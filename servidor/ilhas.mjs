/* O cadastro das ilhas (#124), no SQLite do PROMeiro (e por isso no backup), não no Teable: as ilhas são um cadastro
   novo, e no Teable isso pediria uma tabela nova na base PROMeiro. Quem usa as ilhas é só a montagem da pauta, que
   também fica no SQLite; o histórico das posições (escala_posicoes) guarda o id da ilha, e é dele que sai a ilha de
   costume de cada editor.
   - ilhas: o id, o tipo (em maiúsculas), o número (como escrito) e o nome opcional; a sala não se repete (#165:
     "AVID 46", "ILHA 46" e "46" são a mesma, pela regra de src/modelo/ilhas.ts).
   - ilhas_juntadas: as repetidas de antes da regra que um administrador juntou (o id que saiu → o que ficou, quem e
     quando). Juntar passa as posições da que saiu para a que ficou (também as das publicações, para o dia publicado
     continuar publicado) e tira a que saiu do cadastro; o id que saiu
     continua valendo pela que ficou (no que já foi ao Teams e na tela aberta antes de juntar).
   O SQL é portável (vale também no Postgres): sem INSERT OR REPLACE. */
import { randomUUID } from 'node:crypto';
import { emOrdem, ilhasDeCostume, rotuloDaIlha, salaDe, salaPeloId } from '../src/modelo/ilhas.ts';

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
    CREATE TABLE IF NOT EXISTS ilhas_juntadas (
      id TEXT PRIMARY KEY,
      fica TEXT NOT NULL,
      por TEXT,
      em TEXT NOT NULL
    );
  `);
  const q = {
    todas: db.prepare('SELECT id, tipo, numero, nome FROM ilhas'),
    uma: db.prepare('SELECT id, tipo, numero, nome FROM ilhas WHERE id = ?'),
    criar: db.prepare('INSERT INTO ilhas (id, tipo, numero, nome, por, em) VALUES (?, ?, ?, ?, ?, ?)'),
    mudar: db.prepare('UPDATE ilhas SET tipo = ?, numero = ?, nome = ?, por = ?, em = ? WHERE id = ?'),
    remover: db.prepare('DELETE FROM ilhas WHERE id = ?'),
    historico: db.prepare("SELECT dia, editor, ilha FROM escala_posicoes WHERE dia >= ? AND dia < ? AND ilha <> ''"),
    usos: db.prepare("SELECT ilha, COUNT(*) AS n FROM escala_posicoes WHERE ilha <> '' GROUP BY ilha"),
    juntadas: db.prepare('SELECT id, fica FROM ilhas_juntadas'),
    passarPosicoes: db.prepare('UPDATE escala_posicoes SET ilha = ? WHERE ilha = ?'),
    passarJuntadas: db.prepare('UPDATE ilhas_juntadas SET fica = ? WHERE fica = ?'),
    juntar: db.prepare('INSERT INTO ilhas_juntadas (id, fica, por, em) VALUES (?, ?, ?, ?)'),
    publicacoes: db.prepare('SELECT id, posicoes FROM escala_publicacoes WHERE posicoes LIKE ?'),
    passarPublicacao: db.prepare('UPDATE escala_publicacoes SET posicoes = ? WHERE id = ?'),
  };
  /** As publicações com a ilha que sai, com ela trocada pela que fica (só o campo ilha das posições). */
  const passarPublicacoes = (fica, sai) => {
    for (const l of q.publicacoes.all(`%${JSON.stringify(sai)}%`)) {
      const posicoes = JSON.parse(l.posicoes);
      if (!Array.isArray(posicoes) || !posicoes.some((p) => p?.ilha === sai)) continue;
      q.passarPublicacao.run(JSON.stringify(posicoes.map((p) => (p?.ilha === sai ? { ...p, ilha: fica } : p))), l.id);
    }
  };
  const lista = () => q.todas.all().map((l) => ({ id: l.id, tipo: l.tipo, numero: l.numero, nome: l.nome }));
  /** A mesma sala já no cadastro (#165): a ILHA 46 quando já existe a AVID 46. */
  const repetida = (i, id = '') => {
    const outra = lista().find((x) => x.id !== id && salaDe(x) === salaDe(i));
    if (!outra) return;
    const igual = rotuloDaIlha(outra) === rotuloDaIlha(i);
    throw erro(igual ? `Já existe a ${rotuloDaIlha(i)}.` : `Já existe a ${rotuloDaIlha(outra)}: ${rotuloDaIlha(i)} é a mesma sala.`, 409);
  };
  const juntadas = () => Object.fromEntries(q.juntadas.all().map((l) => [l.id, l.fica]));
  const agora = () => new Date().toISOString();

  return {
    /** As ilhas, em ordem (pelo tipo e pelo número). */
    todas: () => emOrdem(lista()),
    /** As juntadas: o id que saiu → o que ficou. */
    juntadas,
    /** A sala pelo id (a regra de src/modelo/ilhas.ts), com as juntadas: para comparar as posições. */
    sala: () => salaPeloId(lista(), juntadas()),
    /** O id que vale: o da que ficou, para o id juntado; os outros, como vieram. */
    queFicou: (id) => juntadas()[id] ?? id,
    /** Quantas posições (de todos os dias) estão em cada ilha. */
    usos: () => Object.fromEntries(q.usos.all().map((l) => [l.ilha, Number(l.n)])),
    /**
     * Junta a repetida na que fica (#165), só com a conferência de quem pede (a tela mostra as duas e quantas posições
     * passam): as posições da que sai (as do rascunho e as das publicações) passam para a que fica, e a que sai sai do
     * cadastro. Lança 404 a que não existe
     * e 400 as que não são a mesma sala. Devolve quantas posições passaram.
     */
    juntar(fica, sai, por) {
      const a = q.uma.get(fica);
      const b = q.uma.get(sai);
      if (!a || !b) throw erro('Essa ilha não está no cadastro.', 404);
      if (fica === sai || salaDe(a) !== salaDe(b)) throw erro(`${rotuloDaIlha(a)} e ${rotuloDaIlha(b)} não são a mesma sala.`);
      db.exec('BEGIN');
      try {
        const { changes } = q.passarPosicoes.run(fica, sai);
        passarPublicacoes(fica, sai);
        q.passarJuntadas.run(fica, sai);
        q.juntar.run(sai, fica, por, agora());
        q.remover.run(sai);
        db.exec('COMMIT');
        return { posicoes: Number(changes) };
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
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
      return ilhasDeCostume(q.historico.all(diaAntes(dia, DIAS_DO_COSTUME), dia), valem, salaPeloId(lista(), juntadas()));
    },
  };
}
