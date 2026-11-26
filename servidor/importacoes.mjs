/*
 * O histórico das importações do acervo por CSV (#61), no SQLite do PROMeiro: atração, quem, quando, o arquivo e o
 * registro do que a gravação fez (os lotes com o estado de cada um, os ids criados, o tipo e o nome antigos das linhas
 * alteradas e a data de modificação de cada linha logo depois). É dele que saem o desfazer (por 7 dias) e o retomar
 * da gravação interrompida; quem grava, desfaz e retoma no Teable é o acervo (servidor/acervo.mjs).
 */

/** Por quanto tempo a importação pode ser desfeita (ou retomada). */
export const PRAZO_DO_DESFAZER_MS = 7 * 86_400_000;

export function criarTabelaDasImportacoes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS importacoes (
    id TEXT PRIMARY KEY, atracao TEXT NOT NULL, por_email TEXT NOT NULL, por_nome TEXT NOT NULL, em TEXT NOT NULL,
    arquivo TEXT NOT NULL, registro TEXT NOT NULL, desfeita_em TEXT, desfeita_por TEXT, nao_voltaram TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS importacoes_atracao ON importacoes (atracao, em)');
}

/**
 * O estado da importação: gravada (todos os lotes), interrompida (algum lote faltou ou falhou) ou desfeita.
 * @param registro o que acervo.gravarImportacao anotou
 */
const estadoDe = (linha, registro) => (linha.desfeita_em ? 'desfeita' : registro.lotes.every((l) => l.estado === 'gravado') ? 'gravada' : 'interrompida');

export function criarImportacoes(db) {
  const q = {
    anotar: db.prepare(
      `INSERT INTO importacoes (id, atracao, por_email, por_nome, em, arquivo, registro) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET registro = excluded.registro`,
    ),
    uma: db.prepare('SELECT * FROM importacoes WHERE id = ?'),
    daAtracao: db.prepare('SELECT * FROM importacoes WHERE atracao = ? ORDER BY em DESC LIMIT 200'),
    desfeita: db.prepare('UPDATE importacoes SET desfeita_em = ?, desfeita_por = ?, nao_voltaram = ? WHERE id = ?'),
  };
  const ler = (linha) => linha && { ...linha, registro: JSON.parse(linha.registro), naoVoltaram: JSON.parse(linha.nao_voltaram ?? '[]') };

  /** A importação como o histórico mostra; podeDesfazer só para administradores, dentro do prazo e não desfeita. */
  function publica(linha, { admin, agora = Date.now() }) {
    const { registro } = linha;
    const estado = estadoDe(linha, registro);
    const ate = new Date(Date.parse(linha.em) + PRAZO_DO_DESFAZER_MS).toISOString();
    const noPrazo = agora < Date.parse(ate);
    const criadas = registro.lotes.filter((l) => l.acao === 'criar').flatMap((l) => l.registros);
    return {
      id: linha.id,
      em: linha.em,
      arquivo: linha.arquivo,
      por: linha.por_nome,
      estado,
      antes: registro.antes,
      ...registro.resumo,
      renomeadas: registro.resumo.renomeadas.length,
      // na interrompida, quantas das novas chegaram a ser criadas
      criadas: criadas.filter((r) => r.id).length,
      ate,
      podeDesfazer: admin && noPrazo && estado !== 'desfeita',
      podeRetomar: admin && noPrazo && estado === 'interrompida',
      ...(linha.desfeita_em ? { desfeita: { em: linha.desfeita_em, por: linha.desfeita_por, naoVoltaram: linha.naoVoltaram } } : {}),
    };
  }

  return {
    /** Guarda o registro a cada passo da gravação (a primeira vez cria a linha com quem, quando e o arquivo). */
    anotar(id, { atracao, por, arquivo, em }, registro) {
      q.anotar.run(id, atracao, por.email, por.nome, em, arquivo, JSON.stringify(registro));
    },
    uma: (id) => ler(q.uma.get(id)),
    lista: (atracao, opcoes) => q.daAtracao.all(atracao).map((l) => publica(ler(l), opcoes)),
    noPrazo: (linha, agora = Date.now()) => agora < Date.parse(linha.em) + PRAZO_DO_DESFAZER_MS,
    estado: (linha) => estadoDe(linha, linha.registro),
    desfeita(id, por, naoVoltaram, em = new Date().toISOString()) {
      q.desfeita.run(em, por, JSON.stringify(naoVoltaram), id);
    },
  };
}
