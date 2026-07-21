import type { SupabaseClient } from '@supabase/supabase-js';
import type { MotorDeVoz } from '@/lib/voz/tipos';
import type { Campaign, Lead } from '@/lib/tipos';
import { dentroDaJanela, proximoHorarioValido } from './janela';

// Parâmetros de operação do discador progressivo.
export const TIMEOUT_DISCAGEM_MIN = 10; // sem retorno do webhook após isso ⇒ chamada travada
export const ATRASO_RETRY_HORAS = 3; // reagendamento entre tentativas (horários diferentes)
export const MAX_TENTATIVAS = 3;

export interface TickDeps {
  db: SupabaseClient;
  motor: MotorDeVoz;
  agora: Date;
}

export type TickResultado =
  | { acao: 'linha_ocupada' }
  | { acao: 'nada_a_fazer' }
  | { acao: 'lead_tomado' }
  | { acao: 'discou'; leadId: string; campaignId: string; chamadaExternaId: string }
  | { acao: 'falha_ao_discar'; leadId: string; erro: string };

// Uma passada do discador. Regra central (Anatel / discagem progressiva):
// UMA ligação por vez por linha.
//
// PREMISSA ATUAL DO SISTEMA: existe UMA única linha (um número de origem).
// Por isso a checagem de chamada em voo abaixo é GLOBAL — não por campanha
// nem por tenant. Consequência de capacidade, que é escolha consciente e não
// limitação esquecida: com dois parceiros rodando campanhas ao mesmo tempo,
// uma campanha serializa atrás da outra, ainda que sejam tenants distintos.
// Vender "ligações simultâneas" a um segundo parceiro exige contratar mais
// números/linhas — é requisito de infraestrutura, não só de código. Quando
// houver múltiplas linhas, esta checagem passa a ser por-linha.
export async function executarTick(deps: TickDeps): Promise<TickResultado> {
  const { db, agora } = deps;

  // 1. Varre chamadas travadas (discado há mais que o timeout, sem webhook).
  await varrerChamadasTravadas(deps);

  // 2. Linha ocupada? Qualquer lead ainda 'discado' dentro do timeout ⇒ há
  //    uma chamada em voo; não dispara outra.
  const limiteTimeout = new Date(agora.getTime() - TIMEOUT_DISCAGEM_MIN * 60000).toISOString();
  const { data: emVoo } = await db
    .from('leads')
    .select('id')
    .eq('status', 'discado')
    .gt('ultima_discagem_em', limiteTimeout)
    .limit(1);
  if (emVoo && emVoo.length > 0) return { acao: 'linha_ocupada' };

  // 3. Campanhas ativas, dentro da janela, com assistente já criado.
  const { data: campanhas } = await db
    .from('campaigns')
    .select('*')
    .eq('status', 'ativa');
  const elegiveis = (campanhas ?? []).filter(
    (c: Campaign) => c.assistente_id && dentroDaJanela(agora, c.janela_horario),
  ) as Campaign[];
  if (elegiveis.length === 0) return { acao: 'nada_a_fazer' };

  const idsCampanha = elegiveis.map((c) => c.id);

  // 4. Pega UM lead elegível (na fila, com tentativas restantes e cujo
  //    reagendamento já venceu). Mais antigos / sem agendamento primeiro.
  const agoraIso = agora.toISOString();
  const { data: leads } = await db
    .from('leads')
    .select('*')
    .in('campaign_id', idsCampanha)
    .eq('status', 'em_fila')
    .lt('tentativas', MAX_TENTATIVAS)
    .or(`proximo_contato_em.is.null,proximo_contato_em.lte.${agoraIso}`)
    .order('proximo_contato_em', { ascending: true, nullsFirst: true })
    .order('criado_em', { ascending: true })
    .limit(1);

  const lead = (leads ?? [])[0] as Lead | undefined;
  if (!lead) return { acao: 'nada_a_fazer' };

  // 5. Reivindica o lead de forma atômica (trava otimista em status='em_fila').
  //    Se outra passada o pegou primeiro, o update não afeta linhas.
  const { data: reivindicado } = await db
    .from('leads')
    .update({
      status: 'discado',
      tentativas: lead.tentativas + 1,
      ultima_discagem_em: agoraIso,
      chamada_atual_id: null,
    })
    .eq('id', lead.id)
    .eq('status', 'em_fila')
    .select('id')
    .maybeSingle();
  if (!reivindicado) return { acao: 'lead_tomado' };

  const campanha = elegiveis.find((c) => c.id === lead.campaign_id)!;

  // 6. Dispara a ligação pelo motor de voz.
  try {
    const { chamadaExternaId } = await deps.motor.dispararLigacao({
      assistenteId: campanha.assistente_id!,
      telefone: lead.telefone,
      metadados: {
        leadId: lead.id,
        campaignId: lead.campaign_id,
        tenantId: lead.tenant_id,
      },
    });

    // 7. Marca a chamada em voo no lead. É este id que o webhook vai casar
    //    para saber se pode mexer no estado do lead.
    await db
      .from('leads')
      .update({ chamada_atual_id: chamadaExternaId })
      .eq('id', lead.id);

    return {
      acao: 'discou',
      leadId: lead.id,
      campaignId: lead.campaign_id,
      chamadaExternaId,
    };
  } catch (erro) {
    // Falha nossa (motor fora do ar, etc.): devolve o lead à fila sem
    // penalizar a tentativa, com um pequeno atraso.
    await db
      .from('leads')
      .update({
        status: 'em_fila',
        tentativas: lead.tentativas, // desfaz o incremento do passo 5
        chamada_atual_id: null,
        proximo_contato_em: proximoHorarioValido(
          new Date(agora.getTime() + 15 * 60000),
          campanha.janela_horario,
        ).toISOString(),
      })
      .eq('id', lead.id);

    return {
      acao: 'falha_ao_discar',
      leadId: lead.id,
      erro: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

// Chamadas 'discado' há mais que o timeout sem webhook de retorno: registra
// a tentativa em `calls` (para histórico) e reenfileira/encerra o lead,
// fechando o ciclo (chamada_atual_id → null). Fechar o ciclo é o que impede
// um webhook atrasado de sobrescrever um ciclo futuro do mesmo lead.
//
// RISCO CONHECIDO (inerente a qualquer timeout, não é bug):
// se o webhook real demorar MAIS que TIMEOUT_DISCAGEM_MIN, esta varredura
// marca 'nao_atendida' e reenfileira um lead cuja ligação na verdade foi
// atendida com sucesso. O dado não se perde — quando o webhook chega, o
// upsert corrige a linha em `calls` com status/transcrição reais e grava o
// outcome. Mas a empresa pode ser rediscada mesmo já tendo, por exemplo,
// agendado reunião.
// Sintoma a vigiar: lead com outcome positivo numa chamada e, depois dela,
// status de volta para 'em_fila'/'discado'. Vale sinalizar isso no painel ou
// num alerta simples para calibrar TIMEOUT_DISCAGEM_MIN com dados reais,
// antes de o primeiro cliente encontrar o caso.
async function varrerChamadasTravadas(deps: TickDeps): Promise<void> {
  const { db, agora } = deps;
  const limite = new Date(agora.getTime() - TIMEOUT_DISCAGEM_MIN * 60000).toISOString();

  const { data: travados } = await db
    .from('leads')
    .select('*')
    .eq('status', 'discado')
    .lte('ultima_discagem_em', limite);

  for (const lead of (travados ?? []) as Lead[]) {
    // Registra a chamada como não atendida. Se o webhook real chegar depois,
    // faz upsert nesta mesma linha (chave chamada_externa_id) com os dados
    // reais — sem duplicar. tenant_id derivado do próprio lead.
    if (lead.chamada_atual_id) {
      await db.from('calls').upsert(
        {
          tenant_id: lead.tenant_id,
          lead_id: lead.id,
          campaign_id: lead.campaign_id,
          iniciada_em: lead.ultima_discagem_em,
          status_chamada: 'nao_atendida',
          chamada_externa_id: lead.chamada_atual_id,
        },
        { onConflict: 'chamada_externa_id', ignoreDuplicates: true },
      );
    } else {
      await db.from('calls').insert({
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        iniciada_em: lead.ultima_discagem_em,
        status_chamada: 'nao_atendida',
      });
    }

    await reenfileirarOuEncerrar(deps, lead, deps.agora);
  }
}

// Aplica a política de retry a um lead cujo ciclo terminou sem sucesso.
// Reutilizado pelo webhook. Não incrementa tentativas (isso acontece na
// discagem); apenas decide fila vs. encerramento e reagenda em horário
// diferente e válido.
export async function reenfileirarOuEncerrar(
  deps: TickDeps,
  lead: Lead,
  agora: Date,
): Promise<void> {
  const { db } = deps;

  if (lead.tentativas >= MAX_TENTATIVAS) {
    await db
      .from('leads')
      .update({ status: 'concluido', chamada_atual_id: null })
      .eq('id', lead.id);
    return;
  }

  // Busca a janela da campanha para reagendar dentro de um horário válido.
  const { data: campanha } = await db
    .from('campaigns')
    .select('janela_horario')
    .eq('id', lead.campaign_id)
    .maybeSingle();

  const alvo = new Date(agora.getTime() + ATRASO_RETRY_HORAS * 60 * 60000);
  const proximo = campanha
    ? proximoHorarioValido(alvo, (campanha as { janela_horario: Campaign['janela_horario'] }).janela_horario)
    : alvo;

  await db
    .from('leads')
    .update({
      status: 'em_fila',
      chamada_atual_id: null,
      proximo_contato_em: proximo.toISOString(),
    })
    .eq('id', lead.id);
}
