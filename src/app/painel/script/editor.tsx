'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { salvarScript, type EstadoAcao } from './actions';

const ESTADO_INICIAL: EstadoAcao = {};

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primaria px-5 py-2.5 font-medium text-white transition hover:bg-primaria-escura disabled:opacity-60"
    >
      {pending ? 'Salvando…' : 'Salvar'}
    </button>
  );
}

export function EditorScript({
  conteudoInicial,
  nomeInicial,
}: {
  conteudoInicial: string;
  nomeInicial: string;
}) {
  const [estado, acao] = useFormState(salvarScript, ESTADO_INICIAL);

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="nome" value={nomeInicial} />

      <textarea
        name="conteudo"
        defaultValue={conteudoInicial}
        rows={18}
        placeholder="Escreva aqui como sua vendedora deve conduzir a ligação: como se apresentar, o que perguntar, como contornar objeções e o que oferecer no fim."
        className="w-full resize-y rounded-xl border border-borda bg-superficie p-4 font-corpo text-base leading-relaxed outline-none focus:border-primaria"
      />

      <div className="flex flex-wrap items-center gap-3">
        <BotaoSalvar />
        {estado.ok && (
          <span className="text-sm text-texto-suave">
            Salvo — uma nova versão foi criada.
          </span>
        )}
        {estado.erro && (
          <span className="text-sm text-primaria-suave">{estado.erro}</span>
        )}
      </div>
    </form>
  );
}
