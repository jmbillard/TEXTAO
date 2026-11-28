// @vitest-environment node
/* Montar a pauta, a semana lado a lado com a planilha (#133): o n8n manda a foto crua das abas da planilha da edição
   para POST /api/publico/edicao/foto, fora do login, com o EDICAO_FOTO_TOKEN no cabeçalho; o PROMeiro guarda no SQLite
   só as abas que mudaram (com a limpeza, e no backup); e a coordenação vê, em GET /api/montar-pauta/foto, as diferenças
   entre o dia montado e a foto do mesmo dia, lida pelo colar da planilha (#130). Nada vai ao Teable: o Teable falso só
   responde a leitura dos cadastros. Nomes, claquetes e e-mails inventados. */
import { createServer, request, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';
import { porProducoes } from './fixtures/producoes-falsas';
// @ts-expect-error módulo JS sem tipos
import { criarFotosDaEdicao, fotoDoPedido } from '../servidor/foto-da-edicao.mjs';

const CADASTROS = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  CADASTRO_ADMINS: 'chefe@empresa.com',
};
const TOKEN = 'token-da-foto-da-edicao';

function teableFalso() {
  const tabelas: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
    tblRed: [],
    tblEdi: [
      { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
      { id: 'recE2', fields: { editor: 'Elis Furtado' } },
      { id: 'recE3', fields: { editor: 'Gil Moura' } },
    ],
    tblKeyRed: [],
    tblKeyEdi: [],
  };
  return async (url: string, init: RequestInit = {}) => {
    if ((init.method ?? 'GET') !== 'GET') throw new Error(`a foto da edição não escreve no Teable: ${init.method} ${url}`);
    const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
    return { ok: true, status: 200, json: async () => ({ records: tabelas[tabela] }), text: async () => '' };
  };
}

const SEXTA = '2026-11-27';
/** A aba da sexta como a API do Google devolve: a linha do dia, os rótulos dos turnos (mesclados) e os blocos. */
const GRADE_DA_SEXTA = [
  ['', 'L'],
  ['', 'SEXTA', '27/11/2026', '', 'ESTEIRA DE PÓS PRODUÇÃO'],
  [],
  ['', '                                 MADRUGADA'],
  [],
  ['', 'AVID 22', '', 'ILHA 46'],
  ['', 'EDITOR: ', 'Rui Teixeira', 'EDITOR: ', 'Gil Moura'],
  ['', 'HORÁRIO: ', '22H AS 6H', 'HORÁRIO: ', 'FÉRIAS'],
  ['', 'Noite de Gala 27/11 Dp'],
  ['', 'Terra 28/11 (AH)'],
  [],
  ['', '                                 TARDE'],
  [],
  ['', 'AVID 7'],
  ['', 'EDITOR: ', 'Elis Furtado'],
  ['', 'HORÁRIO: ', '14 AS 23'],
  ['', 'Mundo Animal 30/11 (P)'],
];
const GRADE_DA_QUINTA = [['', 'QUINTA', '26/11/2026'], [], ['', 'EDITOR: ', 'Gil Moura'], ['', 'HORÁRIO: ', '6 AS 15']];
const aba = (nome: string, linhas: string[][], extra = {}) => ({ aba: nome, intervalo: `'${nome}'!A1:AD80`, sheetId: 1, data_da_aba: null, linhas, mesclas: [[3, 1, 4, 17]], ...extra });
const pacote = (abas = [aba('QUINTA', GRADE_DA_QUINTA), aba('SEXTA', GRADE_DA_SEXTA)], lida = '2026-11-27T10:15:04.120-03:00') => ({
  formato: 1,
  origem: { fluxo: 'fluxo-de-teste', execucao: '1' },
  lida_em: lida,
  todas_as_abas: ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'],
  abas,
});

describe('a foto crua da planilha da edição (#133)', () => {
  let servidor: Server | null = null;
  afterEach(() => void servidor?.close());

  const subir = async ({ env = { EDICAO_FOTO_TOKEN: TOKEN } as Record<string, string>, db = abrirBanco(':memory:') } = {}) => {
    const app = criarApp({ db, env, cadastros: criarCadastros(CADASTROS, { buscar: teableFalso() }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor!.listen(0, ok));
    const base = `http://localhost:${(servidor!.address() as { port: number }).port}`;
    const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
    const mandar = (corpo: unknown, token: string | null = TOKEN) =>
      fetch(`${base}/api/publico/edicao/foto`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
    return { base, db, como, mandar };
  };

  it('com o token certo, guarda a foto e diz quantas abas gravou', async () => {
    const { mandar } = await subir();
    const r = await mandar(pacote());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ gravadas: 2, iguais: 0 });
  });

  it('sem o token, ou com o errado, 401; sem o EDICAO_FOTO_TOKEN no Portainer, a rota fica desligada (404)', async () => {
    const { mandar } = await subir();
    expect((await mandar(pacote(), null)).status).toBe(401);
    expect((await mandar(pacote(), 'token-errado')).status).toBe(401);
    expect((await mandar(pacote(), `${TOKEN.slice(0, -1)}X`)).status).toBe(401);
    servidor!.close();
    const desligada = await subir({ env: {} });
    expect((await desligada.mandar(pacote())).status).toBe(404);
    expect((await desligada.mandar(pacote(), '')).status).toBe(404);
  });

  it('o caminho torto não grava nem chega às rotas com login, nem com o token', async () => {
    const { base, como } = await subir();
    const coord = como('chefe@empresa.com');
    expect((await coord('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) })).status).toBe(200);
    const cru = (caminho: string) =>
      new Promise<number>((ok, falhou) => {
        const r = request(base + '/', { path: caminho, method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'cf-access-authenticated-user-email': 'bia.coord@empresa.com' } }, (resposta) => (resposta.resume(), ok(resposta.statusCode ?? 0)));
        r.on('error', falhou);
        r.end(JSON.stringify(pacote()));
      });
    for (const caminho of [
      '/api/publico/edicao/foto/%2e%2e/%2e%2e/%2e%2e/montar-pauta/publicar',
      '/api/publico/edicao/%2e%2e/edicao/foto',
      '/api/publico//edicao/foto',
      '/API/publico/edicao/foto',
      '/api/publico/edicao/foto/',
      '/api/publico/edicao/fotos',
      '/api/publico/%2e%2e/montar-pauta/publicar',
    ])
      expect(await cru(caminho), caminho).toBe(404);
    // nada foi guardado: a coordenação não vê foto nenhuma
    expect((await (await como('bia.coord@empresa.com')(`/api/montar-pauta/foto?dia=${SEXTA}`)).json()).foto).toBeNull();
    // o GET no endereço da foto também é 404
    expect((await fetch(`${base}/api/publico/edicao/foto`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
  });

  it('recusa o que não é uma foto (400) e o corpo grande demais (413)', async () => {
    const { mandar } = await subir();
    expect((await mandar('não é json')).status).toBe(400);
    expect((await mandar({ ...pacote(), formato: 2 })).status).toBe(400);
    expect((await mandar({ ...pacote(), lida_em: 'ontem' })).status).toBe(400);
    expect((await mandar({ ...pacote(), abas: [] })).status).toBe(400);
    expect((await mandar(pacote([aba('SEXTA', [['', 3 as unknown as string]])]))).status).toBe(400);
    expect((await mandar(pacote([aba('SEXTA', GRADE_DA_SEXTA), aba('SEXTA', GRADE_DA_SEXTA)]))).status).toBe(400);
    expect((await mandar(pacote([aba('SEXTA', GRADE_DA_SEXTA, { mesclas: [[1, 2, 3]] })]))).status).toBe(400);
    const grande = pacote([aba('SEXTA', Array.from({ length: 300 }, () => Array.from({ length: 30 }, () => 'x'.repeat(200))))]);
    const r = await mandar(grande);
    expect(r.status).toBe(413);
  });

  it('guarda só quando a aba muda: a igual só confirma', async () => {
    const { mandar, como } = await subir();
    await mandar(pacote());
    expect(await (await mandar(pacote(undefined, '2026-11-27T11:15:00-03:00'))).json()).toEqual({ gravadas: 0, iguais: 2 });
    const sexta = GRADE_DA_SEXTA.map((l) => (l[2] === 'Rui Teixeira' ? ['', 'EDITOR: ', 'Rui Teixeira', 'EDITOR: ', 'Gil Moura'] : l)).concat([['', 'CALHAUS']]);
    expect(await (await mandar(pacote([aba('QUINTA', GRADE_DA_QUINTA), aba('SEXTA', sexta)], '2026-11-27T12:15:00-03:00'))).json()).toEqual({ gravadas: 1, iguais: 1 });
    // a coordenação vê a mais nova do dia, com a hora da leitura
    const bia = como('bia.coord@empresa.com');
    await como('chefe@empresa.com')('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) });
    const { foto } = await (await bia(`/api/montar-pauta/foto?dia=${SEXTA}`)).json();
    expect(foto).toMatchObject({ aba: 'SEXTA', dia: SEXTA, lidaEm: '2026-11-27T15:15:00.000Z', todasAsAbas: expect.arrayContaining(['SÁBADO']) });
    expect(foto.linhas.at(-1)).toEqual(['', 'CALHAUS']);
  });

  it('a foto fica no SQLite e entra no backup', async () => {
    const { mandar, db } = await subir();
    await mandar(pacote());
    const pasta = mkdtempSync(join(tmpdir(), 'promeiro-backup-'));
    try {
      const copia = abrirBanco(fazerBackup(db, pasta));
      expect(criarFotosDaEdicao(copia).doDia(SEXTA)).toMatchObject({ aba: 'SEXTA', linhas: GRADE_DA_SEXTA });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('a limpeza: passados 180 dias, fica só a última foto de cada aba em cada dia', () => {
    let agora = new Date('2026-05-01T12:00:00Z');
    const fotos = criarFotosDaEdicao(abrirBanco(':memory:'), { agora: () => agora });
    const sexta = (extra: string) => fotoDoPedido(pacote([aba('SEXTA', [...GRADE_DA_SEXTA, ['', extra]])]));
    fotos.receber(sexta('primeira'));
    fotos.receber(sexta('segunda'));
    fotos.receber(fotoDoPedido(pacote([aba('QUINTA', GRADE_DA_QUINTA)])));
    expect(fotos.quantas()).toBe(3);
    // 179 dias depois, nada sai
    agora = new Date('2026-10-27T12:00:00Z');
    fotos.receber(sexta('segunda'));
    expect(fotos.quantas()).toBe(3);
    // 181 dias depois: da sexta, só a segunda (a última daquele dia); a quinta, sozinha no dia dela, fica
    agora = new Date('2026-10-29T12:00:00Z');
    expect(fotos.limpar()).toBe(1);
    expect(fotos.quantas()).toBe(2);
    expect(fotos.doDia(SEXTA).linhas.at(-1)).toEqual(['', 'segunda']);
  });
});

describe('a semana lado a lado: o dia montado e a foto do mesmo dia (#133)', () => {
  let servidor: Server | null = null;
  afterEach(() => void servidor?.close());

  it('as diferenças, posição por posição, só para a coordenação', async () => {
    const db = abrirBanco(':memory:');
    const app = criarApp({ db, env: { EDICAO_FOTO_TOKEN: TOKEN }, cadastros: criarCadastros(CADASTROS, { buscar: teableFalso() }) });
    // da planilha, só conta o que casa com uma Produção (#199): a Terra 28/11 ainda não tem
    porProducoes(db, ['Noite de Gala 27/11', 'Mundo Animal 30/11'], { perto: SEXTA });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor!.listen(0, ok));
    const base = `http://localhost:${(servidor!.address() as { port: number }).port}`;
    const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
    const bia = como('bia.coord@empresa.com');
    await como('chefe@empresa.com')('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) });
    // sem foto do dia: nada para comparar
    expect(await (await bia(`/api/montar-pauta/foto?dia=${SEXTA}`)).json()).toEqual({ dia: SEXTA, foto: null, daFoto: null, diferencas: null });

    const posicoes = [
      { id: 'pos-1', turno: 'madrugada', editor: 'Rui Teixeira', horario: '22 as 6', demandas: [{ id: 'd-1', texto: 'Noite de Gala 27/11 (DP)' }] },
      { id: 'pos-2', turno: 'tarde', editor: 'Elis Furtado', horario: '14h às 23h', demandas: [{ id: 'd-2', texto: 'Mundo Animal 30/11 (P)' }, { id: 'd-3', texto: 'CALHAUS' }] },
    ];
    expect((await bia(`/api/montar-pauta?dia=${SEXTA}`, { method: 'PUT', body: JSON.stringify({ posicoes }) })).status).toBe(200);
    await fetch(`${base}/api/publico/edicao/foto`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(pacote()) });

    // sem a Produção da Terra, a linha dela na planilha não é diferença: o Montar não a teria
    const semTerra = await (await bia(`/api/montar-pauta/foto?dia=${SEXTA}`)).json();
    expect(semTerra.diferencas.posicoes.map((p: { editor: string }) => p.editor)).toEqual(['Elis Furtado']);
    expect(semTerra.daFoto.posicoes[0].demandas.map((d: { texto: string }) => d.texto)).toEqual(['Noite de Gala 27/11 (DP)']);
    porProducoes(db, ['Terra 28/11'], { perto: SEXTA });

    const r = await (await bia(`/api/montar-pauta/foto?dia=${SEXTA}`)).json();
    expect(r.foto.aba).toBe('SEXTA');
    expect(r.diferencas).toEqual({
      posicoes: [
        { editor: 'Rui Teixeira', turno: 'madrugada', onde: 'nos-dois', campos: [{ campo: 'demandas', promeiro: [], planilha: ['Terra 28/11 (AH)'] }] },
        { editor: 'Elis Furtado', turno: 'tarde', onde: 'nos-dois', campos: [{ campo: 'demandas', promeiro: ['CALHAUS'], planilha: [] }] },
      ],
      iguais: 0,
      fora: { soNoPromeiro: [], soNaPlanilha: ['Gil Moura'] },
    });
    // o que a foto diz vem junto, para a tela comparar com o que ainda está sendo digitado
    expect(r.daFoto.posicoes.map((p: { editor: string; turno: string }) => [p.turno, p.editor])).toEqual([
      ['madrugada', 'Rui Teixeira'],
      ['tarde', 'Elis Furtado'],
    ]);
    expect(r.daFoto.fora).toEqual(['Gil Moura']);
    // a outra semana não tem foto
    expect((await (await bia('/api/montar-pauta/foto?dia=2026-12-04')).json()).foto).toBeNull();
    // quem não é da coordenação não vê
    expect((await como('elis@empresa.com')(`/api/montar-pauta/foto?dia=${SEXTA}`)).status).toBe(403);
  });
});
