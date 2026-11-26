/* A seção Pessoas da Configuração (#77), as regras sem rede: quem entrou e quem saiu do quadro (os membros do quadro
   do Trello comparados com a tabela designers do Teable) e quem é administrador. A regra de administrador do app
   inteiro é esta: quem está no CADASTRO_ADMINS do Portainer (a chave-mestra, sempre administrador) mais quem foi
   salvo na tela (ADMINISTRADORES, em JSON). Os membros do quadro são a fonte por enquanto (ADR 0006): o resto do
   PROMeiro só vê "designer" e "administrador", nunca o Trello. O mesmo módulo serve ao servidor e ao navegador. */
import { nomeComparavel } from './ligarPeloNome.ts';

/** Um membro do quadro, como o Trello lista (o e-mail só quando o Trello dá). */
export interface MembroDoQuadro {
  id: string;
  nome: string;
  email: string;
}
/** Uma linha da tabela designers: o registro no Teable, o nome, o status, o e-mail e o id do membro no Trello. */
export interface Designer {
  registro: string;
  nome: string;
  ativo: boolean;
  email: string;
  idNoTrello: string;
}
/** O que mudou no quadro: "Fulana é nova no quadro" (entrou) ou "Fulano saiu do quadro" (saiu). */
export interface Novidade {
  /** a chave com que se ignora (e desfaz): entrou:<membro> ou saiu:<registro> */
  chave: string;
  tipo: 'entrou' | 'saiu';
  nome: string;
  email: string;
  /** o id do membro no Trello ('' no designer sem o id, que contou pelo nome) */
  membro: string;
  /** o registro do designer na tabela (só em quem saiu) */
  registro?: string;
}

/** O designer é este membro: pelo id do Trello; sem o id na tabela, pelo nome (sem caixa, acento e pontuação). */
const eOMembro = (d: Designer, m: MembroDoQuadro) => (d.idNoTrello ? d.idNoTrello === m.id : !!nomeComparavel(d.nome) && nomeComparavel(d.nome) === nomeComparavel(m.nome));

/**
 * Os membros do quadro × a tabela designers. Entrou: o membro que não está na tabela (nem como inativo). Saiu: o
 * designer ativo que não está mais no quadro. Na ordem: quem entrou, depois quem saiu.
 */
export function novidadesDoQuadro(membros: readonly MembroDoQuadro[], designers: readonly Designer[]): Novidade[] {
  const entrou = membros
    .filter((m) => !designers.some((d) => eOMembro(d, m)))
    .map((m): Novidade => ({ chave: `entrou:${m.id}`, tipo: 'entrou', nome: m.nome, email: m.email, membro: m.id }));
  const saiu = designers
    .filter((d) => d.ativo && !membros.some((m) => eOMembro(d, m)))
    .map((d): Novidade => ({ chave: `saiu:${d.registro}`, tipo: 'saiu', nome: d.nome, email: d.email, membro: d.idNoTrello, registro: d.registro }));
  return [...entrou, ...saiu];
}

/* ---------- administradores ---------- */

type EnvDosAdministradores = { CADASTRO_ADMINS?: string; ADMINISTRADORES?: string };
const EMAIL = /^[^\s@,;"]+@[^\s@,;"]+$/;
const emailLimpo = (e: string) => String(e ?? '').trim().toLowerCase();

/** A chave-mestra: os e-mails do CADASTRO_ADMINS (separados por vírgula), sem caixa. */
export const chaveMestra = (env: EnvDosAdministradores) => [...new Set(String(env.CADASTRO_ADMINS ?? '').split(',').map(emailLimpo).filter(Boolean))];
/** Os salvos na tela (ADMINISTRADORES, uma lista de e-mails em JSON); o que não é e-mail fica de fora. */
export function administradoresSalvos(env: EnvDosAdministradores): string[] {
  let lidos: unknown = [];
  try {
    lidos = JSON.parse(env.ADMINISTRADORES || '[]');
  } catch {
    lidos = [];
  }
  return Array.isArray(lidos) ? [...new Set(lidos.filter((e): e is string => typeof e === 'string').map(emailLimpo).filter((e) => EMAIL.test(e)))] : [];
}

/** A regra de administrador do PROMeiro inteiro: a chave-mestra ou o salvo na tela. */
export function ehAdministrador(email: string, env: EnvDosAdministradores): boolean {
  const e = emailLimpo(email);
  return !!e && (chaveMestra(env).includes(e) || administradoresSalvos(env).includes(e));
}

export interface Administrador {
  email: string;
  /** o nome de quem já entrou no PROMeiro ('' para quem ainda não entrou) */
  nome: string;
  /** está no CADASTRO_ADMINS (não sai pela tela) */
  mestra: boolean;
}
/** Os administradores como a tela mostra: os salvos e a chave-mestra, pelo nome (quem não tem nome, pelo e-mail). */
export function administradoresDaTela(env: EnvDosAdministradores, usuarios: readonly { email: string; nome: string }[]): Administrador[] {
  const mestra = chaveMestra(env);
  const nomeDe = (email: string) => usuarios.find((u) => emailLimpo(u.email) === email)?.nome ?? '';
  return [...new Set([...administradoresSalvos(env), ...mestra])]
    .map((email) => ({ email, nome: nomeDe(email), mestra: mestra.includes(email) }))
    .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
}

/** Pôr um administrador: a lista salva nova, ou o erro. */
export function porAdministrador(env: EnvDosAdministradores, email: string): { salvos: string[] } | { erro: string } {
  const e = emailLimpo(email);
  if (!EMAIL.test(e)) return { erro: 'Escreva um e-mail.' };
  return { salvos: [...new Set([...administradoresSalvos(env), e])] };
}

/** Tirar um administrador: ninguém tira a si mesmo, e a chave-mestra só sai pelo Portainer. */
export function tirarAdministrador(env: EnvDosAdministradores, email: string, eu: string): { salvos: string[] } | { erro: string } {
  const e = emailLimpo(email);
  if (e === emailLimpo(eu)) return { erro: 'Não dá para tirar você mesmo.' };
  if (chaveMestra(env).includes(e)) return { erro: `${e} está no CADASTRO_ADMINS do Portainer (chave-mestra): só sai por lá.` };
  return { salvos: administradoresSalvos(env).filter((x) => x !== e) };
}
