// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
import type { NoJSON } from '../src/modelo/tipos';

/* A edição abre o roteiro escrito no PROMeiro pela Pauta (#197), pelo servidor inteiro (criarApp), com o Teable de
   mentira: a Produção da claquete (ligada à cópia do envio na fila, `producoes.roteiro_id`) leva a Pauta ao escrito
   (`escrito_de`); o último envio abre para ler, e não o texto vivo; o reenvio troca o envio que a Pauta abre (a cópia
   nova herda o card); quem lê o envio comenta no escrito; o roteiro fechado ainda abre o envio, sem os comentários; o
   que nunca foi enviado e o que chegou de fora não abrem. Nada vai ao Trello. Nomes, e-mails e ids inventados. */

const DIA = 86_400_000;
const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
const registro = (id: string, fields: Record<string, unknown>) => ({ id, fields });
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg', designers: 'designers_pg', atracoes: 'atracoes_pg', redatores: 'redatores_pg', EDICAO_producao: 'pauta_pg' };
const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const producao = () => [
  registro('recSn1', { card_ID: card(51), claquete: 'Novela Sinfonia 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', artes: 'HOJE', data_entrada: ha(1), __last_modified_time: ha(1) }),
  registro('recCz1', { card_ID: card(52), claquete: 'Cozinha de Vó 20/12 SP', status: '["PRODUZINDO"]', designers: null, artes: 'VINHETA', data_entrada: ha(1), __last_modified_time: ha(1) }),
];
const naPauta = (id: string, claquete: string) =>
  registro(id, { claquete, key: claquete.toUpperCase(), editor: { id: 'recEdEva', title: 'Eva Manhã' }, data: new Date(`${HOJE}T00:00:00-03:00`).toISOString(), expediente_inicio: new Date(`${HOJE}T06:00:00-03:00`).toISOString(), expediente_fim: new Date(`${HOJE}T15:00:00-03:00`).toISOString(), anotacao: null, alterado_em: ha(0) });

const txt = (t: string): NoJSON => ({ type: 'text', text: t });
const par = (t: string, tipo: string): NoJSON => ({ type: 'paragraph', attrs: { tipo, confirmado: true }, content: [txt(t)] });
const doc = (...content: NoJSON[]): NoJSON => ({ type: 'doc', content });
const ENVIADO = doc(par('NESTE SÁBADO, A SINFONIA DA CIDADE.', 'locucao'), par('Abrir no 00:12:41:08, \\\\servidor\\promo\\sinfonia\\abertura.mov', 'edicao'));
const VIVO = doc(par('TEXTO NOVO, AINDA NÃO ENVIADO.', 'locucao'));

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function preparado() {
  const db = abrirBanco(':memory:');
  const teable = teableFalso(NOMES, {
    registros: {
      ARTE_producao: producao(),
      exibicoes: [],
      designers: [registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana@empresa.com', designer_ID: 'membroAna', status: 'ativo' })],
      atracoes: [],
      redatores: [registro('recRedRita', { redator: 'Rita Lemos', email: 'rita@empresa.com' })],
      EDICAO_producao: [naPauta('recPtSinfonia', 'Novela Sinfonia 20/12'), naPauta('recPtCozinha', 'Cozinha de Vó 20/12')],
    },
  });
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg, cadastros: (env: Record<string, string>) => criarCadastros(env, { buscar: teable }) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  await app.tabelasProntas;
  await app.releituraPronta;
  await app.pessoasProntas;
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const rita = como('rita@empresa.com'); // a redatora, a autora
  const eva = como('eva.manha@empresa.com'); // da edição: só lê e comenta
  type Quem = typeof rita;
  const idDa = (inicio: string) => (db.prepare('SELECT id FROM producoes WHERE claquete LIKE ?').get(`${inicio}%`) as { id: string }).id;
  const salvar = async (id: string, mudar: Record<string, unknown>) => {
    const r = await (await rita(`/api/roteiros/${id}`)).json();
    expect((await rita(`/api/roteiros/${id}`, { method: 'PUT', body: JSON.stringify({ roteiro: { ...r, ...mudar }, nArtes: 0 }) })).status).toBe(200);
  };
  const enviar = async (id: string, copia: string, corpo: Record<string, unknown> = {}) => {
    const r = await (await rita(`/api/roteiros/${id}`)).json();
    const feito = await rita(`/api/roteiros-escritos/${id}/enviar`, { method: 'POST', body: JSON.stringify({ roteiro: { meta: { ...r.meta, claquete: 'Novela Sinfonia 20/12 SP', programa: 'Sinfonia' }, doc: r.doc }, copia, ...corpo }) });
    expect(feito.status).toBe(201);
    return feito.json();
  };
  /** O roteiro escrito, enviado uma vez com ENVIADO, a cópia ligada à Produção da Sinfonia (e ao card dela). */
  const escritoEnviado = async () => {
    expect((await rita('/api/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id: 'escrito-sinfonia', titulo: 'Sinfonia da cidade' }) })).status).toBe(201);
    await salvar('escrito-sinfonia', { doc: ENVIADO });
    await enviar('escrito-sinfonia', 'envio-sinfonia-1', { motivo: 'primeira' });
    db.prepare('UPDATE producoes SET roteiro_id = ? WHERE id = ?').run('envio-sinfonia-1', idDa('Novela Sinfonia'));
    db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, url, em) VALUES ('envio-sinfonia-1', 'enviado', ?, 'https://trello.com/c/SINF0001', ?)").run(card(51), ha(0));
  };
  type Linha = { id: string; producoes?: { id: string; escrito?: string }[] };
  const naPautaDe = async (quem: Quem = eva) => {
    const dia = ((await (await quem(`/api/pauta/dia?dia=${HOJE}`)).json()) as { linhas: Linha[] }).linhas;
    const semana = ((await (await quem(`/api/pauta/semana?inicio=${HOJE}`)).json()) as { linhas: Linha[] }).linhas;
    return { dia: (id: string) => dia.find((l) => l.id === id)!, semana: (id: string) => semana.find((l) => l.id === id)! };
  };
  const ultimo = (quem: Quem, id = 'escrito-sinfonia') => quem(`/api/roteiros-escritos/${id}/ultimo-envio`);
  return { db, rita, eva, salvar, enviar, escritoEnviado, naPautaDe, ultimo, idDa };
}

describe('a edição abre o roteiro escrito pela Pauta (#197)', () => {
  it('a Produção da claquete leva ao escrito: a Pauta (Dia e Semana) traz o id dele; a sem roteiro escrito, não', async () => {
    const { escritoEnviado, naPautaDe, idDa } = await preparado();
    await escritoEnviado();
    const { dia, semana } = await naPautaDe();
    for (const p of [dia, semana]) {
      expect(p('recPtSinfonia').producoes).toEqual([expect.objectContaining({ id: idDa('Novela Sinfonia'), escrito: 'escrito-sinfonia' })]);
      expect(p('recPtCozinha').producoes?.[0]).not.toHaveProperty('escrito');
    }
  });

  it('abre o último envio, e não o texto vivo: a foto do envio, com a claquete, a letra e a versão, para quem lê', async () => {
    const { escritoEnviado, salvar, ultimo, eva, rita } = await preparado();
    await escritoEnviado();
    // a redatora continua escrevendo depois do Enviar: a edição não vê
    await salvar('escrito-sinfonia', { doc: VIVO });
    const r = await ultimo(eva);
    expect(r.status).toBe(200);
    const lido = await r.json();
    expect(lido).toMatchObject({ envio: { n: 2, claquete: 'Novela Sinfonia 20/12 SP', letra: 'A', versao: 1, motivo: 'primeira', por: { email: 'rita@empresa.com' } }, comenta: true, escreve: false });
    expect(lido.roteiro).toMatchObject({ id: 'escrito-sinfonia', escrito: 'enviado', meta: { claquete: 'Novela Sinfonia 20/12 SP', titulo: 'Sinfonia da cidade' }, criadoPor: { email: 'rita@empresa.com' } });
    const textos = (lido.roteiro.doc.content as NoJSON[]).map((p) => p.content?.map((x) => x.text).join(''));
    expect(textos).toEqual(['NESTE SÁBADO, A SINFONIA DA CIDADE.', 'Abrir no 00:12:41:08, \\\\servidor\\promo\\sinfonia\\abertura.mov']);
    // os tipos dos trechos vão junto (são eles que montam as colunas)
    expect((lido.roteiro.doc.content as NoJSON[]).map((p) => p.attrs?.tipo)).toEqual(['locucao', 'edicao']);
    // a autora também lê o envio, e escreve no roteiro
    expect(await (await ultimo(rita)).json()).toMatchObject({ envio: { n: 2 }, escreve: true, comenta: true });
  });

  it('o reenvio troca o envio que a Pauta abre: a cópia nova herda o card, e a Pauta continua levando ao escrito', async () => {
    const { escritoEnviado, salvar, enviar, ultimo, naPautaDe, eva, rita } = await preparado();
    await escritoEnviado();
    await salvar('escrito-sinfonia', { doc: VIVO });
    await enviar('escrito-sinfonia', 'envio-sinfonia-2', { liberada: false, motivo: 'texto novo' });
    // a cópia anterior saiu da fila: a Produção perde o roteiro até a próxima carga, e o card leva à cópia nova
    expect((await naPautaDe()).dia('recPtSinfonia').producoes?.[0]).toMatchObject({ escrito: 'escrito-sinfonia' });
    const lido = await (await ultimo(eva)).json();
    expect(lido.envio).toMatchObject({ n: 3, motivo: 'texto novo', letra: 'A', versao: 2 });
    expect((lido.roteiro.doc.content as NoJSON[]).map((p) => p.content?.map((x) => x.text).join(''))).toEqual(['TEXTO NOVO, AINDA NÃO ENVIADO.']);
    expect(await (await ultimo(rita)).json()).toMatchObject({ escreve: true, comenta: true });
  });

  it('quem lê o envio comenta no escrito, sobre o texto que vê; a autora recebe o aviso', async () => {
    const { escritoEnviado, salvar, eva, rita } = await preparado();
    await escritoEnviado();
    await salvar('escrito-sinfonia', { doc: VIVO });
    const ancora = { trecho: '00:12:41:08', antes: 'Abrir no ', depois: ', \\\\servidor', pos: 50 };
    const r = await eva('/api/roteiros/escrito-sinfonia/comentarios', { method: 'POST', body: JSON.stringify({ texto: 'Esse timecode é do bruto?', ancora }) });
    expect(r.status).toBe(201);
    const deles = await (await rita('/api/roteiros/escrito-sinfonia/comentarios')).json();
    expect(deles.comentarios).toEqual([expect.objectContaining({ texto: 'Esse timecode é do bruto?', ancora, autor: { nome: expect.any(String), email: 'eva.manha@empresa.com' } })]);
    expect(Object.values(deles.novos)).toEqual(['no-seu']);
  });

  it('fechado pela redatora, o envio ainda abre pela Pauta (ele está na fila), mas sem os comentários do roteiro', async () => {
    const { escritoEnviado, salvar, ultimo, eva } = await preparado();
    await escritoEnviado();
    await salvar('escrito-sinfonia', { publico: false });
    // o escrito fechado não abre para a edição
    expect((await eva('/api/roteiros/escrito-sinfonia')).status).toBe(403);
    const r = await ultimo(eva);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ envio: { n: 2 }, comenta: false, escreve: false });
    expect((await eva('/api/roteiros/escrito-sinfonia/comentarios')).status).toBe(404);
  });

  it('o que nunca foi enviado e o que chegou de fora não abrem; o id torto é recusado', async () => {
    const { rita, eva, ultimo, db } = await preparado();
    expect((await rita('/api/roteiros-escritos', { method: 'POST', body: JSON.stringify({ id: 'escrito-rascunho', titulo: 'Rascunho' }) })).status).toBe(201);
    const nunca = await ultimo(rita, 'escrito-rascunho');
    expect(nunca.status).toBe(404);
    expect((await nunca.json()).erro).toMatch(/ainda não foi enviado/);
    const em = ha(0);
    db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, publico, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, 1, ?, ?, ?, ?)').run('roteiro-de-fora', 'rita@empresa.com', 'Rita Lemos', '{"claquete":"X"}', '{"type":"doc"}', em, em);
    expect((await ultimo(eva, 'roteiro-de-fora')).status).toBe(404);
    expect((await ultimo(eva, 'nao-existe')).status).toBe(404);
    expect((await ultimo(eva, 'id torto')).status).toBe(400);
    expect((await eva('/api/roteiros-escritos/escrito-rascunho/ultimo-envio', { method: 'POST' })).status).toBe(405);
  });
});
