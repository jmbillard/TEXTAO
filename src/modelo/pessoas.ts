/* A seção Pessoas da Configuração (#77), as regras sem rede: quem entrou e quem saiu (os designers que aparecem na
   produção da arte do Teable comparados com a tabela designers) e quem é administrador. A regra de administrador do
   app inteiro é esta: quem está no CADASTRO_ADMINS do Portainer (a chave-mestra, sempre administrador) mais quem foi
   salvo na tela (ADMINISTRADORES, em JSON). Nada do Trello (ADR 0006: por enquanto o PROMeiro só ESCREVE no Trello;
   lê do Teable): o resto do PROMeiro só vê "designer" e "administrador". O mesmo módulo serve ao servidor e ao
   navegador. */
import { nomeComparavel } from './ligarPeloNome.ts';

/** Um designer que aparece na produção da arte (a coluna designers), com a entrada mais recente em que aparece. */
export interface DesignerNaProducao {
  nome: string;
  /** a data_entrada mais recente (ISO) da linha em que aparece */
  ultima: string | null;
}
/** Uma linha da tabela designers: o registro no Teable, o nome, o status, o e-mail e o id do membro no Trello. */
export interface Designer {
  registro: string;
  nome: string;
  ativo: boolean;
  email: string;
  idNoTrello: string;
  /** quando o registro foi criado no Teable (ISO), quando a API diz */
  criadoEm?: string | null;
}
/** O que mudou: "Fulana apareceu na produção" (entrou) ou "Fulano sem produção há N dias" (saiu). */
export interface Novidade {
  /** a chave com que se ignora (e desfaz): entrou:<nome comparável> ou saiu:<registro> */
  chave: string;
  tipo: 'entrou' | 'saiu';
  nome: string;
  email: string;
  /** o id do membro no Trello, quando a tabela designers tem (só em quem saiu; '' em quem entrou) */
  membro: string;
  /** o registro do designer na tabela (só em quem saiu) */
  registro?: string;
}

/** Os dias que contam: quem apareceu na produção da arte nesses dias entrou; o designer ativo sem nenhuma, saiu. */
export const DIAS_DAS_PESSOAS = 60;

const mesmoNome = (a: string, b: string) => !!nomeComparavel(a) && nomeComparavel(a) === nomeComparavel(b);

/**
 * Os designers da produção da arte × a tabela designers. Entrou: o nome que aparece na produção (nos últimos dias) e
 * não está na tabela (nem como inativo), pelo nome sem caixa, acento e pontuação. Saiu: o designer ativo que não
 * aparece em nenhuma produção desde `desde` (o cadastrado depois disso ainda não conta). Na ordem: quem entrou,
 * depois quem saiu.
 * @param naProducao os designers das linhas que entraram desde `desde`
 * @param o.desde o começo da janela (ms)
 */
export function novidadesDaProducao(naProducao: readonly DesignerNaProducao[], designers: readonly Designer[], { desde }: { desde: number }): Novidade[] {
  const entrou = naProducao
    .filter((p) => !designers.some((d) => mesmoNome(d.nome, p.nome)))
    .map((p): Novidade => ({ chave: `entrou:${nomeComparavel(p.nome)}`, tipo: 'entrou', nome: p.nome, email: '', membro: '' }));
  const novoNaTabela = (d: Designer) => !!d.criadoEm && Date.parse(d.criadoEm) >= desde;
  const saiu = designers
    .filter((d) => d.ativo && !novoNaTabela(d) && !naProducao.some((p) => mesmoNome(d.nome, p.nome)))
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
