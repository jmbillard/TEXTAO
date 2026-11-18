import type { Pessoa } from '../modelo/tipos';
import { conectar } from './armazenamento';

/* Quem está usando o app. É o único ponto do código que sabe de onde vem a identidade:
   hoje, do Cloudflare Access (quando o site está atrás dele) ou de um perfil local.
   Trocar o provedor de login (Microsoft 365 pelo Access, por exemplo) não muda mais nada no app. */

export interface Identidade extends Pessoa {
  /** "acesso" = veio do login na porta (Cloudflare Access); "local" = digitado neste navegador. */
  origem: 'acesso' | 'local';
}

const CHAVE = 'roteirista.perfil';

const nomeDoEmail = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');

/** O Cloudflare Access expõe quem fez login neste endereço, no mesmo domínio do site. */
async function doAcesso(): Promise<Identidade | null> {
  try {
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 2500);
    const r = await fetch('/cdn-cgi/access/get-identity', { credentials: 'same-origin', signal: controle.signal });
    clearTimeout(prazo);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    const d = (await r.json()) as { email?: string; name?: string };
    if (!d.email) return null;
    return { email: d.email.toLowerCase(), nome: d.name?.trim() || nomeDoEmail(d.email), origem: 'acesso' };
  } catch {
    return null;
  }
}

function local(): Identidade | null {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Pessoa | null;
    return p?.nome ? { nome: p.nome, email: p.email ?? '', origem: 'local' } : null;
  } catch {
    return null;
  }
}

export interface Sessao {
  identidade: Identidade | null;
  /** Há servidor esperando o perfil local: depois de se identificar, os roteiros passam a ir para lá. */
  pedePerfil: boolean;
}

/** Descobre quem está usando e onde os roteiros ficam guardados (servidor ou navegador). */
export async function iniciarSessao(): Promise<Sessao> {
  const perfil = local();
  const conexao = await conectar(perfil);
  if (conexao.eu) return { identidade: conexao.eu, pedePerfil: false };
  return { identidade: (await doAcesso()) ?? perfil, pedePerfil: conexao.pedePerfil };
}

export function salvarPerfilLocal(pessoa: Pessoa): Identidade {
  const limpo = { nome: pessoa.nome.trim(), email: pessoa.email.trim().toLowerCase() };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(limpo));
  } catch {
    /* sem armazenamento local, vale só nesta visita */
  }
  return { ...limpo, origem: 'local' };
}

/** Endereço que encerra a sessão do Cloudflare Access. */
export const SAIR_DO_ACESSO = '/cdn-cgi/access/logout';
