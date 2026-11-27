/* Montar a pauta (#123): o papel de coordenação e o rascunho do dia, no SQLite do PROMeiro (e por isso no backup).
   Nada vai ao Teable: o rascunho só sai do PROMeiro ao publicar (que vem depois).
   - coordenacao: quem é da coordenação, pelo e-mail, marcado por um administrador nos Cadastros;
   - escala_dias: o dia (AAAA-MM-DD), com o estado (vazio ou rascunho) e quem gravou por último;
   - escala_posicoes: as posições do dia (o turno, a ordem, o editor e o horário, no padrão quando o PROMeiro entende);
   - escala_demandas: as demandas de cada posição, na ordem (a claquete no padrão; a tarefa como está).
   O SQL é portável (vale também no Postgres): sem INSERT OR REPLACE, sem json_extract. Gravar troca o dia inteiro,
   numa transação.
   Conferir e publicar (#127):
   - escala_conferidas: as pendências da conferência que a coordenação disse que estão certas, pela chave, por dia;
   - escala_publicacoes: o histórico das publicações de cada dia, com as posições como foram publicadas (JSON), quem
     publicou, quantas pendências ficaram e, se foi desfeita, quando. A publicação que vale é a última não desfeita.
   O estado do dia sai daí: sem publicação, vazio ou rascunho; com ela, publicado (o rascunho é o que foi publicado) ou
   alterado (mudou depois). Publicar ainda não grava no Teable: isso é a virada (#134). */
import { demandaNoPadrao, estadoDoDia, ehTurno, horarioNoPadrao } from '../src/modelo/escala.ts';
import { randomUUID } from 'node:crypto';

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
 */
export function posicoesDoPedido(posicoes, dia) {
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
    if (!ehTurno(p.turno)) throw erro('Turno desconhecido.');
    const demandas = p.demandas ?? [];
    if (!Array.isArray(demandas) || demandas.length > LIMITES.demandas) throw erro(`Demandas inválidas (até ${LIMITES.demandas} por posição).`);
    return {
      id: unico(p.id),
      turno: p.turno,
      editor: texto(p.editor, LIMITES.editor, 'Editor').replace(/\s+/g, ' '),
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
      horario TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS escala_posicoes_dia ON escala_posicoes (dia, ordem);
    CREATE TABLE IF NOT EXISTS escala_demandas (
      id TEXT PRIMARY KEY,
      posicao TEXT NOT NULL REFERENCES escala_posicoes (id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL,
      texto TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS escala_demandas_posicao ON escala_demandas (posicao, ordem);
    CREATE TABLE IF NOT EXISTS escala_conferidas (
      dia TEXT NOT NULL,
      chave TEXT NOT NULL,
      por TEXT,
      em TEXT NOT NULL,
      PRIMARY KEY (dia, chave)
    );
    CREATE TABLE IF NOT EXISTS escala_publicacoes (
      id TEXT PRIMARY KEY,
      dia TEXT NOT NULL,
      em TEXT NOT NULL,
      por TEXT,
      pendencias INTEGER NOT NULL,
      posicoes TEXT NOT NULL,
      desfeita_em TEXT
    );
    CREATE INDEX IF NOT EXISTS escala_publicacoes_dia ON escala_publicacoes (dia, em);
  `);
  const q = {
    coordenacao: db.prepare('SELECT email FROM coordenacao ORDER BY email'),
    ehCoordenacao: db.prepare('SELECT 1 AS sim FROM coordenacao WHERE email = ?'),
    marcar: db.prepare('INSERT INTO coordenacao (email, por, em) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING'),
    tirar: db.prepare('DELETE FROM coordenacao WHERE email = ?'),
    dia: db.prepare('SELECT estado, gravado_por, gravado_em FROM escala_dias WHERE dia = ?'),
    estados: db.prepare('SELECT dia, estado FROM escala_dias WHERE dia >= ? AND dia <= ?'),
    posicoes: db.prepare('SELECT id, turno, editor, horario FROM escala_posicoes WHERE dia = ? ORDER BY ordem'),
    demandas: db.prepare('SELECT d.id, d.posicao, d.texto FROM escala_demandas d JOIN escala_posicoes p ON p.id = d.posicao WHERE p.dia = ? ORDER BY d.ordem'),
    gravarDia: db.prepare('INSERT INTO escala_dias (dia, estado, gravado_por, gravado_em) VALUES (?, ?, ?, ?) ON CONFLICT (dia) DO UPDATE SET estado = excluded.estado, gravado_por = excluded.gravado_por, gravado_em = excluded.gravado_em'),
    apagarPosicoes: db.prepare('DELETE FROM escala_posicoes WHERE dia = ?'),
    // uma posição de outro dia com o mesmo id (um id repetido do navegador) não é sobrescrita
    posicaoDeOutroDia: db.prepare('SELECT dia FROM escala_posicoes WHERE id = ? AND dia <> ?'),
    demandaDeOutroDia: db.prepare('SELECT p.dia FROM escala_demandas d JOIN escala_posicoes p ON p.id = d.posicao WHERE d.id = ? AND p.dia <> ?'),
    posicao: db.prepare('INSERT INTO escala_posicoes (id, dia, ordem, turno, editor, horario) VALUES (?, ?, ?, ?, ?, ?)'),
    demanda: db.prepare('INSERT INTO escala_demandas (id, posicao, ordem, texto) VALUES (?, ?, ?, ?)'),
    conferidas: db.prepare('SELECT chave FROM escala_conferidas WHERE dia = ? ORDER BY chave'),
    conferir: db.prepare('INSERT INTO escala_conferidas (dia, chave, por, em) VALUES (?, ?, ?, ?) ON CONFLICT (dia, chave) DO NOTHING'),
    reabrir: db.prepare('DELETE FROM escala_conferidas WHERE dia = ? AND chave = ?'),
    historico: db.prepare('SELECT id, em, por, pendencias, desfeita_em FROM escala_publicacoes WHERE dia = ? ORDER BY em DESC'),
    publicada: db.prepare('SELECT id, em, por, pendencias, posicoes FROM escala_publicacoes WHERE dia = ? AND desfeita_em IS NULL ORDER BY em DESC LIMIT 1'),
    publicadasNoPeriodo: db.prepare('SELECT dia, posicoes, em FROM escala_publicacoes WHERE dia >= ? AND dia <= ? AND desfeita_em IS NULL ORDER BY dia, em'),
    publicar: db.prepare('INSERT INTO escala_publicacoes (id, dia, em, por, pendencias, posicoes) VALUES (?, ?, ?, ?, ?, ?)'),
    desfazer: db.prepare('UPDATE escala_publicacoes SET desfeita_em = ? WHERE id = ?'),
  };
  /** As posições do dia, como o rascunho as guarda (as mesmas que a publicação guarda). */
  const posicoesDoDia = (dia) => {
    const demandas = new Map();
    for (const l of q.demandas.all(dia)) demandas.set(l.posicao, [...(demandas.get(l.posicao) ?? []), { id: l.id, texto: l.texto }]);
    return q.posicoes.all(dia).map((p) => ({ id: p.id, turno: p.turno, editor: p.editor, horario: p.horario, demandas: demandas.get(p.id) ?? [] }));
  };
  /** O estado do dia: sem publicação, vazio ou rascunho; com ela, publicado ou alterado (o rascunho mudou depois). */
  const estadoDe = (posicoes, publicada) => (!publicada ? estadoDoDia(posicoes) : JSON.stringify(posicoes) === publicada.posicoes ? 'publicado' : 'alterado');
  const daPublicacao = (l) => (l ? { em: l.em, por: l.por, pendencias: l.pendencias } : null);

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

    /**
     * O rascunho do dia: o estado, as posições com as demandas, e quando e por quem foi gravado; a publicação que vale
     * (null: nenhuma), o histórico das publicações (a mais nova primeiro) e as pendências dispensadas (#127).
     */
    lerDia(dia) {
      const d = q.dia.get(dia);
      const posicoes = posicoesDoDia(dia);
      const publicada = q.publicada.get(dia);
      return {
        estado: estadoDe(posicoes, publicada),
        posicoes,
        gravadoEm: d?.gravado_em ?? null,
        gravadoPor: d?.gravado_por ?? null,
        publicacao: daPublicacao(publicada),
        historico: q.historico.all(dia).map((l) => ({ ...daPublicacao(l), desfeitaEm: l.desfeita_em ?? null })),
        dispensadas: q.conferidas.all(dia).map((l) => l.chave),
      };
    },
    /** O estado de cada um dos dias (em ordem; os sem nada gravado são vazios). */
    estados(dias) {
      const gravados = new Set(q.estados.all(dias[0], dias.at(-1)).map((l) => l.dia));
      return dias.map((dia) => ({ dia, estado: gravados.has(dia) ? estadoDe(posicoesDoDia(dia), q.publicada.get(dia)) : 'vazio' }));
    },
    /** Marca (certo) ou reabre uma pendência da conferência do dia, pela chave. Lança (400) a chave inválida. */
    conferida(dia, chave, certo, por) {
      if (typeof chave !== 'string' || !chave.trim() || chave.length > LIMITES.texto) throw erro('Falta a pendência.');
      if (certo) q.conferir.run(dia, chave, minusculo(por), new Date().toISOString());
      else q.reabrir.run(dia, chave);
    },
    /**
     * Publica o rascunho do dia como está gravado, com quantas pendências ficaram. Lança (400) o dia sem nada montado.
     * Não grava no Teable (a virada, #134).
     */
    publicar(dia, pendencias, por) {
      const posicoes = posicoesDoDia(dia);
      if (!posicoes.length) throw erro('Nada montado para publicar.');
      q.publicar.run(randomUUID(), dia, new Date().toISOString(), minusculo(por), pendencias, JSON.stringify(posicoes));
    },
    /** Desfaz a última publicação do dia que vale: volta a valer a anterior (ou nenhuma). Lança (400) sem publicação. */
    desfazer(dia) {
      const publicada = q.publicada.get(dia);
      if (!publicada) throw erro('Não há publicação para desfazer.');
      q.desfazer.run(new Date().toISOString(), publicada.id);
    },
    /** Os dias publicados do período (de `primeiro` a `ultimo`), com as posições como foram publicadas. */
    publicadas(primeiro, ultimo) {
      const porDia = new Map();
      // na ordem de publicação: a última de cada dia fica
      for (const l of q.publicadasNoPeriodo.all(primeiro, ultimo)) porDia.set(l.dia, JSON.parse(l.posicoes));
      return [...porDia].map(([dia, posicoes]) => ({ dia, posicoes }));
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
          q.posicao.run(p.id, dia, i, p.turno, p.editor, p.horario);
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
