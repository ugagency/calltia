// Este módulo traduz o formato não-tipado da API/webhook do Vapi (JSON de
// terceiro) para os tipos internos. Lidar com `any` nas bordas dessa
// tradução é intencional; a fronteira tipada do sistema é a interface
// MotorDeVoz, cujos retornos aqui são todos tipados.
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import type {
  ChamadaNormalizada,
  CriarAssistenteParams,
  CriarAssistenteResultado,
  DispararLigacaoParams,
  DispararLigacaoResultado,
  MotorDeVoz,
  ResultadoNormalizado,
  StatusChamada,
  TipoOutcome,
} from './tipos';

// Implementação do MotorDeVoz usando a API REST do Vapi (https://api.vapi.ai).
// Único módulo do sistema que conhece o formato de dados do Vapi — qualquer
// mudança na API do Vapi, ou uma futura troca de motor, fica isolada aqui.
//
// Nomes de campos conferidos contra a documentação pública do Vapi
// (docs.vapi.ai) em 2026-07. A API do Vapi evolui; revalide os nomes de
// campo abaixo (em especial em normalizarWebhook) contra a documentação
// atual antes de operar em produção.

const VAPI_BASE_URL = 'https://api.vapi.ai';

function credenciais() {
  const apiKey = process.env.VAPI_API_KEY;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!apiKey) throw new Error('VAPI_API_KEY não configurada.');
  if (!phoneNumberId) throw new Error('VAPI_PHONE_NUMBER_ID não configurada.');
  return { apiKey, phoneNumberId };
}

async function vapiFetch(caminho: string, init: RequestInit): Promise<any> {
  const { apiKey } = credenciais();
  const resposta = await fetch(`${VAPI_BASE_URL}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Vapi ${caminho} falhou (${resposta.status}): ${corpo}`);
  }
  return resposta.json();
}

export class VapiMotor implements MotorDeVoz {
  async criarAssistente({
    nome,
    script,
  }: CriarAssistenteParams): Promise<CriarAssistenteResultado> {
    const corpo = {
      name: nome,
      model: {
        provider: 'openai',
        model: process.env.VAPI_MODELO ?? 'gpt-4o-mini',
        messages: [{ role: 'system', content: script }],
      },
      voice: {
        provider: '11labs',
        voiceId: process.env.VAPI_VOICE_ID ?? 'default',
      },
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: 'pt-BR',
      },
    };

    const assistente = await vapiFetch('/assistant', {
      method: 'POST',
      body: JSON.stringify(corpo),
    });

    return { assistenteId: assistente.id };
  }

  async dispararLigacao({
    assistenteId,
    telefone,
    metadados,
  }: DispararLigacaoParams): Promise<DispararLigacaoResultado> {
    const { phoneNumberId } = credenciais();
    const corpo = {
      assistantId: assistenteId,
      phoneNumberId,
      customer: { number: telefone },
      // Metadata de correlação (leadId/campaignId/tenantId). Vai no `metadata`
      // de TOPO do corpo: é ele que o Vapi ecoa em `message.call.metadata` no
      // webhook. `assistantOverrides.metadata` grava no assistente e NÃO volta
      // em call.metadata — mandamos nos dois por segurança, e o parser do
      // webhook procura em ambos os locais.
      metadata: metadados,
      assistantOverrides: { metadata: metadados },
    };

    const chamada = await vapiFetch('/call', {
      method: 'POST',
      body: JSON.stringify(corpo),
    });

    return { chamadaExternaId: chamada.id };
  }

  normalizarWebhook(payload: unknown): ChamadaNormalizada | null {
    const mensagem = (payload as any)?.message;
    if (!mensagem || mensagem.type !== 'end-of-call-report') return null;

    const chamada = mensagem.call ?? {};
    const artifact = mensagem.artifact ?? {};
    // O metadata de correlação pode aparecer em locais diferentes conforme a
    // versão da API do Vapi. Procura em todos os candidatos plausíveis, na
    // ordem mais provável, e usa o primeiro que tiver leadId.
    const metadados = extrairMetadados(mensagem, chamada);

    if (!metadados.leadId) {
      // Fim de chamada SEM metadados de correlação. Diferente de um evento
      // de outro tipo (que é ruído esperado): aqui uma ligação real
      // aconteceu — número discado, minutos gastos — e não há como associá-la
      // a um lead. Causas típicas: teste manual pelo dashboard do Vapi, ou um
      // assistente disparado fora do discador. Registra alto para não sumir
      // silenciosamente; o id abaixo permite achar a chamada no painel do
      // motor de voz.
      //
      // DIAGNÓSTICO TEMPORÁRIO: loga o payload bruto (recortado) para ver onde
      // o Vapi realmente coloca o metadata nesta versão da API — a doc não é
      // confiável. Remover quando a correlação estiver estável.
      console.warn('[vapi] webhook sem correlacao — payload bruto para diagnostico', {
        chaves_message: Object.keys(mensagem ?? {}),
        chaves_call: Object.keys(chamada ?? {}),
        call_metadata: chamada.metadata ?? null,
        call_assistantOverrides_metadata: chamada.assistantOverrides?.metadata ?? null,
        message_metadata: mensagem.metadata ?? null,
        message_assistantOverrides_metadata: mensagem.assistantOverrides?.metadata ?? null,
      });
      console.warn(
        '[vapi] fim de chamada sem metadados de correlacao; nao foi associada a nenhum lead',
        {
          chamadaExternaId: chamada.id ?? null,
          telefone: chamada.customer?.number ?? null,
          endedReason: mensagem.endedReason ?? null,
        },
      );
      return null;
    }

    const duracaoSeg =
      typeof chamada.startedAt === 'number' && typeof chamada.endedAt === 'number'
        ? Math.round(chamada.endedAt - chamada.startedAt)
        : null;

    const custoEstimado =
      typeof chamada.cost === 'number'
        ? chamada.cost
        : Array.isArray(chamada.costs)
          ? chamada.costs.reduce((soma: number, item: any) => soma + (item?.cost ?? 0), 0)
          : null;

    const gravacaoUrl =
      artifact.recording?.stereoUrl ??
      artifact.recording?.mono?.combinedUrl ??
      artifact.recordingUrl ??
      null;

    const statusChamada = mapearStatusChamada(
      mensagem.endedReason ?? chamada.endedReason,
      duracaoSeg,
    );

    return {
      chamadaExternaId: chamada.id,
      leadId: metadados.leadId,
      campaignId: metadados.campaignId ?? null,
      iniciadaEm:
        typeof chamada.startedAt === 'number' ? new Date(chamada.startedAt).toISOString() : null,
      duracaoSeg,
      statusChamada,
      transcricao: artifact.transcript ?? null,
      gravacaoUrl,
      custoEstimado,
      motor: 'vapi',
      resultado: statusChamada === 'atendida' ? extrairResultado(mensagem) : null,
    };
  }
}

// Procura o metadata de correlação nos locais onde o Vapi pode ecoá-lo,
// conforme a versão da API. Retorna o primeiro objeto que tenha leadId; se
// nenhum tiver, retorna o primeiro não-vazio (para o log de diagnóstico) ou
// {}. Enviamos o metadata tanto no topo do /call (→ call.metadata) quanto em
// assistantOverrides.metadata, então cobrimos ambos aqui.
function extrairMetadados(mensagem: any, chamada: any): any {
  const candidatos = [
    chamada?.metadata,
    chamada?.assistantOverrides?.metadata,
    mensagem?.metadata,
    mensagem?.assistantOverrides?.metadata,
  ];
  for (const c of candidatos) {
    if (c && typeof c === 'object' && c.leadId) return c;
  }
  return candidatos.find((c) => c && typeof c === 'object') ?? {};
}

// Extrai o resultado de negócio da análise estruturada do Vapi
// (message.analysis.structuredData). Para isso funcionar, o assistente
// precisa estar configurado com um schema de structured output pedindo os
// campos abaixo — ver SETUP.md. Sem análise utilizável, cai em 'recusa'
// como resultado neutro (a ligação foi atendida mas nada foi capturado).
function extrairResultado(mensagem: any): ResultadoNormalizado {
  const dados = mensagem?.analysis?.structuredData ?? {};
  const tipo = normalizarTipoOutcome(dados.tipo ?? dados.resultado);
  return {
    tipo,
    detalhe:
      typeof dados.detalhe === 'string'
        ? dados.detalhe
        : (mensagem?.analysis?.summary ?? null),
    agendadoPara: typeof dados.agendado_para === 'string' ? dados.agendado_para : null,
  };
}

function normalizarTipoOutcome(valor: unknown): TipoOutcome {
  const v = String(valor ?? '').toLowerCase();
  if (v.includes('reuniao') || v.includes('agendad')) return 'reuniao_agendada';
  if (v.includes('whatsapp')) return 'whatsapp_capturado';
  if (v.includes('retorn')) return 'retornar';
  return 'recusa';
}

// Mapeia o endedReason do Vapi (dezenas de valores possíveis — busy,
// voicemail, no-answer, hangup por qualquer lado, erros de rede, etc.) para
// o vocabulário interno de status_chamada. Cobre os casos mais comuns por
// substring; qualquer motivo não reconhecido cai em 'atendida' quando houve
// duração de conversa, ou 'nao_atendida' caso contrário.
function mapearStatusChamada(
  endedReason: string | undefined,
  duracaoSeg: number | null,
): StatusChamada {
  const motivo = (endedReason ?? '').toLowerCase();
  if (motivo.includes('voicemail')) return 'voicemail';
  if (motivo.includes('busy')) return 'ocupado';
  if (motivo.includes('no-answer') || motivo.includes('did-not-answer')) return 'nao_atendida';
  return duracaoSeg !== null && duracaoSeg > 0 ? 'atendida' : 'nao_atendida';
}
