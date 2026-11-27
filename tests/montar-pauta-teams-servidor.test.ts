// @vitest-environment node
/* Montar a pauta: o cartão do Teams (#135), pela API e com o Teams falso (nada vai ao Teams de verdade). O PROMeiro
   manda o cartão da pauta publicada nos horários da Configuração, pelo endereço do Power Automate guardado como
   segredo no Portainer (TEAMS_PAUTA_URL), com o relógio de São Paulo; o último envio fica no SQLite, e reiniciar não
   manda o mesmo horário de novo. Republicar um dia que já foi ao Teams manda "pauta alterada", com o que mudou. Sem o
   segredo, nada é mandado e a Configuração diz que falta. Nomes, e-mails, ilhas e claquetes fictícios; 27/11/2026 é
   uma sexta. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

const SEXTA = '2026-11-27';
const SABADO = '2026-11-28';
const SEGUNDA = '2026-11-30';
const CHEFE = 'chefe@empresa.com';
const BIA = 'bia.coord@empresa.com';
const TEAMS = 'https://teams.falso.exemplo/fluxo/pauta?sig=falsa';
const ENV_SEM_TEAMS = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  CADASTRO_ADMINS: CHEFE,
  PROMEIRO_URL: 'https://promeiro.exemplo.com/',
};
const ENV = { ...ENV_SEM_TEAMS, TEAMS_PAUTA_URL: TEAMS };

/** Os cadastros de mentira: os editores da lista do montar. Só leitura. */
async function buscarOsCadastros(url: string, init: RequestInit = {}) {
  if ((init.method ?? 'GET') !== 'GET') throw new Error(`o cartão do Teams não escreve no Teable: ${init.method} ${url}`);
  const editores = [{ id: 'recE1', fields: { editor: 'Rui Teixeira' } }, { id: 'recE2', fields: { editor: 'Elis Furtado' } }, { id: 'recE3', fields: { editor: 'Gil Moura' } }];
  const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
  return { ok: true, status: 200, json: async () => ({ records: tabela === 'tblEdi' ? editores : [] }), text: async () => '' };
}

/** O Teams falso: guarda o que chegou (o corpo, como o Power Automate recebe) e responde 202, ou o que for pedido. */
function teamsFalso() {
  const pedidos: { url: string; metodo: string; corpo: { card: string } }[] = [];
  let status = 202;
  const buscar = async (url: string, init: RequestInit = {}) => {
    pedidos.push({ url, metodo: init.method ?? 'GET', corpo: JSON.parse(String(init.body)) });
    return { ok: status < 300, status, text: async () => '' };
  };
  return { pedidos, buscar, responder: (s: number) => (status = s) };
}

type Elemento = { type?: string; text?: string; id?: string; isVisible?: boolean; items?: Elemento[]; columns?: Elemento[]; body?: Elemento[] };
/** Os textos do cartão, na ordem em que aparecem. */
function textos(e: Elemento): string[] {
  const filhos = [...(e.body ?? []), ...(e.columns ?? []), ...(e.items ?? [])];
  return [...(e.type === 'TextBlock' && e.text ? [e.text] : []), ...filhos.flatMap(textos)];
}
/** O cartão (o Adaptive Card) de um pedido ao Teams. */
const cartao = (p: { corpo: { card: string } }) => JSON.parse(p.corpo.card) as Elemento & { type: string; version: string };
/** Um instante na hora de São Paulo. */
const sp = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

const posicao = (id: string, turno: string, editor: string, ilha: string, horario: string, demandas: string[], avisos: string[] = []) => ({
  id,
  turno,
  editor,
  ilha,
  horario,
  demandas: demandas.map((texto, i) => ({ id: `${id}-d${i}`, texto })),
  avisos: avisos.map((texto, i) => ({ id: `${id}-a${i}`, texto })),
});

describe('montar a pauta: o cartão do Teams (#135)', () => {
  const db = abrirBanco(':memory:');
  const teams = teamsFalso();
  let agora = sp(SEXTA, '06:00');
  let servidor: Server;
  let base = '';
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void>; conferirOCartao: () => Promise<unknown>; cartaoEmDia: () => Promise<unknown> };
  const subir = async (env: Record<string, string>) => {
    app = criarApp({ db, env, relogio: () => agora, buscarNoTeams: teams.buscar, agendar: () => ({ unref() {} }), cadastros: criarCadastros(env, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  };
  const descer = async () => {
    await app.fechar();
    await new Promise((ok) => servidor.close(ok));
  };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como(BIA);
  const gravar = (dia: string, posicoes: unknown, recado = '') => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes, recado }) });
  const publicar = (dia: string) => bia(`/api/montar-pauta/publicar?dia=${dia}`, { method: 'POST' });
  /** Anda o relógio e deixa o PROMeiro conferir os horários. */
  const as = async (instante: Date) => {
    agora = instante;
    await app.conferirOCartao();
  };
  const cartaoDoTeams = async () => (await (await chefe('/api/configuracao')).json()).teams;
  let ilhas: Record<string, string> = {};

  beforeAll(async () => {
    await subir(ENV);
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) });
    for (const [tipo, numero] of [['AVID', '22'], ['VDI', '5']]) {
      const r = await (await bia('/api/cadastros/ilhas', { method: 'POST', body: JSON.stringify({ tipo, numero, nome: '' }) })).json();
      ilhas = { ...ilhas, [`${tipo} ${numero}`]: r.ilha.id };
    }
  });
  afterAll(descer);

  const SEXTA_PUBLICADA = () => [
    posicao('p1', 'madrugada', 'Rui Teixeira', ilhas['AVID 22'], '22h às 6h', ['Noite de Gala 27/11 (DP)'], ['Redator vem acompanhar']),
    posicao('p2', 'manha', 'Gil Moura', '', '6h às 15h', ['COMUNICAÇÃO']),
    posicao('p3', 'tarde', 'Elis Furtado', ilhas['VDI 5'], '14h às 22h53', ['Mundo Animal 30/11 (AH)']),
  ];

  it('sem nada salvo, os horários são os do n8n de hoje, e a Configuração diz que o segredo está lá', async () => {
    expect(await cartaoDoTeams()).toEqual({
      horarios: [
        { hora: '07:29', dias: [1, 2, 3, 4, 5], pauta: 'hoje' },
        { hora: '08:29', dias: [6], pauta: 'hoje' },
        { hora: '10:29', dias: [0], pauta: 'hoje' },
        { hora: '16:29', dias: [1, 2, 3, 4, 5], pauta: 'hoje' },
        { hora: '22:29', dias: [1, 2, 3, 4, 5], pauta: 'amanha' },
      ],
      deFabrica: true,
      falta: [],
      ultimo: null,
    });
  });

  it('o dia sem pauta publicada não manda nada no horário', async () => {
    expect((await gravar(SEXTA, SEXTA_PUBLICADA(), 'Reunião geral às 15h, na sala 3')).status).toBe(200);
    await as(sp(SEXTA, '07:29'));
    expect(teams.pedidos).toEqual([]);
  });

  it('publicado, o cartão vai no horário: a pauta do dia por turno (editor, ilha, horário, claquetes e avisos), o recado e o link', async () => {
    expect((await publicar(SEXTA)).status).toBe(200);
    await as(sp(SEXTA, '07:28'));
    expect(teams.pedidos).toEqual([]);
    await as(sp(SEXTA, '07:31'));
    expect(teams.pedidos).toHaveLength(1);
    const [p] = teams.pedidos;
    expect(p).toMatchObject({ url: TEAMS, metodo: 'POST' });
    const c = cartao(p);
    expect(c).toMatchObject({ type: 'AdaptiveCard', version: '1.3' });
    const t = textos(c);
    expect(t[0]).toBe('📺');
    expect(t[1]).toBe('PAUTA - SEXTA 27/11');
    expect(t[2]).toMatch(/^publicada às \d{2}H\d{2} de \d{2}\/\d{2}$/);
    expect(t.slice(3)).toEqual([
      'Recado do dia: Reunião geral às 15h, na sala 3',
      'MADRUGADA',
      'Rui Teixeira',
      'AVID 22 · 22h às 6h',
      '• Noite de Gala 27/11 (DP)',
      '⚑ Redator vem acompanhar',
      'MANHÃ',
      'Gil Moura',
      '6h às 15h',
      '• COMUNICAÇÃO',
      'TARDE',
      'Elis Furtado',
      'VDI 5 · 14h às 22h53',
      '• Mundo Animal 30/11 (AH)',
      '[Abrir a pauta no PROMeiro](https://promeiro.exemplo.com/#/pauta/dia/2026-11-27)',
    ]);
    // como o n8n: a pauta abre ao tocar no cabeçalho
    expect(JSON.stringify(c.body)).toContain('Action.ToggleVisibility');
  });

  it('o mesmo horário não vai de novo; o seguinte vai, e o da noite manda a pauta de amanhã', async () => {
    await as(sp(SEXTA, '07:45'));
    await as(sp(SEXTA, '10:29'));
    expect(teams.pedidos).toHaveLength(1);
    await as(sp(SEXTA, '16:29'));
    expect(teams.pedidos).toHaveLength(2);
    expect(textos(cartao(teams.pedidos[1]))[1]).toBe('PAUTA - SEXTA 27/11');
    expect((await gravar(SABADO, [posicao('s1', 'manha', 'Gil Moura', '', '8h às 14h', ['COMUNICAÇÃO'])])).status).toBe(200);
    expect((await publicar(SABADO)).status).toBe(200);
    await as(sp(SEXTA, '22:29'));
    expect(teams.pedidos).toHaveLength(3);
    expect(textos(cartao(teams.pedidos[2])).slice(1, 2)).toEqual(['PAUTA - SÁBADO 28/11']);
    // no sábado, o das 7h29 é só de segunda a sexta; o das 8h29 é o do sábado
    await as(sp(SABADO, '07:29'));
    expect(teams.pedidos).toHaveLength(3);
    await as(sp(SABADO, '08:29'));
    expect(teams.pedidos).toHaveLength(4);
    expect((await cartaoDoTeams()).ultimo).toMatchObject({ dia: SABADO, tipo: 'pauta', ok: true });
  });

  it('reiniciar o servidor não manda de novo o horário que já foi', async () => {
    await descer();
    await subir(ENV);
    await as(sp(SABADO, '08:40'));
    expect(teams.pedidos).toHaveLength(4);
  });

  it('o horário perdido há mais de meia hora (o servidor estava fora) não vai atrasado', async () => {
    expect((await gravar(SEGUNDA, [posicao('g1', 'manha', 'Gil Moura', '', '6h às 15h', ['COMUNICAÇÃO'])])).status).toBe(200);
    expect((await publicar(SEGUNDA)).status).toBe(200);
    await as(sp(SEGUNDA, '08:00'));
    expect(teams.pedidos).toHaveLength(4);
  });

  it('o Teams que falha é tentado de novo no minuto seguinte, uma vez só quando dá certo', async () => {
    teams.responder(500);
    await as(sp(SEGUNDA, '16:29'));
    expect(teams.pedidos).toHaveLength(5);
    expect((await cartaoDoTeams()).ultimo).toMatchObject({ dia: SEGUNDA, ok: false });
    teams.responder(202);
    await as(sp(SEGUNDA, '16:30'));
    await as(sp(SEGUNDA, '16:31'));
    expect(teams.pedidos).toHaveLength(6);
    expect((await cartaoDoTeams()).ultimo).toMatchObject({ dia: SEGUNDA, ok: true });
  });

  it('republicar o dia que já foi ao Teams manda "pauta alterada", com o que mudou e a pauta inteira', async () => {
    const [p1, p2, p3] = SEXTA_PUBLICADA();
    const mudada = [
      { ...p1, demandas: [...p1.demandas, { id: 'p1-d9', texto: 'Vale a Pena Rever 30/11 (P)' }] },
      { ...p2, demandas: [...p2.demandas, { id: 'p2-d9', texto: 'Mundo Animal 30/11 (AH)' }], avisos: [{ id: 'p2-a9', texto: 'Ligar para a coordenação' }] },
      { ...p3, horario: '15h às 23h', demandas: [] },
    ];
    expect((await gravar(SEXTA, mudada, '')).status).toBe(200);
    expect((await publicar(SEXTA)).status).toBe(200);
    await app.cartaoEmDia();
    expect(teams.pedidos).toHaveLength(7);
    const t = textos(cartao(teams.pedidos[6]));
    expect(t[1]).toBe('PAUTA ALTERADA - SEXTA 27/11');
    expect(t[2]).toMatch(/^alterada às \d{2}H\d{2} de \d{2}\/\d{2}$/);
    expect(t.slice(3, 9)).toEqual([
      'O que mudou',
      '+ Rui Teixeira: Vale a Pena Rever 30/11 (P)',
      'Mundo Animal 30/11 (AH): Elis Furtado → Gil Moura',
      '⚑ Gil Moura: Ligar para a coordenação',
      'Elis Furtado: 14h às 22h53 → 15h às 23h',
      'Recado do dia: saiu',
    ]);
    // as claquetes de cada posição, num bloco só (como o n8n)
    expect(t).toContain('• Noite de Gala 27/11 (DP)\n• Vale a Pena Rever 30/11 (P)');
    expect(t).not.toContain('Recado do dia: Reunião geral às 15h, na sala 3');
    expect((await cartaoDoTeams()).ultimo).toMatchObject({ dia: SEXTA, tipo: 'alterada', ok: true });
    // a próxima mudança é contada a partir do que foi agora: só o que mudou de novo
    expect((await gravar(SEXTA, mudada, 'Pauta revista às 9h')).status).toBe(200);
    expect((await publicar(SEXTA)).status).toBe(200);
    await app.cartaoEmDia();
    expect(textos(cartao(teams.pedidos[7])).slice(3, 5)).toEqual(['O que mudou', 'Recado do dia: Pauta revista às 9h']);
  });

  it('republicar o dia que ainda não foi ao Teams não manda nada: o horário leva a pauta nova', async () => {
    const terca = '2026-12-01';
    expect((await gravar(terca, [posicao('t1', 'manha', 'Gil Moura', '', '6h às 15h', ['COMUNICAÇÃO'])])).status).toBe(200);
    expect((await publicar(terca)).status).toBe(200);
    expect((await gravar(terca, [posicao('t1', 'manha', 'Rui Teixeira', '', '6h às 15h', ['COMUNICAÇÃO'])])).status).toBe(200);
    expect((await publicar(terca)).status).toBe(200);
    await app.cartaoEmDia();
    expect(teams.pedidos).toHaveLength(8);
  });

  it('os horários salvos na Configuração valem na hora', async () => {
    const novos = [{ hora: '9:15', dias: [2], pauta: 'hoje' }];
    const conferida = await (await chefe('/api/configuracao/conferir', { method: 'POST', body: JSON.stringify({ teams: novos }) })).json();
    expect(conferida.ok).toBe(true);
    const r = await chefe('/api/configuracao/salvar', { method: 'POST', body: JSON.stringify({ teams: novos }) });
    expect(r.status).toBe(200);
    expect((await r.json()).teams).toMatchObject({ horarios: [{ hora: '09:15', dias: [2], pauta: 'hoje' }], deFabrica: false });
    await as(sp('2026-12-01', '07:29'));
    expect(teams.pedidos).toHaveLength(8);
    await as(sp('2026-12-01', '09:15'));
    expect(teams.pedidos).toHaveLength(9);
    expect(textos(cartao(teams.pedidos[8]))[1]).toBe('PAUTA - TERÇA 01/12');
  });

  it('a conferência recusa a hora que não é hora, o horário sem dia e o repetido', async () => {
    const r = await (
      await chefe('/api/configuracao/conferir', {
        method: 'POST',
        body: JSON.stringify({ teams: [{ hora: '25:00', dias: [1], pauta: 'hoje' }, { hora: '7:29', dias: [], pauta: 'hoje' }, { hora: '07:29', dias: [1], pauta: 'hoje' }, { hora: '7h29', dias: [1, 2], pauta: 'amanha' }] }),
      })
    ).json();
    expect(r.ok).toBe(false);
    expect(r.itens.filter((i: { tipo: string }) => i.tipo === 'erro').map((i: { detalhe: string }) => i.detalhe)).toEqual([
      'a hora "25:00" não é uma hora.',
      'o horário das 07:29 está sem dia da semana.',
      'dois horários às 07:29 na segunda.',
    ]);
  });
});

describe('o cartão do Teams sem o segredo (#135)', () => {
  const teams = teamsFalso();
  let servidor: Server;
  let base = '';
  let agora = sp(SEXTA, '06:00');
  let app: { fechar: () => Promise<void>; tabelasProntas: Promise<void>; conferirOCartao: () => Promise<unknown>; cartaoEmDia: () => Promise<unknown> };
  const como = (email: string) => (caminho: string, init: RequestInit = {}) => fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como(CHEFE);
  const bia = como(BIA);

  beforeAll(async () => {
    app = criarApp({ db: abrirBanco(':memory:'), env: ENV_SEM_TEAMS, relogio: () => agora, buscarNoTeams: teams.buscar, agendar: () => ({ unref() {} }), cadastros: criarCadastros(ENV_SEM_TEAMS, { buscar: buscarOsCadastros }) });
    await app.tabelasProntas;
    servidor = createServer(app as never);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: BIA }) });
  });
  afterAll(async () => {
    await app.fechar();
    servidor.close();
  });

  it('nada é mandado, nem no horário nem ao republicar, e a Configuração diz o que falta no Portainer', async () => {
    const dia = [posicao('p1', 'manha', 'Gil Moura', '', '6h às 15h', ['COMUNICAÇÃO'])];
    await bia(`/api/montar-pauta?dia=${SEXTA}`, { method: 'PUT', body: JSON.stringify({ posicoes: dia }) });
    expect((await bia(`/api/montar-pauta/publicar?dia=${SEXTA}`, { method: 'POST' })).status).toBe(200);
    agora = sp(SEXTA, '07:29');
    await app.conferirOCartao();
    await bia(`/api/montar-pauta?dia=${SEXTA}`, { method: 'PUT', body: JSON.stringify({ posicoes: [{ ...dia[0], editor: 'Rui Teixeira' }] }) });
    expect((await bia(`/api/montar-pauta/publicar?dia=${SEXTA}`, { method: 'POST' })).status).toBe(200);
    await app.cartaoEmDia();
    expect(teams.pedidos).toEqual([]);
    expect((await (await chefe('/api/configuracao')).json()).teams).toMatchObject({ falta: ['TEAMS_PAUTA_URL'], ultimo: null });
  });
});
