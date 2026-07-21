import type { NextRequest } from 'next/server';
import { atualizarSessao } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return atualizarSessao(request);
}

export const config = {
  matcher: [
    // Tudo, menos assets estáticos e as rotas de API (que têm sua própria
    // autorização por segredo e não usam sessão de usuário).
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
  ],
};
