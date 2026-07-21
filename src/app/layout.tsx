import type { Metadata } from 'next';
import { Outfit, DM_Sans } from 'next/font/google';
import './globals.css';

// Tipografia da marca Vettia: Outfit (títulos) + DM Sans (corpo).
const fonteTitulo = Outfit({
  subsets: ['latin'],
  variable: '--fonte-titulo',
  display: 'swap',
});

const fonteCorpo = DM_Sans({
  subsets: ['latin'],
  variable: '--fonte-corpo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Painel',
  description: 'Acompanhe suas ligações e edite seu script de vendas.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${fonteTitulo.variable} ${fonteCorpo.variable} min-h-screen bg-fundo font-corpo text-texto antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
