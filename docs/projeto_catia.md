# Sistema de Ligações com IA — SSYS

> Documento-mestre do projeto. Serve como briefing de contexto para desenvolvimento
> (inclusive Claude Code) e como referência de decisões. Leia isto antes de escrever
> qualquer código.

---

## 1. O que é (em uma frase)

Um sistema de ligações telefônicas com IA de voz, operado como **serviço gerenciado
white-label** para os parceiros do ecossistema SSYS. A SSYS controla toda a operação;
o parceiro (cliente) só edita o script de vendas e vê os resultados das ligações.

**Não é** um SaaS self-service aberto ao público. É uma operação gerenciada com um
painel enxuto por cliente.

---

## 2. Modelo de negócio

- **Quem opera:** SSYS (você). Gerencia campanhas, telefonia, dados, tudo.
- **Quem é o cliente:** parceiros do ecossistema SSYS.
- **O que o cliente pode fazer:** editar o próprio script de vendas; ver os dados e
  resultados das próprias ligações. Nada além disso.
- **O que o cliente NÃO faz:** configurar telefonia, escolher voz, mexer em campanha,
  ver a plataforma por baixo. Isso é tudo SSYS.
- **Cobrança:** a definir por reunião agendada / resultado (recomendado) em vez de por
  minuto — esconde o custo variável e alinha incentivo. Decisão comercial, não técnica.

### Frentes de uso (em ordem de prioridade de ROI)
1. **Cobrança** — maior ROI, dor explícita, resultado em R$ recuperado. (Futura.)
2. **Re-churn / winback** — reativação de clientes perdidos. (Futura.)
3. **Follow-up de leads quentes** — segundo toque depois de WhatsApp/inbound. (Futura.)
4. **Prospecção fria B2B** — PRIMEIRA frente a validar. Ver seção 3.

> Decisão de arquitetura: o schema e a orquestração são **agnósticos de caso de uso**.
> Uma campanha tem "objetivo" e "script"; não é hard-coded para prospecção. Cobrança e
> re-churn viram configuração, não novo desenvolvimento.

---

## 3. Frente 1: prospecção fria B2B (o que validar primeiro)

**Hipótese a validar:** ligação fria por voz com IA, para telefone COMERCIAL de empresas
(não celular de sócio), em horário comercial, converte em reuniões a um custo menor que
um SDR humano.

**Por que B2B comercial e não celular pessoal:** taxa de atendimento em fixo comercial é
muito maior; apps anti-spam de celular matam a taxa de atendimento em número pessoal.

**Objetivo de cada ligação (micro, único):** passar do gatekeeper e agendar 15 minutos
com o decisor, OU capturar o WhatsApp do decisor. NÃO tentar vender na ligação.

**Fonte dos leads:** projeto Vettia (Google Places + Receita Federal), que já mapeia
empresas por nicho com dores de IA. O nicho e a dor entram no prompt do agente —
personalização que a concorrência (ex: SofIA) não tem.

**Critério de corte honesto:** após ~500 discagens calibradas, se o custo por reunião
agendada for maior que (salário + encargos de um SDR ÷ reuniões/mês dele), o formato
voz-primeiro não fecha. Nesse caso, inverter para WhatsApp-primeiro com voz no follow-up.

---

## 4. Arquitetura (quatro camadas)

```
┌─────────────────────────────────────────────────────────┐
│ CLIENTE (parceiro) — vê SÓ isto                          │
│   • Editar meu script    • Ver minhas ligações           │
└─────────────────────────────────────────────────────────┘
                          ↑ ↓
┌─────────────────────────────────────────────────────────┐
│ SSYS — controla tudo (invisível ao cliente)              │
│   • Supabase (dados por cliente)                         │
│   • Orquestração (dispara campanha, grava, retry)        │
│   • Painel multi-tenant (1 login por cliente)            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ MOTOR DE VOZ — trocável, cliente nunca vê                │
│   • Vapi (validação agora)  →  Pipecat (escala futura)   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ PROVEDORES — pagos por uso, iguais em qualquer motor     │
│   • Deepgram (STT) • LLM • ElevenLabs (TTS) • Trunk SIP  │
└─────────────────────────────────────────────────────────┘
```

**Princípio central:** o painel é da SSYS. O motor de voz é commodity trocável por baixo.
Trocar Vapi → Pipecat no futuro não migra cliente nenhum, porque o painel dele é o mesmo.

### Papel de cada peça

| Peça | O que faz | Tecnologia |
|------|-----------|------------|
| Painel | 2 telas pro cliente: script + resultados | React/Lovable sobre Supabase |
| Supabase | Guarda todos os dados, multi-tenant | Postgres (Supabase) |
| Orquestração | Puxa leads, dispara ligações, grava resultado, retry, follow-up | n8n OU Python |
| Motor de voz | Faz a ligação acontecer (loop STT→LLM→TTS + turn-taking) | Vapi (val.) / Pipecat (escala) |
| Provedores | Ouvir, pensar, falar, telefonar | Deepgram / LLM / ElevenLabs / trunk SIP nacional |

---

## 5. Decisão do motor de voz: Vapi agora, Pipecat depois

### Por quê Vapi na validação
- US$ 10 grátis + ~US$ 0,05/min de plataforma (o resto são os provedores, pagos igual).
- Orquestração de ligação (retry, voicemail, concorrência) já vem pronta e testada.
- API + webhook: cria assistente com o script, dispara chamada, devolve transcrição.
- Custo real total: ~US$ 0,15–0,40/min dependendo do stack. Irrelevante na fase de teste.
- Objetivo: validar a hipótese em DIAS, gastando dólares, não semanas de engenharia.

### Por quê Pipecat na escala
- Elimina a taxa de ~US$ 0,05/min de plataforma (só isso — provedores são iguais).
- Só vale quando um parceiro sozinho gera dezenas de milhares de min/mês.
- É self-hosted: você constrói e mantém a orquestração. Paga em tempo/ops.
- PoC do Pipecat já existe (pasta poc-voz) — é o plano de migração guardado.

### O que NÃO fazer
- NÃO montar o motor de voz "na mão" (STT/TTS from scratch). Vapi e Pipecat já são
  frameworks prontos. A escolha entre eles é só "quanto de orquestração vem pronto".
- NÃO pagar Autocalls/white-label de plataforma: a camada de revenda é SSYS (o painel).
- NÃO usar discador preditivo (regra Anatel, ver seção 8).

---

## 6. Schema do Supabase (multi-tenant desde o dia 1)

Regra de ouro: **toda tabela carrega `tenant_id`**. O painel filtra por ele no login.
É isso que faz "uma plataforma por cliente" ser, na verdade, uma plataforma só mostrando
fatias de dados diferentes.

### Tabelas centrais

- **tenants** — cada parceiro/cliente.
  `id, nome, marca, ativo, criado_em`

- **scripts** — o texto que o cliente edita. Versionado.
  `id, tenant_id, nome, conteudo, versao, ativo, criado_em, atualizado_em`

- **campaigns** — uma campanha de discagem.
  `id, tenant_id, script_id, nome, objetivo (prospeccao|cobranca|rechurn|followup),
   status (rascunho|ativa|pausada|concluida), janela_horario, criado_em`

- **leads** — empresas a ligar (importadas do Vettia).
  `id, tenant_id, campaign_id, empresa, telefone, nicho, dor_mapeada, porte, regiao,
   status (novo|em_fila|discado|concluido), tentativas, criado_em`

- **calls** — cada ligação individual.
  `id, tenant_id, lead_id, campaign_id, iniciada_em, duracao_seg, status_chamada
   (atendida|nao_atendida|voicemail|ocupado), transcricao, gravacao_url, custo_estimado,
   motor (vapi|pipecat), criado_em`

- **outcomes** — o que a ligação produziu.
  `id, tenant_id, call_id, tipo (reuniao_agendada|whatsapp_capturado|recusa|retornar),
   detalhe, agendado_para, criado_em`

### Segurança
- Row Level Security (RLS) no Supabase por `tenant_id` — cada cliente só enxerga o seu.
- O painel autentica e injeta `tenant_id` em toda query.
- Gravações/transcrições: atenção à LGPD (ver seção 8).

---

## 7. Painel do cliente (duas telas, só)

### Tela 1 — Editar meu script
- Campo de texto grande com o script atual.
- Salvar cria nova versão (não sobrescreve — histórico em `scripts.versao`).
- Linguagem do cliente: "meu script de vendas", não "system prompt".

### Tela 2 — Ver minhas ligações
- Lista de ligações com: empresa, data/hora, duração, status, resultado.
- Resumo no topo: total discado, % atendidas, reuniões agendadas.
- Clicar numa ligação: ver transcrição (e ouvir gravação, se permitido por LGPD).

### O que o painel NÃO tem
Configuração de telefonia, escolha de voz, controle de campanha, billing self-service.
Tudo isso é operação SSYS, fora do painel do cliente.

---

## 8. Compliance (Brasil, regras reais de 2026)

- **Origem Verificada (substituiu o 0303):** autenticação de chamadas obrigatória para
  quem origina +500 mil chamadas/mês desde 15/11/2025; rollout pra toda a rede até 2028.
  Você começa muito abaixo do gatilho, MAS aderir cedo ao selo aumenta taxa de atendimento
  (argumento de venda, não só compliance).
- **Chamadas curtas (até 6s):** monitoradas e bloqueadas pelas operadoras. NADA de
  discador preditivo que abandona chamada. Use **discagem progressiva** (uma por vez por
  linha).
- **Cobrança ≠ telemarketing ativo:** base legal contratual, mas valem CDC (sem
  constrangimento), janelas de horário e aviso de gravação.
- **Prospecção B2B:** legítimo interesse (LGPD) funciona com critério; dados públicos da
  Receita (via Vettia) ajudam a fundamentar.
- **LGPD nas gravações:** se o motor de voz for estrangeiro (Vapi/Autocalls em servidor
  fora do BR), gravações e transcrições de brasileiros exigem ajuste contratual com os
  parceiros e aviso de gravação na ligação. Pipecat self-hosted no BR resolve isso na raiz.
- **Telefonia:** usar **trunk SIP nacional** (número BR com reputação limpa). Número
  internacional ou mal originado cai em filtro de spam. Vale para Vapi e Pipecat.

---

## 9. Roadmap de fases

- [ ] **Fase 0 — Fundação**
      Criar projeto Supabase, rodar o schema (seção 6), ligar RLS por tenant_id.

- [ ] **Fase 1 — Validação da hipótese (Vapi)**
      Conta Vapi + trunk SIP nacional com número de teste. Agente v1 com fluxo único
      (gatekeeper → decisor → agendar 15min). Dados caindo no Supabase via webhook.
      Você mesmo como "cliente zero" (prospecção da própria SSYS). SEM painel ainda —
      você olha os dados direto no Supabase.

- [ ] **Fase 2 — Calibração**
      Rodar ~500 discagens de UM nicho do Vettia. Medir: taxa de atendimento, % que passa
      do gatekeeper, conversas >45s, reuniões por 100 discagens, custo por reunião.
      Decidir com o critério de corte (seção 3).

- [ ] **Fase 3 — Painel do cliente**
      Construir as duas telas (seção 7), multi-tenant, 1 login por parceiro. Vapi continua
      o motor por baixo. Onboarding do primeiro parceiro real.

- [ ] **Fase 4 — Novas frentes**
      Ativar cobrança / re-churn como novas campanhas (objetivo + script diferentes).
      Sem novo desenvolvimento estrutural — é configuração.

- [ ] **Fase 5 — Escala (só se justificar)**
      Migrar motor de voz para Pipecat self-hosted quando o volume de algum parceiro
      tornar a taxa de plataforma do Vapi significativa. Cliente não percebe a troca.

---

## 10. Infraestrutura — onde roda o quê

- **Desenvolvimento:** máquina local Windows (E:) com Claude Code. Iteração rápida.
- **Supabase:** nuvem (gerenciado). Já é Postgres de produção.
- **Orquestração (n8n ou Python):** decisão em aberto. Se n8n, usar instância SEPARADA
  da que roda Hermes/Ronaldim — não misturar produto de cliente com infra interna.
  Preferir Postgres (não SQLite) e, se houver volume paralelo, queue mode com Redis.
- **Motor de voz em produção:** quando sair do Vapi (nuvem) para Pipecat, usar VPS
  DEDICADA só para voz. Media server em tempo real é faminto de CPU e sensível a jitter;
  não pode dividir máquina com n8n/Hermes.
- **Telefonia:** trunk SIP nacional, plugado tanto no Vapi quanto no Pipecat.

---

## 11. Decisões em aberto (a resolver na hora certa)

- Orquestração: n8n vs Python puro. (n8n = mais rápido de montar e visual; Python = mais
  controle e menos dependência. Para multi-tenant com exceções por cliente, n8n tende a
  ganhar em manutenção.)
- Modelo de cobrança do cliente: por reunião vs por resultado vs mensalidade.
- Qual LLM no motor (Haiku vs gpt-4o-mini): decidir por latência + custo no teste.
- Qual voz pt-BR na ElevenLabs: decidir por teste cego de naturalidade.
- Trunk SIP: qual operadora/CPaaS nacional (avaliar qualidade de rota e Origem Verificada).

---

## 12. Glossário rápido

- **STT** — Speech-to-Text (fala → texto). Ex: Deepgram.
- **TTS** — Text-to-Speech (texto → fala). Ex: ElevenLabs.
- **LLM** — o "cérebro" que decide a resposta. Ex: Haiku, gpt-4o-mini.
- **Trunk SIP** — a "linha telefônica" digital que conecta o sistema à rede de telefonia.
- **Turn-taking** — saber quando a pessoa terminou de falar e quando interromper.
- **Multi-tenant** — um sistema só servindo vários clientes com dados isolados.
- **Gatekeeper** — quem atende antes do decisor (recepção, secretária).
- **Motor de voz** — Vapi ou Pipecat: orquestra o loop de voz de uma ligação.