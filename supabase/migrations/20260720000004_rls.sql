-- Row Level Security: cada usuário autenticado só enxerga (e, onde permitido,
-- edita) linhas do próprio tenant, resolvido por get_tenant_id().
--
-- O papel service_role (usado apenas no servidor: webhook e discador) ignora
-- RLS por definição do Supabase — a chave service-role jamais vai ao browser.
--
-- Permissões do cliente:
--   - SELECT em tudo do próprio tenant;
--   - INSERT/UPDATE apenas em scripts (edição do próprio script de vendas);
--   - nenhum DELETE; campanhas, leads, calls e outcomes são operados pela Vettia.

alter table tenants enable row level security;
alter table profiles enable row level security;
alter table scripts enable row level security;
alter table campaigns enable row level security;
alter table leads enable row level security;
alter table calls enable row level security;
alter table outcomes enable row level security;

-- tenants: o usuário vê apenas o próprio tenant (nome/marca no painel).
create policy tenants_select on tenants
  for select to authenticated
  using (id = get_tenant_id());

-- profiles: o usuário vê apenas o próprio vínculo.
create policy profiles_select on profiles
  for select to authenticated
  using (user_id = auth.uid());

-- scripts: leitura + criação de novas versões + ativar/desativar versões.
create policy scripts_select on scripts
  for select to authenticated
  using (tenant_id = get_tenant_id());

create policy scripts_insert on scripts
  for insert to authenticated
  with check (tenant_id = get_tenant_id());

create policy scripts_update on scripts
  for update to authenticated
  using (tenant_id = get_tenant_id())
  with check (tenant_id = get_tenant_id());

-- campaigns / leads / calls / outcomes: somente leitura para o cliente.
create policy campaigns_select on campaigns
  for select to authenticated
  using (tenant_id = get_tenant_id());

create policy leads_select on leads
  for select to authenticated
  using (tenant_id = get_tenant_id());

create policy calls_select on calls
  for select to authenticated
  using (tenant_id = get_tenant_id());

create policy outcomes_select on outcomes
  for select to authenticated
  using (tenant_id = get_tenant_id());
