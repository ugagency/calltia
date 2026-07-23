// Tipos que espelham o schema do Supabase (migrations em supabase/migrations).
// Fonte da verdade é o SQL; estes tipos são a visão do lado TypeScript.

export type ObjetivoCampanha = 'prospeccao' | 'cobranca' | 'rechurn' | 'followup';
export type StatusCampanha = 'rascunho' | 'ativa' | 'pausada' | 'concluida';
export type StatusLead = 'novo' | 'em_fila' | 'discado' | 'concluido';
export type StatusChamada = 'atendida' | 'nao_atendida' | 'voicemail' | 'ocupado';
export type TipoOutcome = 'reuniao_agendada' | 'whatsapp_capturado' | 'recusa' | 'retornar';
export type MotorVoz = 'vapi' | 'pipecat';

// janela_horario (jsonb). dias segue a convenção de Date.getUTCDay():
// 0=domingo .. 6=sábado. Horários em America/Sao_Paulo.
// O formato do sistema é array ([1,2,3,4,5]); campanhas criadas à mão podem
// trazer uma string ("1 2 3 4 5"), que o discador normaliza (ver janela.ts).
export interface JanelaHorario {
  dias: number[] | string;
  inicio: string; // "HH:MM"
  fim: string; // "HH:MM"
}

export interface Tenant {
  id: string;
  nome: string;
  marca: string;
  ativo: boolean;
  criado_em: string;
}

export interface Script {
  id: string;
  tenant_id: string;
  nome: string;
  conteudo: string;
  versao: number;
  ativo: boolean;
  criado_em: string;
}

export interface Campaign {
  id: string;
  tenant_id: string;
  script_id: string;
  nome: string;
  objetivo: ObjetivoCampanha;
  status: StatusCampanha;
  janela_horario: JanelaHorario;
  assistente_id: string | null;
  criado_em: string;
}

export interface Lead {
  id: string;
  tenant_id: string;
  campaign_id: string;
  empresa: string;
  telefone: string;
  nicho: string | null;
  dor_mapeada: string | null;
  porte: string | null;
  regiao: string | null;
  status: StatusLead;
  tentativas: number;
  proximo_contato_em: string | null;
  ultima_discagem_em: string | null;
  chamada_atual_id: string | null;
  criado_em: string;
}

export interface Call {
  id: string;
  tenant_id: string;
  lead_id: string;
  campaign_id: string;
  iniciada_em: string | null;
  duracao_seg: number | null;
  status_chamada: StatusChamada;
  transcricao: string | null;
  gravacao_url: string | null;
  custo_estimado: number | null;
  motor: MotorVoz;
  chamada_externa_id: string | null;
  criado_em: string;
}

export interface Outcome {
  id: string;
  tenant_id: string;
  call_id: string;
  tipo: TipoOutcome;
  detalhe: string | null;
  agendado_para: string | null;
  criado_em: string;
}
