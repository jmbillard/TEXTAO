/* O cadastro das ilhas (#124), no SQLite do PROMeiro (e por isso no backup), não no Teable: as ilhas são um cadastro
   novo, e no Teable isso pediria uma tabela nova na base PROMeiro. Quem usa as ilhas é só a montagem da pauta, que
   também fica no SQLite; o histórico das posições (escala_posicoes) guarda o id da ilha, e é dele que sai a ilha de
   costume de cada editor.
   - ilhas: o id, o tipo (em maiúsculas), o número (como escrito) e o nome opcional; tipo e número não se repetem.
   O SQL é portável (vale também no Postgres): sem INSERT OR REPLACE. */
import { randomUUID } from 'node:crypto';
import { emOrdem, ilhasDeCostume } from '../src/modelo/ilhas.ts';

/** Quanto do histórico conta para a ilha de costume: as oito semanas antes do dia. */
const DIAS_DO_COSTUME = 56;
const TIPO = /^[A-Z0-9][A-Z0-9 -]{0,15}$/;
const NUMERO = /^[0-9][0-9A-Z-]{0,5}$/;

const erro = (mensagem, status = 400) => Object.assign(new Error(mensagem), { status });
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '');
const diaAntes = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** A ilha do pedido, no padrão: o tipo em maiúsculas e sem acento, o número como escrito, o nome sem as pontas. */
export function ilhaDoPedido(corpo) {
  const tipo = semAcento(corpo?.tipo).trim().replace(/\s+/g, ' ').toUpperCase();
  const numero = String(corpo?.numero ?? '').trim().toUpperCase();
  const nome = String(corpo?.nome ?? '').trim().replace(/\s+/g, ' ');
  if (!TIPO.test(tipo)) throw erro('Falta o tipo da ilha (AVID, VDI…).');
  if (!NUMERO.test(numero)) throw erro('O número da ilha começa por um algarismo (até 6 letras e algarismos).');
  if (nome.length > 40) throw erro('O nome da ilha é longo demais (até 40 letras).');
  return { tipo, numero, nome };
}

/** @param db o SQLite do PROMeiro (a tabela é criada aqui; escala_posicoes, pela escala) */
export function criarIlhas(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ilhas (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      numero TEXT NOT NULL,
      nome TEXT NOT NULL DEFAULT '',
      por TEXT,
      em TEXT NOT NULL,
      UNIQUE (tipo, numero)
    );
  `);
  const q = {
    todas: db.prepare('SELECT id, tipo, numero, nome FROM ilhas'),
    uma: db.prepare('SELECT id, tipo, numero, nome FROM ilhas WHERE id = ?'),
    mesma: db.prepare('SELECT id FROM ilhas WHERE tipo = ? AND numero = ?'),
    criar: db.prepare('INSERT INTO ilhas (id, tipo, numero, nome, por, em) VALUES (?, ?, ?, ?, ?, ?)'),
    mudar: db.prepare('UPDATE ilhas SET tipo = ?, numero = ?, nome = ?, por = ?, em = ? WHERE id = ?'),
    remover: db.prepare('DELETE FROM ilhas WHERE id = ?'),
    historico: db.prepare("SELECT dia, editor, ilha FROM escala_posicoes WHERE dia >= ? AND dia < ? AND ilha <> ''"),
  };
  const repetida = (i, id = '') => {
    const outra = q.mesma.get(i.tipo, i.numero);
    if (outra && outra.id !== id) throw erro(`Já existe a ${i.tipo} ${i.numero}.`, 409);
  };
  const agora = () => new Date().toISOString();

  return {
    /** As ilhas, em ordem (pelo tipo e pelo número). */
    todas: () => emOrdem(q.todas.all().map((l) => ({ id: l.id, tipo: l.tipo, numero: l.numero, nome: l.nome }))),
    /** Cadastra (lança 400 o pedido errado, 409 a ilha que já existe). */
    criar(corpo, por) {
      const i = ilhaDoPedido(corpo);
      repetida(i);
      const id = `ilha-${randomUUID().slice(0, 12)}`;
      q.criar.run(id, i.tipo, i.numero, i.nome, por, agora());
      return { id, ...i };
    },
    /** Muda o tipo, o número e o nome (lança 404 a que não existe). */
    mudar(id, corpo, por) {
      if (!q.uma.get(id)) throw erro('Essa ilha não está no cadastro.', 404);
      const i = ilhaDoPedido(corpo);
      repetida(i, id);
      q.mudar.run(i.tipo, i.numero, i.nome, por, agora(), id);
      return { id, ...i };
    },
    /** Tira do cadastro; as posições que já tinham a ilha continuam com ela. */
    remover(id) {
      if (!q.uma.get(id)) throw erro('Essa ilha não está no cadastro.', 404);
      q.remover.run(id);
    },
    /** A ilha de costume de cada editor no dia: a que mais se repete nas posições das oito semanas antes dele. */
    deCostume(dia) {
      const valem = new Set(q.todas.all().map((l) => l.id));
      return ilhasDeCostume(q.historico.all(diaAntes(dia, DIAS_DO_COSTUME), dia), valem);
    },
  };
}
