/* Montar a pauta, ausências (#128): as ausências por pessoa e por período, e as demandas "para distribuir", no SQLite
   do PROMeiro (e por isso no backup). Nada vai ao Teable.
   - escala_ausencias: quem (o nome como na escala), o tipo, o período (de e até, os dois inclusive) e a observação,
     quem marcou e quando. Nada é apagado de verdade: apagar marca quem e quando, e o histórico fica;
   - escala_para_distribuir: as demandas tiradas de quem saiu de um dia já publicado, por dia, com de quem eram (a
     coluna lateral, #126, leva cada uma para uma posição).
   Marcar a ausência mexe na escala (escala.mjs) só onde ela não está publicada: nos rascunhos, a posição da pessoa
   vira vaga (fica sem editor, com as demandas). No dia publicado, o PROMeiro só oferece tirar a pessoa: tirar deixa a
   posição vaga e manda as demandas para "para distribuir", e o dia fica alterado (o rascunho já não é o publicado).
   O SQL é portável (vale também no Postgres). */
import { randomUUID } from 'node:crypto';
import { ehTipoDeAusencia, temPeriodo, valeNoDia } from '../src/modelo/ausencias.ts';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { diaOuHoje } from '../src/modelo/pauta.ts';

const ID = /^[\w-]{1,40}$/;
/** Os limites: bem acima de uma ausência de verdade, para um pedido errado não encher o banco. */
const LIMITES = { editor: 80, observacao: 200, dias: 366 };

const erro = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });
const minusculo = (email) => String(email ?? '').trim().toLowerCase();
const ehDia = (d) => typeof d === 'string' && diaOuHoje(d, '') === d;
const dias = (de, ate) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;

/**
 * A ausência do pedido, conferida: o nome sem os espaços a mais, o tipo, o período (na folga e no DM, um dia só) e a
 * observação. Lança (status 400) o que não serve.
 */
export function ausenciaDoPedido(corpo) {
  const { editor, tipo, de, ate, observacao } = corpo ?? {};
  const nome = String(typeof editor === 'string' ? editor : '').trim().replace(/\s+/g, ' ');
  if (!nome || nome.length > LIMITES.editor) throw erro('Falta quem está fora.');
  if (!ehTipoDeAusencia(tipo)) throw erro('Tipo de ausência desconhecido (férias, folga, DM ou licença).');
  if (!ehDia(de)) throw erro('Falta o dia da ausência.');
  const fim = temPeriodo(tipo) ? ate : de;
  if (!ehDia(fim) || fim < de) throw erro('O "até" é o último dia fora, a partir do "de".');
  if (dias(de, fim) > LIMITES.dias) throw erro(`Período longo demais (até ${LIMITES.dias} dias).`);
  if (observacao !== undefined && observacao !== null && typeof observacao !== 'string') throw erro('Observação inválida.');
  const obs = String(observacao ?? '').trim().replace(/\s+/g, ' ');
  if (obs.length > LIMITES.observacao) throw erro(`Observação longa demais (até ${LIMITES.observacao} letras).`);
  return { editor: nome, tipo, de, ate: fim, observacao: obs };
}

/** @param db o SQLite do PROMeiro, com as tabelas da escala já criadas (criarEscala) */
export function criarAusencias(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS escala_ausencias (
      id TEXT PRIMARY KEY,
      editor TEXT NOT NULL,
      tipo TEXT NOT NULL,
      de TEXT NOT NULL,
      ate TEXT NOT NULL,
      observacao TEXT NOT NULL,
      por TEXT,
      em TEXT NOT NULL,
      apagada_por TEXT,
      apagada_em TEXT
    );
    CREATE INDEX IF NOT EXISTS escala_ausencias_periodo ON escala_ausencias (ate, de);
    CREATE TABLE IF NOT EXISTS escala_para_distribuir (
      id TEXT PRIMARY KEY,
      dia TEXT NOT NULL,
      ordem INTEGER NOT NULL,
      texto TEXT NOT NULL,
      de_quem TEXT NOT NULL,
      por TEXT,
      em TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS escala_para_distribuir_dia ON escala_para_distribuir (dia, ordem);
  `);
  const q = {
    marcar: db.prepare('INSERT INTO escala_ausencias (id, editor, tipo, de, ate, observacao, por, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    ativa: db.prepare('SELECT id FROM escala_ausencias WHERE id = ? AND apagada_em IS NULL'),
    apagar: db.prepare('UPDATE escala_ausencias SET apagada_por = ?, apagada_em = ? WHERE id = ?'),
    // as que tocam o período (de <= último e até >= primeiro), pela data de início
    noPeriodo: db.prepare('SELECT id, editor, tipo, de, ate, observacao FROM escala_ausencias WHERE apagada_em IS NULL AND de <= ? AND ate >= ? ORDER BY de, editor'),
    desde: db.prepare('SELECT id, editor, tipo, de, ate, observacao FROM escala_ausencias WHERE apagada_em IS NULL AND ate >= ? ORDER BY de, editor'),
    todas: db.prepare('SELECT id, editor, tipo, de, ate, observacao, por, em, apagada_por, apagada_em FROM escala_ausencias ORDER BY em DESC'),
    posicoes: db.prepare('SELECT id, dia, turno, editor FROM escala_posicoes WHERE dia >= ? AND dia <= ? ORDER BY dia, ordem'),
    publicados: db.prepare('SELECT DISTINCT dia FROM escala_publicacoes WHERE dia >= ? AND dia <= ? AND desfeita_em IS NULL'),
    vaga: db.prepare("UPDATE escala_posicoes SET editor = '' WHERE id = ?"),
    gravado: db.prepare('UPDATE escala_dias SET gravado_por = ?, gravado_em = ? WHERE dia = ?'),
    demandas: db.prepare('SELECT id, texto FROM escala_demandas WHERE posicao = ? ORDER BY ordem'),
    tirarDemandas: db.prepare('DELETE FROM escala_demandas WHERE posicao = ?'),
    paraDistribuir: db.prepare('SELECT id, texto, de_quem FROM escala_para_distribuir WHERE dia = ? ORDER BY ordem'),
    ultimaOrdem: db.prepare('SELECT MAX(ordem) AS n FROM escala_para_distribuir WHERE dia = ?'),
    distribuir: db.prepare('INSERT INTO escala_para_distribuir (id, dia, ordem, texto, de_quem, por, em) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    distribuida: db.prepare('DELETE FROM escala_para_distribuir WHERE dia = ? AND id = ?'),
  };
  const daLinha = (l) => ({ id: l.id, editor: l.editor, tipo: l.tipo, de: l.de, ate: l.ate, observacao: l.observacao });
  const transacao = (f) => {
    db.exec('BEGIN');
    try {
      const r = f();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  /** As posições da pessoa nos rascunhos do período (pelo nome sem caixa, acento e pontuação). */
  const posicoesDe = (editor, de, ate) => {
    const alvo = nomeComparavel(editor);
    return q.posicoes.all(de, ate).filter((p) => alvo && nomeComparavel(p.editor) === alvo);
  };
  /** Onde a pessoa está escalada no período: um item por dia, com os turnos e se o dia já foi publicado. */
  const onde = (editor, de, ate) => {
    const publicados = new Set(q.publicados.all(de, ate).map((l) => l.dia));
    const porDia = new Map();
    for (const p of posicoesDe(editor, de, ate)) porDia.set(p.dia, [...new Set([...(porDia.get(p.dia) ?? []), p.turno])]);
    return [...porDia].map(([dia, turnos]) => ({ dia, turnos, publicado: publicados.has(dia) }));
  };

  return {
    onde(editor, de, ate) {
      if (!ehDia(de) || !ehDia(ate) || ate < de || dias(de, ate) > LIMITES.dias) throw erro('Período inválido.');
      return onde(String(editor ?? ''), de, ate);
    },
    /**
     * Marca a ausência (já conferida por `ausenciaDoPedido`) e, nos rascunhos do período que não estão publicados, a
     * posição da pessoa vira vaga. Devolve a ausência e onde a pessoa estava escalada (os dias publicados ficam).
     */
    marcar(a, por) {
      const escalada = onde(a.editor, a.de, a.ate);
      const marcada = { id: randomUUID(), ...a };
      const agora = new Date().toISOString();
      transacao(() => {
        q.marcar.run(marcada.id, a.editor, a.tipo, a.de, a.ate, a.observacao, minusculo(por), agora);
        const rascunhos = new Set(escalada.filter((e) => !e.publicado).map((e) => e.dia));
        for (const p of posicoesDe(a.editor, a.de, a.ate)) if (rascunhos.has(p.dia)) q.vaga.run(p.id);
        for (const dia of rascunhos) q.gravado.run(minusculo(por), agora, dia);
      });
      return { marcada, escalada };
    },
    /** Apaga a ausência (o registro fica, com quem apagou e quando). Lança (400) a que não existe. */
    apagar(id, por) {
      if (typeof id !== 'string' || !ID.test(id) || !q.ativa.get(id)) throw erro('Essa ausência não existe mais.');
      q.apagar.run(minusculo(por), new Date().toISOString(), id);
    },
    /**
     * Tira a pessoa do rascunho do dia: as posições dela ficam vagas e as demandas vão para "para distribuir". Lança
     * (400) quando ela não está escalada no dia.
     */
    tirar(dia, editor, por) {
      const posicoes = posicoesDe(String(editor ?? ''), dia, dia);
      if (!posicoes.length) throw erro('Essa pessoa não está escalada no dia.');
      const agora = new Date().toISOString();
      transacao(() => {
        let ordem = (q.ultimaOrdem.get(dia)?.n ?? -1) + 1;
        for (const p of posicoes) {
          for (const d of q.demandas.all(p.id)) q.distribuir.run(d.id, dia, ordem++, d.texto, p.editor, minusculo(por), agora);
          q.tirarDemandas.run(p.id);
          q.vaga.run(p.id);
        }
        q.gravado.run(minusculo(por), agora, dia);
      });
    },
    /** "Já distribuí": tira a demanda da lista do dia. */
    distribuida(dia, id) {
      if (typeof id !== 'string' || !ID.test(id)) throw erro('Falta a demanda.');
      q.distribuida.run(dia, id);
    },
    /** As ausências que tocam o período (de `primeiro` a `ultimo`), para a Pauta da edição. */
    noPeriodo: (primeiro, ultimo) => q.noPeriodo.all(ultimo, primeiro).map(daLinha),
    /** O histórico de uma pessoa (ou de todas): as marcadas e as apagadas, a mais nova primeiro. */
    historico: (editor) => {
      const alvo = nomeComparavel(editor ?? '');
      return q.todas
        .all()
        .filter((l) => !alvo || nomeComparavel(l.editor) === alvo)
        .map((l) => ({ ...daLinha(l), por: l.por, em: l.em, apagadaPor: l.apagada_por ?? null, apagadaEm: l.apagada_em ?? null }));
    },
    /** O painel da tela de montar: as ausências que ainda valem a partir de `desde`, as do dia, a oferta de tirar quem
        continua num dia publicado e as demandas para distribuir do dia. */
    painel(dia, desde) {
      const ausencias = q.desde.all(desde).map(daLinha);
      const noPublicado = ausencias.flatMap((a) => onde(a.editor, a.de, a.ate).filter((e) => e.publicado).map((e) => ({ ausencia: a.id, editor: a.editor, dia: e.dia, turnos: e.turnos })));
      return {
        dia,
        ausencias,
        fora: ausencias.filter((a) => valeNoDia(a, dia)),
        noPublicado: noPublicado.sort((a, b) => a.dia.localeCompare(b.dia)),
        paraDistribuir: q.paraDistribuir.all(dia).map((l) => ({ id: l.id, texto: l.texto, deQuem: l.de_quem })),
      };
    },
  };
}
