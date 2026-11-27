/* A configuração viva do servidor: as variáveis do Portainer, com o que foi salvo no PROMeiro (SQLite) por cima.
   Só se guardam aqui as variáveis que a tela de Configuração vai mostrar (onde as coisas estão no Trello e no Teable);
   segredos e infraestrutura (tokens, endereços, portas, o ACESSO e a chave-mestra CADASTRO_ADMINS) continuam só no
   Portainer e são recusados. */

/** As variáveis que podem ser salvas no PROMeiro (as da tela, pelo levantamento da Configuração). */
export const SALVAVEIS = new Set([
  // Teable: a base (TEABLE_PG_ESQUEMA: o id da base, que é o esquema do Postgres) e as tabelas pela API (opcionais: o
  // PROMeiro acha cada uma pelo nome na base)
  'TEABLE_PG_ESQUEMA', 'TEABLE_CADASTRO', 'TEABLE_ATRACOES', 'TEABLE_REDATORES', 'TEABLE_KEY_REDATORES', 'TEABLE_EDITORES',
  'TEABLE_KEY_EDITORES', 'TEABLE_PAUTA', 'TEABLE_ARTE_PRODUCAO', 'TEABLE_ACERVO',
  // (os nomes das tabelas no Postgres não são guardados: vêm do próprio Teable, #76, servidor/tabelas-do-teable.mjs)
  // Trello: o quadro, as praças (entrada, saída, opção), os campos e as opções do card
  'TRELLO_QUADRO', 'TRELLO_LISTA', 'TRELLO_LISTA_SP', 'TRELLO_LISTA_RJ', 'TRELLO_LISTA_G5', 'TRELLO_LISTA_INTER', 'TRELLO_LISTA_VT',
  'TRELLO_LISTA_ENTREGUES', 'TRELLO_SAIDA_SP', 'TRELLO_SAIDA_RJ', 'TRELLO_SAIDA_G5', 'TRELLO_SAIDA_INTER', 'TRELLO_CAMPO_PRACA',
  'TRELLO_PRACAS', 'TRELLO_CAMPO_REDATOR', 'TRELLO_CAMPO_EDITOR', 'TRELLO_CAMPO_PRIORIDADE', 'TRELLO_PRIORIDADE_ALTA',
  'TRELLO_PRIORIDADE_MEDIA', 'TRELLO_CAMPO_COMPLEXIDADE', 'TRELLO_COMPLEXIDADE_OPCOES', 'TRELLO_CAMPO_PROJETO', 'TRELLO_CAMPO_OUTPUT',
  'TRELLO_CAMPO_BOT', 'TRELLO_CAMPO_ENTRADA', 'TRELLO_CAMPOS_FILME',
  // as praças como dado (#71): a coleção inteira, em JSON (sigla, nome, regra, também lida como, entrada, saída, opção,
  // padrão), na ordem em que as regras são conferidas; sem ela, valem as de fábrica com as variáveis acima
  'PRACAS',
  // o que a tela ligou à mão (#72), em JSON: as chaves ("campo", "G5.entrada"); o resto foi achado pelo nome
  'LIGADO_A_MAO',
  // os administradores salvos na tela (#77), em JSON (os e-mails); a chave-mestra CADASTRO_ADMINS fica no Portainer
  'ADMINISTRADORES',
  // os turnos da montagem da pauta (#124), em JSON (id, nome, horário padrão), na ordem da grade; sem ela, os de fábrica
  'TURNOS',
  // os horários do cartão da pauta no Teams (#135), em JSON (hora, dias da semana, a pauta de hoje ou de amanhã); sem
  // ela, os do n8n. O endereço do Power Automate é segredo: fica no Portainer (TEAMS_PAUTA_URL)
  'TEAMS_HORARIOS',
  // o modo só olhar da aba Duplicadas (#67): sem valor, ligado; '0' libera o apagar (a própria aba liga e desliga)
  'DUPLICADAS_SO_OLHAR',
  // Filmes
  'TEABLE_FILMES', 'TEABLE_FILMES_POSTER', 'TEABLE_EXIBICOES', 'TRELLO_LISTA_FILMES', 'TRELLO_FILMES_ETIQUETAS',
  'TRELLO_FILMES_ETIQUETAS_SESSAO', 'TRELLO_FILMES_PRACA', 'FILMES_INTERVALO_MS', 'FILMES_TEMPO_MS',
]);

/**
 * @param db o SQLite do PROMeiro (a tabela `configuracao` é criada aqui)
 * @param portainer as variáveis de ambiente (não são alteradas)
 * @returns
 *   valores() — o objeto de configuração de agora (congelado): o Portainer com o salvo por cima;
 *   salvos() — os nomes que têm valor salvo no PROMeiro (o resto vem do Portainer);
 *   salvar(mudancas, { por, descrever, voltouDe }) — grava { NOME: 'valor' } (null tira o salvo e volta o Portainer) e
 *   devolve os valores novos; um nome que não é da tela (segredo, infraestrutura, desconhecido) recusa a mudança
 *   inteira. Toda gravação que muda alguma coisa entra no histórico (#78), junto, na mesma transação: quem, quando, o
 *   antigo → o novo de cada variável (o valor salvo; null quando valia o Portainer) e as linhas legíveis que
 *   `descrever(antes, depois, nomes)` dá com os valores de antes e de depois (sem ele, o nome e o valor crus);
 *   `voltouDe` marca a gravação que voltou a uma linha do histórico;
 *   simular(mudancas) — os valores que valeriam com a mudança, sem gravar nada;
 *   historico({ limite }) — as gravações, da mais nova para a mais velha: { id, em, por, mudancas, linhas, voltouDe };
 *   entradaDoHistorico(id) — uma delas (ou null).
 */
export function criarConfiguracao(db, portainer = process.env) {
  db.exec('CREATE TABLE IF NOT EXISTS configuracao (nome TEXT PRIMARY KEY, valor TEXT NOT NULL, por TEXT, em TEXT NOT NULL)');
  db.exec(`CREATE TABLE IF NOT EXISTS configuracao_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, em TEXT NOT NULL, por TEXT NOT NULL, mudancas TEXT NOT NULL, linhas TEXT NOT NULL, voltou_de INTEGER
  )`);
  const q = {
    todos: db.prepare('SELECT nome, valor FROM configuracao'),
    gravar: db.prepare('INSERT OR REPLACE INTO configuracao (nome, valor, por, em) VALUES (?, ?, ?, ?)'),
    tirar: db.prepare('DELETE FROM configuracao WHERE nome = ?'),
    anotar: db.prepare('INSERT INTO configuracao_historico (em, por, mudancas, linhas, voltou_de) VALUES (?, ?, ?, ?, ?)'),
    historico: db.prepare('SELECT * FROM configuracao_historico ORDER BY id DESC LIMIT ?'),
    entrada: db.prepare('SELECT * FROM configuracao_historico WHERE id = ?'),
  };
  /** O que está salvo no PROMeiro, só os nomes da tela (um nome que deixou de ser, guardado por uma versão antiga,
      não passa por cima do Portainer). */
  const guardados = () => Object.fromEntries(q.todos.all().filter((l) => SALVAVEIS.has(l.nome)).map((l) => [l.nome, l.valor]));
  const montar = (salvos = guardados()) => Object.freeze({ ...portainer, ...salvos });
  let atuais = montar();
  const valorSalvo = (v) => (v === null || v === undefined ? null : String(v));
  /** O salvo com a mudança por cima (null tira). */
  function comAMudanca(mudancas) {
    const salvos = guardados();
    for (const [nome, valor] of Object.entries(mudancas)) {
      if (valorSalvo(valor) === null) delete salvos[nome];
      else salvos[nome] = String(valor);
    }
    return salvos;
  }
  const comoEntrada = (l) => l && { id: l.id, em: l.em, por: l.por, mudancas: JSON.parse(l.mudancas), linhas: JSON.parse(l.linhas), voltouDe: l.voltou_de ?? null };

  /** Tudo ou nada: a mudança de várias variáveis entra junta, com a linha do histórico. */
  function gravarTudo(mudancas, { por, descrever, voltouDe }) {
    const antes = guardados();
    const mudadas = Object.entries(mudancas)
      .map(([nome, valor]) => ({ nome, antes: antes[nome] ?? null, depois: valorSalvo(valor) }))
      .filter((m) => m.antes !== m.depois);
    if (!mudadas.length) return;
    const depois = montar(comAMudanca(mudancas));
    const nomes = mudadas.map((m) => m.nome);
    let linhas = null;
    try {
      linhas = descrever?.(atuais, depois, nomes) ?? null;
    } catch (e) {
      console.warn(`[configuração] não consegui descrever a mudança para o histórico: ${e instanceof Error ? e.message : e}`);
    }
    if (!Array.isArray(linhas)) linhas = mudadas.map((m) => ({ oque: m.nome, antes: m.antes ?? '—', depois: m.depois ?? '—' }));
    const em = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const [nome, valor] of Object.entries(mudancas)) {
        if (valorSalvo(valor) === null) q.tirar.run(nome);
        else q.gravar.run(nome, String(valor), por, em);
      }
      q.anotar.run(em, por, JSON.stringify(mudadas), JSON.stringify(linhas), voltouDe ?? null);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return {
    valores: () => atuais,
    /** Os nomes que têm valor salvo no PROMeiro (o resto vem do Portainer). */
    salvos: () => new Set(q.todos.all().filter((l) => SALVAVEIS.has(l.nome)).map((l) => l.nome)),
    salvar(mudancas, { por = '', descrever = null, voltouDe = null } = {}) {
      const recusados = Object.keys(mudancas).filter((n) => !SALVAVEIS.has(n));
      if (recusados.length) throw new Error(`Não se guarda no PROMeiro (fica no Portainer): ${recusados.join(', ')}.`);
      gravarTudo(mudancas, { por, descrever, voltouDe });
      atuais = montar();
      return atuais;
    },
    simular: (mudancas) => montar(comAMudanca(mudancas)),
    historico: ({ limite = 50 } = {}) => q.historico.all(limite).map(comoEntrada),
    entradaDoHistorico: (id) => comoEntrada(q.entrada.get(id)) ?? null,
  };
}
