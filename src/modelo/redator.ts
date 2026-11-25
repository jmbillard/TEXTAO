import type { Meta, NoJSON, SugestaoRedator } from './tipos';

/* A sugestão de redator. Quando o roteiro chega sem redator, o PROMeiro procura um nome em duas fontes: o texto do
   roteiro (a assinatura no fim, o cabeçalho, o resto) e as últimas claquetes da atração (a rota
   /api/redator-provavel). Vale o texto; o histórico vem depois, no topo do menu do Escolher. Só redatores ativos.
   Nada é preenchido sozinho: o palpite espera um toque de quem revisa, e o × guarda a recusa no roteiro. */

/** Um redator do cadastro (tabela redatores do Teable), como o vocabulário traz. */
export interface RedatorVocab {
  nome: string;
  /** Como aparece nos roteiros: o autor do Word, o login (KEY_redatores). */
  keys: string[];
  /** Sem o campo "ativo" no Teable, todos contam como ativos. */
  ativo: boolean;
}

/** O que a rota do histórico devolve: quem tem `vezes` das últimas `de` claquetes da atração. */
export interface RedatorDoHistorico {
  nome: string;
  vezes: number;
  de: number;
}

/** Sem acento, sem pontuação, em minúsculas e com um espaço entre as palavras. */
const normal = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/** A palavra (ou o nome inteiro) aparece no texto, como palavra inteira. */
const contem = (texto: string, termo: string) => !!termo && ` ${texto} `.includes(` ${termo} `);

/** Quantos parágrafos do fim contam como a assinatura, e quantos do começo como o cabeçalho. */
const NA_ASSINATURA = 3;
const NO_CABECALHO = 5;
/** O primeiro nome sozinho só vale numa linha curta da assinatura ("Fulana", "Texto: Fulana"). */
const PALAVRAS_DA_LINHA_ASSINADA = 4;
/** Key curta demais ("ana") acharia o que não é. */
const KEY_MINIMA = 3;

/**
 * O redator pelo texto do roteiro. Procura os redatores cadastrados, pelo nome inteiro e pelas keys, em três zonas,
 * nesta ordem: a assinatura (os últimos parágrafos), o cabeçalho (os primeiros) e o resto. Na assinatura, o primeiro
 * nome sozinho também vale, quando um único redator cadastrado tem esse nome. A primeira zona que achar alguém decide:
 * um só, e ativo, é o palpite; mais de um (ou um inativo), nenhum.
 */
export function redatorNoTexto(paragrafos: string[], redatores: RedatorVocab[]): SugestaoRedator | null {
  const pars = paragrafos.map(normal).filter(Boolean);
  if (!pars.length || !redatores.length) return null;
  const n = pars.length;
  const assinatura = pars.slice(Math.max(0, n - NA_ASSINATURA));
  const cabecalho = pars.slice(0, Math.max(0, Math.min(NO_CABECALHO, n - NA_ASSINATURA)));
  const resto = pars.slice(cabecalho.length, Math.max(cabecalho.length, n - NA_ASSINATURA));

  const termos = redatores.map((r) => [normal(r.nome), ...r.keys.map(normal).filter((k) => k.length >= KEY_MINIMA)]);
  // o primeiro nome que só um redator do cadastro tem
  const primeiros = new Map<string, number>();
  for (const r of redatores) {
    const p = normal(r.nome).split(' ')[0];
    if (p) primeiros.set(p, (primeiros.get(p) ?? 0) + 1);
  }
  const achados = (zona: string[], comPrimeiroNome: boolean) => {
    const quem = new Set<number>();
    for (const par of zona) {
      redatores.forEach((r, i) => {
        if (termos[i].some((t) => contem(par, t))) quem.add(i);
        const primeiro = normal(r.nome).split(' ')[0];
        if (comPrimeiroNome && primeiros.get(primeiro) === 1 && par.split(' ').length <= PALAVRAS_DA_LINHA_ASSINADA && contem(par, primeiro)) quem.add(i);
      });
    }
    return [...quem];
  };
  const zonas: [string[], boolean, string][] = [
    [assinatura, true, 'assinado no fim'],
    [cabecalho, false, 'no texto'],
    [resto, false, 'no texto'],
  ];
  for (const [zona, comPrimeiroNome, motivo] of zonas) {
    const quem = achados(zona, comPrimeiroNome);
    if (!quem.length) continue;
    const r = redatores[quem[0]];
    return quem.length === 1 && r.ativo ? { nome: r.nome, motivo, fonte: 'texto' } : null;
  }
  return null;
}

/** O autor do arquivo (dc:creator, lastModifiedBy) é um redator do cadastro? Pelo nome ou por uma key, sem acento e
    sem diferenciar maiúsculas. Sem a lista de redatores (o servidor sem Teable), o autor continua valendo. */
export function autorEhRedator(autor: string, redatores: RedatorVocab[]): boolean {
  const a = normal(autor);
  if (!a) return false;
  if (!redatores.length) return true;
  return redatores.some((r) => normal(r.nome) === a || r.keys.some((k) => normal(k) === a));
}

// as atrações que pedem "da" ("da Novela em Sinfonia", "da Tarde Animada", "da Tela Quente"); o resto, "do"
const FEMININO = /(a|ade|agem|[cs]ao|tarde|noite|tela|tv)$/;
/** "do Caldeirão", "da Novela em Sinfonia": pela primeira palavra da atração. */
const comArtigo = (atracao: string) => `${FEMININO.test(normal(atracao).split(' ')[0] ?? '') ? 'da' : 'do'} ${atracao}`;

/** O motivo curto do histórico: "últimos 4 do Caldeirão" quando são todos dela; "4 dos últimos 5 do Caldeirão" quando não. */
export const motivoDoHistorico = ({ vezes, de }: Pick<RedatorDoHistorico, 'vezes' | 'de'>, atracao: string) =>
  `${vezes === de ? `últimos ${de}` : `${vezes} dos últimos ${de}`} ${comArtigo(atracao || 'atração')}`;

/**
 * Os palpites, na ordem: o do texto e, quando é outro nome, o do histórico. Só redatores ativos do cadastro, com o
 * nome de lá; os que quem revisa já recusou ficam de fora. Sem a lista de redatores, o histórico vale como veio.
 */
export function sugestoesDoRedator({ texto, historico, atracao, redatores, recusados = [] }: { texto: SugestaoRedator | null; historico: RedatorDoHistorico | null; atracao: string; redatores: RedatorVocab[]; recusados?: string[] }): SugestaoRedator[] {
  const lista: SugestaoRedator[] = [];
  if (texto) lista.push(texto);
  if (historico) {
    const r = redatores.find((x) => normal(x.nome) === normal(historico.nome));
    if (!redatores.length) lista.push({ nome: historico.nome, motivo: motivoDoHistorico(historico, atracao), fonte: 'historico' });
    else if (r?.ativo) lista.push({ nome: r.nome, motivo: motivoDoHistorico(historico, atracao), fonte: 'historico' });
  }
  const fora = new Set(recusados.map(normal));
  const vistos = new Set<string>();
  return lista.filter((s) => {
    const k = normal(s.nome);
    if (fora.has(k) || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

export type EstadoDoRedator = 'sugerido' | 'aceito' | 'recusado';

/** O palpite do roteiro (o primeiro) e o estado dele: sugerido (à espera de um toque), aceito (o redator está
    preenchido, pelo palpite ou pelo Escolher) ou recusado (o ×). Sem palpite, null. */
export function estadoDoRedator(meta: Pick<Meta, 'redator' | 'sugestoesRedator' | 'redatorRecusado'>): { estado: EstadoDoRedator; sugestao: SugestaoRedator } | null {
  const sugestao = meta.sugestoesRedator?.[0];
  if (!sugestao) return null;
  if (meta.redator) return { estado: 'aceito', sugestao };
  const recusado = (meta.redatorRecusado ?? []).some((n) => normal(n) === normal(sugestao.nome));
  return { estado: recusado ? 'recusado' : 'sugerido', sugestao };
}

/** O × no palpite: o nome fica guardado no roteiro (entra na edição simultânea) e não volta. */
export function recusarPalpite(meta: Pick<Meta, 'redator' | 'sugestoesRedator' | 'redatorRecusado'>): Pick<Meta, 'redatorRecusado'> {
  const s = estadoDoRedator(meta)?.sugestao;
  const ja = meta.redatorRecusado ?? [];
  if (!s || ja.some((n) => normal(n) === normal(s.nome))) return { redatorRecusado: ja };
  return { redatorRecusado: [...ja, s.nome] };
}

/** Os sugeridos que vão no topo do menu do Escolher: os palpites que ninguém recusou, com o motivo. */
export function sugeridosDoMenu(meta: Pick<Meta, 'sugestoesRedator' | 'redatorRecusado'>): SugestaoRedator[] {
  const fora = new Set((meta.redatorRecusado ?? []).map(normal));
  return (meta.sugestoesRedator ?? []).filter((s) => !fora.has(normal(s.nome)));
}

/** O texto de cada parágrafo do documento do editor, na ordem (para procurar o redator num roteiro que já está na fila). */
export function paragrafosDoDoc(doc: NoJSON | undefined): string[] {
  const saida: string[] = [];
  const texto = (n: NoJSON): string => (n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? ' ' : (n.content ?? []).map(texto).join(''));
  const andar = (n: NoJSON) => {
    if (n.type === 'paragraph') saida.push(texto(n));
    else (n.content ?? []).forEach(andar);
  };
  if (doc) andar(doc);
  return saida;
}
