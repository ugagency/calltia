import { NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarMotor } from '@/lib/voz';
import { autorizadoComoServidor } from '@/lib/autorizacao-servidor';
import type { Campaign, Script } from '@/lib/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Inicia uma campanha (operação da Vettia, não do cliente):
//   1. garante que o assistente do motor de voz existe (cria a partir do
//      script vinculado à campanha, se ainda não houver);
//   2. muda o status da campanha para 'ativa';
//   3. enfileira os leads 'novo' → 'em_fila'.
// A discagem em si é feita pelo discador (rota /api/discador/tick).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!autorizadoComoServidor(request)) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 });
  }

  const db = criarClienteAdmin();

  const { data: campanha } = await db
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Campaign>();
  if (!campanha) {
    return NextResponse.json({ erro: 'campanha nao encontrada' }, { status: 404 });
  }

  // Garante o assistente no motor de voz.
  let assistenteId = campanha.assistente_id;
  if (!assistenteId) {
    const { data: script } = await db
      .from('scripts')
      .select('*')
      .eq('id', campanha.script_id)
      .maybeSingle<Script>();
    if (!script) {
      return NextResponse.json(
        { erro: 'script da campanha nao encontrado' },
        { status: 409 },
      );
    }

    const motor = criarMotor();
    const { assistenteId: novo } = await motor.criarAssistente({
      nome: campanha.nome,
      script: script.conteudo,
    });
    assistenteId = novo;
  }

  await db
    .from('campaigns')
    .update({ status: 'ativa', assistente_id: assistenteId })
    .eq('id', campanha.id);

  // Enfileira apenas os leads ainda não trabalhados.
  const { data: enfileirados } = await db
    .from('leads')
    .update({ status: 'em_fila' })
    .eq('campaign_id', campanha.id)
    .eq('status', 'novo')
    .select('id');

  return NextResponse.json({
    status: 'ativa',
    assistente_id: assistenteId,
    leads_enfileirados: enfileirados?.length ?? 0,
  });
}
