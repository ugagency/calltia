import { redirect } from 'next/navigation';

// A raiz leva direto ao painel; quem não tem sessão cai em /login pela
// barreira de autenticação do layout do painel.
export default function Home() {
  redirect('/painel');
}
