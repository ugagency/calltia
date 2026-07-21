-- Associação usuário (Supabase Auth) → tenant.
--
-- Um usuário pertence a exatamente um tenant. O cadastro é feito pela
-- Vettia (não é self-service):
--
--   1. insert into tenants (nome, marca) values ('Cliente X', 'Marca X');
--   2. Criar o usuário no Supabase Auth (Dashboard → Authentication →
--      Add user, com email + senha) e copiar o UUID gerado.
--   3. insert into profiles (user_id, tenant_id)
--      values ('<uuid do usuário>', '<uuid do tenant>');
--
-- O passo a passo completo fica no SETUP.md.

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references tenants (id),
  criado_em timestamptz not null default now()
);

create index idx_profiles_tenant on profiles (tenant_id);

-- Resolve o tenant do usuário autenticado. Usada em todas as políticas RLS.
-- security definer: lê profiles mesmo com RLS ativo na própria tabela.
create or replace function get_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profiles where user_id = auth.uid();
$$;

revoke execute on function get_tenant_id() from public;
grant execute on function get_tenant_id() to authenticated;
