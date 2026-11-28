/* O Enviar do Roteiro escrito no PROMeiro (#194, spec #186): as regras puras da claquete proposta, dos avisos de "não
   bate", do roteiro que vai para a fila (a cópia do envio), da foto do envio e do andamento da arte. As mesmas no
   servidor (que grava o envio) e no navegador (que mostra o painel): só sintaxe que o Node apaga.

   A fila e a Pauta leem o último envio, e não o texto vivo da sala: o envio é uma cópia do Roteiro, um roteiro comum da
   fila (`escrito_de` aponta o escrito), que a arte revisa como qualquer outro. O escrito continua sendo o documento do
   redator; cada Enviar grava a foto dele na tabela `versoes` (o motivo começa por "enviado") e troca a cópia da fila
   pela nova, que herda o card (a regra de `substituirVersao`). */
import { exportar, pendencias } from './exportar';
import { conflitoDasVersoes, claqueteComAsVersoes, versoesDoRoteiro } from './versoesDoRoteiro.ts';
import type { Versao } from './pauta.ts';
import { acharPrograma, claquetePadrao, dataDaClaquete, keyDaAtracao, lerDataDaClaquete } from './vocabularios';
import { metaVazia, type Meta, type NoJSON, type Roteiro } from './tipos';
import { letraEVersaoDoRoteiro, marcaDaLetraEVersao, proximaLetraEVersao } from './letraEVersao';

/** A origem do roteiro da fila que saiu do Enviar: é o "escrito no PROMeiro" que a ficha da fila mostra. */
export const ORIGEM_DO_ENVIO = 'escrito no PROMeiro';

/* ---------- a foto do envio ---------- */

/** O motivo da foto do envio na tabela `versoes`: "enviado", com o que o redator escreveu, se escreveu. */
export const motivoDoEnvio = (texto: unknown) => {
  const t = typeof texto === 'string' ? texto.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  return t ? `enviado: ${t}` : 'enviado';
};
/** A versão guardada é a foto de um envio (e não a gravação de 5 em 5 minutos). */
export const ehEnvio = (motivo: unknown) => motivo === 'enviado' || (typeof motivo === 'string' && motivo.startsWith('enviado: '));
/** O que o redator escreveu no envio ('' sem nada). */
export const textoDoMotivo = (motivo: string) => (motivo.startsWith('enviado: ') ? motivo.slice(9) : '');

/* ---------- o documento que vai para a fila ---------- */

const ARTE_DO_TRECHO = (n: number) => ({ id: `arte-do-trecho-${n}`, subtipo: '', grupo: null, obs: '', sugerido: false });

/**
 * O documento como vai para a fila: o trecho inteiro do tipo arte coberto por uma só marca `Arte` (a da folha, quando
 * ela já está lá), para a fila, o Trello e o .docx lerem a arte dele como leem a arte marcada no meio da frase (a regra
 * de `artesDoTexto` e a de `artesUnicas` chegam na mesma lista). A folha já cobre o trecho ao digitar (`editor/escrita`);
 * aqui é a garantia, também para o texto gravado antes dela.
 */
export function docParaAFila(doc: NoJSON): NoJSON {
  let n = 0;
  const arrumar = (no: NoJSON): NoJSON => {
    if (no.type !== 'paragraph') return no.content ? { ...no, content: no.content.map(arrumar) } : no;
    n++;
    if (no.attrs?.tipo !== 'arte' || !no.content?.some((x) => x.type === 'text' && x.text?.trim())) return no;
    const ja = no.content.flatMap((x) => x.marks ?? []).find((m) => m.type === 'arte');
    const attrs = ja?.attrs ?? ARTE_DO_TRECHO(n);
    return {
      ...no,
      content: no.content.map((x) => (x.type !== 'text' ? x : { ...x, marks: [...(x.marks ?? []).filter((m) => m.type !== 'arte'), { type: 'arte', attrs }] })),
    };
  };
  return arrumar(doc);
}

/** Os textos das artes como vão para a fila (cada uma uma vez), de onde saem as versões lidas. */
export const artesParaAFila = (doc: NoJSON): string[] => exportar(comoRoteiro(docParaAFila(doc))).artes.map((a) => a.texto);

const comoRoteiro = (doc: NoJSON, meta: Partial<Meta> = {}): Roteiro => ({ id: 'envio', meta: { ...metaVazia(), ...meta }, doc, revisao: 1, criadoEm: '', atualizadoEm: '' });

/* ---------- a claquete proposta ---------- */

/** A claquete que o Enviar propõe e o que veio com ela. */
export interface ClaqueteProposta {
  claquete: string;
  programa: string;
  /** AAAA-MM-DD ou '' */
  dataExibicao: string;
  /** as versões lidas nas artes (a regra de `versoesDoRoteiro`) */
  versoes: Versao[];
}

const comoNaClaquete = (nome: string) => nome.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
const diaEMes = (iso: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${+m[2]}/${+m[1]}` : '';
};
const hojeIso = (hoje: Date) => `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

/**
 * A claquete proposta no Enviar. A atração é a da meta (a que o redator já escolheu) ou a que a lista de atrações
 * reconhece no título; a data é a da meta ou a do título; as versões são as lidas nas artes. A claquete é a key da
 * atração (ou o nome dela) e o dia, no padrão da casa, com o código das versões quando as artes dizem alguma. No
 * reenvio, vale a claquete do envio anterior (é a mesma chamada).
 * @param programa a atração escolhida (sobrepõe a da meta); `atracaoDoServidor`, a que o servidor achou pelo título
 */
export function propostaDaClaquete({ meta, doc, hoje = new Date(), programa, dataExibicao, atracaoDoServidor = '' }: { meta: Partial<Meta>; doc: NoJSON; hoje?: Date; programa?: string; dataExibicao?: string; atracaoDoServidor?: string }): ClaqueteProposta {
  const titulo = meta.titulo ?? '';
  const atracao = programa ?? (meta.programa || acharPrograma(titulo)?.nome || atracaoDoServidor || '');
  const data = dataExibicao ?? (meta.dataExibicao || dataDaClaquete(titulo, hoje) || '');
  const artes = artesParaAFila(doc);
  // o reenvio é a mesma chamada: a claquete do envio anterior, a menos que a atração ou a data tenham mudado
  const anterior = (meta.claquete ?? '').trim();
  if (anterior && atracao === (meta.programa ?? '') && data === (meta.dataExibicao ?? '')) return { claquete: anterior, programa: atracao, dataExibicao: data, versoes: versoesDoRoteiro(artes, anterior, hojeIso(hoje)) };
  const nome = atracao ? keyDaAtracao(atracao) || comoNaClaquete(atracao) : comoNaClaquete(titulo).slice(0, 40);
  const base = claquetePadrao([nome, diaEMes(data)].filter(Boolean).join(' '));
  const versoes = versoesDoRoteiro(artes, base, hojeIso(hoje));
  const codigo = versoes.map((v) => v.codigo).join('');
  return { claquete: codigo && base ? claqueteComAsVersoes(base, codigo) : base, programa: atracao, dataExibicao: data, versoes };
}

/** Um aviso do painel do Enviar: os de "não bate" da fila e o que falta. Só o que `trava` impede o Enviar. */
export interface AvisoDoEnvio {
  id: 'sem-claquete' | 'sem-atracao' | 'atracao' | 'sem-data' | 'data' | 'versoes';
  texto: string;
  trava: boolean;
}

const dataCurta = (iso: string) => diaEMes(iso) || iso;

/**
 * Os avisos da claquete conferida, os mesmos que a fila mostra: a atração que a claquete diz e a escolhida, a data da
 * claquete e a de exibição, e as versões das artes contra o código da claquete (o `conflitoDasVersoes`). Sem claquete,
 * não envia; o resto avisa e deixa enviar (a fila pergunta o que faltar, como para o roteiro que chega de fora).
 */
export function avisosDoEnvio({ claquete, programa, dataExibicao, versoes, hoje = new Date() }: { claquete: string; programa: string; dataExibicao: string; versoes: readonly Versao[]; hoje?: Date }): AvisoDoEnvio[] {
  const c = claquete.trim();
  if (!c) return [{ id: 'sem-claquete', texto: 'Falta a claquete', trava: true }];
  const avisos: AvisoDoEnvio[] = [];
  const daClaquete = acharPrograma(c)?.nome ?? '';
  if (!programa) avisos.push({ id: 'sem-atracao', texto: 'Atração não reconhecida: a fila pergunta depois', trava: false });
  else if (daClaquete && daClaquete !== programa) avisos.push({ id: 'atracao', texto: `A claquete é de ${daClaquete}, não de ${programa}`, trava: false });
  const dia = lerDataDaClaquete(c) ? dataDaClaquete(c, hoje) : '';
  if (!dataExibicao && !dia) avisos.push({ id: 'sem-data', texto: 'Sem data de exibição', trava: false });
  else if (dia && dataExibicao && dia !== dataExibicao) avisos.push({ id: 'data', texto: `A claquete diz ${dataCurta(dia)}, e a exibição é ${dataCurta(dataExibicao)}`, trava: false });
  const conflito = conflitoDasVersoes(c, versoes);
  if (conflito) avisos.push({ id: 'versoes', texto: `As artes dizem ${conflito.doRoteiro}, e a claquete ${conflito.daClaquete || 'não tem código'}`, trava: false });
  return avisos;
}

/* ---------- o roteiro da fila ---------- */

/** A claquete conferida no painel: o que o Enviar leva para a meta. */
export type ClaqueteConferida = Pick<Meta, 'claquete' | 'programa' | 'dataExibicao'> & Partial<Pick<Meta, 'tipoPrograma' | 'editor' | 'praca'>>;

/**
 * O roteiro que entra na fila no Enviar: o texto e a meta do escrito, com a claquete conferida, em texto corrido, na
 * revisão, com as pendências calculadas. O que a fila decide (a versão anterior, a produção) fica de fora: quem põe é
 * o caminho da fila.
 */
export function roteiroDoEnvio(escrito: Pick<Roteiro, 'meta' | 'doc'>, conferida: ClaqueteConferida, id: string, agora = new Date().toISOString()): Roteiro {
  const meta: Meta = { ...metaVazia(), ...escrito.meta, ...conferida, claquete: conferida.claquete.trim(), layout: 'coluna_unica', status: 'revisao' };
  for (const k of ['substitui', 'naProducao', 'v2De', 'outroRoteiro', 'revisar', 'conferidos', 'substituiu', 'letra', 'versao'] as const) delete meta[k];
  const roteiro: Roteiro = { id, meta, doc: docParaAFila(escrito.doc), revisao: 1, criadoEm: agora, atualizadoEm: agora, origem: ORIGEM_DO_ENVIO };
  roteiro.meta.revisar = pendencias(exportar(roteiro));
  return roteiro;
}

/** A letra e a versão que o próximo envio leva, pelo último (a pergunta "já foi liberada para exibição?"). O primeiro
    envio é a A V1. */
export const letraEVersaoDoEnvio = (ultimo: Pick<Meta, 'letra' | 'versao' | 'v2De'> | null, liberada: boolean) => (ultimo ? proximaLetraEVersao(letraEVersaoDoRoteiro(ultimo), liberada) : { letra: 'A', versao: 1 });

/** "A V1", "V2", "B": a marca do envio para o histórico (a A V1, por extenso). */
export const marcaDoEnvio = (meta: Pick<Meta, 'letra' | 'versao' | 'v2De'>) => marcaDaLetraEVersao(letraEVersaoDoRoteiro(meta)) || 'V1';

/* ---------- o andamento da arte ---------- */

export type PassoDaArte = 'entrada' | 'produzindo' | 'entregue';
export const PASSOS_DA_ARTE: readonly { id: PassoDaArte; nome: string }[] = [
  { id: 'entrada', nome: 'Entrada' },
  { id: 'produzindo', nome: 'Produzindo' },
  { id: 'entregue', nome: 'Entregue' },
];

/** O andamento da arte no roteiro enviado, pela Produção ligada ao envio: cada passo feito, agora ou depois. Sem a
    Produção (o card ainda não saiu da fila), nenhum passo começou. */
export function andamentoDaArte(producao: { etapa: string; entradaEm?: string | null; entregaEm?: string | null } | null): { id: PassoDaArte; nome: string; situacao: 'feito' | 'agora' | 'depois'; quando: string | null }[] {
  const etapa = producao?.etapa === 'arquivada' ? 'entregue' : producao?.etapa;
  const k = PASSOS_DA_ARTE.findIndex((p) => p.id === etapa);
  return PASSOS_DA_ARTE.map((p, i) => ({
    ...p,
    situacao: k < 0 || i > k ? 'depois' : i === k ? 'agora' : 'feito',
    quando: k < 0 || i > k ? null : p.id === 'entrada' ? (producao?.entradaEm ?? null) : p.id === 'entregue' ? (producao?.entregaEm ?? null) : null,
  }));
}
