// @vitest-environment node
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { SALVAVEIS } from '../servidor/configuracao.mjs';
// @ts-expect-error módulo JS sem tipos
import { FICAM_NO_PORTAINER } from '../servidor/configuracao-portainer.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* "Pode apagar do Portainer" (#79), pela API: as variáveis do Portainer cujo valor já está salvo na tela (ou que o
   código não lê mais) podem sair; as que ainda não têm valor salvo continuam valendo; segredos e infraestrutura ficam.
   E o exemplo de ambiente e o compose do repositório só com segredos e infraestrutura (mais as que a tela substitui,
   opcionais). Trello e Teable de mentira: ids e nomes inventados. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';

const QUADRO = {
  listas: [
    { id: 'lSP', name: 'SP ENTRADA', closed: false },
    { id: 'lRJ', name: 'RIO ENTRADA', closed: false },
    { id: 'lFilmes', name: 'FILMES', closed: false },
  ],
  campos: [{ id: 'cPraca', name: 'Praça', type: 'list', options: ['G5', 'SP', 'RJ', 'INTER'].map((t) => ({ id: `o${t}`, value: { text: t } })) }],
};
const PORTAINER = {
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_QUADRO: 'qHoje',
  TRELLO_LISTA: 'lRJ',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_LISTA_RJ: 'lRJ',
  TRELLO_LISTA_G5: 'lRJ',
  TRELLO_SAIDA_SP: '',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=oG5,SP=oSP,RJ=oRJ,INTER=oINTER',
  TRELLO_LISTA_FILMES: 'lFilmes',
  TEABLE_PG_URL: 'postgres://falso',
  TEABLE_PG_ESQUEMA: 'bseHoje',
  // a tabela da produção pelo id (é a que o nome acha) e a do acervo, que não está na base
  TEABLE_ARTE_PRODUCAO: 'tblProducao',
  TEABLE_ACERVO: 'tblAcervoDeOutraBase',
  ...TEABLE_FALSO,
  // o que o código não lê mais
  TEABLE_PG_ARTE: 'producao_velha',
  TEABLE_PG_ARTE_LEITURA: 'bseVelha.producao',
  TEABLE_PAUTA_VISAO: 'viwVelha',
  TEABLE_TOKEN_ESCRITA: 'token-velho',
  PORTA: '8080',
  // o que não é do PROMeiro não aparece
  HOSTNAME: 'promeiro',
};

function trelloFalso() {
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '' });
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const rota = new URL(endereco).pathname.replace(/^\/1/, '');
    if ((init.method ?? 'GET') !== 'GET') return ok({});
    if (rota === '/boards/qHoje') return ok({ id: 'qHoje', name: 'PROMO 2026' });
    if (rota === '/boards/qHoje/lists') return ok(QUADRO.listas);
    if (rota === '/boards/qHoje/customFields') return ok(QUADRO.campos);
    if (rota === '/boards/qHoje/labels') return ok([]);
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
  };
  return { buscar };
}

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor() {
  const falso = trelloFalso();
  const teable = teableFalso({ ARTE_producao: 'arte_producao_h1' }, { base: 'bseHoje', ids: { ARTE_producao: 'tblProducao' } });
  const abrirPg = async () => ({ query: async () => ({ rows: [] }), end: async () => {} });
  const app = criarApp({ db: abrirBanco(':memory:'), env: PORTAINER, abrirPg, buscarNoTeable: teable, trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar: async () => [] }) });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  fechar = async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await app.fechar();
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, corpo?: unknown) =>
    fetch(base + caminho, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  return { chefe: como(CHEFE), ana: como(ANA) };
}

type Variavel = { nome: string; porque: string };
type Lista = { podeApagar: Variavel[]; aindaNao: Variavel[]; ficam: Variavel[] };
const lerLista = async (chefe: (c: string) => Promise<Response>) => (await (await chefe('/api/configuracao/portainer')).json()) as Lista;
const nomes = (vs: Variavel[]) => vs.map((v) => v.nome).sort();

describe('pode apagar do Portainer', () => {
  it('só administradores', async () => {
    const { ana } = await comServidor();
    expect((await ana('/api/configuracao/portainer')).status).toBe(403);
  });

  it('antes de salvar: só o que o código não lê mais e as tabelas achadas pelo nome; o resto ainda não', async () => {
    const { chefe } = await comServidor();
    const l = await lerLista(chefe);
    expect(nomes(l.podeApagar)).toEqual(['TEABLE_ARTE_PRODUCAO', 'TEABLE_PAUTA_VISAO', 'TEABLE_PG_ARTE', 'TEABLE_PG_ARTE_LEITURA', 'TEABLE_TOKEN_ESCRITA']);
    expect(l.podeApagar.find((v) => v.nome === 'TEABLE_PG_ARTE')?.porque).toMatch(/não lê mais/);
    expect(l.podeApagar.find((v) => v.nome === 'TEABLE_ARTE_PRODUCAO')?.porque).toMatch(/pelo nome/);
    // vazias no Portainer (TRELLO_SAIDA_SP) não aparecem
    expect(nomes(l.aindaNao)).toEqual([
      'TEABLE_ACERVO',
      'TEABLE_PG_ESQUEMA',
      'TRELLO_CAMPO_PRACA',
      'TRELLO_LISTA',
      'TRELLO_LISTA_FILMES',
      'TRELLO_LISTA_G5',
      'TRELLO_LISTA_RJ',
      'TRELLO_LISTA_SP',
      'TRELLO_PRACAS',
      'TRELLO_QUADRO',
    ]);
    expect(l.aindaNao.find((v) => v.nome === 'TEABLE_ACERVO')?.porque).toMatch(/ARTES_acervo/);
    expect(l.aindaNao.find((v) => v.nome === 'TRELLO_LISTA_FILMES')?.porque).toBe('sem valor salvo em Filmes');
    expect(l.aindaNao.find((v) => v.nome === 'TRELLO_LISTA_SP')?.porque).toBe('sem valor salvo em Praças');
    // segredos, infraestrutura e a chave-mestra ficam; o que não é do PROMeiro não aparece
    expect(nomes(l.ficam)).toEqual(['CADASTRO_ADMINS', 'PORTA', 'TEABLE_PG_URL', 'TEABLE_TOKEN', 'TEABLE_URL', 'TRELLO_KEY', 'TRELLO_TOKEN']);
    expect(l.ficam.find((v) => v.nome === 'TRELLO_TOKEN')?.porque).toBe('segredo');
    expect(l.ficam.find((v) => v.nome === 'PORTA')?.porque).toBe('infraestrutura');
    expect(JSON.stringify(l)).not.toMatch(/HOSTNAME/);
  });

  it('salvas as Praças, as variáveis delas podem sair; a reserva ainda não, enquanto uma praça não tem entrada', async () => {
    const { chefe } = await comServidor();
    const s = (await (await chefe('/api/configuracao')).json()) as { pracas: { proposta: { pracas: { sigla: string; nome: string }[] } } };
    const proposta = s.pracas.proposta;
    const pedido = { pracas: { ...proposta, pracas: proposta.pracas.map((p) => (p.sigla === 'SP' ? { ...p, nome: 'São Paulo' } : p)) } };
    expect((await chefe('/api/configuracao/salvar', pedido)).status).toBe(200);
    const l = await lerLista(chefe);
    for (const nome of ['TRELLO_LISTA_SP', 'TRELLO_LISTA_RJ', 'TRELLO_LISTA_G5', 'TRELLO_PRACAS', 'TRELLO_CAMPO_PRACA']) {
      expect(l.podeApagar.find((v) => v.nome === nome)?.porque).toMatch(/Praças/);
    }
    // a INTER não tem entrada: a reserva ainda vale para ela
    expect(l.aindaNao.find((v) => v.nome === 'TRELLO_LISTA')?.porque).toMatch(/INTER/);
    expect(nomes(l.aindaNao)).toEqual(['TEABLE_ACERVO', 'TEABLE_PG_ESQUEMA', 'TRELLO_LISTA', 'TRELLO_LISTA_FILMES', 'TRELLO_QUADRO']);
  });
});

describe('o exemplo de ambiente e o compose do repositório', () => {
  const ler = (arquivo: string) => readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8');
  /** As variáveis de um arquivo: as linhas NOME=…, e as comentadas como "# NOME=" (opcionais). */
  const doExemplo = (texto: string) => [...texto.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);
  const doCompose = (texto: string) => [...texto.matchAll(/^\s*#?\s*-\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);

  it('só segredos e infraestrutura, mais as que a tela substitui (opcionais); nenhuma que o código não lê', () => {
    for (const [arquivo, variaveis] of [
      ['stack.env.exemplo', doExemplo(ler('stack.env.exemplo'))],
      ['docker-compose.yml', doCompose(ler('docker-compose.yml'))],
    ] as const) {
      const fora = variaveis.filter((n) => !FICAM_NO_PORTAINER.has(n) && !SALVAVEIS.has(n));
      expect(fora, arquivo).toEqual([]);
      // nada de TEABLE_PG_* de tabela, da base de leitura antiga ou das obsoletas
      expect(variaveis.filter((n) => /^TEABLE_PG_(?!URL$|ESQUEMA$)|TEABLE_TOKEN_ESCRITA|TEABLE_PAUTA_VISAO/.test(n)), arquivo).toEqual([]);
    }
  });

  it('as que a tela substitui ficam num bloco à parte, com "pode ficar vazia: a Configuração do app guarda"', () => {
    for (const arquivo of ['stack.env.exemplo', 'docker-compose.yml']) {
      const texto = ler(arquivo);
      const marca = texto.indexOf('pode ficar vazia: a Configuração do app guarda');
      expect(marca, arquivo).toBeGreaterThan(0);
      // as salváveis só aparecem depois da marca
      const antes = texto.slice(0, marca);
      const salvaveisAntes = (arquivo.endsWith('.yml') ? doCompose(antes) : doExemplo(antes)).filter((n) => SALVAVEIS.has(n));
      expect(salvaveisAntes, arquivo).toEqual([]);
    }
  });
});
