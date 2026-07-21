import Link from 'next/link';
import { criarClienteServidor } from '@/lib/supabase/server';
import { exigirSessao } from '@/lib/tenant';
import {
  formatarDataHora,
  formatarDuracao,
  ROTULO_RESULTADO,
  ROTULO_STATUS,
} from '@/lib/formato';
import type { StatusChamada, TipoOutcome } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minhas ligações' };

// Colunas expostas ao cliente. custo_estimado, motor e chamada_externa_id
// ficam DELIBERADAMENTE de fora: são dados de operação da Vettia e não
// aparecem em nenhuma tela do cliente.
const COLUNAS =
  'id, iniciada_em, criado_em, duracao_seg, status_chamada, gravacao_url, leads(empresa)';

interface LinhaChamada {
  id: string;
  iniciada_em: string | null;
  criado_em: string;
  duracao_seg: number | null;
  status_chamada: StatusChamada;
  gravacao_url: string | null;
  leads: { empresa: string } | null;
  outcomes: { tipo: TipoOutcome }[];
}

function Resumo({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-xl border border-borda bg-superficie px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-texto-suave">{rotulo}</p>
      <p className="mt-1 font-titulo text-2xl font-semibold">{valor}</p>
    </div>
  );
}

export default async function PaginaLigacoes({
  searchParams,
}: {
  searchParams: { status?: string; resultado?: string };
}) {
  const { tenant } = await exigirSessao();
  const supabase = criarClienteServidor();

  const filtroStatus = searchParams.status || '';
  const filtroResultado = searchParams.resultado || '';

  // Resumo do topo (sempre sobre o total, independente dos filtros).
  const [{ count: total }, { count: atendidas }, { count: reunioes }] = await Promise.all([
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id),
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status_chamada', 'atendida'),
    supabase
      .from('outcomes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('tipo', 'reuniao_agendada'),
  ]);

  const taxaAtendimento =
    total && total > 0 ? Math.round(((atendidas ?? 0) / total) * 100) : 0;

  // Lista. Ao filtrar por resultado, o join com outcomes vira !inner para
  // que o filtro recaia sobre a chamada, não só sobre o embed.
  const embedOutcomes = filtroResultado
    ? 'outcomes!inner(tipo)'
    : 'outcomes(tipo)';

  let consulta = supabase
    .from('calls')
    .select(`${COLUNAS}, ${embedOutcomes}`)
    .eq('tenant_id', tenant.id)
    .order('criado_em', { ascending: false })
    .limit(100);

  if (filtroStatus) consulta = consulta.eq('status_chamada', filtroStatus);
  if (filtroResultado) consulta = consulta.eq('outcomes.tipo', filtroResultado);

  const { data } = await consulta;
  const chamadas = (data ?? []) as unknown as LinhaChamada[];

  return (
    <>
      <h1 className="font-titulo text-2xl font-semibold tracking-tight">
        Minhas ligações
      </h1>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Resumo rotulo="Ligações feitas" valor={String(total ?? 0)} />
        <Resumo rotulo="Taxa de atendimento" valor={`${taxaAtendimento}%`} />
        <Resumo rotulo="Reuniões agendadas" valor={String(reunioes ?? 0)} />
      </div>

      <form className="mt-8 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="status" className="block text-xs text-texto-suave">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={filtroStatus}
            className="mt-1 rounded-lg border border-borda bg-superficie px-3 py-2 text-sm outline-none focus:border-primaria"
          >
            <option value="">Todos</option>
            {Object.entries(ROTULO_STATUS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="resultado" className="block text-xs text-texto-suave">
            Resultado
          </label>
          <select
            id="resultado"
            name="resultado"
            defaultValue={filtroResultado}
            className="mt-1 rounded-lg border border-borda bg-superficie px-3 py-2 text-sm outline-none focus:border-primaria"
          >
            <option value="">Todos</option>
            {Object.entries(ROTULO_RESULTADO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-lg border border-borda px-4 py-2 text-sm transition hover:border-primaria"
        >
          Filtrar
        </button>

        {(filtroStatus || filtroResultado) && (
          <Link
            href="/painel/ligacoes"
            className="py-2 text-sm text-texto-suave transition hover:text-texto"
          >
            Limpar
          </Link>
        )}
      </form>

      {chamadas.length === 0 ? (
        <p className="mt-8 rounded-xl border border-borda bg-superficie px-4 py-6 text-sm text-texto-suave">
          Nenhuma ligação por aqui ainda.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-borda rounded-xl border border-borda">
          {chamadas.map((chamada) => {
            const resultado = chamada.outcomes?.[0]?.tipo;
            return (
              <li key={chamada.id}>
                <Link
                  href={`/painel/ligacoes/${chamada.id}`}
                  className="flex flex-col gap-1 px-4 py-3.5 transition hover:bg-superficie sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {chamada.leads?.empresa ?? 'Empresa'}
                    </p>
                    <p className="mt-0.5 text-xs text-texto-suave">
                      {formatarDataHora(chamada.iniciada_em ?? chamada.criado_em)} ·{' '}
                      {formatarDuracao(chamada.duracao_seg)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="rounded-full border border-borda px-2.5 py-0.5 text-xs text-texto-suave">
                      {ROTULO_STATUS[chamada.status_chamada]}
                    </span>
                    {resultado && (
                      <span className="rounded-full bg-primaria/15 px-2.5 py-0.5 text-xs text-primaria-suave">
                        {ROTULO_RESULTADO[resultado]}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
