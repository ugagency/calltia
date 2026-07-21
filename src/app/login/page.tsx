import { FormularioLogin } from './formulario';

export const metadata = { title: 'Entrar' };

export default function PaginaLogin({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-titulo text-3xl font-semibold tracking-tight">
          Entrar
        </h1>
        <p className="mt-2 text-sm text-texto-suave">
          Acesse o painel para acompanhar suas ligações.
        </p>

        {searchParams.erro === 'sem_tenant' && (
          <p className="mt-6 rounded-lg border border-borda bg-superficie px-4 py-3 text-sm text-texto-suave">
            Seu acesso ainda não está liberado. Fale com a Vettia.
          </p>
        )}

        <FormularioLogin />
      </div>
    </main>
  );
}
