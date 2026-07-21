// Contrato entre o resto do sistema e o motor de voz. Painel e orquestração
// só conversam com esta interface — nunca com o Vapi (ou qualquer outro
// motor) diretamente. Trocar de motor no futuro (ex.: Pipecat) significa
// escrever uma nova implementação desta interface, sem tocar em painel nem
// orquestração.

export type StatusChamada = 'atendida' | 'nao_atendida' | 'voicemail' | 'ocupado';

export type TipoOutcome =
  | 'reuniao_agendada'
  | 'whatsapp_capturado'
  | 'recusa'
  | 'retornar';

// Resultado de negócio da chamada, quando o motor consegue extraí-lo (via
// análise estruturada do próprio LLM da ligação). Extrair isso é específico
// de cada motor, então mora no adaptador — a orquestração só recebe o
// resultado já normalizado. null quando não há resultado a registrar
// (ex.: chamada não atendida).
export interface ResultadoNormalizado {
  tipo: TipoOutcome;
  detalhe: string | null;
  agendadoPara: string | null;
}

export interface CriarAssistenteParams {
  nome: string;
  script: string;
}

export interface CriarAssistenteResultado {
  assistenteId: string;
}

export interface DispararLigacaoParams {
  assistenteId: string;
  telefone: string;
  metadados: {
    leadId: string;
    campaignId: string;
    tenantId: string;
  };
}

export interface DispararLigacaoResultado {
  chamadaExternaId: string;
}

// Retorno normalizado do webhook do motor de voz.
//
// Propositalmente NÃO inclui tenantId: o motor de voz é uma origem externa,
// e o webhook não é uma requisição autenticada como um usuário do sistema.
// Ainda que o Vapi ecoe o tenantId enviado em dispararLigacao, quem grava em
// `calls` deve sempre derivar o tenant a partir de `leadId`
// (select tenant_id from leads where id = ...), nunca aceitar um tenant que
// veio de fora. Omitir o campo aqui torna esse erro impossível por tipo.
export interface ChamadaNormalizada {
  chamadaExternaId: string;
  leadId: string;
  // Informativo apenas: quem grava deriva a campanha (e o tenant) do lead,
  // nunca deste campo, que veio de fora.
  campaignId: string | null;
  iniciadaEm: string | null;
  duracaoSeg: number | null;
  statusChamada: StatusChamada;
  transcricao: string | null;
  gravacaoUrl: string | null;
  custoEstimado: number | null;
  motor: 'vapi' | 'pipecat';
  // Resultado de negócio, quando o motor o forneceu. A orquestração decide
  // se e como gravar em `outcomes`.
  resultado: ResultadoNormalizado | null;
}

export interface MotorDeVoz {
  criarAssistente(params: CriarAssistenteParams): Promise<CriarAssistenteResultado>;
  dispararLigacao(params: DispararLigacaoParams): Promise<DispararLigacaoResultado>;
  // Retorna null quando o payload recebido não é um evento de fim de
  // chamada (o motor pode mandar outros tipos de evento no mesmo endpoint).
  normalizarWebhook(payload: unknown): ChamadaNormalizada | null;
}
