import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import type { Tenant } from '@/lib/tipos';

export interface SessaoPainel {
  usuarioId: string;
  email: string | null;
  tenant: Tenant;
}

// Resolve a sessão do painel: usuário logado + tenant a que ele pertence.
// Redireciona para /login quando não há sessão válida.
//
// O tenant_id resolvido aqui é usado para filtrar as consultas também no
// front. O banco já barra o resto via RLS (as políticas usam get_tenant_id());
// o filtro no front é defesa em profundidade, não a única proteção.
export async function exigirSessao(): Promise<SessaoPainel> {
  const supabase = criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('profiles')
    .select('tenant_id, tenants(*)')
    .eq('user_id', user.id)
    .maybeSingle<{ tenant_id: string; tenants: Tenant }>();

  // Usuário autenticado mas sem vínculo com tenant: cadastro incompleto
  // (ver SETUP.md — a Vettia precisa inserir a linha em `profiles`).
  if (!perfil?.tenants) redirect('/login?erro=sem_tenant');

  return {
    usuarioId: user.id,
    email: user.email ?? null,
    tenant: perfil.tenants,
  };
}
