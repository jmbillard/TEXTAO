/* Os caminhos da arte (#202): a pasta de saída (o output, de onde a edição pega o render) e o projeto (o `.aep`) de uma
   Produção, nos dois jeitos, Windows e Mac. Vêm do registro do projeto (a tabela `projetos`, #144), que o Padeiro manda
   a cada projeto criado, aberto ou alterado pelo card: a Produção acha os registros pelo card dela.

   O Padeiro manda o caminho como o computador do designer mostra (docs/webhook-projeto.md do Padeiro): no Windows, o
   de rede (\\servidor\VOLUME\…); no Mac, o do volume montado (/Volumes/VOLUME/…, sem o -1 a -5 de quando o macOS monta
   o mesmo volume de novo). Os dois são o mesmo lugar: o Mac monta o VOLUME do servidor em /Volumes/VOLUME (é a mesma
   conta do Padeiro, finder.js e attractions.js, e a mesma chave das pastas do projeto do Padeiro, chaveDaPasta). Do
   Windows para o Mac, a troca é direta; do Mac para o Windows falta o nome do servidor, que sai dos outros registros
   (o mesmo VOLUME já visto num caminho de rede). Sem ele, ou com a letra do disco (Z:\…), só o jeito que veio.

   O mesmo módulo serve ao servidor e ao navegador: só sintaxe que o Node apaga. */

/** Um caminho nos dois sistemas ('' no que não dá para saber). */
export interface NosDoisSistemas {
  win: string;
  mac: string;
}

/** Os caminhos da arte de uma Produção: a pasta de saída e o projeto (null no que o registro não tem). */
export interface CaminhosDaArte {
  saida: NosDoisSistemas | null;
  projeto: NosDoisSistemas | null;
}

/** Um registro do projeto, só com o que os caminhos usam. */
export interface RegistroDoProjeto {
  /** o card do Trello (card_ID) */
  card: string;
  aep: string;
  output: string;
  /** quando chegou (ISO) */
  data: string;
}

const REDE = /^\/\/([^/]+)\/([^/]+)(\/.*)?$/;
const VOLUME = /^\/Volumes\/([^/]+?)(?:-[1-5])?(\/.*)?$/i;
const DISCO = /^[A-Za-z]:\//;

const comBarras = (s: string) => String(s ?? '').trim().replace(/\\/g, '/');
const semBarraNoFim = (s: string) => (s.length > 1 ? s.replace(/\/+$/, '') : s);
const doWindows = (servidor: string, volume: string, resto: string) => `\\\\${servidor}\\${volume}${resto.replace(/\//g, '\\')}`;

/** O servidor de cada VOLUME, dos caminhos de rede dados (o mais à frente na lista vale): { volume em minúsculas: servidor }. */
export function servidoresDosCaminhos(caminhos: readonly string[]): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const c of caminhos) {
    const m = REDE.exec(comBarras(c));
    if (m && !(m[2].toLowerCase() in saida)) saida[m[2].toLowerCase()] = m[1];
  }
  return saida;
}

/**
 * O caminho nos dois sistemas. O de rede dá os dois; o do Mac dá o do Windows quando o servidor do volume é conhecido;
 * a letra do disco e o caminho local ficam só no jeito que vieram. null sem caminho.
 * @param servidores { volume em minúsculas: servidor } (servidoresDosCaminhos)
 */
export function nosDoisSistemas(caminho: string, servidores: Record<string, string> = {}): NosDoisSistemas | null {
  const p = semBarraNoFim(comBarras(caminho));
  if (!p) return null;
  const rede = REDE.exec(p);
  if (rede) return { win: doWindows(rede[1], rede[2], rede[3] ?? ''), mac: `/Volumes/${rede[2]}${rede[3] ?? ''}` };
  const vol = VOLUME.exec(p);
  if (vol) {
    const servidor = servidores[vol[1].toLowerCase()];
    return { win: servidor ? doWindows(servidor, vol[1], vol[2] ?? '') : '', mac: `/Volumes/${vol[1]}${vol[2] ?? ''}` };
  }
  if (DISCO.test(p)) return { win: p.replace(/\//g, '\\'), mac: '' };
  return p.startsWith('/') ? { win: '', mac: p } : { win: String(caminho).trim(), mac: '' };
}

const quando = (r: RegistroDoProjeto) => (Number.isFinite(Date.parse(r.data)) ? Date.parse(r.data) : -Infinity);

/**
 * Os caminhos da arte de um card, dos registros do projeto dele: cada caminho do registro mais novo que o tem (o
 * `aberto` e o `alterado` podem vir sem a pasta de saída, que é a da atração e não muda). null sem nenhum dos dois.
 */
export function caminhosDosRegistros(registros: readonly RegistroDoProjeto[], servidores: Record<string, string> = {}): CaminhosDaArte | null {
  const doMaisNovo = [...registros].sort((a, b) => quando(b) - quando(a));
  const primeiro = (campo: 'aep' | 'output') => {
    for (const r of doMaisNovo) {
      const c = nosDoisSistemas(r[campo], servidores);
      if (c) return c;
    }
    return null;
  };
  const projeto = primeiro('aep');
  const saida = primeiro('output');
  return projeto || saida ? { saida, projeto } : null;
}

/**
 * Os caminhos da arte de cada card pedido: { card: CaminhosDaArte }, só os que têm. O servidor de cada volume sai de
 * todos os caminhos dados (os registros e os `conhecidos`, os caminhos de rede de outros registros).
 */
export function caminhosPorCard(registros: readonly RegistroDoProjeto[], cards: readonly string[], conhecidos: readonly string[] = []): Record<string, CaminhosDaArte> {
  const pedidos = new Set(cards.filter(Boolean));
  const doCard = new Map<string, RegistroDoProjeto[]>();
  for (const r of registros) if (pedidos.has(r.card)) doCard.set(r.card, [...(doCard.get(r.card) ?? []), r]);
  const servidores = servidoresDosCaminhos([...[...registros].sort((a, b) => quando(b) - quando(a)).flatMap((r) => [r.aep, r.output]), ...conhecidos]);
  const saida: Record<string, CaminhosDaArte> = {};
  for (const [card, rs] of doCard) {
    const c = caminhosDosRegistros(rs, servidores);
    if (c) saida[card] = c;
  }
  return saida;
}

/** O nome do arquivo no fim do caminho ("…/01_PROJETOS/FESTA CHAMADA.aep" → "FESTA CHAMADA.aep"). */
export const nomeNoFim = (caminho: string) => comBarras(caminho).replace(/\/+$/, '').split('/').pop() ?? '';
