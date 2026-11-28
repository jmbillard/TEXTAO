// @vitest-environment node
/* Os comentários do Roteiro escrito no PROMeiro (#192), pelo servidor inteiro (criarApp): comentar quem só lê,
   responder, resolver e desfazer, a menção @nome com o aviso (a bolinha) que some ao ver, a âncora refeita por quem
   escreve e o aviso ao vivo pela fila. Com o Teable de mentira dos cadastros; nomes e e-mails inventados. */
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
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
  CADASTRO_ADMINS: 'chefe@empresa.com',
};
const TABELAS: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
  tblRed: [
    { id: 'recR1', fields: { redator: 'Marina Teles', email: 'marina.teles@empresa.com' } },
    { id: 'recR2', fields: { redator: 'Júlio Pires', email: 'julio.pires@empresa.com' } },
  ],
  tblEdi: [{ id: 'recE1', fields: { editor: 'Caio Brandão', email: 'caio.brandao@empresa.com' } }],
  tblKeyRed: [],
  tblKeyEdi: [],
};
const buscar = async (url: string) => {
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: TABELAS[tabela] }), text: async () => '' };
};

const ANCORA = { trecho: 'UM SÓ TÍTULO', antes: 'OITO CHURRASQUEIROS. ', depois: '.', pos: 21 };
interface Comentario {
  id: string;
  fio: string | null;
  autor: { nome: string; email: string };
  papel: string;
  texto: string;
  ancora: typeof ANCORA | null;
  resolvido: { por: { email: string } } | null;
}

describe('os comentários do Roteiro escrito (#192)', () => {
  let servidor: Server;
  let base = '';
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const marina = como('marina.teles@empresa.com'); // redatora, a autora
  const julio = como('julio.pires@empresa.com'); // outro redator
  const caio = como('caio.brandao@empresa.com'); // editor
  const davi = como('davi.rocha@empresa.com'); // designer, sem cadastro
  const bia = como('bia.coord@empresa.com'); // coordenação
  const chefe = como('chefe@empresa.com');
  type Quem = typeof marina;

  const comecar = (quem: Quem, id: string) => quem('/api/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id, titulo: 'Desafio da Brasa' }) });
  const comentar = (quem: Quem, id: string, corpo: Record<string, unknown>) => quem(`/api/roteiros/${id}/comentarios`, { method: 'POST', body: JSON.stringify(corpo) });
  const lerComentarios = async (quem: Quem, id: string) => (await (await quem(`/api/roteiros/${id}/comentarios`)).json()) as { comentarios: Comentario[]; novos: Record<string, string>; pessoas: { nome: string; email: string }[]; escreve: boolean };
  const avisos = async (quem: Quem) => ((await (await quem('/api/avisos')).json()) as { roteiros: Record<string, { n: number; mencao: boolean }> }).roteiros;

  beforeAll(async () => {
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, cadastros: criarCadastros(ENV, { buscar }) });
    servidor = createServer(app);
    servidor.on('upgrade', app.upgrade);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    expect((await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) })).status).toBe(200);
  });
  afterAll(() => servidor.close());

  it('quem só lê comenta o trecho; o balão traz autor, papel e hora; responder e o fio', async () => {
    await comecar(marina, 'coment-fio-1');
    const r = await comentar(davi, 'coment-fio-1', { texto: '  Dá para tirar “Um só título”? ', ancora: ANCORA });
    expect(r.status).toBe(201);
    const { comentario } = (await r.json()) as { comentario: Comentario & { criadoEm: string } };
    expect(comentario).toMatchObject({ fio: null, autor: { email: 'davi.rocha@empresa.com' }, papel: 'equipe', texto: 'Dá para tirar “Um só título”?', ancora: ANCORA, resolvido: null });
    expect(Number.isNaN(Date.parse(comentario.criadoEm))).toBe(false);
    // a resposta da autora, no mesmo fio; o papel vem do cadastro
    const resp = (await (await comentar(marina, 'coment-fio-1', { texto: 'Deixo por ora.', fio: comentario.id })).json()) as { comentario: Comentario };
    expect(resp.comentario).toMatchObject({ fio: comentario.id, papel: 'redação', ancora: null });
    expect((await (await comentar(caio, 'coment-fio-1', { texto: 'Pela edição, tudo bem.', fio: comentario.id })).json()).comentario.papel).toBe('edição');
    expect((await (await comentar(bia, 'coment-fio-1', { texto: 'Concordo.', fio: comentario.id })).json()).comentario.papel).toBe('coordenação');
    const lido = await lerComentarios(julio, 'coment-fio-1');
    expect(lido.comentarios.map((c) => c.texto)).toEqual(['Dá para tirar “Um só título”?', 'Deixo por ora.', 'Pela edição, tudo bem.', 'Concordo.']);
    expect(lido.escreve).toBe(false);
    expect((await lerComentarios(marina, 'coment-fio-1')).escreve).toBe(true);
    // quem o @ acha: os dos cadastros e quem já entrou
    expect(lido.pessoas.map((p) => p.nome)).toEqual(expect.arrayContaining(['Marina Teles', 'Júlio Pires', 'Caio Brandão']));
  });

  it('recusa o comentário vazio, sem trecho, a resposta a quem não existe e a resposta da resposta', async () => {
    await comecar(marina, 'coment-recusa-1');
    expect((await comentar(davi, 'coment-recusa-1', { texto: '   ', ancora: ANCORA })).status).toBe(400);
    expect((await comentar(davi, 'coment-recusa-1', { texto: 'oi', ancora: { trecho: '' } })).status).toBe(400);
    expect((await comentar(davi, 'coment-recusa-1', { texto: 'oi', fio: 'nao-existe-1' })).status).toBe(404);
    const c = (await (await comentar(davi, 'coment-recusa-1', { texto: 'oi', ancora: ANCORA })).json()).comentario as Comentario;
    const r = (await (await comentar(davi, 'coment-recusa-1', { texto: 'resposta', fio: c.id })).json()).comentario as Comentario;
    expect((await comentar(davi, 'coment-recusa-1', { texto: 'da resposta', fio: r.id })).status).toBe(404);
  });

  it('fechado: só quem lê comenta; quem não lê nem vê os comentários', async () => {
    await comecar(marina, 'coment-fechado-1');
    const atual = await (await marina('/api/roteiros/coment-fechado-1')).json();
    await marina('/api/roteiros/coment-fechado-1', { method: 'PUT', body: JSON.stringify({ roteiro: { ...atual, publico: false, compartilhadoCom: [{ email: 'davi.rocha@empresa.com', editar: false }] }, nArtes: 0 }) });
    expect((await comentar(davi, 'coment-fechado-1', { texto: 'convidado comenta', ancora: ANCORA })).status).toBe(201);
    for (const quem of [caio, bia, julio]) {
      expect((await comentar(quem, 'coment-fechado-1', { texto: 'não', ancora: ANCORA })).status).toBe(404);
      expect((await quem('/api/roteiros/coment-fechado-1/comentarios')).status).toBe(404);
    }
  });

  it('o roteiro que chegou de fora não tem estes comentários (a etiqueta `comentario` continua no texto)', async () => {
    await davi('/api/roteiros/de-fora-coment', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'CHEF(FUT) 3/12 SP' }, doc: { type: 'doc', content: [] } }, nArtes: 0 }) });
    expect((await comentar(davi, 'de-fora-coment', { texto: 'oi', ancora: ANCORA })).status).toBe(404);
  });

  it('resolver e desfazer: quem comentou e quem escreve; os outros, não', async () => {
    await comecar(marina, 'coment-resolver-1');
    const c = (await (await comentar(davi, 'coment-resolver-1', { texto: 'troca a arte 2?', ancora: ANCORA })).json()).comentario as Comentario;
    const resolver = (quem: Quem, acao = 'resolver') => quem(`/api/roteiros/coment-resolver-1/comentarios/${c.id}/${acao}`, { method: 'POST' });
    expect((await resolver(caio)).status).toBe(403);
    const r = await resolver(marina);
    expect(r.status).toBe(200);
    expect((await r.json()).comentario.resolvido.por.email).toBe('marina.teles@empresa.com');
    // o desfazer reabre
    expect((await (await resolver(marina, 'reabrir')).json()).comentario.resolvido).toBeNull();
    // quem comentou também resolve; a coordenação, que escreve, também
    expect((await resolver(davi)).status).toBe(200);
    expect((await resolver(bia, 'reabrir')).status).toBe(200);
    expect((await davi(`/api/roteiros/coment-resolver-1/comentarios/${c.id}/resolver`)).status).toBe(405);
  });

  it('@nome avisa a pessoa citada e o redator ganha o aviso do comentário no roteiro dele; some quando vê', async () => {
    await comecar(marina, 'coment-aviso-1');
    expect(await avisos(marina)).not.toHaveProperty('coment-aviso-1');
    const c = (await (await comentar(davi, 'coment-aviso-1', { texto: '@Júlio Pires e @caio, olhem isso', ancora: ANCORA })).json()).comentario as Comentario;
    expect((await avisos(julio))['coment-aviso-1']).toEqual({ n: 1, mencao: true });
    expect((await avisos(caio))['coment-aviso-1']).toEqual({ n: 1, mencao: true });
    expect((await avisos(marina))['coment-aviso-1']).toEqual({ n: 1, mencao: false });
    // quem escreveu não se avisa
    expect(await avisos(davi)).not.toHaveProperty('coment-aviso-1');
    // a lista de "Roteiros" leva a bolinha
    const lista = (await (await julio('/api/roteiros-escritos')).json()).roteiros as { id: string; avisos?: { n: number } }[];
    expect(lista.find((r) => r.id === 'coment-aviso-1')?.avisos).toEqual({ n: 1, mencao: true });
    // no roteiro, o comentário vem marcado como novo para quem foi avisado
    expect((await lerComentarios(julio, 'coment-aviso-1')).novos).toEqual({ [c.id]: 'mencao' });
    // viu: some
    expect((await (await julio('/api/roteiros/coment-aviso-1/comentarios/visto', { method: 'POST' })).json()).vistos).toBe(1);
    expect(await avisos(julio)).not.toHaveProperty('coment-aviso-1');
    expect((await lerComentarios(julio, 'coment-aviso-1')).novos).toEqual({});
    // os outros continuam com a deles
    expect((await avisos(marina))['coment-aviso-1']).toEqual({ n: 1, mencao: false });
    // a resposta da autora avisa só quem ela citar
    await comentar(marina, 'coment-aviso-1', { texto: 'Ok, @Davi?', fio: c.id });
    expect(await avisos(julio)).not.toHaveProperty('coment-aviso-1');
  });

  it('o citado que não lê o roteiro fechado não ganha aviso', async () => {
    await comecar(marina, 'coment-aviso-fechado');
    const atual = await (await marina('/api/roteiros/coment-aviso-fechado')).json();
    await marina('/api/roteiros/coment-aviso-fechado', { method: 'PUT', body: JSON.stringify({ roteiro: { ...atual, publico: false, compartilhadoCom: [] }, nArtes: 0 }) });
    await comentar(marina, 'coment-aviso-fechado', { texto: '@Júlio Pires, depois te mostro', ancora: ANCORA });
    expect(await avisos(julio)).not.toHaveProperty('coment-aviso-fechado');
  });

  it('a âncora: quem escreve refaz (o trecho mudou); quem só lê, não', async () => {
    await comecar(marina, 'coment-ancora-1');
    const c = (await (await comentar(davi, 'coment-ancora-1', { texto: 'isso', ancora: ANCORA })).json()).comentario as Comentario;
    const nova = { trecho: 'UM TÍTULO SÓ', antes: 'DOZE CHURRASQUEIROS. ', depois: '!', pos: 40 };
    expect((await davi('/api/roteiros/coment-ancora-1/comentarios/ancoras', { method: 'POST', body: JSON.stringify({ ancoras: { [c.id]: nova } }) })).status).toBe(403);
    const r = await marina('/api/roteiros/coment-ancora-1/comentarios/ancoras', { method: 'POST', body: JSON.stringify({ ancoras: { [c.id]: nova, outro: { trecho: '' } } }) });
    expect((await r.json()).mudadas).toBe(1);
    expect((await lerComentarios(davi, 'coment-ancora-1')).comentarios[0].ancora).toEqual(nova);
  });

  it('ao vivo: quem escuta só os comentários recebe o aviso, sem virar presença na fila', async () => {
    await comecar(marina, 'coment-vivo-1');
    const escutar = (email: string, so: boolean) =>
      new Promise<{ ws: WebSocket; recebidos: { tipo: string; id?: string; pessoas?: unknown[] }[] }>((ok, erro) => {
        const ws = new WebSocket(base.replace('http', 'ws') + `/api/eventos${so ? '?so=comentarios' : ''}`, { headers: { 'cf-access-authenticated-user-email': email } });
        const recebidos: { tipo: string; id?: string }[] = [];
        ws.on('message', (m) => recebidos.push(JSON.parse(String(m))));
        ws.on('open', () => ok({ ws, recebidos }));
        ws.on('error', erro);
      });
    const naFila = await escutar('julio.pires@empresa.com', false);
    const soComentarios = await escutar('marina.teles@empresa.com', true);
    await new Promise((r) => setTimeout(r, 100));
    // a presença da fila não conta quem só escuta os comentários
    const presenca = naFila.recebidos.filter((e) => e.tipo === 'presenca').at(-1);
    expect(JSON.stringify(presenca?.pessoas)).not.toContain('marina');
    await comentar(davi, 'coment-vivo-1', { texto: 'ao vivo', ancora: ANCORA });
    await new Promise((r) => setTimeout(r, 150));
    expect(soComentarios.recebidos).toContainEqual({ tipo: 'comentarios', id: 'coment-vivo-1', por: 'davi.rocha@empresa.com' });
    expect(soComentarios.recebidos.every((e) => e.tipo === 'comentarios' || e.tipo === 'avisos')).toBe(true);
    // a fila não recebe os comentários (nada nela muda com eles)
    expect(naFila.recebidos.some((e) => e.tipo === 'comentarios')).toBe(false);
    naFila.ws.close();
    soComentarios.ws.close();
  });
});
