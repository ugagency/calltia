'use server';

import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { exigirSessao } from '@/lib/tenant';
import type { Script } from '@/lib/tipos';

export interface EstadoAcao {
  ok?: boolean;
  erro?: string;
}

// Histórico é append-only: salvar NUNCA sobrescreve uma versão existente —
// cria uma nova, incrementando `versao`, e desativa a anterior. Reativar uma
// versão antiga também cria uma versão nova com o mesmo conteúdo, de modo
// que o histórico nunca é reescrito.
async function publicarNovaVersao(conteudo: string, nome: string): Promise<EstadoAcao> {
  const texto = conteudo.trim();
  if (!texto) return { erro: 'O script não pode ficar vazio.' };

  const { tenant } = await exigirSessao();
  const supabase = criarClienteServidor();

  const { data: ultima } = await supabase
    .from('scripts')
    .select('versao')
    .eq('tenant_id', tenant.id)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle<{ versao: number }>();

  // Desativa a versão ativa ANTES de inserir a nova: há um índice único
  // parcial garantindo no máximo uma versão ativa por tenant.
  const { error: erroDesativar } = await supabase
    .from('scripts')
    .update({ ativo: false })
    .eq('tenant_id', tenant.id)
    .eq('ativo', true);
  if (erroDesativar) return { erro: 'Não foi possível salvar. Tente de novo.' };

  const { error: erroInserir } = await supabase.from('scripts').insert({
    tenant_id: tenant.id,
    nome,
    conteudo: texto,
    versao: (ultima?.versao ?? 0) + 1,
    ativo: true,
  });
  if (erroInserir) return { erro: 'Não foi possível salvar. Tente de novo.' };

  revalidatePath('/painel/script');
  return { ok: true };
}

export async function salvarScript(
  _estadoAnterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const conteudo = String(formData.get('conteudo') ?? '');
  const nome = String(formData.get('nome') ?? '').trim() || 'Script de vendas';
  return publicarNovaVersao(conteudo, nome);
}

export async function reativarVersao(
  _estadoAnterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const scriptId = String(formData.get('scriptId') ?? '');
  if (!scriptId) return { erro: 'Versão inválida.' };

  const { tenant } = await exigirSessao();
  const supabase = criarClienteServidor();

  const { data: antiga } = await supabase
    .from('scripts')
    .select('*')
    .eq('id', scriptId)
    .eq('tenant_id', tenant.id)
    .maybeSingle<Script>();
  if (!antiga) return { erro: 'Versão não encontrada.' };

  return publicarNovaVersao(antiga.conteudo, antiga.nome);
}
