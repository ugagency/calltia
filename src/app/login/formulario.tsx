'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/client';

export function FormularioLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setErro('E-mail ou senha incorretos.');
      setEnviando(false);
      return;
    }

    router.replace('/painel');
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm text-texto-suave">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-borda bg-superficie px-3 py-2.5 text-base outline-none focus:border-primaria"
        />
      </div>

      <div>
        <label htmlFor="senha" className="block text-sm text-texto-suave">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          required
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-borda bg-superficie px-3 py-2.5 text-base outline-none focus:border-primaria"
        />
      </div>

      {erro && <p className="text-sm text-primaria-suave">{erro}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-lg bg-primaria px-4 py-2.5 font-medium text-white transition hover:bg-primaria-escura disabled:opacity-60"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
