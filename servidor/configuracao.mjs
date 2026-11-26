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
 *   salvar(mudancas, { por }) — grava { NOME: 'valor' } (null tira o salvo e volta o Portainer) e devolve os valores
 *   novos; um nome que não é da tela (segredo, infraestrutura, desconhecido) recusa a mudança inteira.
 */
export function criarConfiguracao(db, portainer = process.env) {
  db.exec('CREATE TABLE IF NOT EXISTS configuracao (nome TEXT PRIMARY KEY, valor TEXT NOT NULL, por TEXT, em TEXT NOT NULL)');
  const q = {
    todos: db.prepare('SELECT nome, valor FROM configuracao'),
    gravar: db.prepare('INSERT OR REPLACE INTO configuracao (nome, valor, por, em) VALUES (?, ?, ?, ?)'),
    tirar: db.prepare('DELETE FROM configuracao WHERE nome = ?'),
  };
  const montar = () => {
    // um nome que deixou de ser da tela (guardado por uma versão antiga) não passa por cima do Portainer
    const salvos = Object.fromEntries(q.todos.all().filter((l) => SALVAVEIS.has(l.nome)).map((l) => [l.nome, l.valor]));
    return Object.freeze({ ...portainer, ...salvos });
  };
  let atuais = montar();

  /** Tudo ou nada: a mudança de várias variáveis entra junta. */
  function gravarTudo(mudancas, por) {
    const em = new Date().toISOString();
    db.exec('BEGIN');
    try {
      for (const [nome, valor] of Object.entries(mudancas)) {
        if (valor === null || valor === undefined) q.tirar.run(nome);
        else q.gravar.run(nome, String(valor), por, em);
      }
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
    salvar(mudancas, { por = '' } = {}) {
      const recusados = Object.keys(mudancas).filter((n) => !SALVAVEIS.has(n));
      if (recusados.length) throw new Error(`Não se guarda no PROMeiro (fica no Portainer): ${recusados.join(', ')}.`);
      gravarTudo(mudancas, por);
      atuais = montar();
      return atuais;
    },
  };
}
