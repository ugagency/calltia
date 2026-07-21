import type { JanelaHorario } from '@/lib/tipos';

// Avaliação da janela de horário das campanhas no fuso America/Sao_Paulo.
//
// O Brasil não adota horário de verão desde 2019, então America/Sao_Paulo é
// um deslocamento fixo de UTC-3. Se isso voltar a mudar, esta constante (e a
// aritmética abaixo) precisa ser revista para usar o offset real por data.
const SP_OFFSET_MIN = -180; // UTC-3

function hhmmParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Componentes de calendário/relógio de `utc` como observados em São Paulo.
function componentesSP(utc: Date): { dia: number; minutoDoDia: number } {
  const deslocado = new Date(utc.getTime() + SP_OFFSET_MIN * 60000);
  return {
    dia: deslocado.getUTCDay(),
    minutoDoDia: deslocado.getUTCHours() * 60 + deslocado.getUTCMinutes(),
  };
}

function janelaValida(janela: JanelaHorario | null | undefined): janela is JanelaHorario {
  return !!janela && Array.isArray(janela.dias) && !!janela.inicio && !!janela.fim;
}

// `agora` cai dentro da janela permitida (dia da semana + faixa de hora)?
export function dentroDaJanela(agora: Date, janela: JanelaHorario): boolean {
  if (!janelaValida(janela)) return false;
  const { dia, minutoDoDia } = componentesSP(agora);
  if (!janela.dias.map(Number).includes(dia)) return false;
  return minutoDoDia >= hhmmParaMin(janela.inicio) && minutoDoDia < hhmmParaMin(janela.fim);
}

// Primeiro instante >= `apartir` que está dentro da janela. Usado pelo retry
// para reagendar num horário válido (as tentativas caem em horários
// diferentes, respeitando dias e faixa de hora). Se `apartir` já está dentro
// da janela, retorna o próprio `apartir`.
export function proximoHorarioValido(apartir: Date, janela: JanelaHorario): Date {
  if (!janelaValida(janela)) return apartir;
  const inicioMin = hhmmParaMin(janela.inicio);
  const fimMin = hhmmParaMin(janela.fim);
  const dias = janela.dias.map(Number);

  for (let i = 0; i < 14; i++) {
    const base = new Date(apartir.getTime() + i * 24 * 60 * 60000);
    const { dia } = componentesSP(base);
    if (!dias.includes(dia)) continue;

    // Data de calendário (em SP) do dia candidato.
    const spBase = new Date(base.getTime() + SP_OFFSET_MIN * 60000);
    const ano = spBase.getUTCFullYear();
    const mes = spBase.getUTCMonth();
    const diaMes = spBase.getUTCDate();

    // Converte um horário de parede SP (minutos do dia) de volta para UTC:
    // UTC = SP + 3h  →  subtrair o offset (que é negativo).
    const meiaNoiteSpEmUtc = Date.UTC(ano, mes, diaMes, 0, 0) - SP_OFFSET_MIN * 60000;
    const abertura = new Date(meiaNoiteSpEmUtc + inicioMin * 60000);
    const fechamento = new Date(meiaNoiteSpEmUtc + fimMin * 60000);

    if (apartir <= abertura) return abertura; // janela abre mais tarde nesse dia
    if (apartir < fechamento) return apartir; // já estamos dentro da janela
    // janela já fechou nesse dia — tenta o próximo dia permitido
  }

  return apartir; // fallback defensivo (janela sem dias válidos)
}
