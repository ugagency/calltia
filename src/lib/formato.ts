import type { StatusChamada, TipoOutcome } from '@/lib/tipos';

const FUSO = 'America/Sao_Paulo';

export function formatarDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatarDuracao(segundos: number | null): string {
  if (segundos === null || segundos < 0) return '—';
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}min ${String(seg).padStart(2, '0')}s`;
}

// Rótulos voltados ao cliente: linguagem do negócio, sem jargão técnico.
export const ROTULO_STATUS: Record<StatusChamada, string> = {
  atendida: 'Atendida',
  nao_atendida: 'Não atendida',
  voicemail: 'Caixa postal',
  ocupado: 'Ocupado',
};

export const ROTULO_RESULTADO: Record<TipoOutcome, string> = {
  reuniao_agendada: 'Reunião agendada',
  whatsapp_capturado: 'WhatsApp capturado',
  recusa: 'Sem interesse',
  retornar: 'Retornar depois',
};
