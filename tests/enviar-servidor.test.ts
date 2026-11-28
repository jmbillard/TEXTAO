// @vitest-environment node
/* O Enviar do Roteiro escrito no PROMeiro (#194), pelo servidor inteiro (criarApp), com o Trello de mentira (o padrão
   do describe "rotas do envio" de trello.test.ts) e o Teable de mentira dos cadastros: o primeiro Enviar põe a cópia do
   envio na fila, com a foto; o reenvio vira a V2 ou a letra B, substitui a anterior e herda o card; a fila lê o último
   envio, e não o texto vivo; o histórico dos envios; e quem só lê o roteiro sem sala guardada lê o texto. Nomes, e-mails
   e cards inventados. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
import { artesDoEnvio, exportar } from '../src/modelo/exportar';
import type { NoJSON, Roteiro } from '../src/modelo/tipos';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  CADASTRO_ADMINS: 'chefe@empresa.com',
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

const txt = (t: string): NoJSON => ({ type: 'text', text: t });
const arte = (t: string, id: string): NoJSON => ({ type: 'text', text: t, marks: [{ type: 'arte', attrs: { id, subtipo: '' } }] });
const par = (content: NoJSON[], attrs: Record<string, unknown>): NoJSON => ({ type: 'paragraph', attrs, content });
const DOC: NoJSON = {
  type: 'doc',
  content: [
    par([txt('NESTE SÁBADO, '), arte('OITO CHURRASQUEIROS', 'a1'), txt(' NA BRASA.')], { tipo: 'locucao', confirmado: true }),
    // o trecho inteiro do tipo arte, gravado sem a marca (a garantia do Enviar a põe)
    par([txt('AMANHÃ, 22H')], { tipo: 'arte', confirmado: true }),
  ],
};

describe('o Enviar do Roteiro escrito no PROMeiro (#194)', () => {
  let servidor: Server;
  let base = '';
  const recebidos: { artes: (string | { texto: string })[]; meta: { claquete: string } }[] = [];
  const trello = {
    ligado: true,
    parar: async () => {},
    enviar: async (r: (typeof recebidos)[number]) => {
      recebidos.push(r);
      return { card: { id: 'cardBrasa01', url: 'https://trello.com/c/BRASA01' }, avisos: [] };
    },
  };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const marina = como('marina.teles@empresa.com'); // redatora, a autora
  const davi = como('davi.rocha@empresa.com'); // designer: só lê
  type Quem = typeof marina;

  const enviar = (quem: Quem, id: string, corpo: Record<string, unknown>) => quem(`/api/roteiros-escritos/${id}/enviar`, { method: 'POST', body: JSON.stringify(corpo) });
  const ler = async (quem: Quem, id: string) => (await quem(`/api/roteiros/${id}`)).json();
  const fila = async (quem: Quem = davi) => (await (await quem('/api/roteiros')).json()) as (Roteiro & { escritoDe?: string; trello?: { estado: string; url?: string } })[];
  const comecarComTexto = async (id: string, doc: NoJSON = DOC) => {
    expect((await marina('/api/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id, titulo: 'Brasa na Panela 21/11' }) })).status).toBe(201);
    const r = await ler(marina, id);
    // sem a sala (o servidor de teste não abre WebSocket), o PUT salva o texto
    expect((await marina(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify({ roteiro: { ...r, doc }, nArtes: 0 }) })).status).toBe(200);
  };
  const conferida = (claquete = 'BRASA 21/11 (A)') => ({ claquete, programa: 'Brasa na Panela', dataExibicao: '2099-11-21', editor: 'Caio Brandão' });

  beforeAll(async () => {
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, cadastros: criarCadastros(ENV, { buscar }), trello });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  });
  afterAll(() => servidor.close());

  it('o primeiro Enviar põe a cópia do envio na fila, com a foto; o escrito fica enviado, com a claquete', async () => {
    await comecarComTexto('escrito-envio-1');
    // sendo escrito, não está na fila
    expect((await fila()).some((r) => r.id === 'escrito-envio-1')).toBe(false);
    const escrito = await ler(marina, 'escrito-envio-1');

    // quem só lê não envia; sem a claquete, não vai
    expect((await enviar(davi, 'escrito-envio-1', { roteiro: { meta: { ...escrito.meta, ...conferida() }, doc: escrito.doc } })).status).toBe(403);
    expect((await enviar(marina, 'escrito-envio-1', { roteiro: { meta: { ...escrito.meta, claquete: ' ' }, doc: escrito.doc } })).status).toBe(400);

    const r = await enviar(marina, 'escrito-envio-1', { roteiro: { meta: { ...escrito.meta, ...conferida() }, doc: escrito.doc }, copia: 'envio-brasa-1', motivo: 'primeira versão', nArtes: 2 });
    expect(r.status).toBe(201);
    const feito = await r.json();
    expect(feito).toMatchObject({ envio: { n: 2, claquete: 'BRASA 21/11 (A)', letra: 'A', versao: 1 }, cardHerdado: false, substituiu: null });
    expect(feito.escrito).toMatchObject({ escrito: 'enviado', meta: { claquete: 'BRASA 21/11 (A)', programa: 'Brasa na Panela', titulo: 'Brasa na Panela 21/11', status: 'revisao' } });

    // na fila: a cópia, marcada como escrita no PROMeiro, em revisão, com a claquete; o escrito continua fora
    const naFila = await fila();
    expect(naFila.some((x) => x.id === 'escrito-envio-1')).toBe(false);
    expect(naFila.find((x) => x.id === 'envio-brasa-1')).toMatchObject({ escritoDe: 'escrito-envio-1', meta: { claquete: 'BRASA 21/11 (A)', status: 'revisao', editor: 'Caio Brandão', revisar: [] }, nArtes: 2 });
    const copia = await ler(davi, 'envio-brasa-1');
    expect(copia).toMatchObject({ origem: 'escrito no PROMeiro', escritoDe: 'escrito-envio-1' });
    expect(copia.escrito).toBeUndefined();

    // a foto do envio, com o motivo, no histórico do escrito
    const versoes = await (await marina('/api/roteiros/escrito-envio-1/versoes')).json();
    expect(versoes[0]).toMatchObject({ n: 2, motivo: 'enviado: primeira versão', por: { nome: 'Marina Teles' } });
    expect((await (await marina('/api/roteiros/escrito-envio-1/versoes/2')).json()).meta.claquete).toBe('BRASA 21/11 (A)');

    // a aba Enviados da lista de Roteiros
    const lista = await (await marina('/api/roteiros-escritos')).json();
    expect(lista.roteiros.find((x: { id: string }) => x.id === 'escrito-envio-1')).toMatchObject({ escrito: 'enviado' });
    // e o "meus roteiros" do Redator traz o último envio, com o ciclo
    const meus = await (await marina('/api/meus-roteiros?area=redator')).json();
    expect(meus.roteiros.find((x: { id: string }) => x.id === 'envio-brasa-1')).toMatchObject({ escritoDe: 'escrito-envio-1', ciclo: { estado: 'revisao' } });
  });

  it('o trecho inteiro do tipo arte chega à fila e ao Trello; o escrito não vai ao Trello', async () => {
    const copia = (await ler(davi, 'envio-brasa-1')) as Roteiro;
    const artes = artesDoEnvio(exportar(copia), copia.meta);
    expect(artes.map((a) => a.texto)).toEqual(['OITO CHURRASQUEIROS', 'AMANHÃ, 22H']);
    const r = await (await davi('/api/roteiros/envio-brasa-1/trello', { method: 'POST', body: JSON.stringify({ artes, texto: exportar(copia).texto.completo }) })).json();
    expect(r.estado).toBe('enviado');
    expect(recebidos.at(-1)!.artes.map((a) => (typeof a === 'string' ? a : a.texto))).toEqual(['OITO CHURRASQUEIROS', 'AMANHÃ, 22H']);
    expect(recebidos.at(-1)!.meta.claquete).toBe('BRASA 21/11 (A)');
    expect((await marina('/api/roteiros/escrito-envio-1/trello', { method: 'POST', body: '{}' })).status).toBe(409);
  });

  it('a fila lê o último envio, não o texto vivo do escrito', async () => {
    const escrito = await ler(marina, 'escrito-envio-1');
    const vivo: NoJSON = { type: 'doc', content: [...(DOC.content ?? []), par([txt('UM TRECHO NOVO, AINDA NÃO ENVIADO.')], { tipo: 'locucao', confirmado: true })] };
    // a folha salva sem a claquete na meta: ela é do envio e fica
    expect((await marina('/api/roteiros/escrito-envio-1', { method: 'PUT', body: JSON.stringify({ roteiro: { ...escrito, meta: { ...escrito.meta, claquete: '' }, doc: vivo }, nArtes: 0 }) })).status).toBe(200);
    expect((await ler(marina, 'escrito-envio-1')).meta.claquete).toBe('BRASA 21/11 (A)');
    const copia = await ler(davi, 'envio-brasa-1');
    expect(JSON.stringify(copia.doc)).not.toContain('UM TRECHO NOVO');
    expect((await fila()).filter((x) => x.escritoDe === 'escrito-envio-1').map((x) => x.id)).toEqual(['envio-brasa-1']);
  });

  it('o reenvio pergunta da liberação: não liberada, a V2, que substitui a anterior e herda o card', async () => {
    const escrito = await ler(marina, 'escrito-envio-1');
    const corpo = { roteiro: { meta: { ...escrito.meta, ...conferida() }, doc: escrito.doc }, copia: 'envio-brasa-2', motivo: 'o trecho novo' };
    expect((await enviar(marina, 'escrito-envio-1', corpo)).status).toBe(400);
    const feito = await (await enviar(marina, 'escrito-envio-1', { ...corpo, liberada: false })).json();
    expect(feito).toMatchObject({ envio: { letra: 'A', versao: 2 }, cardHerdado: true, substituiu: 'envio-brasa-1' });

    const naFila = (await fila()).filter((x) => x.escritoDe === 'escrito-envio-1');
    expect(naFila.map((x) => x.id)).toEqual(['envio-brasa-2']);
    expect(naFila[0]).toMatchObject({ meta: { versao: 2, substituiu: { letra: 'A', versao: 1, liberada: false } }, trello: { estado: 'enviado', url: 'https://trello.com/c/BRASA01' } });
    expect(JSON.stringify((await ler(davi, 'envio-brasa-2')).doc)).toContain('UM TRECHO NOVO');
    // a anterior saiu da fila, com a lápide que aponta a nova
    const velha = await davi('/api/roteiros/envio-brasa-1');
    expect(velha.status).toBe(410);
    expect(await velha.json()).toMatchObject({ claquete: 'BRASA 21/11 (A)', substituto: 'envio-brasa-2' });
    // a nova já está no Trello (o card herdado): mandar de novo sem pedir é recusado
    expect((await davi('/api/roteiros/envio-brasa-2/trello', { method: 'POST', body: '{}' })).status).toBe(409);
    expect((await ler(marina, 'escrito-envio-1')).meta).toMatchObject({ versao: 2 });
  });

  it('liberada para exibição, o reenvio vira a letra B, de volta à V1', async () => {
    const escrito = await ler(marina, 'escrito-envio-1');
    const feito = await (await enviar(marina, 'escrito-envio-1', { roteiro: { meta: { ...escrito.meta, ...conferida() }, doc: escrito.doc }, copia: 'envio-brasa-3', liberada: true })).json();
    expect(feito).toMatchObject({ envio: { letra: 'B', versao: 1 }, cardHerdado: true, substituiu: 'envio-brasa-2' });
    expect((await ler(marina, 'escrito-envio-1')).meta).toMatchObject({ letra: 'B', versao: 1 });
  });

  it('a anterior que já saiu da fila: a letra e a versão seguem o último envio', async () => {
    expect((await davi('/api/roteiros/envio-brasa-3', { method: 'DELETE' })).status).toBe(200);
    const escrito = await ler(marina, 'escrito-envio-1');
    const feito = await (await enviar(marina, 'escrito-envio-1', { roteiro: { meta: { ...escrito.meta, ...conferida() }, doc: escrito.doc }, copia: 'envio-brasa-4', liberada: false })).json();
    expect(feito).toMatchObject({ envio: { letra: 'B', versao: 2 }, cardHerdado: false, substituiu: null });
  });

  it('o histórico dos envios, do mais novo ao mais velho, com o roteiro da fila e o andamento da arte', async () => {
    const h = await (await davi('/api/roteiros-escritos/escrito-envio-1/envios')).json();
    expect(h.envios.map((e: { letra: string; versao: number }) => `${e.letra}${e.versao}`)).toEqual(['B2', 'B1', 'A2', 'A1']);
    expect(h.envios.at(-1)).toMatchObject({ motivo: 'primeira versão', claquete: 'BRASA 21/11 (A)', por: { nome: 'Marina Teles' } });
    expect(h.fila).toMatchObject({ id: 'envio-brasa-4', claquete: 'BRASA 21/11 (A)', designers: [] });
    expect(h.fila.andamento.map((p: { id: string; situacao: string }) => `${p.id}:${p.situacao}`)).toEqual(['entrada:depois', 'produzindo:depois', 'entregue:depois']);
    // o roteiro de fora não tem Enviar
    await marina('/api/roteiros/de-fora-01', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'OUTRA 2/12' }, doc: { type: 'doc', content: [] } }, nArtes: 0 }) });
    expect((await enviar(marina, 'de-fora-01', { roteiro: { meta: { claquete: 'X' }, doc: { type: 'doc', content: [] } } })).status).toBe(409);
  });

  it('quem só lê o roteiro escrito sem sala guardada lê o texto guardado, sem esperar quem escreve', async () => {
    await comecarComTexto('escrito-sem-sala');
    const lido = await ler(davi, 'escrito-sem-sala');
    expect(lido).toMatchObject({ semSala: true, podeEditar: false });
    expect(JSON.stringify(lido.doc)).toContain('OITO CHURRASQUEIROS');
    // quem escreve preenche a sala, como antes (a vez de preencher é dela)
    expect((await ler(marina, 'escrito-sem-sala')).semSala).toBeUndefined();
  });
});
