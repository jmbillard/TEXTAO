// @vitest-environment node
/* Começar o Roteiro de um arquivo ou de um texto colado (#195): o Novo roteiro já com o texto lido no navegador (os
   tipos e as artes), só os campos de fora da meta, a origem e o arquivo original guardado. Pelo servidor inteiro
   (criarApp), com o Teable de mentira dos cadastros. Nomes e e-mails inventados. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
};
const TABELAS: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
  tblRed: [{ id: 'recR1', fields: { redator: 'Marina Teles', email: 'marina.teles@empresa.com' } }],
  tblEdi: [{ id: 'recE1', fields: { editor: 'Caio Brandão', email: 'caio.brandao@empresa.com' } }],
  tblKeyRed: [],
  tblKeyEdi: [],
};
const buscar = async (url: string) => {
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
};

const DOC = {
  type: 'doc',
  content: [
    { type: 'paragraph', attrs: { tipo: 'locucao', confirmado: false }, content: [{ type: 'text', text: 'NESTE SÁBADO, A BRASA DECIDE.' }] },
    { type: 'paragraph', attrs: { tipo: 'arte', confirmado: true }, content: [{ type: 'text', text: 'Desafio da Brasa', marks: [{ type: 'arte', attrs: { id: 'a1', subtipo: '' } }] }] },
  ],
};

describe('começar o Roteiro de um arquivo ou colado (#195)', () => {
  let servidor: Server;
  let base = '';
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const marina = como('marina.teles@empresa.com'); // redatora
  const caio = como('caio.brandao@empresa.com'); // editor: não começa
  const comecar = (quem: typeof marina, corpo: Record<string, unknown>) => quem('/api/roteiros-escritos', { method: 'POST', body: JSON.stringify(corpo) });

  beforeAll(async () => {
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, cadastros: criarCadastros(ENV, { buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  });
  afterAll(() => servidor.close());

  it('nasce sendo escrito com o texto lido, os tipos e as artes; da meta, só os campos de fora', async () => {
    const r = await comecar(marina, {
      id: 'de-fora-1',
      titulo: 'Desafio da Brasa · Chamada de 14/11',
      doc: DOC,
      nArtes: 1,
      origem: 'Desafio_Brasa_14_11.docx',
      // a claquete é proposta no Enviar, o redator é quem escreve e o status é o de rascunho: o que vier deles não vale
      meta: { programa: 'Desafio da Brasa', tipoPrograma: 'auditorio', dataExibicao: '2026-11-14', locutor: 'TIAGO', duracaoAlvoSeg: 30, claquete: 'BRASA 14/11', redator: 'Outra Pessoa', status: 'aprovado', layout: 'instrucoes_texto', revisar: ['x'], capitulo: 'sete' },
    });
    expect(r.status).toBe(201);
    const novo = await r.json();
    expect(novo).toMatchObject({ id: 'de-fora-1', escrito: 'sendo-escrito', publico: true, meu: true, podeEditar: true, origem: 'Desafio_Brasa_14_11.docx' });
    expect(novo.doc).toEqual(DOC);
    expect(novo.meta).toMatchObject({ titulo: 'Desafio da Brasa · Chamada de 14/11', programa: 'Desafio da Brasa', tipoPrograma: 'auditorio', dataExibicao: '2026-11-14', locutor: 'TIAGO', duracaoAlvoSeg: 30 });
    expect(novo.meta).toMatchObject({ claquete: '', redator: 'Marina Teles', status: 'rascunho', layout: 'coluna_unica', capitulo: null });
    expect(novo.meta.revisar).toBeUndefined();
    // na lista de "Roteiros", com as artes contadas
    const lista = await (await marina('/api/roteiros-escritos')).json();
    expect(lista.roteiros.find((x: { id: string }) => x.id === 'de-fora-1')).toMatchObject({ escrito: 'sendo-escrito', nArtes: 1 });
    // e a primeira versão diz de onde veio
    const versoes = await (await marina('/api/roteiros/de-fora-1/versoes')).json();
    expect(versoes.map((v: { motivo: string }) => v.motivo)).toEqual(['começou do arquivo']);
  });

  it('colado: sem origem; a versão diz que começou do colado', async () => {
    const r = await comecar(marina, { id: 'de-fora-2', doc: DOC, meta: {} });
    expect(r.status).toBe(201);
    const novo = await r.json();
    expect(novo.origem).toBeUndefined();
    expect(novo.meta.titulo).toBe('');
    const versoes = await (await marina('/api/roteiros/de-fora-2/versoes')).json();
    expect(versoes.map((v: { motivo: string }) => v.motivo)).toEqual(['começou do colado']);
  });

  it('o original do arquivo fica guardado no roteiro sendo escrito, para baixar de novo', async () => {
    await comecar(marina, { id: 'de-fora-3', doc: DOC, origem: 'Brasa.rtf' });
    const subiu = await marina('/api/roteiros/de-fora-3/original', { method: 'PUT', body: new Uint8Array([7, 8, 9]), headers: { 'content-type': 'application/rtf', 'x-arquivo': encodeURIComponent('Brasa.rtf') } });
    expect(subiu.status).toBe(200);
    const baixado = await marina('/api/roteiros/de-fora-3/original');
    expect([...new Uint8Array(await baixado.arrayBuffer())]).toEqual([7, 8, 9]);
    expect((await (await marina('/api/roteiros/de-fora-3')).json()).original).toMatchObject({ nome: 'Brasa.rtf' });
  });

  it('recusa o texto que não é um documento, e quem não começa roteiro continua sem começar', async () => {
    expect((await comecar(marina, { doc: { type: 'paragraph' } })).status).toBe(400);
    expect((await comecar(marina, { doc: { type: 'doc', content: [] } })).status).toBe(400);
    expect((await comecar(marina, { doc: 'texto' })).status).toBe(400);
    expect((await comecar(caio, { doc: DOC })).status).toBe(403);
  });
});
