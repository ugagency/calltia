import { NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarMotor } from '@/lib/voz';
import { segredoConfere } from '@/lib/autorizacao-servidor';
import { reenfileirarOuEncerrar } from '@/lib/discador/tick';
import type { Lead } from '@/lib/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recebe o pós-chamada do motor de voz, normaliza pelo adaptador, grava em
// `calls`, deriva o `outcome` e atualiza o estado do lead.
//
// Duas regras de segurança embutidas:
//  - tenant_id (e campaign_id) são SEMPRE derivados do lead via lead_id,
//    nunca aceitos do payload/metadata que veio de fora.
//  - a mutação de estado do lead só ocorre se a chamada recebida for a
//    chamada em voo atual do lead (lead.chamada_atual_id casa). Um webhook
//    atrasado, chegando depois de o retry já ter iniciado um novo ciclo,
//    ainda é registrado em calls/outcomes para histórico, mas não
//    sobrescreve o ciclo novo.
export async function POST(request: Request) {
  if (!segredoConfere(request.headers.get('x-vapi-secret'), process.env.VAPI_WEBHOOK_SECRET)) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ erro: 'payload invalido' }, { status: 400 });
  }

  const motor = criarMotor();
  const chamada = motor.normalizarWebhook(payload);
  // Evento que não é fim de chamada, ou sem metadados de correlação: ignora.
  if (!chamada) return NextResponse.json({ ok: true, ignorado: true });

  const db = criarClienteAdmin();

  // Fonte da verdade do tenant: o lead. Nunca o metadata ecoado.
  const { data: lead } = await db
    .from('leads')
    .select('*')
    .eq('id', chamada.leadId)
    .maybeSingle<Lead>();
  if (!lead) {
    // Metadados apontam para um lead que não existe (lead removido, base
    // recriada, ou ambiente trocado). Uma ligação real aconteceu e não tem
    // onde ser registrada — não pode sumir em silêncio.
    console.warn('[webhook] chamada recebida para lead inexistente', {
      leadId: chamada.leadId,
      chamadaExternaId: chamada.chamadaExternaId,
    });
    return NextResponse.json({ ok: true, lead_desconhecido: true });
  }

  // 1. Grava/atualiza a chamada. Idempotente por chamada_externa_id: uma
  //    reentrega, ou o upsert da varredura de chamada travada, converge na
  //    mesma linha.
  const linhaCall = {
    tenant_id: lead.tenant_id,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    iniciada_em: chamada.iniciadaEm,
    duracao_seg: chamada.duracaoSeg,
    status_chamada: chamada.statusChamada,
    transcricao: chamada.transcricao,
    gravacao_url: chamada.gravacaoUrl,
    custo_estimado: chamada.custoEstimado,
    motor: chamada.motor,
    chamada_externa_id: chamada.chamadaExternaId,
  };

  const escrita = chamada.chamadaExternaId
    ? await db
        .from('calls')
        .upsert(linhaCall, { onConflict: 'chamada_externa_id' })
        .select('id')
        .maybeSingle<{ id: string }>()
    : await db.from('calls').insert(linhaCall).select('id').maybeSingle<{ id: string }>();

  // Falha ao gravar a chamada é perda de dado: responde 500 para o motor de
  // voz reentregar o evento (as escritas são idempotentes, então repetir é
  // seguro).
  if (escrita.error || !escrita.data) {
    console.error('[webhook] falha ao gravar chamada', {
      leadId: lead.id,
      chamadaExternaId: chamada.chamadaExternaId,
      erro: escrita.error?.message,
    });
    return NextResponse.json({ erro: 'falha ao gravar chamada' }, { status: 500 });
  }

  const callId = escrita.data.id;

  // 2. Outcome, quando o motor extraiu um resultado. Idempotente: no máximo
  //    um outcome por call (índice único em outcomes.call_id).
  if (chamada.resultado) {
    const { error } = await db.from('outcomes').upsert(
      {
        tenant_id: lead.tenant_id,
        call_id: callId,
        tipo: chamada.resultado.tipo,
        detalhe: chamada.resultado.detalhe,
        agendado_para: chamada.resultado.agendadoPara,
      },
      { onConflict: 'call_id', ignoreDuplicates: true },
    );
    // A chamada já está salva (com transcrição), então o resultado pode ser
    // reconstruído depois: registra e segue, sem forçar reentrega.
    if (error) {
      console.error('[webhook] falha ao gravar resultado da chamada', {
        callId,
        erro: error.message,
      });
    }
  }

  // 3. Estado do lead — só se este webhook for o do ciclo em voo atual.
  const doCicloAtual = lead.chamada_atual_id === chamada.chamadaExternaId;
  if (doCicloAtual) {
    if (chamada.statusChamada === 'atendida') {
      await db
        .from('leads')
        .update({ status: 'concluido', chamada_atual_id: null })
        .eq('id', lead.id);
    } else {
      // nao_atendida / ocupado / voicemail → retry em horário diferente.
      await reenfileirarOuEncerrar(
        { db, motor, agora: new Date() },
        lead,
        new Date(),
      );
    }
  }

  return NextResponse.json({ ok: true, ciclo_atual: doCicloAtual });
}
