import { redirect } from 'next/navigation';
import { exigirSessao } from '@/lib/tenant';
import { criarClienteServidor } from '@/lib/supabase/server';
import { Navegacao } from './navegacao';

export const dynamic = 'force-dynamic';

async function sair() {
  'use server';
  const supabase = criarClienteServidor();
  await supabase.auth.signOut();
  redirect('/login');
}

export default async function LayoutPainel({
  children,
}: {
  children: React.ReactNode;
}) {
  // Barreira de autenticação de todo o painel: sem sessão válida e vínculo
  // com um tenant, redireciona para /login.
  const { tenant } = await exigirSessao();

  return (
    <div className="min-h-screen">
      <header className="border-b border-borda">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          {/* White-label: o painel exibe a marca do cliente. */}
          <span className="font-titulo text-lg font-semibold tracking-tight">
            {tenant.marca}
          </span>
          <form action={sair}>
            <button
              type="submit"
              className="text-sm text-texto-suave transition hover:text-texto"
            >
              Sair
            </button>
          </form>
        </div>

        <Navegacao />
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
