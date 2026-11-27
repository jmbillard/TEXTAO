/* As tabelas do Teable (#76): o PROMeiro acha cada uma pelo nome na base escolhida, e o nome dela no Postgres vem do
   próprio Teable (o dbTableName). Aqui fica o mapa "tabela → colunas que o código usa", num lugar só: as da API (o
   nome do campo, com que o PROMeiro grava e lê pela API) e as do Postgres (o dbFieldName, com que o SQL lê). Os dois
   nomes podem diferir; a conferência olha os dois. Quem mexer num SELECT ou numa gravação atualiza este mapa.
   O mesmo módulo serve ao servidor e ao navegador: só sintaxe que o Node apaga. */
import { casar, nomeComparavel } from './ligarPeloNome.ts';

export interface TabelaDoPROMeiro {
  /** o nome esperado na base (é também a chave da tabela no código) */
  nome: string;
  /** como a tela chama */
  titulo: string;
  /** a variável do id da tabela na API (o Portainer ou o salvo vale antes do nome); '' = só o Postgres */
  variavel: string;
  /** os nomes de campo que o PROMeiro usa pela API (gravar, ler com fieldKeyType=name) */
  api: readonly string[];
  /** as colunas que o SQL lê no Postgres (o dbFieldName) */
  pg: readonly string[];
  /** a tabela que, faltando, não tira nada do ar (não vira aviso) */
  opcional?: boolean;
}

export const TABELAS_DO_TEABLE: readonly TabelaDoPROMeiro[] = [
  {
    nome: 'atracoes',
    titulo: 'Atrações',
    variavel: 'TEABLE_CADASTRO',
    // cadastros.mjs (criar, ler), vocabulario.mjs (a categoria)
    api: ['atracao', 'categoria', 'acervo', 'projeto_win', 'output_win'],
    // vocabulario.mjs, trello.mjs (acharAtracao), acervo.mjs, exibicao.mjs (as sessões)
    pg: ['atracao', 'categoria', 'pattern', 'projeto_win', 'output_win', 'acervo'],
  },
  { nome: 'KEY_atracoes', titulo: 'Keys das atrações', variavel: 'TEABLE_ATRACOES', api: ['key', 'atracoes'], pg: [] },
  {
    nome: 'redatores',
    titulo: 'Redatores',
    variavel: 'TEABLE_REDATORES',
    // trello.mjs (a opção nova do redator), cadastros.mjs, vocabulario.mjs
    api: ['redator', 'redator_ID', 'customField_ID'],
    pg: ['redator', 'key', 'redator_ID', 'customField_ID'],
  },
  { nome: 'KEY_redatores', titulo: 'Keys dos redatores', variavel: 'TEABLE_KEY_REDATORES', api: ['key', 'redator'], pg: [] },
  { nome: 'editores', titulo: 'Editores', variavel: 'TEABLE_EDITORES', api: ['editor', 'editor_ID', 'customField_ID'], pg: ['editor', 'editor_ID', 'customField_ID'] },
  { nome: 'KEY_editores', titulo: 'Keys dos editores', variavel: 'TEABLE_KEY_EDITORES', api: ['key', 'editor'], pg: [] },
  // configuracao-pessoas.mjs (#77): quem entrou e quem saiu do quadro, cadastrar como designer e marcar inativo
  { nome: 'designers', titulo: 'Designers', variavel: '', api: ['designer', 'status', 'email', 'designer_ID'], pg: [] },
  {
    nome: 'ARTE_producao',
    titulo: 'Produção da arte',
    variavel: 'TEABLE_ARTE_PRODUCAO',
    // trello.mjs (o registro do envio e a versão nova)
    api: ['claquete', 'artes_quantidade', 'artes', 'artes_existentes', 'doc', 'redator', 'card_ID', 'data_entrada', 'texto', 'atracao', 'editor', 'key', 'filme', 'praca', 'prioridade', 'workflow', 'urgencia', 'complexidade'],
    // trello.mjs (andamento, duplicadas, já entrou hoje, a carga das Produções), acervo.mjs, redator.mjs
    pg: ['card_ID', 'claquete', 'key', 'status', 'data_entrada', 'artes_quantidade', 'artes', 'texto', 'doc', 'redator', 'editor', 'designers', 'entregue', 'data_entrega', 'praca', 'arquivado', 'filme', 'atracao', 'complexidade'],
  },
  // pauta.mjs e vocabulario.mjs (quem está com a claquete); pauta.mjs (a Semana da pauta, #94)
  { nome: 'EDICAO_producao', titulo: 'Pauta da edição', variavel: 'TEABLE_PAUTA', api: ['key', 'data', 'editor', 'claquete'], pg: ['key', 'editor', 'data', 'expediente_inicio', 'expediente_fim', 'anotacao', 'alterado_em'], opcional: true },
  {
    nome: 'ARTES_acervo',
    titulo: 'Acervo',
    variavel: 'TEABLE_ACERVO',
    // acervo.mjs (gravar, tipar, renomear), importacao-do-acervo
    api: ['arte', 'tipo', 'complexidade', 'atracao', 'claquete', 'filme', 'caminho'],
    // acervo.mjs, filmes.mjs (as artes do filme)
    pg: ['arte', 'tipo', 'atracao', 'claquete', 'filme', 'caminho'],
  },
  // trello.mjs (a prioridade ALTA)
  { nome: 'prioridade', titulo: 'Prioridade', variavel: '', api: [], pg: ['key', 'claquete', 'data'] },
  {
    nome: 'filmes',
    titulo: 'Filmes',
    variavel: 'TEABLE_FILMES',
    // exibicao.mjs (o filme novo, o ano, o pôster)
    api: ['titulo', 'cadastrado_em', 'ano_de_producao', 'poster'],
    // exibicao.mjs, filmes.mjs (a conferência), trello.mjs (os filmes recentes do Padeiro, #142: o nome_da_pasta)
    pg: ['titulo', 'ano_de_producao', 'projeto_win', 'projeto_mac', 'output_win', 'output_mac', 'poster', 'nome_da_pasta'],
  },
  {
    nome: 'exibicoes',
    titulo: 'Exibições',
    variavel: 'TEABLE_EXIBICOES',
    // exibicao.mjs (a exibição de cada card de filme)
    api: ['exibicao', 'data_de_exibicao', 'card_ID', 'link', 'inedito', 'output', 'criado_em', 'artes', 'artes_existentes', 'filme', 'sessao'],
    // trello.mjs (também a carga das Produções), exibicao.mjs, acervo.mjs, filmes.mjs
    pg: ['card_ID', 'sessao', 'exibicao', 'labels', 'filme', 'data_de_exibicao', 'link', 'inedito', 'output', 'artes', 'artes_existentes'],
  },
];

/** O campo do pôster na tabela filmes (TEABLE_FILMES_POSTER): o de anexo com este nome. */
export const CAMPO_DO_POSTER = 'poster';

/** Uma tabela da base como a API do Teable lista. */
export interface TabelaLida {
  id: string;
  nome: string;
  /** "bseXXX.nome_no_postgres" */
  dbTableName: string;
}
/** Um campo como a API do Teable lista. */
export interface CampoLido {
  name: string;
  dbFieldName: string;
  type?: string;
  id?: string;
}

export interface TabelaLigada {
  nome: string;
  /** o id na API ('' = não ligada) */
  id: string;
  /** o nome no Postgres (sem o esquema) e o esquema, do dbTableName */
  pg: string;
  esquema: string;
  /** o nome lido agora no Teable */
  nomeLido: string;
  /** 'variavel': o id do Portainer ou do salvo; 'lembrado': o da última descoberta (renomeada no Teable); 'nome': achada pelo nome */
  como: 'variavel' | 'lembrado' | 'nome' | '';
  problema: '' | 'nenhum' | 'dobro';
  candidatos: string[];
  /** a variável tem um id que não está nesta base (ficou de outra base): não vale */
  variavelFora?: boolean;
}

/** "bseXXX.nome" → { esquema: 'bseXXX', pg: 'nome' } (sem aspas). */
function doDbTableName(v: string) {
  const limpo = String(v ?? '').replace(/["'`]/g, '').trim();
  const i = limpo.lastIndexOf('.');
  return i < 0 ? { esquema: '', pg: limpo } : { esquema: limpo.slice(0, i), pg: limpo.slice(i + 1) };
}

/**
 * Liga cada tabela do PROMeiro a uma tabela da base: o id da variável (se está na base), senão o lembrado da última
 * descoberta (renomear no Teable não quebra), senão o nome (achou uma só). O nome no Postgres é o dela no Teable.
 * @param configurados { [nome]: id } das variáveis (o Portainer ou o salvo); lembrados { [nome]: id } da última vez
 */
export function ligarAsTabelas(lidas: readonly TabelaLida[], { configurados = {}, lembrados = {} }: { configurados?: Record<string, string>; lembrados?: Record<string, string> }): TabelaLigada[] {
  const naBase = (id: string | undefined) => (id ? lidas.find((t) => t.id === id) : undefined);
  return TABELAS_DO_TEABLE.map((t) => {
    const variavel = configurados[t.nome] ?? '';
    const porVariavel = naBase(variavel);
    const porLembrado = naBase(lembrados[t.nome]);
    const achado = casar(lidas, (l) => nomeComparavel(l.nome) === nomeComparavel(t.nome));
    const doNome = achado.como === 'um' ? naBase(achado.id) : undefined;
    const escolhida = porVariavel ?? porLembrado ?? doNome;
    // o lembrado que o nome ainda acha é "achado pelo nome"; só o renomeado no Teable fica "lembrado"
    const como: TabelaLigada['como'] = porVariavel ? 'variavel' : porLembrado && porLembrado !== doNome ? 'lembrado' : escolhida ? 'nome' : '';
    return {
      nome: t.nome,
      id: escolhida?.id ?? '',
      ...(escolhida ? doDbTableName(escolhida.dbTableName) : { esquema: '', pg: '' }),
      nomeLido: escolhida?.nome ?? '',
      como,
      problema: escolhida ? '' : achado.como === 'dobro' ? 'dobro' : 'nenhum',
      candidatos: !escolhida && achado.como === 'dobro' ? achado.ids : [],
      ...(variavel && !porVariavel ? { variavelFora: true } : {}),
    };
  });
}

/** As colunas que o código usa e a tabela não tem: pelo nome do campo (API) e pelo dbFieldName (Postgres). */
export function colunasQueFaltam(tabela: TabelaDoPROMeiro, campos: readonly CampoLido[]): { api: string[]; pg: string[] } {
  const nomes = new Set(campos.map((c) => c.name));
  const doPg = new Set(campos.map((c) => c.dbFieldName));
  return { api: tabela.api.filter((n) => !nomes.has(n)), pg: tabela.pg.filter((n) => !doPg.has(n)) };
}

export interface AvisoDasTabelas {
  tabela: string;
  texto: string;
}

/**
 * O aviso do topo da Configuração: a tabela que não foi achada (ou está em dobro) e a coluna que o código usa e a
 * tabela não tem. `campos`: os campos lidos de cada tabela ligada (a tabela sem campos lidos não é conferida).
 */
export function avisosDasTabelas(ligadas: readonly TabelaLigada[], campos: Record<string, readonly CampoLido[] | undefined>): AvisoDasTabelas[] {
  const avisos: AvisoDasTabelas[] = [];
  for (const l of ligadas) {
    const t = TABELAS_DO_TEABLE.find((x) => x.nome === l.nome);
    if (!t) continue;
    if (!l.id) {
      if (l.problema === 'dobro') avisos.push({ tabela: t.nome, texto: `Há duas tabelas ${t.nome} na base (renomeie uma no Teable)` });
      else if (!t.opcional) avisos.push({ tabela: t.nome, texto: `Não achei a tabela ${t.nome} na base` });
      continue;
    }
    const lidos = campos[l.nome];
    if (!lidos) continue;
    const { api, pg } = colunasQueFaltam(t, lidos);
    const todas = [...new Set([...api, ...pg])];
    if (!todas.length) continue;
    const onde = (c: string) => (api.includes(c) && pg.includes(c) ? 'na API e no Postgres' : api.includes(c) ? 'na API' : 'no Postgres');
    const lados = [...new Set(todas.map(onde))];
    avisos.push({
      tabela: t.nome,
      texto:
        lados.length === 1
          ? `${t.titulo} sem a${todas.length > 1 ? 's colunas' : ' coluna'} ${todas.join(', ')} (${lados[0]})`
          : `${t.titulo} sem as colunas ${todas.map((c) => `${c} (${onde(c)})`).join(', ')}`,
    });
  }
  return avisos;
}
