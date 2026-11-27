/* O registro da correção de grafia (#115): cada correção aplicada, no SQLite do PROMeiro (e por isso no backup), com o
   que era, o que ficou, quem aplicou e quando; e o desfazer de cada uma, mais tarde. Serve a todos os tipos de correção:
   a pauta da edição (#115) e, depois, juntar atrações (#117). Cada tipo dá o seu `desfazer`, que confere "mudou desde
   então" e grava o valor antigo de volta; o registro só guarda, lista e marca a desfeita.
   O SQL é o comum ao SQLite e ao Postgres: o id é texto (randomUUID), as datas são texto ISO, os valores são JSON em
   texto (sem json_extract), e o "desfeita" é um UPDATE condicional (… WHERE desfeita_em IS NULL). */
import { randomUUID } from 'node:crypto';

/** Quantas correções por página do registro. */
export const REGISTROS_POR_PAGINA = 20;
/** Quantas correções um pedido de desfazer leva (uma aplicação inteira cabe). */
export const MAX_DESFAZER = 100;

/** Por que uma correção não foi desfeita, na tela. */
const TEXTOS = {
  'nao-existe': 'Essa correção não está no registro.',
  desfeita: 'Essa correção já foi desfeita.',
  'sem-tipo': 'O PROMeiro não sabe desfazer esse tipo de correção.',
};

/**
 * @param db o SQLite do PROMeiro (a tabela `correcoes_aplicadas` é criada aqui)
 * @param desfazedores { [tipo]: async (correcao) => null | { motivo, texto } }: desfaz no Teable (null deu certo)
 */
export function criarRegistroDeCorrecoes({ db, desfazedores = {} }) {
  // antes, depois e detalhes são JSON: cada tipo guarda o que o desfazer dele precisa (e o que a tela mostra)
  db.exec(`CREATE TABLE IF NOT EXISTS correcoes_aplicadas (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    alvo TEXT NOT NULL,
    antes TEXT NOT NULL,
    depois TEXT NOT NULL,
    detalhes TEXT NOT NULL DEFAULT '{}',
    por TEXT NOT NULL,
    em TEXT NOT NULL,
    desfeita_por TEXT,
    desfeita_em TEXT
  )`);
  const q = {
    registrar: db.prepare('INSERT INTO correcoes_aplicadas (id, tipo, alvo, antes, depois, detalhes, por, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    uma: db.prepare('SELECT * FROM correcoes_aplicadas WHERE id = ?'),
    total: db.prepare('SELECT count(*) AS n FROM correcoes_aplicadas'),
    pagina: db.prepare('SELECT * FROM correcoes_aplicadas ORDER BY em DESC, id DESC LIMIT ? OFFSET ?'),
    desfeita: db.prepare('UPDATE correcoes_aplicadas SET desfeita_por = ?, desfeita_em = ? WHERE id = ? AND desfeita_em IS NULL'),
  };
  const lida = (l) =>
    l && {
      id: l.id,
      tipo: l.tipo,
      alvo: l.alvo,
      antes: JSON.parse(l.antes),
      depois: JSON.parse(l.depois),
      detalhes: JSON.parse(l.detalhes || '{}'),
      por: l.por,
      em: l.em,
      desfeita: l.desfeita_em ? { por: l.desfeita_por, em: l.desfeita_em } : null,
    };
  // a correção que está sendo desfeita agora (dois pedidos ao mesmo tempo não gravam duas vezes)
  const desfazendo = new Set();

  return {
    /**
     * Guarda uma correção aplicada. @returns o id dela no registro
     * @param c { tipo, alvo (o id do que mudou), antes, depois, detalhes?, por (o e-mail), em? }
     */
    registrar({ tipo, alvo, antes, depois, detalhes = {}, por, em = new Date().toISOString() }) {
      const id = randomUUID();
      q.registrar.run(id, tipo, String(alvo), JSON.stringify(antes), JSON.stringify(depois), JSON.stringify(detalhes), por, em);
      return id;
    },
    /** Uma correção do registro, ou null. */
    pegar: (id) => lida(q.uma.get(String(id))) ?? null,
    /** Uma página do registro, a mais recente primeiro. @param pagina a partir de 1 */
    listar(pagina = 1) {
      const itens = q.pagina.all(REGISTROS_POR_PAGINA, (pagina - 1) * REGISTROS_POR_PAGINA).map(lida);
      return { pagina, porPagina: REGISTROS_POR_PAGINA, total: q.total.get().n, itens };
    },
    /**
     * Desfaz as correções, uma por vez, na ordem pedida: o desfazer do tipo confere e grava no Teable; deu certo, a
     * correção fica marcada como desfeita (por quem e quando).
     * @returns { certas: [ids], falhas: [{ id, motivo, texto }] }
     */
    async desfazer(ids, por) {
      const certas = [];
      const falhas = [];
      for (const id of ids) {
        const c = lida(q.uma.get(String(id)));
        const falha = (motivo, texto = TEXTOS[motivo]) => falhas.push({ id, motivo, texto });
        if (!c) {
          falha('nao-existe');
          continue;
        }
        if (c.desfeita || desfazendo.has(c.id)) {
          falha('desfeita');
          continue;
        }
        const desfazer = desfazedores[c.tipo];
        if (!desfazer) {
          falha('sem-tipo');
          continue;
        }
        desfazendo.add(c.id);
        try {
          const r = await desfazer(c);
          if (r) falha(r.motivo, r.texto);
          else if (q.desfeita.run(por, new Date().toISOString(), c.id).changes) certas.push(c.id);
          else falha('desfeita');
        } catch (e) {
          falha('erro', `Não desfiz: ${e instanceof Error ? e.message : e}.`);
        } finally {
          desfazendo.delete(c.id);
        }
      }
      return { certas, falhas };
    },
  };
}

/** Os ids de um pedido de desfazer: de 1 a 100 textos curtos, ou null. */
export function idsParaDesfazer(v) {
  if (!Array.isArray(v) || !v.length || v.length > MAX_DESFAZER) return null;
  return v.every((x) => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)) ? v : null;
}
