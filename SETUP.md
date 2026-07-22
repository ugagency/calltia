# Setup — Sistema de Ligações com IA (Vettia)

Este documento cobre o que precisa ser feito **fora do código** para o sistema
funcionar. O repositório traz a camada de software pronta; a infraestrutura
(Supabase, Vapi, trunk SIP, número BR) é plugada manualmente seguindo os
passos abaixo.

Ordem recomendada: 1 → 2 → 3 → 4 → 5 → 6.

---

## Como as peças se encaixam

```
Cliente (parceiro)          Vettia (você)                  Externo
┌────────────────┐    ┌───────────────────────┐    ┌──────────────────┐
│ Painel:        │    │ Next.js (Vercel)      │    │ Vapi             │
│ - meu script   │───▶│ - painel multi-tenant │───▶│ (motor de voz)   │
│ - minhas       │    │ - discador (acionado  │    │  ↓               │
│   ligações     │◀───│   por agendador ext.) │◀───│ trunk SIP + nº BR│
└────────────────┘    │ - webhook             │    └──────────────────┘
                      │ Supabase (dados+RLS)  │
                      └───────────────────────┘
```

O cliente nunca vê custo, telefonia nem o nome do motor de voz. Trocar o Vapi
por outro motor no futuro é implementar a interface `MotorDeVoz`
(`src/lib/voz/tipos.ts`) — painel e orquestração não mudam.

---

## 1. Rodar o projeto localmente

Requer Node.js 18.17+ (testado com 22.x).

```bash
npm install
cp .env.example .env.local   # preencha conforme os passos abaixo
npm run dev                  # http://localhost:3000
```

`.env.local` nunca é commitado (bloqueado no `.gitignore`).

---

## 2. Supabase (banco, autenticação e isolamento entre clientes)

### 2.1 Criar o projeto

1. Em [supabase.com](https://supabase.com), crie um projeto (região `South
   America (São Paulo)` para menor latência).
2. Em **Project Settings → API**, copie para o `.env.local`:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - chave `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - chave `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

> A chave `service_role` ignora todas as regras de segurança do banco. Ela só
> é usada no servidor (webhook e discador) e **nunca** pode ir para o
> navegador nem para um repositório público.

### 2.2 Aplicar as migrations

Os arquivos estão em `supabase/migrations/`, e **a ordem importa**:

| Arquivo | O que cria |
|---|---|
| `20260720000001_enums.sql` | Tipos (objetivo de campanha, status, resultado…) |
| `20260720000002_tabelas.sql` | Tabelas: tenants, scripts, campaigns, leads, calls, outcomes |
| `20260720000003_perfis_e_helpers.sql` | Vínculo usuário↔tenant e função `get_tenant_id()` |
| `20260720000004_rls.sql` | Regras de isolamento entre clientes (RLS) |
| `20260720000005_discador.sql` | Colunas de controle do discador |

**Opção A — pelo painel do Supabase:** abra **SQL Editor**, cole o conteúdo de
cada arquivo na ordem da tabela e execute um por vez.

**Opção B — pela CLI:**

```bash
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

### 2.3 Conferir que o isolamento está ativo

No SQL Editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
```

Todas as tabelas devem aparecer com `rowsecurity = true`. Se alguma estiver
`false`, a migration `20260720000004_rls.sql` não foi aplicada — **não coloque
dados reais de cliente antes de corrigir isso.**

---

## 3. Cadastrar um cliente (tenant + usuário)

Não existe autocadastro: quem cria clientes é a Vettia. São três passos.

**1) Criar o tenant** (SQL Editor):

```sql
insert into tenants (nome, marca)
values ('Nome do Cliente Ltda', 'Marca que aparece no painel')
returning id;
```

Guarde o `id` retornado.

**2) Criar o usuário:** **Authentication → Users → Add user**. Informe e-mail e
senha e marque *Auto Confirm User*. Copie o `UID` do usuário criado.

**3) Vincular usuário ao tenant:**

```sql
insert into profiles (user_id, tenant_id)
values ('<UID-do-usuario>', '<id-do-tenant>');
```

A partir daí esse usuário entra no painel e enxerga **somente** os dados do
próprio tenant. Sem o passo 3, o login acontece mas o painel mostra "acesso
ainda não liberado".

**4) Criar o script inicial do cliente** (ele edita depois pelo painel):

```sql
insert into scripts (tenant_id, nome, conteudo, versao, ativo)
values (
  '<id-do-tenant>',
  'Script de vendas',
  'Você é uma vendedora da <empresa>. Esta ligação é gravada. ...',
  1,
  true
);
```

> **LGPD:** o aviso de que a ligação é gravada faz parte do texto do script.
> Mantenha-o nas versões que forem para produção.

---

## 4. Vapi (motor de voz) e telefonia

### 4.1 Conta e chave

1. Crie a conta em [vapi.ai](https://vapi.ai).
2. Em **API Keys**, gere uma chave → `VAPI_API_KEY`.

### 4.2 Número brasileiro via trunk SIP

O Vapi só disca; a linha é contratada à parte. Contrate um trunk SIP com um
provedor nacional (ex.: Twilio Brasil, Vono, Directcall, Zenvia) com número BR.

1. No Vapi: **Phone Numbers → Import / BYO SIP Trunk**, informando host,
   usuário e senha do trunk fornecidos pelo provedor.
2. Copie o **id do número** criado → `VAPI_PHONE_NUMBER_ID`.

> Regra da Anatel: o sistema usa discagem **progressiva** (uma ligação por vez,
> sem abandono). Não configure discagem preditiva nem disparo em massa — além
> de ilegal, derruba a reputação do número.

### 4.3 Webhook de retorno

1. Escolha um segredo forte (ex.: `openssl rand -hex 32`) e coloque em
   `VAPI_WEBHOOK_SECRET`.
2. No Vapi, em **Server URL** (organização ou assistente), configure:
   - URL: `https://<seu-dominio>/api/webhooks/vapi`
   - Secret: o mesmo valor de `VAPI_WEBHOOK_SECRET`
3. Garanta que o evento `end-of-call-report` está habilitado.

Sem isso, as ligações acontecem mas nada é gravado no painel.

### 4.4 Resultado estruturado (reunião agendada, WhatsApp…)

Para o painel classificar o resultado das ligações, o assistente do Vapi
precisa devolver uma análise estruturada. Em **Analysis → Structured Data
Schema**, configure um objeto com:

| Campo | Valores |
|---|---|
| `tipo` | `reuniao_agendada`, `whatsapp_capturado`, `recusa`, `retornar` |
| `detalhe` | texto livre com o resumo do combinado |
| `agendado_para` | data/hora ISO 8601, quando houver reunião |

Sem essa configuração o sistema continua funcionando: as ligações e
transcrições são gravadas normalmente, e chamadas atendidas caem em
"Sem interesse" por falta de classificação.

---

## 5. Discador (agendamento)

O discador é a rota `/api/discador/tick`: um endpoint HTTP comum, protegido por
segredo, que a cada chamada executa **uma** passada (no máximo uma ligação).
Quem o aciona repetidamente é um **agendador externo**.

> **Por que não o cron da Vercel:** o plano Hobby executa cron no máximo
> **1×/dia**, o que não serve para discar, e um `vercel.json` com agendamento
> por minuto faz o deploy falhar. Por isso o projeto **não tem `vercel.json`** —
> o agendamento é externo. Se um dia migrar para o plano Pro, dá para voltar ao
> cron nativo criando um `vercel.json` com a seção `crons`.

### 5.1 Configurar o agendador (cron-job.org)

1. Gere um segredo e coloque em `CRON_SECRET` (nas variáveis da Vercel também).
2. Crie a conta em [cron-job.org](https://cron-job.org) e cadastre um job:
   - **URL:** `https://<seu-dominio>/api/discador/tick`
   - **Método:** `GET`
   - **Intervalo:** a cada 1 minuto
   - **Header** (em *Advanced → Headers*):
     `Authorization: Bearer <valor-do-CRON_SECRET>`
3. Salve e ative.

Sem esse header, o endpoint responde `401` e nenhuma ligação acontece — este é
o erro mais comum na configuração.

Deixar o job rodando o dia inteiro é seguro: fora da janela de horário da
campanha, cada passada apenas responde `nada_a_fazer` sem discar.

### 5.2 Testar

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<seu-dominio>/api/discador/tick
```

Respostas possíveis: `nada_a_fazer`, `linha_ocupada`, `discou`,
`lead_tomado`, `falha_ao_discar`.

---

## 6. Deploy na Vercel

1. Importe o repositório na Vercel (framework detectado: Next.js).
2. Em **Settings → Environment Variables**, cadastre todas as variáveis da
   tabela abaixo.
3. Deploy. Depois:
   - volte ao passo 4.3 e aponte o webhook do Vapi para o domínio real;
   - volte ao passo 5.1 e aponte o agendador externo para o domínio real.

O plano Hobby atende — não há cron nativo em uso (ver seção 5).

### Variáveis de ambiente

| Variável | Onde obter | Exposta ao navegador? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (`anon`) | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (`service_role`) | **Não** |
| `MOTOR_DE_VOZ` | `vapi` (único implementado) | Não |
| `VAPI_API_KEY` | Vapi → API Keys | **Não** |
| `VAPI_PHONE_NUMBER_ID` | Vapi → Phone Numbers | Não |
| `VAPI_WEBHOOK_SECRET` | você define; igual ao Server URL secret | **Não** |
| `CRON_SECRET` | você define | **Não** |
| `VAPI_MODELO` | opcional (padrão `gpt-4o-mini`) | Não |
| `VAPI_VOICE_ID` | opcional (voz do ElevenLabs) | Não |

---

## 7. Operação do dia a dia

### Criar uma campanha

```sql
insert into campaigns (tenant_id, script_id, nome, objetivo, janela_horario)
values (
  '<id-do-tenant>',
  '<id-do-script-ativo>',
  'Prospecção — clínicas BH',
  'prospeccao',
  '{"dias":[1,2,3,4,5],"inicio":"09:00","fim":"18:00"}'::jsonb
)
returning id;
```

`objetivo` aceita `prospeccao`, `cobranca`, `rechurn` ou `followup` — o sistema
não é específico de prospecção. Em `janela_horario`, `dias` vai de `0`
(domingo) a `6` (sábado), e os horários são de Brasília.

### Importar leads

```sql
insert into leads (tenant_id, campaign_id, empresa, telefone, nicho, regiao)
values
  ('<tenant>', '<campanha>', 'Clínica Exemplo', '+5531999998888', 'saúde', 'BH'),
  ('<tenant>', '<campanha>', 'Outra Empresa',   '+5531988887777', 'varejo', 'BH');
```

Telefones em formato E.164 (`+55` + DDD + número).

### Iniciar a campanha

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<seu-dominio>/api/campanhas/<id-da-campanha>/iniciar
```

Isso cria o assistente no motor de voz a partir do script, marca a campanha
como `ativa` e coloca os leads na fila. O discador começa a trabalhar na
próxima passada dentro da janela de horário.

### Pausar

```sql
update campaigns set status = 'pausada' where id = '<id-da-campanha>';
```

O discador ignora campanhas que não estejam `ativa`. Uma ligação já em curso
segue até o fim (não é derrubada).

---

## 8. Premissas e limitações conhecidas

Decisões conscientes deste estágio, registradas para não virarem surpresa:

**Uma única linha telefônica.** Existe um número de origem, então o sistema
disca **uma ligação por vez no total** — não por cliente. Se dois parceiros
tiverem campanhas ativas ao mesmo tempo, uma serializa atrás da outra, mesmo
sendo tenants diferentes. Vender "ligações simultâneas" a um segundo parceiro
exige **contratar mais números/linhas**; é limite de capacidade real, não de
código. O ponto de mudança está em `src/lib/discador/tick.ts` (a checagem de
chamada em voo passaria a ser por linha).

**Timeout de chamada travada (10 min).** Se o webhook do Vapi demorar mais que
isso, o discador considera a chamada perdida e reenfileira o lead — mesmo que a
ligação tenha sido atendida com sucesso. O dado não se perde (quando o webhook
chega, a chamada é corrigida com transcrição e resultado reais), mas a empresa
pode ser discada de novo depois de já ter, por exemplo, agendado reunião.
Sintoma a vigiar nos primeiros clientes: lead com resultado positivo e, depois
dessa ligação, status de volta para a fila. Ajuste `TIMEOUT_DISCAGEM_MIN` em
`src/lib/discador/tick.ts` com dados reais de duração.

**Ligações sem correlação.** Chamadas feitas fora do discador (ex.: teste pelo
dashboard do Vapi) chegam ao webhook sem vínculo com um lead. São registradas
no log do servidor com o id da chamada, e não aparecem no painel do cliente.
Se isso aparecer com frequência nos logs da Vercel, é sinal de que alguém está
discando por fora do sistema.

**Colunas além da especificação original.** Para o discador funcionar foram
acrescentadas: `leads.proximo_contato_em`, `leads.ultima_discagem_em`,
`leads.chamada_atual_id`, `campaigns.assistente_id` e
`calls.chamada_externa_id`.

**Next.js 14 com CVEs em aberto.** O projeto está fixado na 14.2.35, a última
correção da linha 14. Os avisos restantes do `npm audit` afetam **todas** as
versões estáveis do Next publicadas até hoje (inclusive a 16.x) — a correção
existe apenas em pré-release. Revisite quando sair um patch estável:
`npm audit` e, se houver correção dentro da linha 14, `npm i next@14`.

---

## 9. Diagnóstico rápido

| Sintoma | Causa provável |
|---|---|
| Login funciona mas aparece "acesso ainda não liberado" | Falta a linha em `profiles` (passo 3.3) |
| Painel vazio, sem erro | RLS ativo e usuário em outro tenant, ou não há dados ainda |
| Campanha ativa mas nenhuma ligação sai | Agendador externo não configurado ou desativado (passo 5.1); confira o histórico do job no cron-job.org |
| Discador sempre responde `nada_a_fazer` | Fora da janela de horário, campanha não `ativa`, ou leads sem `em_fila` |
| Discador responde `linha_ocupada` sem parar | Chamada travada; confira `leads` com `status='discado'` |
| Ligações acontecem mas não aparecem no painel | Webhook não configurado ou secret divergente (passo 4.3) |
| Resultado sempre "Sem interesse" | Falta a análise estruturada no assistente (passo 4.4) |
| `401` no webhook | `VAPI_WEBHOOK_SECRET` diferente do secret configurado no Vapi |
| `401` no discador | Header `Authorization: Bearer <CRON_SECRET>` ausente ou divergente no job do agendador (passo 5.1) |
| Deploy da Vercel falha por causa de cron | Algum `vercel.json` com seção `crons` voltou ao repositório; o plano Hobby não aceita agendamento por minuto |
