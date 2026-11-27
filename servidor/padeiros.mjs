/* O caminho do Padeiro (#137): a chave do Padeiro, no SQLite do PROMeiro (e por isso no backup).
   - O Padeiro (a extensão do After Effects, fora do Cloudflare Access) se cadastra com o usuário do computador, o nome
     do computador, o sistema e a sigla do designer, e recebe uma chave. Uma por par usuário + computador: o cadastro
     novo do mesmo par troca a chave na hora e volta a pendente, quando ela está pendente ou revogada. A ligada não
     cai: o cadastro novo vira o **pedido novo** do mesmo computador (pendente, numa linha à parte, com a sua chave), e
     a ligada vale até um administrador aprovar o pedido (aí ela cai) ou recusá-lo (aí ela fica). O pedido novo guarda
     no `par` o do computador com NOVO no fim: o par continua único (uma chave atual e, no máximo, um pedido novo).
   - Estados: pendente (ninguém ligou ainda), ligada (a um designer cadastrado, por um administrador) e revogada.
   - A chave só existe às claras na resposta do cadastro. Aqui fica o SHA-256 dela: a chave são 32 bytes aleatórios
     (256 bits), então não há o que adivinhar por força bruta e um hash lento (scrypt, bcrypt) não acrescenta nada; o
     SHA-256, sem sal, deixa achar a chave pelo hash (o índice único) e o backup vazado não dá a chave a ninguém. A
     busca compara o hash do que veio, e não a chave: o tempo da comparação não diz nada sobre a chave guardada.
   O SQL é portável (vale também no Postgres): sem INSERT OR REPLACE, sem json_extract. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** O cabeçalho em que o Padeiro manda a chave (o único jeito de ser reconhecido no caminho dele). */
export const CABECALHO_DA_CHAVE = 'x-chave-do-padeiro';
export const ESTADOS = ['pendente', 'ligada', 'revogada'];
/** Os limites do cadastro: bem acima de um nome de verdade, para um pedido errado não encher o banco. */
const LIMITES = { usuario: 80, computador: 120, sistema: 120, sigla: 40 };
/** Quantos cadastros cabem: o caminho é aberto (sem login), e um robô não enche o banco. */
const MAXIMO_DE_PADEIROS = 500;

const erro = (mensagem, status = 400) => Object.assign(new Error(mensagem), { status });
const hashDa = (chave) => createHash('sha256').update(String(chave)).digest('hex');
/** O par usuário + computador como o PROMeiro compara (o mesmo computador pode mandar o nome em outra caixa). */
const parDe = (usuario, computador) => `${usuario.toLowerCase()}\n${computador.toLowerCase()}`;
/** O fim do `par` do pedido novo (a chave que espera para trocar a ligada do mesmo computador). */
const NOVO = '\nnovo';

/** O cadastro que veio do Padeiro, conferido. Lança (status 400) o que falta ou passa do limite. */
function doPedido(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const campo = (nome, obrigatorio = true) => {
    const v = c[nome];
    if (v !== undefined && v !== null && typeof v !== 'string') throw erro(`O campo ${nome} é inválido.`);
    const t = String(v ?? '').trim().replace(/\s+/g, ' ');
    if (obrigatorio && !t) throw erro(`Falta o campo ${nome}.`);
    if (t.length > LIMITES[nome]) throw erro(`O campo ${nome} é longo demais (até ${LIMITES[nome]} letras).`);
    return t;
  };
  return { usuario: campo('usuario'), computador: campo('computador'), sistema: campo('sistema', false), sigla: campo('sigla', false).toUpperCase() };
}

/** @param db o SQLite do PROMeiro (a tabela é criada aqui) */
export function criarPadeiros(db, { agora = () => new Date() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS padeiros (
      id TEXT PRIMARY KEY,
      par TEXT NOT NULL UNIQUE,
      usuario TEXT NOT NULL,
      computador TEXT NOT NULL,
      sistema TEXT NOT NULL,
      sigla TEXT NOT NULL,
      chave_hash TEXT NOT NULL UNIQUE,
      estado TEXT NOT NULL,
      designer_registro TEXT,
      designer_nome TEXT,
      mudado_por TEXT,
      mudado_em TEXT,
      criado_em TEXT NOT NULL,
      ultimo_aviso_em TEXT
    );
  `);
  const COLUNAS = 'id, par, usuario, computador, sistema, sigla, estado, designer_registro, designer_nome, mudado_por, mudado_em, criado_em, ultimo_aviso_em';
  const q = {
    doPar: db.prepare('SELECT id, estado FROM padeiros WHERE par = ?'),
    apagar: db.prepare('DELETE FROM padeiros WHERE id = ?'),
    mudarPar: db.prepare('UPDATE padeiros SET par = ? WHERE id = ?'),
    total: db.prepare('SELECT COUNT(*) AS n FROM padeiros'),
    trocar: db.prepare(
      `UPDATE padeiros SET usuario = ?, computador = ?, sistema = ?, sigla = ?, chave_hash = ?, estado = 'pendente', designer_registro = NULL,
         designer_nome = NULL, mudado_por = NULL, mudado_em = NULL, criado_em = ? WHERE id = ?`,
    ),
    inserir: db.prepare(
      `INSERT INTO padeiros (id, par, usuario, computador, sistema, sigla, chave_hash, estado, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`,
    ),
    daChave: db.prepare(`SELECT ${COLUNAS} FROM padeiros WHERE chave_hash = ?`),
    um: db.prepare(`SELECT ${COLUNAS} FROM padeiros WHERE id = ?`),
    todos: db.prepare(`SELECT ${COLUNAS} FROM padeiros`),
    ligar: db.prepare("UPDATE padeiros SET estado = 'ligada', designer_registro = ?, designer_nome = ?, mudado_por = ?, mudado_em = ? WHERE id = ?"),
    revogar: db.prepare("UPDATE padeiros SET estado = 'revogada', mudado_por = ?, mudado_em = ? WHERE id = ?"),
  };
  const ehPedidoNovo = (l) => l.par.endsWith(NOVO);
  const comoFica = (l) => ({
    id: l.id,
    // o pedido novo do mesmo computador e a chave ligada que ele vai trocar quando for aprovado
    pedidoNovo: ehPedidoNovo(l),
    substitui: ehPedidoNovo(l) ? (q.doPar.get(l.par.slice(0, -NOVO.length))?.id ?? null) : null,
    usuario: l.usuario,
    computador: l.computador,
    sistema: l.sistema,
    sigla: l.sigla,
    estado: l.estado,
    designer: l.designer_registro ? { registro: l.designer_registro, nome: l.designer_nome } : null,
    mudadoPor: l.mudado_por ?? null,
    mudadoEm: l.mudado_em ?? null,
    criadoEm: l.criado_em,
    ultimoAviso: l.ultimo_aviso_em ?? null,
  });
  const emTransacao = (f) => {
    db.exec('BEGIN');
    try {
      f();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const achar = (id) => {
    const l = typeof id === 'string' ? q.um.get(id) : null;
    if (!l) throw erro('Não achei esse Padeiro.', 404);
    return l;
  };

  return {
    /**
     * O cadastro do Padeiro: devolve a chave (às claras, só aqui) e o estado, pendente. Com a chave do mesmo par usuário
     * + computador ligada, o cadastro vira o pedido novo (a ligada continua valendo); senão, troca a chave do cadastro
     * que já existia (a antiga deixa de valer, e o pedido novo que havia some).
     */
    cadastrar(corpo) {
      const p = doPedido(corpo);
      const chave = randomBytes(32).toString('base64url');
      const em = agora().toISOString();
      const par = parDe(p.usuario, p.computador);
      const atual = q.doPar.get(par);
      const pedido = q.doPar.get(par + NOVO);
      const novaLinha = (oPar) => {
        if (q.total.get().n >= MAXIMO_DE_PADEIROS) throw erro('Padeiros demais cadastrados. Peça a um administrador para revogar os que não valem mais.', 429);
        q.inserir.run(randomUUID(), oPar, p.usuario, p.computador, p.sistema, p.sigla, hashDa(chave), em);
      };
      emTransacao(() => {
        if (atual?.estado === 'ligada') {
          if (pedido) q.trocar.run(p.usuario, p.computador, p.sistema, p.sigla, hashDa(chave), em, pedido.id);
          else novaLinha(par + NOVO);
        } else {
          if (pedido) q.apagar.run(pedido.id);
          if (atual) q.trocar.run(p.usuario, p.computador, p.sistema, p.sigla, hashDa(chave), em, atual.id);
          else novaLinha(par);
        }
      });
      return { chave, estado: 'pendente', usuario: p.usuario, computador: p.computador };
    },
    /** O Padeiro da chave (o que veio no cabeçalho), ou null quando ela não vale (nenhuma, errada ou trocada). */
    daChave(chave) {
      const c = String(chave ?? '').trim();
      if (!c || c.length > 200) return null;
      const l = q.daChave.get(hashDa(c));
      return l ? comoFica(l) : null;
    },
    /** Todos os Padeiros (a aba Padeiros): os pendentes primeiro, depois os ligados e os revogados; em cada estado,
        pelo usuário e pelo computador. O pedido novo vem logo antes da chave que ele vai trocar. */
    lista() {
      const todos = q.todos
        .all()
        .map(comoFica)
        .sort((a, b) => ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado) || a.usuario.localeCompare(b.usuario, 'pt-BR') || a.computador.localeCompare(b.computador, 'pt-BR'));
      const pedidos = new Map(todos.filter((p) => p.substitui).map((p) => [p.substitui, p]));
      return todos.filter((p) => !p.substitui).flatMap((p) => (pedidos.has(p.id) ? [pedidos.get(p.id), p] : [p]));
    },
    /** Liga a chave a um designer cadastrado ({ registro, nome }), ou troca o designer da ligada. A revogada não volta:
        o Padeiro pede outra chave. */
    ligar(id, designer, por) {
      const l = achar(id);
      if (l.estado === 'revogada') throw erro('Essa chave foi revogada: o Padeiro precisa pedir outra.', 409);
      emTransacao(() => {
        // aprovar o pedido novo: a chave de antes do mesmo computador cai, e o pedido passa a ser a chave dele
        if (ehPedidoNovo(l)) {
          const par = l.par.slice(0, -NOVO.length);
          const antes = q.doPar.get(par);
          if (antes) q.apagar.run(antes.id);
          q.mudarPar.run(par, id);
        }
        q.ligar.run(designer.registro, designer.nome, por, agora().toISOString(), id);
      });
      return comoFica(q.um.get(id));
    },
    /** Revoga a chave: o Padeiro vê "revogada" e precisa se cadastrar de novo (e volta a pendente). No pedido novo, é
        recusar: a chave ligada do mesmo computador fica. */
    revogar(id, por) {
      achar(id);
      q.revogar.run(por, agora().toISOString(), id);
      return comoFica(q.um.get(id));
    },
  };
}
