import { NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarMotor } from '@/lib/voz';
import { executarTick } from '@/lib/discador/tick';
import { autorizadoComoServidor } from '@/lib/autorizacao-servidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Discador progressivo. Endpoint HTTP comum, protegido por CRON_SECRET, que
// deve ser acionado a cada minuto por um agendador externo (cron-job.org —
// ver SETUP.md). Não usa o cron nativo da Vercel: o plano Hobby executa no
// máximo 1×/dia, o que não serve para discar.
// Cada passada dispara no máximo UMA ligação (uma por vez por linha).
export async function GET(request: Request) {
  if (!autorizadoComoServidor(request)) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 });
  }

  const resultado = await executarTick({
    db: criarClienteAdmin(),
    motor: criarMotor(),
    agora: new Date(),
  });

  return NextResponse.json(resultado);
}
