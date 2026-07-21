'use client';

import { createBrowserClient } from '@supabase/ssr';

// Cliente do navegador. Usado apenas para o fluxo de login/logout — as
// leituras de dados acontecem no servidor (Server Components), sob RLS.
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
