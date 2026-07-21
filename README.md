# Sistema de Ligações com IA — Vettia

Serviço gerenciado white-label de ligações telefônicas com IA de voz. A Vettia
opera as campanhas; cada cliente parceiro edita apenas o próprio script de
vendas e acompanha as próprias ligações.

**Para colocar no ar, siga o [SETUP.md](./SETUP.md)** — ele cobre Supabase,
Vapi, trunk SIP, variáveis de ambiente e o cadastro do primeiro cliente.

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha seguindo o SETUP.md
npm run dev
```

## Organização do código

| Caminho | Responsabilidade |
|---|---|
| `supabase/migrations/` | Schema, isolamento entre clientes (RLS) e índices |
| `src/lib/voz/` | Adaptador do motor de voz — **única** parte que conhece o Vapi |
| `src/lib/discador/` | Discagem progressiva: janela de horário, fila, retry |
| `src/app/api/` | Discador (cron), webhook de retorno e controle de campanha |
| `src/app/painel/` | Painel do cliente: script e ligações |

## Princípios que o código preserva

- **Multi-tenant desde o dia 1.** Toda tabela tem `tenant_id` e o isolamento é
  garantido pelo banco (RLS), não só pelo front.
- **O motor de voz é trocável e invisível ao cliente.** Todo o sistema conversa
  com a interface `MotorDeVoz` (`src/lib/voz/tipos.ts`); migrar para outro
  motor é implementá-la, sem tocar em painel nem orquestração.
- **Discagem progressiva, nunca preditiva.** Uma ligação por vez, sem
  abandono de chamadas (regra da Anatel).
- **Agnóstico de objetivo.** Prospecção, cobrança, re-churn e follow-up são
  campanhas diferentes, não códigos diferentes.
- **Custo e telefonia são operação da Vettia.** Não aparecem em nenhuma tela do
  cliente.
