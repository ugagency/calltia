import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Cliente com a chave service-role: ignora Row Level Security. Uso
// exclusivo de código que roda no servidor sem um usuário autenticado
// (webhook do motor de voz, discador). O pacote `server-only` faz o build
// falhar se este módulo for importado em algo que possa ir para o bundle
// do cliente.
//
// Como aqui não há RLS para barrar um tenant_id errado: rotas que usam
// este cliente nunca devem aceitar tenant_id como input direto (do
// payload de um webhook, de metadados de terceiros, etc.). Sempre derive
// o tenant a partir de uma linha já existente e confiável — por exemplo
// `select tenant_id from leads where id = :leadId`.
export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL não configurada.');
  if (!chave) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');

  return createClient(url, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
