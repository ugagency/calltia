import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Renova a sessão do Supabase a cada requisição e repassa os cookies
// atualizados para a resposta. Sem isso, sessões expiram no meio da
// navegação em Server Components.
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          resposta = NextResponse.next({ request: { headers: request.headers } });
          resposta.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          resposta = NextResponse.next({ request: { headers: request.headers } });
          resposta.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  await supabase.auth.getUser();

  return resposta;
}
