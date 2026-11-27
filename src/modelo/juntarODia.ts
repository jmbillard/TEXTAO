/* Montar a pauta: duas pessoas ao mesmo tempo (#131). As regras puras de juntar o trabalho de duas pessoas da
   coordenação no mesmo dia, as mesmas no servidor e no navegador (só sintaxe que o Node apaga).
   Juntar é de três vias: a `base` (o dia como a pessoa o leu), as `minhas` (o que ela tem agora) e as `atuais` (o que
   está gravado, com o trabalho da outra). Campo por campo: o que eu mudei desde a base vale; o que não mudei fica como
   a outra deixou. A mesma coisa com outra grafia ("22 as 6" e "22h às 6h") não é mudança, e a minha grafia fica.
   As posições, as demandas e os avisos são achados pelo id, em qualquer posição: a demanda que uma moveu vai para onde
   ela pôs, com o texto que a outra escreveu. Tirar só vale para o que a outra não mexeu: o trabalho dela fica. Nada é
   travado: no mesmo campo, vale quem gravou por último. A ilha é comparada pela sala (#165): trocar a AVID 46 pela
   ILHA 46 repetida do cadastro não é mudança. */
import { demandaNoPadrao, horarioNoPadrao, type AvisoDaEscala, type DemandaDaEscala, type PosicaoDaEscala } from './escala.ts';
import { salaPeloId, type Ilha } from './ilhas.ts';

/** Um lado do dia: as posições e o recado do dia. */
export interface LadoDoDia {
  posicoes: readonly PosicaoDaEscala[];
  recado: string;
}

type Item = { id: string };
/** Onde cada item está num lado: o lugar (a posição, ou o dia, para as posições) e o item. */
type Onde<T> = Map<string, { lugar: string; item: T }>;

const limpo = (t: unknown) => String(t ?? '').trim().replace(/\s+/g, ' ');

/** O campo juntado: o meu, se é o mesmo que o gravado ou se eu o mudei desde a base; senão, o gravado. */
function campo<T>(base: T | undefined, minha: T, atual: T, igual: (a: T, b: T) => boolean): T {
  if (igual(minha, atual)) return minha;
  if (base !== undefined && igual(minha, base)) return atual;
  return minha;
}

function onde<T extends Item>(grupos: readonly { lugar: string; itens: readonly T[] }[]): Onde<T> {
  const m: Onde<T> = new Map();
  for (const g of grupos) for (const item of g.itens) if (!m.has(item.id)) m.set(item.id, { lugar: g.lugar, item });
  return m;
}

/**
 * Junta uma coleção de itens com id, espalhados em lugares (as demandas nas posições; as posições no dia).
 * Devolve, por lugar, os itens juntados na ordem: a do gravado e, entre eles, os que só eu tenho, depois do item que
 * vinha antes deles na minha lista.
 * @param juntarItem junta o item dos três lados (a base pode faltar: o item é novo)
 * @param mudou diz se o item mudou desde a base (o que mudou não sai quando o outro lado o tirou)
 */
function juntarColecao<T extends Item>(
  base: readonly { lugar: string; itens: readonly T[] }[],
  minhas: readonly { lugar: string; itens: readonly T[] }[],
  atuais: readonly { lugar: string; itens: readonly T[] }[],
  juntarItem: (b: T | undefined, m: T, a: T) => T,
  mudou: (b: T, x: T) => boolean,
): Map<string, T[]> {
  const B = onde(base);
  const M = onde(minhas);
  const A = onde(atuais);
  // onde cada item fica, e com que cara
  const fica = new Map<string, { lugar: string; item: T }>();
  for (const id of new Set([...M.keys(), ...A.keys()])) {
    const b = B.get(id);
    const m = M.get(id);
    const a = A.get(id);
    let lugar: string | undefined;
    if (m && b && m.lugar === b.lugar) {
      // eu não mexi no lugar: vale o do gravado; tirado pelo outro lado, só fica se eu mudei o item
      lugar = a ? a.lugar : mudou(b.item, m.item) ? m.lugar : undefined;
    } else if (m) {
      // eu pus (ou movi) aqui
      lugar = m.lugar;
    } else if (a && b) {
      // eu tirei: sai, a menos que o outro lado tenha mudado o item
      lugar = mudou(b.item, a.item) ? a.lugar : undefined;
    } else if (a) {
      // o outro lado pôs
      lugar = a.lugar;
    }
    if (lugar === undefined) continue;
    const item = m && a ? juntarItem(b?.item, m.item, a.item) : (m ?? a)!.item;
    fica.set(id, { lugar, item });
  }
  // a ordem em cada lugar: a do gravado, com os meus encaixados depois do que vinha antes deles
  const porLugar = new Map<string, T[]>();
  const lugares = new Set([...atuais.map((g) => g.lugar), ...minhas.map((g) => g.lugar)]);
  for (const lugar of lugares) {
    const ids = (atuais.find((g) => g.lugar === lugar)?.itens ?? []).map((x) => x.id).filter((id) => fica.get(id)?.lugar === lugar);
    const minhaLista = (minhas.find((g) => g.lugar === lugar)?.itens ?? []).map((x) => x.id);
    minhaLista.forEach((id, i) => {
      if (fica.get(id)?.lugar !== lugar || ids.includes(id)) return;
      const antes = minhaLista.slice(0, i).reverse().find((x) => ids.includes(x));
      ids.splice(antes === undefined ? 0 : ids.indexOf(antes) + 1, 0, id);
    });
    // o que ficou aqui e não estava em nenhuma das duas listas deste lugar (raro: vem do gravado de outro lugar)
    for (const [id, f] of fica) if (f.lugar === lugar && !ids.includes(id)) ids.push(id);
    porLugar.set(lugar, ids.map((id) => fica.get(id)!.item));
  }
  return porLugar;
}

const DIA = 'dia';
const textoIgual = (a: string, b: string) => limpo(a) === limpo(b);

/**
 * O dia juntado: as minhas mudanças desde a base por cima do que está gravado agora (veja o comentário do arquivo).
 * @param dia o dia (a claquete é comparada no padrão, perto dele)
 * @param o.ilhas o cadastro das ilhas (a ilha é comparada pela sala; sem ele, pelo id)
 */
export function juntarODia(base: LadoDoDia, minhas: LadoDoDia, atuais: LadoDoDia, dia: string, o: { ilhas?: readonly Ilha[] } = {}): { posicoes: PosicaoDaEscala[]; recado: string } {
  const sala = salaPeloId(o.ilhas ?? []);
  const ilhaIgual = (a: string, b: string) => sala(a) === sala(b);
  const demandaIgual = (a: string, b: string) => textoIgual(a, b) || limpo(demandaNoPadrao(a, dia)) === limpo(demandaNoPadrao(b, dia));
  const horarioIgual = (a: string, b: string) => textoIgual(a, b) || horarioNoPadrao(limpo(a)) === horarioNoPadrao(limpo(b));
  const juntarTexto = (igual: (a: string, b: string) => boolean) => <T extends DemandaDaEscala | AvisoDaEscala>(b: T | undefined, m: T, a: T): T => ({ ...m, texto: campo(b?.texto, m.texto, a.texto, igual) });
  const mudouTexto = (igual: (a: string, b: string) => boolean) => (b: Item & { texto: string }, x: Item & { texto: string }) => !igual(b.texto, x.texto);

  // as demandas e os avisos, cada um na sua posição (um pode ir de uma posição para outra)
  const grupos = (lado: LadoDoDia, de: 'demandas' | 'avisos') => lado.posicoes.map((p) => ({ lugar: p.id, itens: (p[de] ?? []) as (DemandaDaEscala | AvisoDaEscala)[] }));
  const demandas = juntarColecao(grupos(base, 'demandas'), grupos(minhas, 'demandas'), grupos(atuais, 'demandas'), juntarTexto(demandaIgual), mudouTexto(demandaIgual));
  const avisos = juntarColecao(grupos(base, 'avisos'), grupos(minhas, 'avisos'), grupos(atuais, 'avisos'), juntarTexto(textoIgual), mudouTexto(textoIgual));

  // a posição mudou se mudou um campo dela ou o que está nela (a linha vazia, em que a tela espera a digitação, não conta)
  const cheias = <T extends { texto: string }>(xs: readonly T[] | undefined) => (xs ?? []).filter((x) => limpo(x.texto));
  const conteudo = (p: PosicaoDaEscala) => JSON.stringify([cheias(p.demandas).map((d) => [d.id, limpo(demandaNoPadrao(d.texto, dia))]), cheias(p.avisos).map((a) => [a.id, limpo(a.texto)])]);
  const mudouPosicao = (b: PosicaoDaEscala, x: PosicaoDaEscala) =>
    b.turno !== x.turno || !textoIgual(b.editor, x.editor) || !ilhaIgual(b.ilha, x.ilha) || !horarioIgual(b.horario, x.horario) || !textoIgual(b.vaga ?? '', x.vaga ?? '') || conteudo(b) !== conteudo(x);
  const juntarPosicao = (b: PosicaoDaEscala | undefined, m: PosicaoDaEscala, a: PosicaoDaEscala): PosicaoDaEscala => {
    const igual = (x: string, y: string) => x === y;
    return {
      ...m,
      turno: campo(b?.turno, m.turno, a.turno, igual),
      editor: campo(b?.editor, m.editor, a.editor, textoIgual),
      ilha: campo(b?.ilha, m.ilha, a.ilha, ilhaIgual),
      horario: campo(b?.horario, m.horario, a.horario, horarioIgual),
      vaga: campo(b ? b.vaga ?? '' : undefined, m.vaga ?? '', a.vaga ?? '', textoIgual),
    };
  };
  const posicoes = (juntarColecao([{ lugar: DIA, itens: base.posicoes }], [{ lugar: DIA, itens: minhas.posicoes }], [{ lugar: DIA, itens: atuais.posicoes }], juntarPosicao, mudouPosicao).get(DIA) ?? []).map(
    (p): PosicaoDaEscala => {
      const { vaga, ...resto } = p;
      return { ...resto, demandas: demandas.get(p.id) ?? [], avisos: avisos.get(p.id) ?? [], ...(vaga ? { vaga } : {}) };
    },
  );
  // uma demanda (ou um aviso) nunca fica em dois lugares, nem na posição que saiu
  const vistos = new Set<string>();
  const umaVez = <T extends Item>(xs: T[]) => xs.filter((x) => !vistos.has(x.id) && vistos.add(x.id));
  return {
    posicoes: posicoes.map((p) => ({ ...p, demandas: umaVez(p.demandas), avisos: umaVez(p.avisos) })),
    recado: campo(base.recado ?? '', minhas.recado ?? '', atuais.recado ?? '', textoIgual),
  };
}
