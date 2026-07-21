-- Tabelas do domínio. Multi-tenant desde o dia 1: toda tabela (exceto a
-- própria tenants) carrega tenant_id, e o isolamento é garantido por RLS
-- (migration 20260720000004_rls.sql).

create table tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  marca text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Scripts são versionados: salvar cria uma nova linha com versao incrementada,
-- nunca sobrescreve. Apenas uma versão ativa por tenant.
create table scripts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  nome text not null,
  conteudo text not null,
  versao integer not null default 1,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (tenant_id, versao)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  script_id uuid not null references scripts (id),
  nome text not null,
  objetivo objetivo_campanha not null,
  status status_campanha not null default 'rascunho',
  -- Ex.: { "dias": [1,2,3,4,5], "inicio": "09:00", "fim": "18:00" }
  -- dias: 0=domingo..6=sábado, horários no fuso America/Sao_Paulo.
  janela_horario jsonb not null default '{"dias":[1,2,3,4,5],"inicio":"09:00","fim":"18:00"}'::jsonb,
  -- Id do assistente criado no motor de voz (cache; preenchido pela orquestração).
  assistente_id text,
  criado_em timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  campaign_id uuid not null references campaigns (id),
  empresa text not null,
  telefone text not null,
  nicho text,
  dor_mapeada text,
  porte text,
  regiao text,
  status status_lead not null default 'novo',
  tentativas integer not null default 0,
  -- Controle do discador progressivo: quando o lead pode ser rediscado
  -- (retry em horário diferente) e quando foi a última discagem (detecção
  -- de chamada travada sem retorno de webhook).
  proximo_contato_em timestamptz,
  ultima_discagem_em timestamptz,
  criado_em timestamptz not null default now()
);

create table calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  lead_id uuid not null references leads (id),
  campaign_id uuid not null references campaigns (id),
  iniciada_em timestamptz,
  duracao_seg integer,
  status_chamada status_chamada not null,
  transcricao text,
  gravacao_url text,
  -- Operação Vettia: custo e motor NUNCA aparecem no painel do cliente.
  custo_estimado numeric(10, 4),
  motor motor_voz not null default 'vapi',
  -- Id da chamada no motor de voz; garante idempotência do webhook.
  chamada_externa_id text unique,
  criado_em timestamptz not null default now()
);

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  call_id uuid not null references calls (id),
  tipo tipo_outcome not null,
  detalhe text,
  agendado_para timestamptz,
  criado_em timestamptz not null default now()
);

-- Índices de acesso mais comuns.
-- Único e parcial: impede duas versões ativas para o mesmo tenant mesmo em
-- corrida (double-click, retry de rede), e serve de índice de lookup.
create unique index idx_scripts_ativo_unico on scripts (tenant_id) where ativo;
create index idx_campaigns_tenant_status on campaigns (tenant_id, status);
create index idx_leads_campaign_status on leads (campaign_id, status);
create index idx_leads_fila on leads (status, proximo_contato_em) where status in ('em_fila', 'discado');
create index idx_calls_tenant_data on calls (tenant_id, criado_em desc);
create index idx_calls_lead on calls (lead_id);
create index idx_outcomes_tenant on outcomes (tenant_id, criado_em desc);
create index idx_outcomes_call on outcomes (call_id);
