'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { reativarVersao, type EstadoAcao } from './actions';
import { formatarDataHora } from '@/lib/formato';
import type { Script } from '@/lib/tipos';

const ESTADO_INICIAL: EstadoAcao = {};

function BotaoReativar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-borda px-3 py-1.5 text-sm text-texto-suave transition hover:border-primaria hover:text-texto disabled:opacity-60"
    >
      {pending ? 'Reativando…' : 'Usar esta'}
    </button>
  );
}

export function HistoricoVersoes({ versoes }: { versoes: Script[] }) {
  const [estado, acao] = useFormState(reativarVersao, ESTADO_INICIAL);

  if (versoes.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="font-titulo text-lg font-semibold">Versões anteriores</h2>
      <p className="mt-1 text-sm text-texto-suave">
        Reativar uma versão antiga cria uma nova versão com aquele conteúdo —
        nada do histórico é apagado.
      </p>

      {estado.erro && (
        <p className="mt-3 text-sm text-primaria-suave">{estado.erro}</p>
      )}

      <ul className="mt-4 divide-y divide-borda rounded-xl border border-borda">
        {versoes.map((versao) => (
          <li
            key={versao.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm">
                Versão {versao.versao}
                {versao.ativo && (
                  <span className="ml-2 rounded-full bg-primaria/15 px-2 py-0.5 text-xs text-primaria-suave">
                    em uso
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-texto-suave">
                {formatarDataHora(versao.criado_em)}
              </p>
            </div>

            {!versao.ativo && (
              <form action={acao}>
                <input type="hidden" name="scriptId" value={versao.id} />
                <BotaoReativar />
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
