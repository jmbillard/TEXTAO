// @vitest-environment node
/* A revisão que volta como sugestão (#196), pelo servidor inteiro (criarApp): o designer, na cópia da fila de um Roteiro
   escrito no PROMeiro, sugere; a sugestão chega ao escrito com autor e hora e o aviso da bolinha (#192) para a autora;
   ela aceita ou recusa (e desfaz), só quem escreve decide; a mudança desfeita sai, a decidida volta como decidida; o
   próximo Enviar leva o aceito; o roteiro de fora não é afetado. Com o Teable de mentira dos cadastros; nomes, e-mails
   e claquetes inventados. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
import type { Comentario } from '../src/modelo/comentarios';
import type { NoJSON } from '../src/modelo/tipos';

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
  tblEdi: [],
  tblKeyRed: [],
  tblKeyEdi: [],
};
const buscar = async (url: string) => {
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
};

const par = (t: string): NoJSON => ({ type: 'paragraph', attrs: { tipo: 'locucao', confirmado: true }, content: [{ type: 'text', text: t }] });
const DOC: NoJSON = { type: 'doc', content: [par('NESTE SÁBADO, OITO CHURASQUEIROS NA BRASA.'), par('AMANHÃ, 22H.')] };
const ANCORA = { trecho: 'CHURASQUEIROS', antes: 'NESTE SÁBADO, OITO ', depois: ' NA BRASA.\nAMANHÃ, 22H.', pos: 19 };
const ANCORA_HORA = { trecho: '22H.', antes: 'CHURASQUEIROS NA BRASA.\nAMANHÃ, ', depois: '', pos: 51 };

describe('a revisão que volta como sugestão (#196)', () => {
  let servidor: Server;
  let base = '';
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const marina = como('marina.teles@empresa.com'); // redatora, a autora do escrito
  const davi = como('davi.rocha@empresa.com'); // designer: revisa a cópia na fila
  const lia = como('lia.souza@empresa.com'); // outra designer
  type Quem = typeof marina;

  const ler = async (quem: Quem, id: string) => (await quem(`/api/roteiros/${id}`)).json();
  const sugerir = (quem: Quem, copia: string, lote: string, sugestoes: unknown[]) => quem(`/api/roteiros/${copia}/sugestoes`, { method: 'POST', body: JSON.stringify({ lote, sugestoes }) });
  const lerComentarios = async (quem: Quem, id: string) => (await (await quem(`/api/roteiros/${id}/comentarios`)).json()) as { comentarios: (Comentario & { criadoEm: string })[]; novos: Record<string, string> };
  const decidir = (quem: Quem, id: string, cid: string, acao: string) => quem(`/api/roteiros/${id}/comentarios/${cid}/${acao}`, { method: 'POST' });
  const avisos = async (quem: Quem) => ((await (await quem('/api/avisos')).json()) as { roteiros: Record<string, { n: number }> }).roteiros;

  /** Um escrito com o texto, enviado à fila como `copia`. */
  async function escritoNaFila(id: string, copia: string) {
    expect((await marina('/api/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id, titulo: 'Brasa na Panela 21/11' }) })).status).toBe(201);
    const r = await ler(marina, id);
    expect((await marina(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify({ roteiro: { ...r, doc: DOC }, nArtes: 0 }) })).status).toBe(200);
    const meta = { ...r.meta, claquete: 'BRASA 21/11 (A)', programa: 'Brasa na Panela', dataExibicao: '2099-11-21' };
    expect((await marina(`/api/roteiros-escritos/${id}/enviar`, { method: 'POST', body: JSON.stringify({ roteiro: { meta, doc: DOC }, copia }) })).status).toBe(201);
  }

  beforeAll(async () => {
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, cadastros: criarCadastros(ENV, { buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  });
  afterAll(() => servidor.close());

  it('a mudança na cópia da fila chega ao escrito como sugestão, com autor e hora, e o aviso da autora', async () => {
    await escritoNaFila('sug-escrito-1', 'sug-copia-1');
    const r = await sugerir(davi, 'sug-copia-1', 'lote-davi-1', [{ id: 'sug-churras-1', ancora: ANCORA, texto: 'CHURRASQUEIROS' }]);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ decididas: [], escrito: 'sug-escrito-1' });
    const { comentarios, novos } = await lerComentarios(marina, 'sug-escrito-1');
    expect(comentarios).toHaveLength(1);
    expect(comentarios[0]).toMatchObject({ id: 'sug-churras-1', fio: null, autor: { nome: 'Davi Rocha', email: 'davi.rocha@empresa.com' }, ancora: ANCORA, resolvido: null, sugestao: { texto: 'CHURRASQUEIROS', decisao: null } });
    expect(Number.isNaN(Date.parse(comentarios[0].criadoEm))).toBe(false);
    expect(novos).toEqual({ 'sug-churras-1': 'no-seu' });
    // a bolinha em "Roteiros", para a autora; quem sugeriu não ganha aviso
    expect(await avisos(marina)).toMatchObject({ 'sug-escrito-1': { n: 1 } });
    expect(await avisos(davi)).toEqual({});

    // continuando a digitar no mesmo trecho: a mesma sugestão muda no lugar, sem aviso novo
    await sugerir(davi, 'sug-copia-1', 'lote-davi-1', [{ id: 'sug-churras-1', ancora: ANCORA, texto: 'CHURRASQUEIROS!' }]);
    const depois = await lerComentarios(marina, 'sug-escrito-1');
    expect(depois.comentarios.map((c) => c.sugestao?.texto)).toEqual(['CHURRASQUEIROS!']);
    expect((await avisos(marina))['sug-escrito-1'].n).toBe(1);
  });

  it('só quem escreve aceita ou recusa; o aceito volta como decidido para quem sugeriu; o desfazer reabre', async () => {
    await sugerir(davi, 'sug-copia-1', 'lote-davi-1', [
      { id: 'sug-churras-1', ancora: ANCORA, texto: 'CHURRASQUEIROS' },
      { id: 'sug-hora-1', ancora: ANCORA_HORA, texto: '23H.' },
    ]);
    expect((await decidir(davi, 'sug-escrito-1', 'sug-churras-1', 'aceitar')).status).toBe(403);
    // a sugestão não se "resolve" como comentário
    expect((await decidir(marina, 'sug-escrito-1', 'sug-churras-1', 'resolver')).status).toBe(400);
    const aceita = await decidir(marina, 'sug-escrito-1', 'sug-churras-1', 'aceitar');
    expect(aceita.status).toBe(200);
    expect((await aceita.json()).comentario).toMatchObject({ sugestao: { texto: 'CHURRASQUEIROS', decisao: 'aceita' }, resolvido: { por: { email: 'marina.teles@empresa.com' } } });
    expect((await decidir(marina, 'sug-escrito-1', 'sug-churras-1', 'recusar')).status).toBe(409);
    const recusada = await (await decidir(marina, 'sug-escrito-1', 'sug-hora-1', 'recusar')).json();
    expect(recusada.comentario.sugestao.decisao).toBe('recusada');

    // quem sugeriu manda de novo o que tem: as decididas voltam como decididas e não mudam
    const r = await (await sugerir(davi, 'sug-copia-1', 'lote-davi-1', [
      { id: 'sug-churras-1', ancora: ANCORA, texto: 'OUTRA COISA' },
      { id: 'sug-hora-1', ancora: ANCORA_HORA, texto: '23H.' },
    ])).json();
    expect(r.decididas.sort()).toEqual(['sug-churras-1', 'sug-hora-1']);
    expect((await lerComentarios(marina, 'sug-escrito-1')).comentarios.find((c) => c.id === 'sug-churras-1')?.sugestao?.texto).toBe('CHURRASQUEIROS');

    // o desfazer da recusa: a sugestão volta aberta
    expect((await decidir(davi, 'sug-escrito-1', 'sug-hora-1', 'reabrir')).status).toBe(403);
    const reaberta = await (await decidir(marina, 'sug-escrito-1', 'sug-hora-1', 'reabrir')).json();
    expect(reaberta.comentario).toMatchObject({ resolvido: null, sugestao: { decisao: null } });
  });

  it('a mudança desfeita sai do escrito (a não ser que já tenha resposta); outra pessoa não mexe na de ninguém', async () => {
    await escritoNaFila('sug-escrito-2', 'sug-copia-2');
    await sugerir(davi, 'sug-copia-2', 'lote-davi-2', [
      { id: 'sug-a-2', ancora: ANCORA, texto: 'CHURRASQUEIROS' },
      { id: 'sug-b-2', ancora: ANCORA_HORA, texto: '23H.' },
    ]);
    // a Marina responde a segunda
    expect((await marina('/api/roteiros/sug-escrito-2/comentarios', { method: 'POST', body: JSON.stringify({ texto: 'Por quê?', fio: 'sug-b-2' }) })).status).toBe(201);
    // a Lia, com o mesmo id, não muda a sugestão do Davi
    await sugerir(lia, 'sug-copia-2', 'lote-lia-2', [{ id: 'sug-a-2', ancora: ANCORA, texto: 'DA LIA' }]);
    // o Davi desfaz as duas: a primeira sai; a com resposta fica
    await sugerir(davi, 'sug-copia-2', 'lote-davi-2', []);
    const { comentarios } = await lerComentarios(marina, 'sug-escrito-2');
    expect(comentarios.filter((c) => !c.fio).map((c) => [c.id, c.sugestao?.texto])).toEqual([['sug-b-2', '23H.']]);
    expect(await avisos(marina)).toMatchObject({ 'sug-escrito-2': { n: 1 } });
  });

  it('o próximo Enviar leva o aceito (o texto do escrito), e a cópia da fila já guardava a mudança', async () => {
    const escrito = await ler(marina, 'sug-escrito-1');
    // a folha da redatora aplicou a aceita no texto dela e salvou
    const aceito: NoJSON = { type: 'doc', content: [par('NESTE SÁBADO, OITO CHURRASQUEIROS NA BRASA.'), par('AMANHÃ, 22H.')] };
    expect((await marina('/api/roteiros/sug-escrito-1', { method: 'PUT', body: JSON.stringify({ roteiro: { ...escrito, doc: aceito }, nArtes: 0 }) })).status).toBe(200);
    const meta = { ...escrito.meta, claquete: 'BRASA 21/11 (A)' };
    const r = await marina('/api/roteiros-escritos/sug-escrito-1/enviar', { method: 'POST', body: JSON.stringify({ roteiro: { meta, doc: aceito }, copia: 'sug-copia-1b', liberada: false }) });
    expect(r.status).toBe(201);
    const copia = await ler(davi, 'sug-copia-1b');
    expect(JSON.stringify(copia.doc)).toContain('OITO CHURRASQUEIROS NA BRASA');
    expect(JSON.stringify(copia.doc)).toContain('22H.');
    // as sugestões continuam no escrito, decididas: a cópia nova sugere de novo, ao mesmo escrito
    expect((await sugerir(davi, 'sug-copia-1b', 'lote-davi-3', [{ id: 'sug-nova-3', ancora: ANCORA_HORA, texto: '22H30.' }])).status).toBe(200);
    expect((await lerComentarios(marina, 'sug-escrito-1')).comentarios.some((c) => c.id === 'sug-nova-3')).toBe(true);
  });

  it('o roteiro de fora não é afetado; o escrito não recebe sugestão de si mesmo; o pedido torto é recusado', async () => {
    expect((await marina('/api/roteiros/sug-de-fora', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'FESTA 19/11' }, doc: DOC }, nArtes: 0 }) })).status).toBe(200);
    expect((await sugerir(davi, 'sug-de-fora', 'lote-fora-1', [{ id: 'sug-fora-1', ancora: ANCORA, texto: 'X' }])).status).toBe(409);
    expect((await sugerir(davi, 'sug-escrito-2', 'lote-esc-1', [])).status).toBe(400);
    expect((await sugerir(davi, 'sug-copia-2', 'curto', [])).status).toBe(400);
    expect((await sugerir(davi, 'sug-copia-2', 'lote-davi-2', [{ id: 'sug-c-2', ancora: { trecho: '' }, texto: 'X' }])).status).toBe(400);
    expect((await sugerir(davi, 'sug-copia-2', 'lote-davi-2', [{ id: 'sug-c-2', ancora: ANCORA, texto: 'X'.repeat(3000) }])).status).toBe(400);
    expect((await davi('/api/roteiros/sug-copia-2/sugestoes')).status).toBe(405);
    // um comentário comum não se aceita
    const c = await (await marina('/api/roteiros/sug-escrito-2/comentarios', { method: 'POST', body: JSON.stringify({ texto: 'Um comentário.', ancora: ANCORA }) })).json();
    expect((await decidir(marina, 'sug-escrito-2', c.comentario.id, 'aceitar')).status).toBe(400);
  });
});
