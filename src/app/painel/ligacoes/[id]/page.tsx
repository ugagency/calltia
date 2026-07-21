import Link from 'next/link';
import { notFound } from 'next/navigation';
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
export const metadata = { title: 'Detalhe da ligação' };

// Sem custo, sem motor, sem dados de telefonia — igual à listagem.
const COLUNAS =
  'id, iniciada_em, criado_em, duracao_seg, status_chamada, transcricao, gravacao_url, leads(empresa, nicho, regiao), outcomes(tipo, detalhe, agendado_para)';

interface DetalheChamada {
  id: string;
  iniciada_em: string | null;
  criado_em: string;
  duracao_seg: number | null;
  status_chamada: StatusChamada;
  transcricao: string | null;
  gravacao_url: string | null;
  leads: { empresa: string; nicho: string | null; regiao: string | null } | null;
  outcomes: {
    tipo: TipoOutcome;
    detalhe: string | null;
    agendado_para: string | null;
  }[];
}

export default async function PaginaDetalheLigacao({
  params,
}: {
  params: { id: string };
}) {
  const { tenant } = await exigirSessao();
  const supabase = criarClienteServidor();

  const { data } = await supabase
    .from('calls')
    .select(COLUNAS)
    .eq('id', params.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  // RLS garante que uma chamada de outro tenant simplesmente não é
  // encontrada — o cliente vê "não existe", não "não autorizado".
  if (!data) notFound();
  const chamada = data as unknown as DetalheChamada;
  const resultado = chamada.outcomes?.[0];

  return (
    <>
      <Link
        href="/painel/ligacoes"
        className="text-sm text-texto-suave transition hover:text-texto"
      >
        ← Voltar para as ligações
      </Link>

      <h1 className="mt-4 font-titulo text-2xl font-semibold tracking-tight">
        {chamada.leads?.empresa ?? 'Empresa'}
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-texto-suave">
        <span>{formatarDataHora(chamada.iniciada_em ?? chamada.criado_em)}</span>
        <span aria-hidden>·</span>
        <span>{formatarDuracao(chamada.duracao_seg)}</span>
        <span aria-hidden>·</span>
        <span>{ROTULO_STATUS[chamada.status_chamada]}</span>
      </div>

      {resultado && (
        <div className="mt-6 rounded-xl border border-borda bg-superficie p-4">
          <p className="font-titulo text-base font-semibold text-primaria-suave">
            {ROTULO_RESULTADO[resultado.tipo]}
          </p>
          {resultado.agendado_para && (
            <p className="mt-1 text-sm text-texto-suave">
              Agendado para {formatarDataHora(resultado.agendado_para)}
            </p>
          )}
          {resultado.detalhe && (
            <p className="mt-2 text-sm leading-relaxed">{resultado.detalhe}</p>
          )}
        </div>
      )}

      {chamada.gravacao_url && (
        <section className="mt-8">
          <h2 className="font-titulo text-lg font-semibold">Gravação</h2>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            preload="none"
            src={chamada.gravacao_url}
            className="mt-3 w-full"
          />
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-titulo text-lg font-semibold">Transcrição</h2>
        {chamada.transcricao ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-borda bg-superficie p-4 font-corpo text-sm leading-relaxed">
            {chamada.transcricao}
          </pre>
        ) : (
          <p className="mt-3 text-sm text-texto-suave">
            Esta ligação não tem transcrição.
          </p>
        )}
      </section>
    </>
  );
}
