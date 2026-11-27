/* Montar a pauta (#123): o papel de coordenação e o rascunho do dia, no SQLite do PROMeiro (e por isso no backup).
   Nada vai ao Teable: o rascunho só sai do PROMeiro ao publicar (que vem depois).
   - coordenacao: quem é da coordenação, pelo e-mail, marcado por um administrador nos Cadastros;
   - escala_dias: o dia (AAAA-MM-DD), com o estado (vazio ou rascunho) e quem gravou por último;
   - escala_posicoes: as posições do dia (o turno, a ordem, o editor, a ilha (#124) e o horário, no padrão quando o
     PROMeiro entende);
   - escala_demandas: as demandas de cada posição, na ordem (a claquete no padrão; a tarefa como está).
   O SQL é portável (vale também no Postgres): sem INSERT OR REPLACE, sem json_extract. Gravar troca o dia inteiro,
   numa transação. */
import { demandaNoPadrao, estadoDoDia, ehTurno, horarioNoPadrao } from '../src/modelo/escala.ts';

const ID = /^[\w-]{1,40}$/;
const EMAIL = /^[^\s@,;"]+@[^\s@,;"]+$/;
/** Os limites do dia: bem acima de um dia de verdade, para um pedido errado não encher o banco. */
const LIMITES = { posicoes: 80, demandas: 60, editor: 80, horario: 40, texto: 200 };

const erro = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });
const minusculo = (email) => String(email ?? '').trim().toLowerCase();

/**
 * As posições do pedido, conferidas e no padrão: o horário e a claquete como o PROMeiro grava, a demanda vazia fora.
 * Lança (status 400) o que não é uma lista de posições.
 * @param dia o dia (a data e as versões das claquetes são lidas perto dele)
 * @param o.turnos os ids de turno que valem (sem ele, os de fábrica); o.ilhaVale(ilha, posicao) diz se a ilha vale
 *   naquela posição (sem ele, qualquer uma); a ilha vazia vale sempre
 */
export function posicoesDoPedido(posicoes, dia, { turnos = null, ilhaVale = null } = {}) {
  if (!Array.isArray(posicoes)) throw erro('Faltam as posições do dia.');
  if (posicoes.length > LIMITES.posicoes) throw erro(`Posições demais num dia (até ${LIMITES.posicoes}).`);
  const ids = new Set();
  const unico = (id) => {
    if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) throw erro('Identificador inválido.');
    ids.add(id);
    return id;
  };
  const texto = (v, limite, oQue) => {
    if (v !== undefined && v !== null && typeof v !== 'string') throw erro(`${oQue} inválido.`);
    const t = String(v ?? '').trim();
    if (t.length > limite) throw erro(`${oQue} longo demais (até ${limite} letras).`);
    return t;
  };
  return posicoes.map((p) => {
    if (!p || typeof p !== 'object') throw erro('Posição inválida.');
    if (turnos ? !turnos.has(p.turno) : !ehTurno(p.turno)) throw erro('Turno desconhecido.');
    const ilha = p.ilha ?? '';
    if (typeof ilha !== 'string' || (ilha && (!ID.test(ilha) || (ilhaVale && !ilhaVale(ilha, p.id))))) throw erro('Ilha desconhecida.');
    const demandas = p.demandas ?? [];
    if (!Array.isArray(demandas) || demandas.length > LIMITES.demandas) throw erro(`Demandas inválidas (até ${LIMITES.demandas} por posição).`);
    return {
      id: unico(p.id),
      turno: p.turno,
      editor: texto(p.editor, LIMITES.editor, 'Editor').replace(/\s+/g, ' '),
      ilha,
      horario: horarioNoPadrao(texto(p.horario, LIMITES.horario, 'Horário')),
      demandas: demandas
        .map((d) => {
          if (!d || typeof d !== 'object') throw erro('Demanda inválida.');
          return { id: unico(d.id), texto: demandaNoPadrao(texto(d.texto, LIMITES.texto, 'Demanda'), dia) };
        })
        .filter((d) => d.texto),
    };
  });
}

/** @param db o SQLite do PROMeiro (as tabelas são criadas aqui) */
export function criarEscala(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coordenacao (
      email TEXT PRIMARY KEY,
      por TEXT,
      em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS escala_dias (
      dia TEXT PRIMARY KEY,
      estado TEXT NOT NULL,
      gravado_por TEXT,
      gravado_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS escala_posicoes (
      id TEXT PRIMARY KEY,
      dia TEXT NOT NULL REFERENCES escala_dias (dia) ON DELETE CASCADE,
      ordem INTEGER NOT NULL,
      turno TEXT NOT NULL,
      editor TEXT NOT NULL,
      horario TEXT NOT NULL,
      ilha TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS escala_posicoes_dia ON escala_posicoes (dia, ordem);
    CREATE TABLE IF NOT EXISTS escala_demandas (
      id TEXT PRIMARY KEY,
      posicao TEXT NOT NULL REFERENCES escala_posicoes (id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL,
      texto TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS escala_demandas_posicao ON escala_demandas (posicao, ordem);
  `);
  // a ilha da posição (#124), nos bancos de antes dela
  if (!db.prepare('PRAGMA table_info(escala_posicoes)').all().some((c) => c.name === 'ilha')) db.exec("ALTER TABLE escala_posicoes ADD COLUMN ilha TEXT NOT NULL DEFAULT ''");
  const q = {
    coordenacao: db.prepare('SELECT email FROM coordenacao ORDER BY email'),
    ehCoordenacao: db.prepare('SELECT 1 AS sim FROM coordenacao WHERE email = ?'),
    marcar: db.prepare('INSERT INTO coordenacao (email, por, em) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING'),
    tirar: db.prepare('DELETE FROM coordenacao WHERE email = ?'),
    dia: db.prepare('SELECT estado, gravado_por, gravado_em FROM escala_dias WHERE dia = ?'),
    estados: db.prepare('SELECT dia, estado FROM escala_dias WHERE dia >= ? AND dia <= ?'),
    posicoes: db.prepare('SELECT id, turno, editor, ilha, horario FROM escala_posicoes WHERE dia = ? ORDER BY ordem'),
    demandas: db.prepare('SELECT d.id, d.posicao, d.texto FROM escala_demandas d JOIN escala_posicoes p ON p.id = d.posicao WHERE p.dia = ? ORDER BY d.ordem'),
    gravarDia: db.prepare('INSERT INTO escala_dias (dia, estado, gravado_por, gravado_em) VALUES (?, ?, ?, ?) ON CONFLICT (dia) DO UPDATE SET estado = excluded.estado, gravado_por = excluded.gravado_por, gravado_em = excluded.gravado_em'),
    apagarPosicoes: db.prepare('DELETE FROM escala_posicoes WHERE dia = ?'),
    // uma posição de outro dia com o mesmo id (um id repetido do navegador) não é sobrescrita
    posicaoDeOutroDia: db.prepare('SELECT dia FROM escala_posicoes WHERE id = ? AND dia <> ?'),
    demandaDeOutroDia: db.prepare('SELECT p.dia FROM escala_demandas d JOIN escala_posicoes p ON p.id = d.posicao WHERE d.id = ? AND p.dia <> ?'),
    posicao: db.prepare('INSERT INTO escala_posicoes (id, dia, ordem, turno, editor, ilha, horario) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    demanda: db.prepare('INSERT INTO escala_demandas (id, posicao, ordem, texto) VALUES (?, ?, ?, ?)'),
  };

  return {
    /** Os e-mails da coordenação, em ordem. */
    coordenacao: () => q.coordenacao.all().map((l) => l.email),
    ehCoordenacao: (email) => !!q.ehCoordenacao.get(minusculo(email)),
    /** Marca (ou tira) a pessoa da coordenação. Lança (400) o que não é e-mail. */
    marcar(email, por) {
      const e = minusculo(email);
      if (!EMAIL.test(e)) throw erro('Falta o e-mail da pessoa.');
      q.marcar.run(e, minusculo(por), new Date().toISOString());
      return e;
    },
    tirar(email) {
      const e = minusculo(email);
      if (!EMAIL.test(e)) throw erro('Falta o e-mail da pessoa.');
      q.tirar.run(e);
      return e;
    },

    /** O rascunho do dia: o estado, as posições com as demandas, e quando e por quem foi gravado. */
    lerDia(dia) {
      const d = q.dia.get(dia);
      const demandas = new Map();
      for (const l of q.demandas.all(dia)) demandas.set(l.posicao, [...(demandas.get(l.posicao) ?? []), { id: l.id, texto: l.texto }]);
      const posicoes = q.posicoes.all(dia).map((p) => ({ id: p.id, turno: p.turno, editor: p.editor, ilha: p.ilha, horario: p.horario, demandas: demandas.get(p.id) ?? [] }));
      return { estado: estadoDoDia(posicoes), posicoes, gravadoEm: d?.gravado_em ?? null, gravadoPor: d?.gravado_por ?? null };
    },
    /** O estado de cada um dos dias (em ordem; os sem nada gravado são vazios). */
    estados(dias) {
      const gravados = new Map(q.estados.all(dias[0], dias.at(-1)).map((l) => [l.dia, l.estado]));
      return dias.map((dia) => ({ dia, estado: gravados.get(dia) ?? 'vazio' }));
    },
    /**
     * Troca o rascunho do dia pelas posições do pedido (já conferidas por `posicoesDoPedido`), numa transação. Lança
     * (400) um id que já é de outro dia.
     */
    gravarDia(dia, posicoes, por) {
      for (const p of posicoes) {
        if (q.posicaoDeOutroDia.get(p.id, dia)) throw erro('Identificador inválido.');
        for (const d of p.demandas) if (q.demandaDeOutroDia.get(d.id, dia)) throw erro('Identificador inválido.');
      }
      db.exec('BEGIN');
      try {
        q.gravarDia.run(dia, estadoDoDia(posicoes), minusculo(por), new Date().toISOString());
        q.apagarPosicoes.run(dia);
        posicoes.forEach((p, i) => {
          q.posicao.run(p.id, dia, i, p.turno, p.editor, p.ilha, p.horario);
          p.demandas.forEach((d, j) => q.demanda.run(d.id, p.id, j, d.texto));
        });
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
