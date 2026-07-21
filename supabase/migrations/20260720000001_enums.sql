-- Tipos enumerados do domínio.
-- O sistema é agnóstico de caso de uso: novos objetivos de campanha entram
-- aqui sem mudar a estrutura das tabelas.

create type objetivo_campanha as enum (
  'prospeccao',
  'cobranca',
  'rechurn',
  'followup'
);

create type status_campanha as enum (
  'rascunho',
  'ativa',
  'pausada',
  'concluida'
);

create type status_lead as enum (
  'novo',
  'em_fila',
  'discado',
  'concluido'
);

create type status_chamada as enum (
  'atendida',
  'nao_atendida',
  'voicemail',
  'ocupado'
);

create type tipo_outcome as enum (
  'reuniao_agendada',
  'whatsapp_capturado',
  'recusa',
  'retornar'
);

create type motor_voz as enum (
  'vapi',
  'pipecat'
);
