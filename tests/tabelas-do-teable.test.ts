import { describe, expect, it } from 'vitest';
import { TABELAS_DO_TEABLE, avisosDasTabelas, colunasQueFaltam, ligarAsTabelas } from '../src/modelo/tabelasDoTeable';

/* Tabelas e campos fictícios: os ids e os nomes de verdade ficam só no Teable. */
const lida = (id: string, nome: string, dbTableName = `bseBase.${nome.toLowerCase()}_x`) => ({ id, nome, dbTableName });
const campo = (name: string, dbFieldName = name) => ({ name, dbFieldName });

describe('as tabelas achadas pelo nome na base', () => {
  const lidas = [
    lida('tblAtr', 'atracoes', 'bseBase.atracoes_a1'),
    lida('tblKAtr', 'KEY_atracoes', 'bseBase.key_atracoes_b2'),
    lida('tblArte', 'ARTE producao', 'bseBase.arte_producao_c3'),
    lida('tblExib1', 'Exibições'),
    lida('tblExib2', 'exibicoes'),
  ];

  it('acha pelo nome (sem caixa, acento e pontuação) e o nome no Postgres vem do Teable', () => {
    const ligadas = ligarAsTabelas(lidas, {});
    const atr = ligadas.find((t) => t.nome === 'atracoes')!;
    expect(atr).toMatchObject({ id: 'tblAtr', pg: 'atracoes_a1', esquema: 'bseBase', como: 'nome', problema: '' });
    // "ARTE producao" é a ARTE_producao; "KEY_atracoes" não confunde com "atracoes"
    expect(ligadas.find((t) => t.nome === 'ARTE_producao')).toMatchObject({ id: 'tblArte', pg: 'arte_producao_c3' });
    expect(ligadas.find((t) => t.nome === 'KEY_atracoes')).toMatchObject({ id: 'tblKAtr' });
  });

  it('não achou ou achou em dobro: exceção, sem id', () => {
    const ligadas = ligarAsTabelas(lidas, {});
    expect(ligadas.find((t) => t.nome === 'filmes')).toMatchObject({ id: '', pg: '', problema: 'nenhum' });
    expect(ligadas.find((t) => t.nome === 'exibicoes')).toMatchObject({ id: '', problema: 'dobro', candidatos: ['tblExib1', 'tblExib2'] });
  });

  it('o id da variável (o Portainer ou o salvo) vale antes do nome, se está na base; depois, o último achado', () => {
    const ligadas = ligarAsTabelas(lidas, { configurados: { exibicoes: 'tblExib2', atracoes: 'tblDeOutraBase' }, lembrados: { ARTE_producao: 'tblArte' } });
    expect(ligadas.find((t) => t.nome === 'exibicoes')).toMatchObject({ id: 'tblExib2', como: 'variavel', problema: '', pg: 'exibicoes_x' });
    // o id que não está na base (de outra base) não vale: o nome acha
    expect(ligadas.find((t) => t.nome === 'atracoes')).toMatchObject({ id: 'tblAtr', como: 'nome', variavelFora: true });
    // o lembrado que o nome ainda acha é achado pelo nome
    expect(ligadas.find((t) => t.nome === 'ARTE_producao')).toMatchObject({ id: 'tblArte', como: 'nome' });
    // renomeada no Teable: o id lembrado continua valendo
    const renomeada = ligarAsTabelas([lida('tblArte', 'Produção da arte (nova)', 'bseBase.arte_producao_c3')], { lembrados: { ARTE_producao: 'tblArte' } });
    expect(renomeada.find((t) => t.nome === 'ARTE_producao')).toMatchObject({ id: 'tblArte', como: 'lembrado', nomeLido: 'Produção da arte (nova)' });
  });

  it('a tabela sem o nome no Postgres no formato "esquema.tabela" ainda dá a tabela, com o esquema vazio', () => {
    const [t] = ligarAsTabelas([lida('tblP', 'prioridade', 'prioridade_z')], {}).filter((x) => x.nome === 'prioridade');
    expect(t).toMatchObject({ pg: 'prioridade_z', esquema: '' });
  });
});

describe('o mapa tabela → colunas que o PROMeiro usa', () => {
  it('tem as tabelas da base, cada uma com as colunas da API (o nome do campo) e do Postgres (o dbFieldName)', () => {
    const nomes = TABELAS_DO_TEABLE.map((t) => t.nome);
    expect(nomes).toEqual(['atracoes', 'KEY_atracoes', 'redatores', 'KEY_redatores', 'editores', 'KEY_editores', 'designers', 'ARTE_producao', 'EDICAO_producao', 'ARTES_acervo', 'prioridade', 'filmes', 'exibicoes']);
    const acervo = TABELAS_DO_TEABLE.find((t) => t.nome === 'ARTES_acervo')!;
    expect(acervo.variavel).toBe('TEABLE_ACERVO');
    expect(acervo.api).toContain('complexidade');
    expect(acervo.pg).toContain('caminho');
  });
});

describe('as colunas que faltam', () => {
  const acervo = TABELAS_DO_TEABLE.find((t) => t.nome === 'ARTES_acervo')!;
  const todos = [...new Set([...acervo.api, ...acervo.pg])].map((n) => campo(n));

  it('com todas, nada falta', () => {
    expect(colunasQueFaltam(acervo, todos)).toEqual({ api: [], pg: [] });
  });

  it('confere pelo nome da API e pelo nome no Postgres, que podem diferir', () => {
    // a complexidade existe com outro dbFieldName: a gravação (API) passa, a leitura (Postgres) não
    const outros = todos.filter((c) => c.name !== 'caminho' && c.name !== 'complexidade').concat(campo('complexidade', 'complexidade_1'), campo('Caminho do arquivo', 'caminho'));
    expect(colunasQueFaltam(acervo, outros)).toEqual({ api: ['caminho'], pg: [] });
    const semArte = todos.filter((c) => c.name !== 'arte');
    expect(colunasQueFaltam(acervo, semArte)).toEqual({ api: ['arte'], pg: ['arte'] });
  });
});

describe('o aviso no topo', () => {
  const tudoDe = (nome: string) => {
    const t = TABELAS_DO_TEABLE.find((x) => x.nome === nome)!;
    return [...new Set([...t.api, ...t.pg])].map((n) => campo(n));
  };
  const lidas = TABELAS_DO_TEABLE.map((t, i) => lida(`tbl${i}`, t.nome));
  const ligadas = ligarAsTabelas(lidas, {});
  const camposDe = Object.fromEntries(ligadas.map((t) => [t.nome, tudoDe(t.nome)]));

  it('tudo certo: nenhum aviso', () => {
    expect(avisosDasTabelas(ligadas, camposDe)).toEqual([]);
  });

  it('a coluna que falta e a tabela que não achou viram aviso; a tabela opcional que falta, não', () => {
    const semComplexidade = { ...camposDe, ARTES_acervo: camposDe.ARTES_acervo.filter((c) => c.name !== 'complexidade') };
    const avisos = avisosDasTabelas(ligarAsTabelas(lidas.filter((l) => l.nome !== 'filmes' && l.nome !== 'EDICAO_producao'), {}), semComplexidade);
    expect(avisos).toEqual([
      { tabela: 'ARTES_acervo', texto: 'Acervo sem a coluna complexidade (na API)' },
      { tabela: 'filmes', texto: 'Não achei a tabela filmes na base' },
    ]);
  });

  it('a coluna que só falta de um lado diz qual', () => {
    const soPg = { ...camposDe, prioridade: camposDe.prioridade.map((c) => (c.name === 'data' ? campo('data', 'data_1') : c)) };
    expect(avisosDasTabelas(ligadas, soPg)).toEqual([{ tabela: 'prioridade', texto: 'Prioridade sem a coluna data (no Postgres)' }]);
  });

  it('a tabela em dobro diz para escolher', () => {
    const dobro = ligarAsTabelas([...lidas, lida('tblOutra', 'Filmes')], {});
    expect(avisosDasTabelas(dobro, camposDe)).toEqual([{ tabela: 'filmes', texto: 'Há duas tabelas filmes na base (renomeie uma no Teable)' }]);
  });
});

describe('as variáveis de nome no Postgres sumiram do código', () => {
  it('nenhum arquivo do servidor nem do navegador lê TEABLE_PG_<tabela> nem a base de leitura antiga', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const arquivos = (pasta: string): string[] =>
      readdirSync(pasta).flatMap((n) => {
        const c = join(pasta, n);
        if (n === 'node_modules') return [];
        return statSync(c).isDirectory() ? arquivos(c) : /\.(m?js|tsx?)$/.test(n) ? [c] : [];
      });
    const antigas = /TEABLE_PG_(ATRACOES|REDATORES|EDITORES|PAUTA|ARTE|ACERVO|FILMES|EXIBICOES|PRIORIDADE)\b|TEABLE_PG_ARTE_LEITURA/;
    const achados = [...arquivos('servidor'), ...arquivos('src')].filter((f) => antigas.test(readFileSync(f, 'utf8')));
    expect(achados).toEqual([]);
  });
});
