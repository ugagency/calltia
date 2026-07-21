-- Suporte à orquestração (Bloco 3). Migration aditiva: não altera as tabelas
-- já revisadas no Bloco 1, só acrescenta o que o discador e o webhook precisam.

-- Marcador do ciclo de discagem em voo. O discador grava aqui o id da
-- chamada externa assim que a dispara; o webhook só mexe no estado do lead
-- se o evento recebido casar com este id. Assim, um webhook atrasado que
-- chega depois de o retry já ter reenfileirado o lead (novo ciclo) ainda é
-- registrado em `calls`/`outcomes` para histórico, mas NÃO sobrescreve o
-- estado do ciclo novo. Fica null quando não há chamada em voo.
alter table leads add column chamada_atual_id text;

-- Idempotência de outcome: no máximo um outcome por call. O webhook pode ser
-- reentregue pelo motor de voz; a chamada é deduplicada por
-- calls.chamada_externa_id (unique, Bloco 1) e o outcome por este índice.
-- Substitui o índice não-único de mesmo nome criado no Bloco 1.
drop index if exists idx_outcomes_call;
create unique index idx_outcomes_call on outcomes (call_id);
