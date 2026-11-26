/*
 * As regras desta atração (#63), no SQLite do PROMeiro: as decisões da conferência da importação do acervo que ficam
 * lembradas para as próximas importações da mesma atração ("lembrar as decisões nas próximas desta atração"). Cada
 * regra é uma linha (para a lista "Regras desta atração" na ficha mostrar e apagar uma a uma), no formato das regras
 * das cargas à mão: trocas, ignorar, versões, cópias, semSigla e tipos. Quem as tira das decisões é
 * regrasDasDecisoes (servidor/importacao-do-acervo.mjs), e quem as aplica é classificar.
 */
import { comoRegras } from './importacao-do-acervo.mjs';

export function criarTabelaDasRegras(db) {
  // a mesma expressão do mesmo tipo é a mesma regra: decidir de novo troca o que ela faz
  db.exec(`CREATE TABLE IF NOT EXISTS regras_do_acervo (
    id INTEGER PRIMARY KEY AUTOINCREMENT, atracao TEXT NOT NULL, tipo TEXT NOT NULL, re TEXT NOT NULL,
    regra TEXT NOT NULL, por_nome TEXT NOT NULL, em TEXT NOT NULL, UNIQUE (atracao, tipo, re)
  )`);
}

export function criarRegrasDaAtracao(db) {
  const q = {
    guardar: db.prepare(
      `INSERT INTO regras_do_acervo (atracao, tipo, re, regra, por_nome, em) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (atracao, tipo, re) DO UPDATE SET regra = excluded.regra, por_nome = excluded.por_nome, em = excluded.em`,
    ),
    daAtracao: db.prepare('SELECT * FROM regras_do_acervo WHERE atracao = ? ORDER BY id'),
    uma: db.prepare('SELECT * FROM regras_do_acervo WHERE id = ?'),
    apagar: db.prepare('DELETE FROM regras_do_acervo WHERE id = ?'),
  };
  /** A regra como a lista mostra: o que ela faz (tipo, expressão, motivo…), quem lembrou e quando. */
  const ler = (linha) => ({ ...JSON.parse(linha.regra), id: linha.id, tipo: linha.tipo, re: linha.re, quem: linha.por_nome, em: linha.em });
  return {
    /** Guarda as regras tiradas das decisões (a mesma regra, de novo, fica com o que foi decidido agora). */
    lembrar(atracao, regras, por, em = new Date().toISOString()) {
      const unicas = new Map(regras.map((r) => [`${r.tipo} ${r.re}`, r]));
      for (const { tipo, re, ...resto } of unicas.values()) q.guardar.run(atracao, tipo, re, JSON.stringify(resto), por, em);
      return unicas.size;
    },
    /** As regras da atração, uma a uma, na ordem em que foram lembradas. */
    lista: (atracao) => q.daAtracao.all(atracao).map(ler),
    /** As regras da atração no formato das cargas à mão, o que a prévia aplica. */
    daAtracao: (atracao) => comoRegras(q.daAtracao.all(atracao).map(ler)),
    /** Apaga a regra lembrada errada: devolve a que foi apagada (com a atração), ou null quando ela não existe. */
    apagar(id) {
      const linha = q.uma.get(id);
      if (!linha) return null;
      q.apagar.run(id);
      return { ...ler(linha), atracao: linha.atracao };
    },
  };
}
