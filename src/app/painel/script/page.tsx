import { criarClienteServidor } from '@/lib/supabase/server';
import { exigirSessao } from '@/lib/tenant';
import { EditorScript } from './editor';
import { HistoricoVersoes } from './historico';
import type { Script } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meu script' };

export default async function PaginaScript() {
  const { tenant } = await exigirSessao();
  const supabase = criarClienteServidor();

  // RLS já restringe ao tenant do usuário; o filtro explícito é defesa em
  // profundidade.
  const { data } = await supabase
    .from('scripts')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('versao', { ascending: false });

  const versoes = (data ?? []) as Script[];
  const ativo = versoes.find((v) => v.ativo);

  return (
    <>
      <h1 className="font-titulo text-2xl font-semibold tracking-tight">
        Meu script de vendas
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-texto-suave">
        É este texto que orienta a conversa nas suas ligações. Ao salvar, uma
        nova versão é criada e passa a valer nas próximas chamadas.
      </p>

      <div className="mt-6">
        <EditorScript
          conteudoInicial={ativo?.conteudo ?? ''}
          nomeInicial={ativo?.nome ?? 'Script de vendas'}
        />
      </div>

      <HistoricoVersoes versoes={versoes} />
    </>
  );
}
