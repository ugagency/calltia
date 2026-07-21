'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/painel/ligacoes', rotulo: 'Minhas ligações' },
  { href: '/painel/script', rotulo: 'Meu script' },
];

export function Navegacao() {
  const caminho = usePathname();

  return (
    <nav className="mx-auto flex max-w-5xl gap-1 px-3 pb-1">
      {ITENS.map((item) => {
        const ativo = caminho.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-sm transition ${
              ativo
                ? 'bg-superficie text-texto'
                : 'text-texto-suave hover:bg-superficie hover:text-texto'
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
