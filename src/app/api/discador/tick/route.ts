import { NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarMotor } from '@/lib/voz';
import { executarTick } from '@/lib/discador/tick';
import { autorizadoComoServidor } from '@/lib/autorizacao-servidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Discador progressivo. Chamado pela Vercel Cron a cada minuto (ver
// vercel.json) e protegido por CRON_SECRET. Cada passada dispara no máximo
// UMA ligação (uma por vez por linha).
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
