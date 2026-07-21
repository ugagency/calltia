import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente do lado do servidor autenticado como o usuário logado (sessão vem
// dos cookies). Usa a chave anônima: TODAS as consultas passam por Row Level
// Security, então o banco é quem garante o isolamento entre tenants.
export function criarClienteServidor() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, chave, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components não podem escrever cookies; a renovação de
          // sessão acontece no middleware.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // idem acima
        }
      },
    },
  });
}
