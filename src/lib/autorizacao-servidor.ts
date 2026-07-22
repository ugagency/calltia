import 'server-only';
import { timingSafeEqual } from 'node:crypto';

// Comparação de segredos resistente a timing. Retorna false (em vez de
// lançar) quando os tamanhos diferem.
export function segredoConfere(recebido: string | null, esperado: string | undefined): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Autoriza operações de servidor da Vettia (discador e controle de campanha).
// Quem chama — o agendador externo que aciona o discador, ou um disparo
// manual — precisa enviar `Authorization: Bearer <CRON_SECRET>`.
export function autorizadoComoServidor(request: Request): boolean {
  const header = request.headers.get('authorization');
  const esperado = process.env.CRON_SECRET;
  if (!header || !esperado) return false;
  return segredoConfere(header, `Bearer ${esperado}`);
}
