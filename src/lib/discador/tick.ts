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

// Loga e devolve um erro de consulta como resultado do tick, para que a causa
// apareça na resposta HTTP em vez de virar 'nada_a_fazer' silencioso.
function erroTick(etapa: string, erro: { message?: string }): TickResultado {
  console.error('[discador] falha na etapa', etapa, erro);
  return { acao: 'erro', etapa, erro: erro?.message ?? 'erro desconhecido' };
}

// Diagnóstico de uma passada. Vai junto na resposta para tornar visível por
// que o discador não discou (as duas causas de 'nada_a_fazer' — nenhuma
// campanha elegível vs. nenhum lead — eram indistinguíveis antes disso).
export interface DiagnosticoTick {
  campanhasAtivas: number;
  campanhasElegiveis: number;
  leadsEncontrados: number;
  // DIAGNÓSTICO TEMPORÁRIO: prova se criarClienteAdmin() é mesmo service-role.
  // `profiles` só tem policy de SELECT para o próprio usuário
  // (user_id = auth.uid()). O discador roda sem sessão: com a chave
  // service-role (ignora RLS) este count vem igual ao total real de profiles;
  // se vier 0, a chave configurada é a anon (ou outra sem service-role),
  // ainda que o login do painel funcione (login usa a anon key, outra
  // credencial). Remover quando o diagnóstico terminar.
  totalProfilesViaAdmin: number | null;
  // DIAGNÓSTICO TEMPORÁRIO: qual projeto Supabase a app está falando (host da
  // NEXT_PUBLIC_SUPABASE_URL). Compare com a URL do projeto onde você criou a
  // campanha por SQL — se diferirem, a Vercel aponta para outro banco.
  supabaseHost: string | null;
  // DIAGNÓSTICO TEMPORÁRIO: todas as campanhas que o client admin enxerga,
  // sem filtro de status. Se vier [], o banco que a app vê não tem a campanha
  // (projeto errado); se vier com status != 'ativa', o /iniciar não a ativou.
  todasCampanhas: { id: string; status: string }[];
  // DIAGNÓSTICO TEMPORÁRIO: bytes crus do status da 1ª campanha. Se .eq
  // ('status','ativa') volta 0 mas a lista mostra "ativa", o valor guardado
  // tem caractere invisível — os char codes revelam. `casaStatusAtivaEmJs`
  // repete o filtro em JS: se também der 0, o valor não é a string 'ativa'.
  statusPrimeiraCharCodes: number[] | null;
  casaStatusAtivaEmJs: number;
  // DIAGNÓSTICO TEMPORÁRIO: o valor é 'ativa' limpo e o JS acha, mas o
  // PostgREST não. Isola a causa variando UMA coisa por vez (select vs.
  // filtro vs. tipo de coluna). Leitura em cada probe: count = linhas
  // encontradas, erro = mensagem do PostgREST se houver.
  probes: { nome: string; count: number | null; erro: string | null }[];
  // DIAGNÓSTICO TEMPORÁRIO: probes que buscam o CORPO das linhas (sem head),
  // reproduzindo o passo 3. count acima é só contagem; o problema aparece só
  // ao trazer as linhas de fato. status = HTTP do PostgREST; chaves = colunas
  // da 1ª linha retornada (null se não veio linha).
  probesBody: {
    nome: string;
    dataLen: number | null;
    status: number | null;
    erro: string | null;
    chaves: string[] | null;
  }[];
}

export type TickResultado =
  | { acao: 'linha_ocupada' }
  | { acao: 'nada_a_fazer'; motivo: 'sem_campanha_elegivel' | 'sem_lead'; diagnostico: DiagnosticoTick }
  | { acao: 'lead_tomado' }
  | { acao: 'discou'; leadId: string; campaignId: string; chamadaExternaId: string }
  | { acao: 'falha_ao_discar'; leadId: string; erro: string }
  // Uma consulta ao Supabase falhou. Antes esse erro era engolido e virava
  // 'nada_a_fazer' silencioso (mesmo antipadrão corrigido no webhook).
  | { acao: 'erro'; etapa: string; erro: string };

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
  const emVoo = await db
    .from('leads')
    .select('id')
    .eq('status', 'discado')
    .gt('ultima_discagem_em', limiteTimeout)
    .limit(1);
  if (emVoo.error) return erroTick('consultar_em_voo', emVoo.error);
  if (emVoo.data && emVoo.data.length > 0) return { acao: 'linha_ocupada' };

  // DIAGNÓSTICO TEMPORÁRIO: conta profiles sem filtro. Ver DiagnosticoTick.
  const profilesResp = await db
    .from('profiles')
    .select('*', { count: 'exact', head: true });
  const totalProfilesViaAdmin = profilesResp.error ? null : (profilesResp.count ?? 0);

  // DIAGNÓSTICO TEMPORÁRIO: host do projeto Supabase + todas as campanhas.
  let supabaseHost: string | null = null;
  try {
    supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host;
  } catch {
    supabaseHost = null;
  }
  const todasResp = await db.from('campaigns').select('id, status');
  const todasCampanhas = (todasResp.data ?? []) as { id: string; status: string }[];

  // DIAGNÓSTICO TEMPORÁRIO: isola por que .eq('status','ativa') volta 0.
  const primeiraId = todasCampanhas[0]?.id ?? null;
  const contar = async (
    nome: string,
    q: PromiseLike<{ count: number | null; error: { message?: string } | null }>,
  ) => {
    const r = await q;
    return { nome, count: r.error ? null : (r.count ?? 0), erro: r.error?.message ?? null };
  };
  const probes = [
    // select * sem filtro: `select *` sozinho funciona?
    await contar('select_star_sem_filtro', db.from('campaigns').select('*', { count: 'exact', head: true })),
    // reproduz a query que falha (select * + filtro de enum).
    await contar('eq_status_select_star', db.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'ativa')),
    // mesmo filtro de enum, mas select mínimo: isola o efeito do `select *`.
    await contar('eq_status_select_id', db.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'ativa')),
    // `in` em vez de `eq` sobre o mesmo enum.
    await contar('in_status_ativa', db.from('campaigns').select('id', { count: 'exact', head: true }).in('status', ['ativa'])),
    // filtro por uuid (coluna não-enum): filtrar em geral funciona?
    await contar('eq_id', db.from('campaigns').select('id', { count: 'exact', head: true }).eq('id', primeiraId ?? '')),
  ];
  // Todos os probes acima usam head:true (count puro, sem serializar linha).
  // Todos deram 1. Mas o passo 3 busca o CORPO (head:false, select '*') e dá
  // 0. Hipótese: contar não exige serializar as colunas da linha; trazer o
  // corpo exige, e alguma coluna tem valor que quebra a serialização (jsonb
  // malformado, timestamp fora de faixa, etc.) — o que faria a linha "sumir"
  // só quando pedida de verdade. Testa isso variando as colunas buscadas.
  const buscarCorpo = async (
    nome: string,
    q: PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
      status: number;
    }>,
  ) => {
    const r = await q;
    const primeira = Array.isArray(r.data) ? (r.data[0] as Record<string, unknown>) : null;
    return {
      nome,
      dataLen: Array.isArray(r.data) ? r.data.length : null,
      status: r.status ?? null,
      erro: r.error?.message ?? null,
      chaves: primeira ? Object.keys(primeira) : null,
    };
  };
  const probesBody = [
    await buscarCorpo('so_id', db.from('campaigns').select('id').eq('status', 'ativa')),
    await buscarCorpo('id_status', db.from('campaigns').select('id, status').eq('status', 'ativa')),
    await buscarCorpo('id_status_assistente', db.from('campaigns').select('id, status, assistente_id').eq('status', 'ativa')),
    await buscarCorpo('id_status_janela', db.from('campaigns').select('id, status, janela_horario').eq('status', 'ativa')),
    await buscarCorpo('id_status_script', db.from('campaigns').select('id, status, script_id').eq('status', 'ativa')),
    await buscarCorpo('id_status_criado', db.from('campaigns').select('id, status, criado_em').eq('status', 'ativa')),
    await buscarCorpo('estrela_completo', db.from('campaigns').select('*').eq('status', 'ativa')),
  ];

  // 3. Campanhas ativas, dentro da janela, com assistente já criado.
  const campanhasResp = await db.from('campaigns').select('*').eq('status', 'ativa');
  if (campanhasResp.error) return erroTick('consultar_campanhas', campanhasResp.error);
  const campanhas = (campanhasResp.data ?? []) as Campaign[];
  const elegiveis = campanhas.filter(
    (c) => c.assistente_id && dentroDaJanela(agora, c.janela_horario),
  );

  // 4. Pega UM lead elegível (na fila, com tentativas restantes e cujo
  //    reagendamento já venceu). Mais antigos / sem agendamento primeiro.
  const agoraIso = agora.toISOString();
  let leads: Lead[] = [];
  if (elegiveis.length > 0) {
    const idsCampanha = elegiveis.map((c) => c.id);
    const leadsResp = await db
      .from('leads')
      .select('*')
      .in('campaign_id', idsCampanha)
      .eq('status', 'em_fila')
      .lt('tentativas', MAX_TENTATIVAS)
      .or(`proximo_contato_em.is.null,proximo_contato_em.lte.${agoraIso}`)
      .order('proximo_contato_em', { ascending: true, nullsFirst: true })
      .order('criado_em', { ascending: true })
      .limit(1);
    if (leadsResp.error) return erroTick('consultar_leads', leadsResp.error);
    leads = (leadsResp.data ?? []) as Lead[];
  }

  const diagnostico: DiagnosticoTick = {
    campanhasAtivas: campanhas.length,
    campanhasElegiveis: elegiveis.length,
    leadsEncontrados: leads.length,
    totalProfilesViaAdmin,
    supabaseHost,
    todasCampanhas,
    statusPrimeiraCharCodes: todasCampanhas[0]
      ? Array.from(todasCampanhas[0].status, (ch) => ch.charCodeAt(0))
      : null,
    casaStatusAtivaEmJs: todasCampanhas.filter((c) => c.status === 'ativa').length,
    probes,
    probesBody,
  };

  const lead = leads[0];
  if (!lead) {
    return {
      acao: 'nada_a_fazer',
      motivo: elegiveis.length === 0 ? 'sem_campanha_elegivel' : 'sem_lead',
      diagnostico,
    };
  }

  // 5. Reivindica o lead de forma atômica (trava otimista em status='em_fila').
  //    Se outra passada o pegou primeiro, o update não afeta linhas.
  const reivindicacao = await db
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
  if (reivindicacao.error) return erroTick('reivindicar_lead', reivindicacao.error);
  if (!reivindicacao.data) return { acao: 'lead_tomado' };

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
