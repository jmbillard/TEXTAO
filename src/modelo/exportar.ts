import { analisarSonoras, ehLocucao, lerContexto, lerTimecodeSolto, RE_LINHA_LOC, textoDaLocucao, type ContextoSonora } from './sonora';
import { nomesDosTipos, normalizarSubtipo, siglaDoTipo, tiposDaArte, SCHEMA_VERSION, type Meta, type NoJSON, type Pessoa, type Roteiro, type SubtipoArte, type TipoEtiqueta } from './tipos';
import { chaveDeArte } from './diferencas';

/* Do documento do editor para o contrato de saída (JSON canônico).
   Função pura: o mesmo roteiro sempre gera a mesma saída, com os mesmos IDs. */

export interface ArteSaida {
  id: string;
  ordem: number;
  texto: string;
  subtipo: SubtipoArte;
  /** Todos os tipos da arte (pode ter mais de um); subtipo é o primeiro. */
  subtipos: Exclude<SubtipoArte, ''>[];
  subtipoNome: string;
  /** Artes com o mesmo grupo são versões que se substituem no mesmo lugar (AMANHÃ/HOJE). */
  grupoVersoes: string | null;
  observacao: string;
  /** false enquanto o subtipo é só a sugestão do importador. */
  conferida: boolean;
  contexto: { coluna: string | null; trechoAnterior: string; trechoPosterior: string };
  /** Quanto tempo a arte fica no ar: a leitura da frase em que ela aparece, no ritmo da locução. */
  duracaoEstimadaSeg: number;
  status: 'pendente';
}
export interface OrientacaoSaida {
  id: string;
  ordem: number;
  texto: string;
  observacao: string;
  coluna: string | null;
}
export interface SonoraSaida {
  ordem: number;
  origem: string;
  origemOriginal: string;
  bloco: number | null;
  /** Vazio quando o roteiro não informa. */
  timecodeEntrada: string;
  timecodeSaida: string | null;
  timecodeOriginal: string;
  personagem: string;
  descricaoImagem: string;
  fala: string;
}
export interface Saida {
  schemaVersion: string;
  exportadoEm: string;
  roteiro: Meta & {
    id: string;
    versoes: string[];
    duracaoEstimadaSeg: number;
    revisao: number;
    atualizadoEm: string;
    criadoPor: Pessoa | null;
    alteradoPor: Pessoa | null;
  };
  artes: ArteSaida[];
  orientacoes: Record<'edicao' | 'locutor' | 'sonoplastia' | 'producao', OrientacaoSaida[]>;
  comentarios: OrientacaoSaida[];
  trechosCortaveis: (OrientacaoSaida & { duracaoEstimadaSeg: number })[];
  sonoras: SonoraSaida[];
  texto: { completo: string; locucao: string; markdown: string };
  blocos: NoJSON;
}

/** Ritmo médio de leitura, em palavras por segundo. */
export const RITMO = { locucao: 2.6, sonora: 3 };
const NAO_LIDO: TipoEtiqueta[] = ['edicao', 'locutor', 'sonoplastia', 'producao', 'comentario'];

interface Pedaco {
  t: string;
  arte?: Record<string, unknown>;
  etq?: Record<string, unknown>;
}
interface Bloco {
  coluna: 'e' | 'd' | null;
  pedacos: Pedaco[];
}

function achatar(doc: NoJSON): Bloco[] {
  const out: Bloco[] = [];
  const paragrafo = (p: NoJSON, coluna: Bloco['coluna']) => {
    const pedacos: Pedaco[] = [];
    for (const n of p.content ?? []) {
      if (n.type === 'hardBreak' || (n.type === 'text' && n.text))
        pedacos.push({
          t: n.type === 'hardBreak' ? '\n' : n.text!,
          arte: n.marks?.find((m) => m.type === 'arte')?.attrs,
          etq: n.marks?.find((m) => m.type === 'etiqueta')?.attrs,
        });
    }
    out.push({ coluna, pedacos });
  };
  for (const n of doc.content ?? []) {
    if (n.type === 'paragraph') paragrafo(n, null);
    else if (n.type === 'linha')
      (n.content ?? []).forEach((cel, i) => (cel.content ?? []).forEach((p) => paragrafo(p, i === 0 ? 'e' : 'd')));
  }
  return out;
}

/** A frase em volta do trecho [ini, fim): do último ponto antes até o primeiro depois. */
function fraseEmVolta(total: string, ini: number, fim: number) {
  const antes = total.slice(0, ini);
  const comeco = Math.max(antes.search(/[^.!?\n]*$/), 0);
  const depois = total.slice(fim).search(/[.!?\n]/);
  return total.slice(comeco, depois < 0 ? total.length : fim + depois + 1);
}
/** A arte fica no ar enquanto a frase dela é lida; no mínimo 3 segundos, para dar tempo de ler. */
function duracaoDaArte(total: string, ini: number, fim: number) {
  return Math.max(3, Math.round(palavras(fraseEmVolta(total, ini, fim)) / RITMO.locucao));
}

const palavras = (s: string) => (s.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length;
const limpo = (s: string) => s.replace(/\s+/g, ' ').trim();

export function exportar(roteiro: Roteiro, agora = new Date()): Saida {
  const blocos = achatar(roteiro.doc);
  const colunas = roteiro.meta.layout === 'ilustracao_audio' ? { e: 'ilustracao', d: 'audio' } : { e: 'instrucoes', d: 'texto' };
  const nomeColuna = (c: Bloco['coluna']) => (c ? colunas[c] : null);

  const artes: ArteSaida[] = [];
  /** Onde cada arte está no texto, para juntar o "depois de…" aos dias que vêm antes. */
  const locais: { bloco: Bloco; ini: number; fim: number; total: string }[] = [];
  const orientacoes: Saida['orientacoes'] = { edicao: [], locutor: [], sonoplastia: [], producao: [] };
  const comentarios: OrientacaoSaida[] = [];
  const cortaveis: Saida['trechosCortaveis'] = [];
  const sonoras: SonoraSaida[] = [];
  const idsVistos = new Set<string>();
  const idUnico = (id: string) => {
    let u = id;
    for (let n = 2; idsVistos.has(u); n++) u = `${id}-${n}`;
    idsVistos.add(u);
    return u;
  };

  const linhasCompleto: string[] = [];
  const linhasLocucao: string[] = [];
  const linhasMd: string[] = [];
  let segLocucao = 0;
  let segSonoras = 0;
  let ctx: ContextoSonora | null = null;

  for (const bloco of blocos) {
    const total = bloco.pedacos.map((p) => p.t).join('');
    if (!total.trim()) continue;
    linhasCompleto.push(limpo(total));

    // faixas contínuas da mesma marca
    let pos = 0;
    let md = '';
    for (let i = 0; i < bloco.pedacos.length; ) {
      const p = bloco.pedacos[i];
      const ini = pos;
      if (p.arte) {
        let j = i;
        let texto = '';
        while (j < bloco.pedacos.length && bloco.pedacos[j].arte?.id === p.arte.id) texto += bloco.pedacos[j++].t;
        const subtipo = normalizarSubtipo(p.arte.subtipo);
        const subtipos = tiposDaArte(p.arte.subtipo);
        locais.push({ bloco, ini, fim: ini + texto.length, total });
        artes.push({
          id: idUnico(String(p.arte.id)),
          ordem: artes.length + 1,
          texto: limpo(texto),
          subtipo,
          subtipos,
          subtipoNome: nomesDosTipos(subtipos),
          grupoVersoes: (p.arte.grupo as string | null) ?? null,
          observacao: String(p.arte.obs ?? ''),
          conferida: !p.arte.sugerido,
          contexto: {
            coluna: nomeColuna(bloco.coluna),
            trechoAnterior: limpo(total.slice(0, ini)).slice(-80),
            trechoPosterior: limpo(total.slice(ini + texto.length)).slice(0, 80),
          },
          duracaoEstimadaSeg: 0,
          status: 'pendente',
        });
        md += `__${limpo(texto)}__` + (/\s$/.test(texto) ? ' ' : '');
        pos += texto.length;
        i = j;
        continue;
      }
      md += p.etq ? '' : p.t;
      pos += p.t.length;
      i++;
    }
    // etiquetas (podem conter artes dentro)
    for (let i = 0; i < bloco.pedacos.length; ) {
      const p = bloco.pedacos[i];
      if (!p.etq) {
        i++;
        continue;
      }
      let j = i;
      let texto = '';
      while (j < bloco.pedacos.length && bloco.pedacos[j].etq?.id === p.etq.id) texto += bloco.pedacos[j++].t;
      const tipo = p.etq.tipo as TipoEtiqueta;
      const item: OrientacaoSaida = {
        id: idUnico(String(p.etq.id)),
        ordem: 0,
        texto: limpo(texto),
        observacao: String(p.etq.obs ?? ''),
        coluna: nomeColuna(bloco.coluna),
      };
      if (tipo === 'comentario') comentarios.push({ ...item, ordem: comentarios.length + 1 });
      else if (tipo === 'cortavel')
        cortaveis.push({ ...item, ordem: cortaveis.length + 1, duracaoEstimadaSeg: Math.max(1, Math.round(palavras(texto) / RITMO.sonora)) });
      else if (tipo in orientacoes) orientacoes[tipo as keyof typeof orientacoes].push({ ...item, ordem: orientacoes[tipo as keyof typeof orientacoes].length + 1 });
      // tipo que o app não conhece (arquivo antigo, colagem): entra como comentário em vez de derrubar a tela
      else comentarios.push({ ...item, ordem: comentarios.length + 1 });
      md += ` _[${tipo}: ${limpo(texto)}]_`;
      i = j;
    }
    linhasMd.push(limpo(md));

    // o que é efetivamente lido ou ouvido
    const lido = bloco.pedacos
      .filter((p) => !p.etq || !NAO_LIDO.includes(p.etq.tipo as TipoEtiqueta))
      .map((p) => p.t)
      .join('');
    const novoCtx = lerContexto(total);
    if (novoCtx) {
      ctx = novoCtx;
      continue;
    }
    if (bloco.coluna === 'e') continue;
    // timecode sozinho na linha: vale para a fala da linha seguinte
    const solto = lerTimecodeSolto(lido);
    if (solto) {
      ctx = { origem: ctx?.origem ?? 'outro', origemOriginal: ctx?.origemOriginal ?? '', bloco: ctx?.bloco ?? null, tcPendente: solto };
      continue;
    }
    const achadas = RE_LINHA_LOC.test(lido) ? [] : analisarSonoras(lido, ctx);
    if (ctx?.tcPendente) ctx = { ...ctx, tcPendente: undefined };
    if (achadas.length) {
      for (const s of achadas) {
        sonoras.push({
          ordem: sonoras.length + 1,
          origem: s.origem,
          origemOriginal: s.origemOriginal,
          bloco: s.bloco,
          timecodeEntrada: s.timecodeEntrada,
          timecodeSaida: s.timecodeSaida,
          timecodeOriginal: s.timecodeOriginal,
          personagem: s.personagem,
          descricaoImagem: s.descricaoImagem,
          fala: limpo(s.fala),
        });
        segSonoras += palavras(s.fala) / RITMO.sonora;
      }
    } else if (ehLocucao(lido)) {
      const lida = textoDaLocucao(lido);
      linhasLocucao.push(limpo(lida));
      segLocucao += palavras(lida) / RITMO.locucao;
    }
  }

  const versoes = [
    ...new Set(artes.filter((a) => a.grupoVersoes && /^\p{L}/u.test(a.texto)).map((a) => a.texto.toUpperCase().replace(/[\s.…,!?:;]+$/, ''))),
  ];

  // "SÁBADO/AMANHÃ/HOJE, DEPOIS DE …": o complemento sublinhado vale para cada um dos dias
  for (let i = 0; i < artes.length; i++) {
    const grupo = artes[i].grupoVersoes;
    if (!grupo) continue;
    let fim = i;
    while (fim + 1 < artes.length && artes[fim + 1].grupoVersoes === grupo) fim++;
    const depois = artes[fim + 1];
    const entre = depois && locais[fim + 1].bloco === locais[fim].bloco ? locais[fim].total.slice(locais[fim].fim, locais[fim + 1].ini) : null;
    if (depois && !depois.grupoVersoes && entre !== null && entre.length <= 8 && !/[\p{L}\p{N}]/u.test(entre) && /^(?:logo\s+)?(?:depois|ap[óo]s)\b/i.test(depois.texto)) {
      for (let k = i; k <= fim; k++) artes[k].texto += (entre.includes(',') ? ', ' : ' ') + depois.texto;
      artes.splice(fim + 1, 1);
      locais.splice(fim + 1, 1);
    }
    i = fim;
  }
  artes.forEach((a, k) => {
    a.ordem = k + 1;
    a.duracaoEstimadaSeg = duracaoDaArte(locais[k].total, locais[k].ini, locais[k].fim);
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    exportadoEm: agora.toISOString(),
    roteiro: {
      id: roteiro.id,
      ...roteiro.meta,
      versoes,
      duracaoEstimadaSeg: Math.round(segLocucao + segSonoras),
      revisao: roteiro.revisao,
      atualizadoEm: roteiro.atualizadoEm,
      criadoPor: roteiro.criadoPor ?? null,
      alteradoPor: roteiro.alteradoPor ?? null,
    },
    artes,
    orientacoes,
    comentarios,
    trechosCortaveis: cortaveis,
    sonoras,
    texto: { completo: linhasCompleto.join('\n'), locucao: linhasLocucao.join('\n'), markdown: linhasMd.join('\n\n') },
    blocos: roteiro.doc,
  };
}

/** Uma arte da lista, sem repetição: `ids` são todas as vezes em que ela aparece no texto (a primeira é o `id`). */
export type ArteUnica = ArteSaida & { ids: string[] };

/**
 * As artes sem repetição: o redator sublinha a mesma arte várias vezes (IZA, HOJE…), e ela é uma produção só. É a mesma
 * arte quando a chave do acervo é igual (sem caixa, sem acento, sem pontuação: "AO VIVO!" e "Ao vivo"; "AOVIVO" é
 * outra). Fica a primeira aparição, na ordem dela, numerada de novo; os tipos das repetidas se somam (cada tipo é uma
 * produção). O estado (já existe, não produzir, complexidade) é guardado pela mesma chave, então as repetidas nunca
 * divergem nele.
 */
export function artesUnicas(artes: ArteSaida[]): ArteUnica[] {
  const porChave = new Map<string, ArteUnica>();
  for (const a of artes) {
    const k = chaveDeArte(a.texto);
    const ja = porChave.get(k);
    if (!ja) {
      porChave.set(k, { ...a, subtipos: [...a.subtipos], ids: [a.id] });
      continue;
    }
    ja.ids.push(a.id);
    ja.subtipos = tiposDaArte([...ja.subtipos, ...a.subtipos]);
    ja.subtipo = ja.subtipos[0] ?? '';
    ja.subtipoNome = nomesDosTipos(ja.subtipos);
    ja.observacao ||= a.observacao;
    ja.conferida &&= a.conferida;
  }
  return [...porChave.values()].map((a, k) => ({ ...a, ordem: k + 1 }));
}

/** O que vai ao Trello: cada arte uma vez, menos as que não vão ser produzidas (✕). A que já existe (✓, ou do acervo)
    vai marcada (fora do checklist, na linha JÁ EXISTEM); cada uma leva a sua complexidade. */
export function artesDoEnvio(saida: Saida, meta: Meta) {
  const jaExiste = chavesQueExistem(meta);
  const fora = new Set(meta.naoProduzir ?? []);
  return artesUnicas(saida.artes)
    .filter((a) => !fora.has(chaveDeArte(a.texto)))
    .map((a) => {
      const k = chaveDeArte(a.texto);
      const tipos = a.subtipos.map(siglaDoTipo);
      return { texto: a.texto, tipo: tipos.join(', '), tipos, existe: jaExiste.has(k), complexidade: complexidadeDaArte(meta, k) };
    });
}

/** Lista de artes em texto simples, para colar em e-mail, card ou planilha. */
export function listaDeArtes(saida: Saida): string {
  const r = saida.roteiro;
  const cab = [r.programa, r.titulo, r.dataExibicao.split('-').reverse().join('/')].filter(Boolean).join(' · ');
  const linhas = artesUnicas(saida.artes).map((a) => `${a.ordem}\t${a.subtipoNome}\t${a.texto}${a.observacao ? `\t${a.observacao}` : ''}`);
  return [cab, '', 'Nº\tTipo\tTexto', ...linhas].join('\n');
}

/** Reabre um roteiro a partir de um JSON exportado. */
export function roteiroDoJson(json: unknown): Roteiro {
  const s = json as Partial<Saida>;
  if (!s || typeof s !== 'object' || !s.roteiro || !s.blocos || s.blocos.type !== 'doc')
    throw new Error('Este .json não é um roteiro exportado daqui.');
  const { id, versoes: _v, duracaoEstimadaSeg: _d, revisao, atualizadoEm, criadoPor, alteradoPor, ...meta } = s.roteiro;
  return {
    id, meta: meta as Meta, doc: s.blocos, revisao: revisao ?? 1, criadoEm: atualizadoEm, atualizadoEm,
    ...(criadoPor ? { criadoPor } : {}),
    ...(alteradoPor ? { alteradoPor } : {}),
  };
}

/* ---------- o que pede revisão antes de enviar ---------- */

/** Texto de arte comprido costuma ser instrução sublinhada, não arte. O "depois de…" juntado ao dia não conta. */
const arteLonga = (texto: string) => {
  const t = texto.replace(/,?\s+(?:logo\s+)?(?:depois|ap[óo]s)\b.*$/i, '');
  return t.length > 60 || palavras(t) > 8;
};

/** Pendências que fazem o roteiro esperar a revisão antes de ir sozinho ao Trello. Nada impede o envio de fato:
    sem redator, sem editor e sem data não seguram (o n8n completa depois; VT de evento ou reunião interna não tem data). */
export const TEXTO_SEM_EDITOR = 'Sem editor';
/** Sem redator também não segura: o PROMeiro sugere um nome e quem revisa aceita com um toque. */
export const TEXTO_SEM_REDATOR = 'Sem redator';
// o texto de antes, que roteiros já guardados ainda têm
const SEM_EDITOR_ANTIGO = 'Sem editor: a claquete não está na pauta';
const NAO_SEGURAM = new Set([TEXTO_SEM_REDATOR, 'Sem editor', SEM_EDITOR_ANTIGO, 'Sem data', 'Sem data de exibição']);
export const travamTrello = (revisar: string[] | undefined) => (revisar ?? []).filter((t) => !NAO_SEGURAM.has(t));

export type IdPendencia = 'sem-arte' | 'muitas-artes' | 'arte-longa' | 'sem-redator' | 'sem-editor' | 'sem-data' | 'ocr' | 'v2' | 'repetida' | 'ja-existem';
export interface Pendencia {
  id: IdPendencia;
  texto: string;
  /** Dá para conferir e dizer "está certo" (as outras se resolvem preenchendo o que falta). */
  dispensavel: boolean;
  /** A arte que motivou, quando é uma só. */
  arte?: string;
}

/** Motivos para o roteiro não entrar na fila como pronto, menos os que alguém já conferiu.
    Atração não reconhecida não é motivo: ela pode ser cadastrada depois. */
export function pendenciasDetalhadas(saida: Saida): Pendencia[] {
  const n = artesUnicas(saida.artes).length;
  const r = saida.roteiro;
  const longa = saida.artes.find((a) => arteLonga(a.texto));
  const p: Pendencia[] = [];
  if (!n) p.push({ id: 'sem-arte', texto: 'Nenhuma arte', dispensavel: true });
  if (n >= 10) p.push({ id: 'muitas-artes', texto: `Muitas artes: ${n}`, dispensavel: true });
  if (longa) p.push({ id: 'arte-longa', texto: 'Arte longa', dispensavel: true, arte: longa.id });
  if (!r.redator) p.push({ id: 'sem-redator', texto: TEXTO_SEM_REDATOR, dispensavel: false });
  if (!r.editor) p.push({ id: 'sem-editor', texto: TEXTO_SEM_EDITOR, dispensavel: false });
  if (!r.dataExibicao) p.push({ id: 'sem-data', texto: 'Sem data', dispensavel: false });
  if (r.lidoPorOcr) p.push({ id: 'ocr', texto: 'Lido por OCR', dispensavel: true });
  // claquete que já estava na produção da arte: fica marcada até alguém conferir
  // artes que a atração já tem: quem revisa confere no servidor e, se achar, exclui da lista
  const existem = artesQueJaExistem(saida).length;
  if (existem) p.push({ id: 'ja-existem', texto: `Já existem: ${existem}`, dispensavel: true });
  if (r.v2De) p.push({ id: 'v2', texto: 'Versão nova (v2)', dispensavel: true });
  else if (r.outroRoteiro) p.push({ id: 'repetida', texto: 'Claquete repetida', dispensavel: true });
  const conferidos = new Set(r.conferidos ?? []);
  return p.filter((x) => !(x.dispensavel && conferidos.has(x.id)));
}

/**
 * As artes que contam como já existentes (pela chave): as que quem revisa confirmou (✓) e as que estão no acervo da
 * atração, que já vêm riscadas, menos as que quem revisa mandou produzir (↺) ou não produzir (✕). O ✓ vai para o
 * acervo no envio: da próxima vez que a atração pedir a mesma arte, ela já vem riscada.
 */
export function chavesQueExistem(meta: Pick<Meta, 'jaExiste' | 'jaExistem' | 'naoProduzir' | 'produzir'>): Set<string> {
  const fora = new Set([...(meta.naoProduzir ?? []), ...(meta.produzir ?? [])]);
  const existem = new Set((meta.jaExiste ?? []).filter((k) => !(meta.naoProduzir ?? []).includes(k)));
  for (const a of meta.jaExistem ?? []) if (!fora.has(a.chave)) existem.add(a.chave);
  return existem;
}

/** Marca as artes (pelas chaves) como já existe (✓), não produzir (✕) ou de volta à lista (null), e devolve as listas
 *  novas das marcas. A arte do acervo devolvida à lista fica lembrada como "produzir", para não voltar riscada. */
export function remarcar(meta: Pick<Meta, 'jaExiste' | 'jaExistem' | 'naoProduzir' | 'produzir'>, chaves: string[], como: 'existe' | 'fora' | null): Pick<Meta, 'jaExiste' | 'naoProduzir' | 'produzir'> {
  const ja = new Set(meta.jaExiste ?? []);
  const fora = new Set(meta.naoProduzir ?? []);
  const prod = new Set(meta.produzir ?? []);
  const doAcervo = new Set((meta.jaExistem ?? []).map((a) => a.chave));
  for (const k of chaves) {
    ja.delete(k);
    fora.delete(k);
    prod.delete(k);
    if (como === 'existe') ja.add(k);
    if (como === 'fora') fora.add(k);
    if (!como && doAcervo.has(k)) prod.add(k);
  }
  const lista = (s: Set<string>) => (s.size ? [...s] : undefined);
  return { jaExiste: lista(ja), naoProduzir: lista(fora), produzir: lista(prod) };
}

/** "Já existe" pelo teclado, como a bolinha do índice: se alguma das artes ainda vai ser produzida, todas viram "já
 *  existe"; se todas já saíram da lista (já existe ou fora), todas voltam para ela. */
export function alternarJaExiste(meta: Pick<Meta, 'jaExiste' | 'jaExistem' | 'naoProduzir' | 'produzir'>, chaves: string[]): Pick<Meta, 'jaExiste' | 'naoProduzir' | 'produzir'> {
  const existem = chavesQueExistem(meta);
  const fora = new Set(meta.naoProduzir ?? []);
  return remarcar(meta, chaves, chaves.every((k) => existem.has(k) || fora.has(k)) ? null : 'existe');
}

/** A quais artes valem as teclas da lista (1, 2, 3 e E): a seleção inteira; sem seleção, a arte sob o mouse; sem ela,
 *  a última clicada. */
export function alvosDoTeclado<T>(selecionadas: T[], sobOMouse: T | null, ultimaClicada: T | null): T[] {
  if (selecionadas.length) return selecionadas;
  const uma = sobOMouse ?? ultimaClicada;
  return uma == null ? [] : [uma];
}

/** Complexidade da arte: BAIXA, MÉDIA ou ALTA, na escala do campo do Trello e da produção da arte. */
export type Complexidade = 1 | 2 | 3;
export const NOME_DA_COMPLEXIDADE: Record<Complexidade, string> = { 1: 'BAIXA', 2: 'MÉDIA', 3: 'ALTA' };

/** A complexidade da arte (pela chave): a não marcada é BAIXA. */
export const complexidadeDaArte = (meta: Pick<Meta, 'complexidade'>, chave: string): Complexidade => meta.complexidade?.[chave] ?? 1;

/** O clique no fogo: sobe um nível (BAIXA → MÉDIA → ALTA → BAIXA). Devolve as marcas novas; a BAIXA não é guardada. */
export function subirComplexidade(meta: Pick<Meta, 'complexidade'>, chave: string): Pick<Meta, 'complexidade'> {
  const n = complexidadeDaArte(meta, chave);
  const marcas = { ...meta.complexidade };
  if (n === 3) delete marcas[chave];
  else marcas[chave] = n === 1 ? 2 : 3;
  return { complexidade: Object.keys(marcas).length ? marcas : undefined };
}

/** As teclas 1, 2 e 3 e a barra de lote: levam as artes direto ao nível. A que já existe e a que está fora não têm
 *  fogo e ficam como estão; a BAIXA não é guardada. */
export function marcarComplexidade(meta: Pick<Meta, 'complexidade' | 'jaExiste' | 'jaExistem' | 'naoProduzir' | 'produzir'>, chaves: string[], n: Complexidade): Pick<Meta, 'complexidade'> {
  const existem = chavesQueExistem(meta);
  const fora = new Set(meta.naoProduzir ?? []);
  const marcas = { ...meta.complexidade };
  for (const k of chaves) {
    if (existem.has(k) || fora.has(k)) continue;
    if (n === 1) delete marcas[k];
    else marcas[k] = n;
  }
  return { complexidade: Object.keys(marcas).length ? marcas : undefined };
}

/** A complexidade do card: a maior das artes a produzir (a que já existe e a que está fora não contam); sem nenhuma, BAIXA. */
export function complexidadeDoRoteiro(meta: Pick<Meta, 'complexidade' | 'jaExiste' | 'jaExistem' | 'naoProduzir' | 'produzir'>, chaves: string[]): Complexidade {
  const existem = chavesQueExistem(meta);
  const fora = new Set(meta.naoProduzir ?? []);
  return Math.max(1, ...chaves.filter((k) => !existem.has(k) && !fora.has(k)).map((k) => complexidadeDaArte(meta, k))) as Complexidade;
}

/** As artes do roteiro que estão no acervo da atração e ninguém resolveu (com elas já riscadas, normalmente nenhuma). */
export function artesQueJaExistem(saida: Saida): string[] {
  const acervo = new Set((saida.roteiro.jaExistem ?? []).map((a) => a.chave));
  if (!acervo.size) return [];
  // as que já contam como existentes e as que quem revisa resolveu (produzir ou não produzir) não contam mais
  const resolvidas = new Set([...chavesQueExistem(saida.roteiro), ...(saida.roteiro.naoProduzir ?? []), ...(saida.roteiro.produzir ?? [])]);
  return [...new Set(saida.artes.map((a) => chaveDeArte(a.texto)))].filter((k) => acervo.has(k) && !resolvidas.has(k));
}

export const pendencias = (saida: Saida): string[] => pendenciasDetalhadas(saida).map((p) => p.texto);
