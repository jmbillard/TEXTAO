// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { chaveDaAtracao, chaveN8n, criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';

/* IDs inventados: o quadro de verdade fica só nas variáveis do servidor. */
const ENV = {
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA: 'listaG5',
  TRELLO_LISTA_SP: 'listaSP',
  TRELLO_LISTA_VT: 'listaVT',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=opG5, SP=opSP, RJ=opRJ',
  TRELLO_CAMPO_REDATOR: 'cRedator',
  TRELLO_CAMPO_PRIORIDADE: 'cPrio',
  TRELLO_PRIORIDADE_ALTA: 'opAlta',
  TRELLO_CAMPO_PROJETO: 'cProjeto',
  TRELLO_CAMPO_OUTPUT: 'cOutput',
  TRELLO_CAMPO_BOT: 'cBot',
  TRELLO_CAMPO_ENTRADA: 'cEntrada',
  TRELLO_CAMPOS_FILME: 'cComplexidade,cIA',
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_ARTE_PRODUCAO: 'tblProducao',
  TEABLE_REDATORES: 'tblRedatores',
  TEABLE_PG_URL: 'postgres://x',
  TEABLE_PG_ESQUEMA: 'bseBase',
  TEABLE_PG_ARTE: 'producao',
  TEABLE_PG_REDATORES: 'redatores',
  TEABLE_PG_EDITORES: 'editores',
  TEABLE_PG_ATRACOES: 'atracoes',
  TEABLE_PG_PRIORIDADE: 'prioridade',
  TEABLE_PG_EXIBICOES: 'exibicoes',
  SFTP_HOST: 'onedrive',
};

interface Pedido {
  metodo: string;
  url: URL;
  corpo: unknown;
}

/** Trello e Teable de mentira, num fetch só. */
function falsos(opcoes: { falharCard?: boolean; falharChecklist?: boolean } = {}) {
  const pedidos: Pedido[] = [];
  let n = 0;
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    let corpo: unknown = null;
    if (typeof init.body === 'string') corpo = JSON.parse(init.body);
    else if (init.body instanceof FormData) corpo = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `arquivo:${(v as File).name}`]));
    pedidos.push({ metodo, url, corpo });
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
    if (url.host === 'teable:3000') return ok({ records: [{ id: 'rec1' }] });
    const rota = url.pathname.replace('/1', '');
    if (rota === '/cards' && metodo === 'POST') {
      if (opcoes.falharCard) return { ok: false, status: 401, text: async () => 'invalid token', json: async () => ({}) };
      return ok({ id: 'card' + ++n, shortUrl: `https://trello.com/c/CARD${n}` });
    }
    if (rota === '/checklists') {
      if (opcoes.falharChecklist) return { ok: false, status: 500, text: async () => 'erro', json: async () => ({}) };
      return ok({ id: 'checklist1' });
    }
    if (rota.endsWith('/attachments') && metodo === 'POST') return ok({ id: 'anexo1', url: 'https://trello.com/anexo.pdf' });
    if (rota.startsWith('/customField/') && rota.endsWith('/options')) return ok({ id: 'opNovoRedator', idCustomField: 'cRedator', value: { text: 'Nova Pessoa' } });
    if (rota === '/cards/cardFilme' && metodo === 'GET')
      return ok({
        id: 'cardFilme',
        idMembers: ['m1', 'm2'],
        customFieldItems: [
          { idCustomField: 'cComplexidade', idValue: 'opMedia' },
          { idCustomField: 'cIA', value: { checked: 'true' } },
          { idCustomField: 'cOutroQualquer', idValue: 'x' },
        ],
      });
    return ok({});
  };
  return { buscar, pedidos };
}

/** O Postgres do Teable, respondendo pelo nome da tabela na consulta. */
function banco(opcoes: { duplicado?: boolean; redatorNovo?: boolean; redatorSemId?: boolean; sessao?: boolean } = {}) {
  const consultas: { sql: string; params: unknown[] }[] = [];
  const consultar = async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (sql.includes('"producao"')) return opcoes.duplicado ? [{ claquete: 'Festa_Na_Praca_19_11_SP' }] : [{ claquete: 'Outra 19/11' }];
    if (sql.includes('MAX("customField_ID")')) return [{ id: 'cRedator' }];
    if (sql.includes('"redatores"')) return opcoes.redatorNovo ? [] : opcoes.redatorSemId ? [{ id: 'recAna', redator: 'Ana Lima', redator_ID: null, customField_ID: null }] : [{ redator: 'Ana Lima', redator_ID: 'opAna', customField_ID: 'cRedator' }];
    if (sql.includes('"editores"')) return [{ editor: 'Bruno Regis', editor_ID: 'opBruno', customField_ID: 'cEditor' }];
    if (sql.includes('"atracoes"'))
      return opcoes.sessao
        ? [{ atracao: 'Sessão da Tarde', projeto_win: 'cole_aqui_o_caminho', output_win: 'X:\\saida' }]
        : [{ atracao: 'Festa na Praça', projeto_win: 'P:\\festa\\projeto', output_win: 'caminho_nao_encontrado' }];
    if (sql.includes('"prioridade"')) return [{ '?column?': 1 }];
    if (sql.includes('"exibicoes"')) return String(params[0]).toUpperCase() === 'SESSÃO DA TARDE' ? [{ card_ID: 'cardFilme', output: 'F:\\filmes\\saida', filme: { id: 'recFilme', title: 'RIVAIS (2024)' } }] : [];
    return [];
  };
  return { consultar, consultas };
}

const original = { nome: 'Festa_Na_Praca_19_11_SP.docx', tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dados: Buffer.from('PK') };
const meta = { claquete: 'Festa na Praça 19/11 SP', praca: 'SP', redator: 'ana.lima', editor: 'Bruno Regis', dataExibicao: '2026-11-19', programa: 'Festa na Praça' };
const DOC = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'VEM AÍ ' }, { type: 'text', text: 'A GRANDE FESTA', marks: [{ type: 'arte', attrs: { subtipo: 'cartao' } }] }, { type: 'text', text: ' – “ao vivo”…' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'nota interna', marks: [{ type: 'etiqueta', attrs: { tipo: 'comentario' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'SÁBADO', marks: [{ type: 'arte', attrs: {} }] }, { type: 'hardBreak' }, { type: 'text', text: 'na praça 🎉' }] },
  ],
};
const campoPut = (pedidos: Pedido[], campo: string) => pedidos.find((p) => p.metodo === 'PUT' && p.url.pathname.endsWith(`/customField/${campo}/item`))?.corpo;

describe('PDF do roteiro', () => {
  it('sai um PDF com o texto e a lista de artes, sem comentários', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { gerarPdf, paragrafosDoDoc } = await import('../servidor/pdf.mjs');
    const pdf: Buffer = await gerarPdf({ meta, doc: DOC, artes: [{ texto: 'A GRANDE FESTA', tipo: 'Cartão' }, { texto: 'SÁBADO', tipo: '' }] });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
    const pars = paragrafosDoDoc(DOC);
    expect(pars).toHaveLength(2);
    expect(pars[0].find((p: { arte: boolean }) => p.arte).t).toBe('A GRANDE FESTA');
  });
});

describe('chaves do n8n', () => {
  it('a claquete e a atração saem como o fluxo antigo escrevia', () => {
    expect(chaveN8n('Quem Ama(Prologo)26/10 Rede')).toBe('QUEM AMA PROLOGO 26 10 REDE');
    expect(chaveDaAtracao('Rio Festa na Praça 19/11 (AH)')).toBe('FESTA NA PRACA');
    expect(chaveDaAtracao('Fant(Abertura) 22/11')).toBe('FANT');
  });
});

describe('envio para o Trello', () => {
  it('cria o card na lista de SP, com checklist, campos, PDF, OneDrive e registro na produção', async () => {
    const { buscar, pedidos } = falsos();
    const { consultar } = banco();
    const enviadosAoOneDrive: string[] = [];
    const t = criarTrello(ENV, { buscar, consultar, sftp: async (caminho: string) => void enviadosAoOneDrive.push(caminho) });
    const r = await t.enviar({ meta, doc: DOC, artes: [{ texto: 'A GRANDE FESTA', tipo: 'Cartão' }, 'SÁBADO'], texto: 'texto corrido', original }, new Date('2026-11-19T12:00:00Z'));

    expect(r.card).toEqual({ id: 'card1', url: 'https://trello.com/c/CARD1' });
    expect(r.avisos).toEqual([]);
    const card = pedidos.find((p) => p.url.pathname === '/1/cards' && p.metodo === 'POST')!;
    expect(card.corpo).toMatchObject({ idList: 'listaSP', name: 'Festa na Praça 19/11 SP' });
    expect((card.corpo as { desc: string }).desc).toContain('`A GRANDE FESTA`, `SÁBADO`');
    expect(card.url.searchParams.get('key')).toBe('k');
    // a checklist leva só o texto de cada arte
    expect(pedidos.filter((p) => p.url.pathname === '/1/checklists/checklist1/checkItems').map((p) => p.url.searchParams.get('name'))).toEqual(['A GRANDE FESTA', 'SÁBADO']);
    expect(campoPut(pedidos, 'cPraca')).toEqual({ idValue: 'opSP' });
    expect(campoPut(pedidos, 'cRedator')).toEqual({ idValue: 'opAna' });
    expect(campoPut(pedidos, 'cEditor')).toEqual({ idValue: 'opBruno' });
    expect(campoPut(pedidos, 'cPrio')).toEqual({ idValue: 'opAlta' });
    expect(campoPut(pedidos, 'cProjeto')).toEqual({ value: { text: 'P:\\festa\\projeto' } });
    expect(campoPut(pedidos, 'cOutput')).toBeUndefined(); // "caminho_nao_encontrado" não vai para o card
    expect(campoPut(pedidos, 'cBot')).toEqual({ value: { checked: 'true' } });
    expect(campoPut(pedidos, 'cEntrada')).toEqual({ value: { date: '2026-11-19T12:00:00.000Z' } });
    // o docx vira PDF aqui mesmo e só o PDF vai anexo
    expect(pedidos.find((p) => p.url.pathname === '/1/cards/card1/attachments')!.corpo).toMatchObject({ name: 'Festa_Na_Praca_19_11_SP.pdf', mimeType: 'application/pdf', file: 'arquivo:Festa_Na_Praca_19_11_SP.pdf' });
    expect(enviadosAoOneDrive).toEqual(['/PROMO/WORKFLOWS/ROTEIROS/2026-11-19/Festa_Na_Praca_19_11_SP.docx']);
    const registro = pedidos.find((p) => p.url.pathname === '/api/table/tblProducao/record')!.corpo as { records: { fields: Record<string, unknown> }[] };
    expect(registro.records[0].fields).toMatchObject({
      claquete: 'Festa na Praça 19/11 SP', artes_quantidade: 2, artes: 'A GRANDE FESTA | SÁBADO', doc: 'https://trello.com/anexo.pdf',
      redator: 'Ana Lima', card_ID: 'card1', atracao: 'Festa na Praça', editor: 'Bruno Regis', key: 'FESTA NA PRACA 19 11 SP', praca: 'SP', prioridade: 'ALTA',
    });
  });

  it('não repete o que já entrou hoje na produção da arte (pelo upload antigo, com outra grafia)', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, consultar: banco({ duplicado: true }).consultar });
    expect(await t.enviar({ meta, artes: [], original })).toMatchObject({ duplicado: true });
    expect(pedidos.some((p) => p.url.pathname === '/1/cards')).toBe(false);
  });

  it('redator que ainda não existe vira opção no Trello e linha na tabela de redatores', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, consultar: banco({ redatorNovo: true }).consultar });
    await t.enviar({ meta: { ...meta, redator: 'Nova Pessoa' }, artes: ['X'], original });
    expect(pedidos.find((p) => p.url.pathname === '/1/customField/cRedator/options')!.corpo).toEqual({ pos: 'bottom', value: { text: 'Nova Pessoa' } });
    expect(pedidos.find((p) => p.url.pathname === '/api/table/tblRedatores/record')!.corpo).toMatchObject({ records: [{ fields: { user: 'Nova Pessoa', redator: 'Nova Pessoa', redator_ID: 'opNovoRedator' } }] });
    expect(campoPut(pedidos, 'cRedator')).toEqual({ idValue: 'opNovoRedator' });
  });

  it('redator que já está na tabela sem opção no Trello: cria a opção e completa a mesma linha', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, consultar: banco({ redatorSemId: true }).consultar });
    await t.enviar({ meta, artes: ['X'] });
    expect(pedidos.find((p) => p.url.pathname === '/1/customField/cRedator/options')!.corpo).toEqual({ pos: 'bottom', value: { text: 'Ana Lima' } });
    const patch = pedidos.find((p) => p.metodo === 'PATCH')!;
    expect(patch.url.pathname).toBe('/api/table/tblRedatores/record/recAna');
    expect(patch.corpo).toMatchObject({ record: { fields: { redator_ID: 'opNovoRedator', customField_ID: 'cRedator' } } });
    expect(pedidos.some((p) => p.url.pathname === '/api/table/tblRedatores/record' && p.metodo === 'POST')).toBe(false);
  });

  it('sessão de filmes: liga ao card do filme, copia membros e os campos combinados', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, consultar: banco({ sessao: true }).consultar });
    await t.enviar({ meta: { ...meta, claquete: 'Sessão da Tarde 19/11', praca: 'G5' }, artes: ['X'], original: { ...original, nome: 'sessao.pdf', tipo: 'application/pdf' } });
    expect((pedidos.find((p) => p.url.pathname === '/1/cards' && p.metodo === 'POST')!.corpo as { idList: string }).idList).toBe('listaG5');
    expect(pedidos.find((p) => p.url.pathname === '/1/cards/card1/attachments' && p.url.searchParams.get('url'))!.url.searchParams.get('url')).toBe('https://trello.com/c/cardFilme');
    expect(pedidos.find((p) => p.metodo === 'PUT' && p.url.pathname === '/1/cards/card1')!.url.searchParams.get('idMembers')).toBe('m1,m2');
    expect(campoPut(pedidos, 'cComplexidade')).toEqual({ idValue: 'opMedia' });
    expect(campoPut(pedidos, 'cIA')).toEqual({ value: { checked: 'true' } });
    expect(campoPut(pedidos, 'cOutroQualquer')).toBeUndefined();
    // o output do filme vale mais que o da atração; o PDF que subiu vai como veio
    expect(campoPut(pedidos, 'cOutput')).toEqual({ value: { text: 'F:\\filmes\\saida' } });
    expect(pedidos.find((p) => p.url.pathname === '/1/cards/card1/attachments' && p.corpo)!.corpo).toMatchObject({ name: 'sessao.pdf', file: 'arquivo:sessao.pdf' });    // na produção da arte, o card fica ligado ao filme (o pacote gráfico é dele)
    const registro = pedidos.find((p) => p.url.pathname === '/api/table/tblProducao/record')!.corpo as { records: { fields: Record<string, unknown> }[] };
    expect(registro.records[0].fields.filme).toEqual({ id: 'recFilme' });
  });

  it('VT vai para a lista de VT; sem o card, o envio falha; passo secundário que falha vira aviso', async () => {
    const um = falsos();
    await criarTrello(ENV, { buscar: um.buscar, consultar: banco().consultar }).enviar({ meta: { ...meta, claquete: 'Vt Festa 19/11 SP' }, artes: [] });
    expect((um.pedidos.find((p) => p.url.pathname === '/1/cards')!.corpo as { idList: string }).idList).toBe('listaVT');

    const semCard = falsos({ falharCard: true });
    await expect(criarTrello(ENV, { buscar: semCard.buscar, consultar: banco().consultar }).enviar({ meta, artes: [] })).rejects.toThrow(/401/);

    const semChecklist = falsos({ falharChecklist: true });
    const r = await criarTrello(ENV, { buscar: semChecklist.buscar, consultar: banco().consultar }).enviar({ meta, artes: ['X'] });
    expect(r.card.id).toBe('card1');
    expect(r.avisos).toEqual([expect.stringMatching(/criar a checklist/)]);
    // colado do Word, sem arquivo: o PDF sai do texto, com o nome da claquete
    expect(semChecklist.pedidos.find((p) => p.url.pathname === '/1/cards/card1/attachments')!.corpo).toMatchObject({ name: 'Festa na Praça 19_11 SP.pdf' });
  });

  it('desligado sem chave, token e lista', () => {
    expect(criarTrello({}).ligado).toBe(false);
    expect(criarTrello({ ...ENV, TRELLO_LISTA: '', TRELLO_LISTA_SP: '' }).ligado).toBe(false);
    expect(criarTrello({ ...ENV, TRELLO_LISTA: '' }).ligado).toBe(true); // basta a entrada de uma praça
  });
});

describe('rotas do envio', () => {
  let servidor: Server;
  let base = '';
  const recebidos: { artes: string[]; original: { nome: string; dados: Buffer } | null; meta: { claquete: string } }[] = [];
  let falhar = false;
  const trello = {
    ligado: true,
    parar: async () => {},
    enviar: async (r: (typeof recebidos)[number]) => {
      recebidos.push(r);
      if (falhar) throw new Error('Trello respondeu 401');
      return { card: { id: 'c1', url: 'https://trello.com/c/C1' }, avisos: ['guardar no OneDrive: sem resposta'] };
    },
  };
  const ana = (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json', ...init.headers } });

  beforeAll(async () => {
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, trello });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  });
  afterAll(() => servidor.close());

  it('guarda o original, manda uma vez e mostra o estado na fila', async () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X' }] }] };
    await ana('/api/roteiros/rot-trello-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Festa 19/11' }, doc }, nArtes: 1 }) });
    expect((await ana('/api/eu').then((r) => r.json())).trello).toBe(true);

    const subiu = await ana('/api/roteiros/rot-trello-1/original', { method: 'PUT', body: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'application/pdf', 'x-arquivo': encodeURIComponent('Festa 19_11 ç.pdf') } });
    expect(subiu.status).toBe(200);
    expect((await ana('/api/roteiros')).ok && (await (await ana('/api/roteiros')).json())[0].temOriginal).toBe(true);

    // baixar de novo, como subiu; o roteiro diz o nome e o tamanho
    const baixado = await ana('/api/roteiros/rot-trello-1/original');
    expect(baixado.headers.get('content-type')).toBe('application/pdf');
    expect(baixado.headers.get('content-disposition')).toContain("filename*=UTF-8''Festa%2019_11%20%C3%A7.pdf");
    expect([...new Uint8Array(await baixado.arrayBuffer())]).toEqual([1, 2, 3]);
    expect((await (await ana('/api/roteiros/rot-trello-1')).json()).original).toMatchObject({ nome: 'Festa 19_11 ç.pdf', tamanho: 3 });
    expect((await fetch(base + '/api/roteiros/rot-trello-1/original')).status).toBe(401);

    const r = await (await ana('/api/roteiros/rot-trello-1/trello', { method: 'POST', body: JSON.stringify({ artes: ['A', 'B'], texto: 'x' }) })).json();
    expect(r).toEqual({ estado: 'enviado', url: 'https://trello.com/c/C1', avisos: ['guardar no OneDrive: sem resposta'] });
    expect(recebidos[0].artes).toEqual(['A', 'B']);
    expect(recebidos[0].original).toMatchObject({ nome: 'Festa 19_11 ç.pdf' });
    expect([...recebidos[0].original!.dados]).toEqual([1, 2, 3]);
    expect((await (await ana('/api/roteiros')).json())[0].trello).toMatchObject({ estado: 'enviado', url: 'https://trello.com/c/C1', por: 'Ana' });

    // de novo, sem pedir: recusa
    expect((await ana('/api/roteiros/rot-trello-1/trello', { method: 'POST', body: '{}' })).status).toBe(409);
    expect(recebidos).toHaveLength(1);
  });

  it('versão nova que substitui a anterior herda o card do Trello', async () => {
    const doc = { type: 'doc', content: [] };
    await ana('/api/roteiros/rot-nova-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Festa 19/11' }, doc }, nArtes: 0 }) });
    const r = await (await ana('/api/roteiros/rot-nova-1/trello', { method: 'POST', body: JSON.stringify({ herdarDe: 'rot-trello-1' }) })).json();
    expect(r.herdado).toBe(true);
    await ana('/api/roteiros/rot-trello-1', { method: 'DELETE' });
    const lista = await (await ana('/api/roteiros')).json();
    expect(lista.find((x: { id: string }) => x.id === 'rot-nova-1').trello).toMatchObject({ estado: 'enviado', url: 'https://trello.com/c/C1' });
    // de novo, sem pedir: continua recusado, agora para a versão nova
    expect((await ana('/api/roteiros/rot-nova-1/trello', { method: 'POST', body: '{}' })).status).toBe(409);
  });

  it('original grande demais recebe 413 com a mensagem, sem derrubar a conexão', async () => {
    const r = await ana('/api/roteiros/rot-nova-1/original', { method: 'PUT', body: new Uint8Array(31 * 1024 * 1024), headers: { 'content-type': 'application/pdf' } });
    expect(r.status).toBe(413);
    expect((await r.json()).erro).toMatch(/grande demais/);
  });

  it('erro fica registrado e pode tentar de novo', async () => {
    const doc = { type: 'doc', content: [] };
    await ana('/api/roteiros/rot-trello-2', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Outra 20/11' }, doc }, nArtes: 0 }) });
    falhar = true;
    const r = await ana('/api/roteiros/rot-trello-2/trello', { method: 'POST', body: '{}' });
    expect(r.status).toBe(422);
    expect((await (await ana('/api/roteiros/rot-trello-2/trello')).json())).toMatchObject({ estado: 'erro', erro: 'Trello respondeu 401' });
    falhar = false;
    expect((await (await ana('/api/roteiros/rot-trello-2/trello', { method: 'POST', body: '{}' })).json()).estado).toBe('enviado');
  });
});

describe('andamento na produção da arte', () => {
  it('lê status, designers e entrega do Teable pelo card; sem card, pela claquete; guarda por 1 min', async () => {
    const consultas: { sql: string; params: unknown[] }[] = [];
    const consultar = async (sql: string, params: unknown[] = []) => {
      consultas.push({ sql, params });
      return [
        { card_ID: 'c1', claquete: 'SHOW DA NOITE 20/11 SP', status: '["EM APROVAÇÃO"]', designers: ['Rafa Lins'], entregue: false, data_entrega: new Date('2026-11-21T03:00:00Z'), data_entrada: new Date('2026-11-20T10:00:00Z') },
        { card_ID: 'c2', claquete: 'FESTA 20/11', status: ['FINALIZADO'], designers: '["Bia Costa","Rafa Lins"]', entregue: true, data_entrega: null, data_entrada: new Date('2026-11-20T09:00:00Z') },
        { card_ID: 'velho', claquete: 'JORNAL DA TARDE 20/11', status: null, designers: null, entregue: false, data_entrega: null, data_entrada: new Date('2026-11-19T09:00:00Z') },
        { card_ID: 'novo', claquete: 'Jornal da Tarde 20/11', status: '["CAIU"]', designers: null, entregue: false, data_entrega: null, data_entrada: new Date('2026-11-20T08:00:00Z') },
      ].filter((l) => (params[0] as string[]).includes(l.card_ID) || sql.includes('30 days'));
    };
    const t = criarTrello(ENV, { consultar });
    const itens = [
      { id: 'r1', card: 'c1', claquete: 'SHOW DA NOITE 20/11 SP' },
      { id: 'r2', card: 'c2', claquete: 'FESTA 20/11' },
      { id: 'r3', card: null, claquete: 'JORNAL DA TARDE 20/11' },
      { id: 'r4', card: 'sumiu', claquete: 'X' },
    ];
    const a = await t.andamento(itens);
    expect(a.r1).toEqual({ status: ['EM APROVAÇÃO'], designers: ['Rafa Lins'], entregue: false, entrega: '2026-11-21T03:00:00.000Z' });
    expect(a.r2).toMatchObject({ status: ['FINALIZADO'], designers: ['Bia Costa', 'Rafa Lins'], entregue: true, entrega: null });
    expect(a.r3.status).toEqual(['CAIU']); // a linha mais recente com a mesma claquete
    expect(a.r4).toBeUndefined();
    expect(consultas[0].sql).toContain('"bseBase"."producao"');
    await t.andamento(itens);
    expect(consultas).toHaveLength(1);
  });

  it('sem Postgres ou com erro, devolve vazio', async () => {
    expect(await criarTrello({ ...ENV, TEABLE_PG_ARTE: '' }, { consultar: async () => [] }).andamento([{ id: 'r', card: 'c' }])).toEqual({});
    const t = criarTrello(ENV, { consultar: async () => { throw new Error('coluna não existe'); } });
    expect(await t.andamento([{ id: 'r', card: 'c', claquete: '' }])).toEqual({});
  });
});

describe('versão nova de um roteiro que já está na produção', () => {
  it('acha na produção pela key; sem key igual, pela claquete', async () => {
    const consultar = async () => [
      { registro: 'recP1', card_ID: 'cardVelho', claquete: 'FESTA NA PRACA 19/11 SP', key: 'FESTA NA PRACA 19 11 SP', status: '["PRODUZINDO"]', data_entrada: new Date('2026-11-18T13:00:00Z'), artes_quantidade: 3 },
      { registro: 'recP2', card_ID: 'cardShow', claquete: 'Show_Da_Noite_20_11', key: 'OUTRA COISA', status: null, data_entrada: new Date('2026-11-17T13:00:00Z'), artes_quantidade: 1 },
    ];
    const t = criarTrello(ENV, { consultar });
    const chave = chaveN8n('Festa na Praça 19/11 SP');
    const achado = await t.naProducao('Festa na Praça 19/11 SP');
    expect(achado).toMatchObject({ card: 'cardVelho', url: 'https://trello.com/c/cardVelho', registro: 'recP1', status: ['PRODUZINDO'], artes: 3 });
    expect(chave).toBeTruthy();
    expect((await t.naProducao('SHOW DA NOITE 20/11'))?.card).toBe('cardShow');
    expect(await t.naProducao('Nada a ver 01/01')).toBeNull();
  });

  it('só olha os últimos 3 meses (a key não tem o ano)', async () => {
    const consultas: string[] = [];
    const t = criarTrello(ENV, { consultar: async (sql: string) => (consultas.push(sql), []) });
    await t.naProducao('Festa na Praça 19/11 SP');
    expect(consultas[0]).toMatch(/"data_entrada" >= now\(\) - interval '3 months'/);
    expect(consultas[0]).not.toMatch(/"key" = \$1 OR/);
  });

  it('v2: não cria card; põe só as artes novas no checklist, anexa o roteiro, comenta e atualiza o Teable', async () => {
    const { buscar, pedidos } = falsos();
    const buscarComCard = async (endereco: string, init: RequestInit = {}) => {
      const u = new URL(endereco);
      if ((init.method ?? 'GET') === 'GET' && u.pathname.endsWith('/cards/cardVelho')) return { ok: true, status: 200, json: async () => ({ id: 'cardVelho', shortUrl: 'https://trello.com/c/VELHO' }), text: async () => '' };
      if ((init.method ?? 'GET') === 'GET' && u.pathname.endsWith('/cards/cardVelho/checklists'))
        return { ok: true, status: 200, json: async () => [{ id: 'chkVelho', name: 'ARTES PRODUZIDAS', checkItems: [{ name: 'A GRANDE FESTA' }] }], text: async () => '' };
      return buscar(endereco, init);
    };
    const t = criarTrello(ENV, { buscar: buscarComCard, ...banco(), sftp: async () => {} });
    const r = await t.enviar({ meta: { ...meta, v2De: { card: 'cardVelho', url: 'https://trello.com/c/cardVelho', registro: 'recP1' } }, doc: DOC, artes: ['A GRANDE FESTA', 'SÁBADO'], texto: 'texto novo', original });
    expect(r).toMatchObject({ card: { id: 'cardVelho', url: 'https://trello.com/c/VELHO' }, v2: true, novas: 1 });
    expect(pedidos.some((p) => p.metodo === 'POST' && p.url.pathname.endsWith('/cards'))).toBe(false);
    const itens = pedidos.filter((p) => p.url.pathname.includes('/checklists/chkVelho/checkItems')).map((p) => p.url.searchParams.get('name'));
    expect(itens).toEqual(['SÁBADO']);
    const anexo = pedidos.find((p) => p.url.pathname.endsWith('/cards/cardVelho/attachments'));
    expect((anexo?.corpo as { name: string }).name).toMatch(/ V2\.pdf$/);
    expect(pedidos.find((p) => p.url.pathname.endsWith('/cards/cardVelho/actions/comments'))?.url.searchParams.get('text')).toContain('1 arte nova no checklist (SÁBADO)');
    const patch = pedidos.find((p) => p.metodo === 'PATCH' && p.url.host === 'teable:3000');
    expect(patch?.url.pathname).toContain('/record/recP1');
    expect((patch?.corpo as { record: { fields: Record<string, unknown> } }).record.fields).toMatchObject({ artes: 'A GRANDE FESTA | SÁBADO', artes_quantidade: 2 });
  });

  it('"é outro roteiro" passa pela checagem de duplicado de hoje', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, ...banco({ duplicado: true }), sftp: async () => {} });
    expect(await t.enviar({ meta, doc: DOC, artes: ['X'], original })).toMatchObject({ duplicado: true });
    const r = await t.enviar({ meta: { ...meta, outroRoteiro: true }, doc: DOC, artes: ['X'], original });
    expect(r.card?.id).toBeTruthy();
    expect(pedidos.filter((p) => p.metodo === 'POST' && p.url.pathname.endsWith('/cards'))).toHaveLength(1);
  });
});

describe('PDF do card que já está na produção', () => {
  const linha = (doc: string) => async () => [{ registro: 'r', card_ID: 'cardVelho', claquete: 'FESTA NA PRACA 19/11 SP', key: chaveN8n('Festa na Praça 19/11 SP'), status: null, data_entrada: new Date(), artes_quantidade: 1, artes: 'A', texto: 't', doc }];
  it('baixa o anexo do link do Teable, com a autenticação do Trello', async () => {
    const pedidos: { url: string; auth?: string }[] = [];
    const buscar = async (url: string, init: RequestInit = {}) => {
      pedidos.push({ url, auth: (init.headers as Record<string, string> | undefined)?.authorization });
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4').buffer, json: async () => ({}), text: async () => '' };
    };
    const t = criarTrello(ENV, { buscar, consultar: linha('https://trello.com/1/cards/x/attachments/y/download/roteiro.pdf') });
    const pdf = await t.pdfDaProducao('Festa na Praça 19/11 SP');
    expect(pdf?.dados.toString()).toBe('%PDF-1.4');
    expect(pedidos[0].auth).toMatch(/^OAuth oauth_consumer_key="k", oauth_token="t"$/);
  });
  it('não busca endereço que não seja do Trello', async () => {
    const pedidos: string[] = [];
    const buscar = async (url: string) => (pedidos.push(url), { ok: true, status: 200, json: async () => [], arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' });
    const t = criarTrello(ENV, { buscar, consultar: linha('https://intranet.exemplo/segredo.pdf') });
    expect(await t.pdfDaProducao('Festa na Praça 19/11 SP')).toBeNull();
    expect(pedidos.some((u) => u.includes('intranet'))).toBe(false);
  });
});

describe('sem claquete', () => {
  it('o card leva o nome do arquivo, em vez de recusar', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, ...banco(), sftp: async () => {} });
    const r = await t.enviar({ meta: { ...meta, claquete: '', dataExibicao: '' }, doc: DOC, artes: ['X'], original: { ...original, nome: 'Vt_Evento_Interno.docx' } });
    expect(r.card?.id).toBeTruthy();
    const card = pedidos.find((p) => p.metodo === 'POST' && p.url.pathname.endsWith('/cards'));
    expect((card?.corpo as { name: string }).name).toBe('Vt Evento Interno');
  });
});

describe('artes que já existem no acervo', () => {
  it('vão no PDF, mas não no checklist nem na conta; a descrição diz para não produzir', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, ...banco(), sftp: async () => {} });
    await t.enviar({ meta, doc: DOC, artes: [{ texto: 'A GRANDE FESTA' }, { texto: 'HOJE', existe: true }, { texto: 'AMANHÃ', existe: true }], original });
    const itens = pedidos.filter((p) => p.url.pathname.includes('/checkItems')).map((p) => p.url.searchParams.get('name'));
    expect(itens).toEqual(['A GRANDE FESTA']);
    const card = pedidos.find((p) => p.metodo === 'POST' && p.url.pathname.endsWith('/cards'))?.corpo as { desc: string };
    expect(card.desc).toContain('**JÁ EXISTEM (não produzir):**\n`HOJE`, `AMANHÃ`');
    const teable = pedidos.find((p) => p.url.host === 'teable:3000' && p.metodo === 'POST')?.corpo as { records: { fields: Record<string, unknown> }[] };
    expect(teable.records[0].fields).toMatchObject({ artes: 'A GRANDE FESTA', artes_quantidade: 1, artes_existentes: 'HOJE | AMANHÃ' });
  });
});

describe('PDF do card: sempre o roteiro como chegou', () => {
  it('Word com Stirling: o original é convertido lá, sem nada da revisão', async () => {
    const pedidos: { url: string; nome?: string; chave?: string }[] = [];
    const buscar = async (url: string, init: RequestInit = {}) => {
      const arq = init.body instanceof FormData ? (init.body.get('fileInput') as File | null) : null;
      pedidos.push({ url, nome: arq?.name, chave: (init.headers as Record<string, string> | undefined)?.['X-API-KEY'] });
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('%PDF-stirling').buffer, json: async () => ({}), text: async () => '' };
    };
    const t = criarTrello({ ...ENV, STIRLING_URL: 'http://stirling:8080/', STIRLING_CHAVE: 'chave-do-stirling' }, { buscar });
    const pdf = await t.pdfDoRoteiro({ meta, doc: DOC, docOriginal: DOC, original }, [{ texto: 'X' }]);
    expect(pedidos[0]).toEqual({ url: 'http://stirling:8080/api/v1/convert/file/pdf', nome: 'Festa_Na_Praca_19_11_SP.docx', chave: 'chave-do-stirling' });
    expect(pdf.nome).toBe('Festa_Na_Praca_19_11_SP.pdf');
    expect(pdf.dados.toString()).toBe('%PDF-stirling');
  });

  it('sem Stirling (ou se ele falhar): sai do roteiro como foi importado, não do editado', async () => {
    const buscar = async () => ({ ok: false, status: 500, text: async () => 'erro', json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) });
    const t = criarTrello({ ...ENV, STIRLING_URL: 'http://stirling:8080' }, { buscar });
    const editado = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TEXTO EDITADO NA REVISAO' }] }] };
    const pdf = await t.pdfDoRoteiro({ meta, doc: editado, docOriginal: DOC, original }, [{ texto: 'X' }]);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf.dados), isEvalSupported: false }).promise;
    const pagina = await doc.getPage(1);
    const texto = (await pagina.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
    expect(texto).toContain('A GRANDE FESTA');
    expect(texto).not.toContain('EDITADO');
    expect(texto).not.toMatch(/ARTES \(/); // o original não tem a lista de artes no fim
  });

  it('PDF que chegou vai como veio', async () => {
    const t = criarTrello(ENV, {});
    const pdfOriginal = { nome: 'Roteiro.pdf', tipo: 'application/pdf', dados: Buffer.from('%PDF-original') };
    expect((await t.pdfDoRoteiro({ meta, doc: DOC, original: pdfOriginal }, [])).dados.toString()).toBe('%PDF-original');
  });
});

describe('PDF do card sem Stirling: o sublinhado do redator, nem mais nem menos', () => {
  const sublinhados = async (dados: Buffer) => {
    // pdfkit desenha o sublinhado como um traço logo abaixo do texto: conta os traços e preenchimentos
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(dados), isEvalSupported: false, verbosity: 0 }).promise;
    const pagina = await doc.getPage(1);
    const texto = (await pagina.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('');
    const ops = await pagina.getOperatorList();
    const preenchimentos = ops.fnArray.filter((f) => [pdfjs.OPS.fill, pdfjs.OPS.eoFill, pdfjs.OPS.stroke, pdfjs.OPS.fillStroke].includes(f)).length;
    return { texto, preenchimentos };
  };
  it('sai do texto do original: o que estava sublinhado (até o link) sublinha; o resto não', async () => {
    const t = criarTrello(ENV, {});
    const textoOriginal = [
      [{ t: 'VEM AÍ ' }, { t: 'A GRANDE FESTA', u: 1 }, { t: '. Veja em ' }, { t: 'www.exemplo.com', u: 1 }],
      [{ t: 'NADA SUBLINHADO AQUI' }],
    ];
    const comOriginal = await t.pdfDoRoteiro({ meta, doc: DOC, docOriginal: DOC, textoOriginal, original }, [{ texto: 'X' }]);
    const semNada = await t.pdfDoRoteiro({ meta, doc: DOC, docOriginal: DOC, textoOriginal: [[{ t: 'VEM AÍ A GRANDE FESTA. Veja em www.exemplo.com' }], [{ t: 'NADA SUBLINHADO AQUI' }]], original }, []);
    const a = await sublinhados(comOriginal.dados);
    const b = await sublinhados(semNada.dados);
    expect(a.texto).toContain('www.exemplo.com');
    expect(a.texto).not.toMatch(/ARTES \(/);
    expect(a.preenchimentos - b.preenchimentos).toBe(2); // os dois trechos sublinhados pelo redator, e só eles
  });
});

describe('uma entrada por praça', () => {
  const env = { ...ENV, TRELLO_LISTA: 'listaPadrao', TRELLO_LISTA_SP: 'entradaSP', TRELLO_LISTA_RJ: 'entradaRJ', TRELLO_LISTA_G5: 'entradaRJ', TRELLO_LISTA_INTER: 'entradaINTER', TRELLO_LISTA_VT: '' };
  const lista = async (e: Record<string, string>, praca: string, claquete = 'Festa na Praça 19/11') => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(e, { buscar, ...banco(), sftp: async () => {} });
    const r = await t.enviar({ meta: { ...meta, praca, claquete }, doc: DOC, artes: ['X'], original });
    const card = pedidos.find((p) => p.metodo === 'POST' && p.url.pathname.endsWith('/cards'))?.corpo as { idList: string };
    return { lista: card.idList, avisos: r.avisos };
  };
  it('SP, RJ, G5 (pode repetir a do RJ) e INTER, cada uma na sua', async () => {
    expect((await lista(env, 'SP')).lista).toBe('entradaSP');
    expect((await lista(env, 'RJ')).lista).toBe('entradaRJ');
    expect((await lista(env, 'G5')).lista).toBe('entradaRJ');
    expect((await lista(env, 'INTER')).lista).toBe('entradaINTER');
  });
  it('praça sem a sua lista vai para a TRELLO_LISTA, com aviso', async () => {
    const r = await lista({ ...env, TRELLO_LISTA_INTER: '' }, 'INTER');
    expect(r.lista).toBe('listaPadrao');
    expect(r.avisos.join(' ')).toContain('sem TRELLO_LISTA_INTER');
  });
});

describe('convivência com o n8n: lê a produção de outra base, grava na sua', () => {
  it('andamento, claquete repetida e "já entrou hoje" vêm de TEABLE_PG_ARTE_LEITURA; o registro vai para a tabela do app', async () => {
    const lidas: string[] = [];
    const consultar = async (sql: string) => {
      lidas.push(sql);
      if (sql.includes('"bseProd"."producaoViva"') && sql.includes('"designers"')) return [{ card_ID: 'cardN8n', claquete: 'X', status: '["FINALIZADO"]', designers: '[]', entregue: true, data_entrega: null, data_entrada: null }];
      return [];
    };
    const env = { ...ENV, TEABLE_PG_ARTE_LEITURA: 'bseProd.producaoViva' };
    const t = criarTrello(env, { consultar });
    expect((await t.andamento([{ id: 'r1', card: 'cardN8n' }])).r1.status).toEqual(['FINALIZADO']);
    await t.naProducao('Festa na Praça 19/11 SP');
    expect(lidas.filter((s) => s.includes('"producao"'))).toHaveLength(0);
    const { buscar, pedidos } = falsos();
    const b = banco();
    const consultar2 = async (sql: string, params: unknown[] = []) => (lidas.push(sql), b.consultar(sql, params));
    await criarTrello(env, { buscar, consultar: consultar2, sftp: async () => {} }).enviar({ meta, doc: DOC, artes: ['X'], original });
    expect(lidas.some((s) => s.includes('"bseProd"."producaoViva"') && s.includes('America/Sao_Paulo'))).toBe(true);
    expect(pedidos.some((p) => p.url.pathname === '/api/table/tblProducao/record')).toBe(true);
  });
});

describe('checklist com mais de um tipo', () => {
  it('a arte com dois tipos vira dois itens; com um tipo (ou sem), um item; a que já existe fica de fora', async () => {
    const { itensDoChecklist } = await import('../servidor/trello.mjs' as string);
    expect(itensDoChecklist([
      { texto: 'HOJE', tipos: ['RDP', 'CRT'] },
      { texto: 'AMANHÃ', tipos: ['LETT'] },
      { texto: 'SÁBADO', tipos: [] },
      { texto: 'DOMINGO', tipos: ['RDP', 'CRT'], existe: true },
    ])).toEqual(['HOJE (RDP)', 'HOJE (CRT)', 'AMANHÃ', 'SÁBADO']);
  });
});

describe('atração pela claquete, no servidor', () => {
  it('"CHEF(MANUT) C" procura a key CHEF nas keys do Teable', async () => {
    const { chaveDaAtracao } = await import('../servidor/trello.mjs' as string);
    expect(chaveDaAtracao('CHEF(MANUT) C')).toBe('CHEF');
    const params: unknown[] = [];
    const consultar = async (sql: string, p: unknown[] = []) => (sql.includes('"pattern"') ? (params.push(p[0]), [{ atracao: 'Chef de Alto Nível', projeto_win: '', output_win: '' }]) : []);
    const t = criarTrello(ENV, { consultar });
    expect(await t.atracaoDaClaquete('CHEF(MANUT) C')).toBe('Chef de Alto Nível');
    expect(params).toEqual(['CHEF']);
    expect(await criarTrello(ENV, { consultar: async () => [] }).atracaoDaClaquete('NADA 1/1')).toBe('');
  });
});
