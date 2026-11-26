// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { artesDaProducao, chaveDaAtracao, chaveN8n, criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { comTabelas } from '../servidor/tabelas-do-teable.mjs';

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
  TEABLE_KEY_REDATORES: 'tblKeyRedatores',
  TEABLE_PG_URL: 'postgres://x',
  TEABLE_PG_ESQUEMA: 'bseBase',
  ...comTabelas({ ARTE_producao: 'producao', redatores: 'redatores', editores: 'editores', atracoes: 'atracoes', prioridade: 'prioridade', exibicoes: 'exibicoes' }),
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

/** Uma linha da tabela prioridade (o histórico das listas): a claquete e o dia da lista. A key sai da claquete. */
interface Prioridade {
  claquete: string;
  data: string;
}

/** A tabela prioridade no Postgres falso: as linhas das keys pedidas ($1) em listas de hoje ($2) em diante. */
const listaDePrioridade = (linhas: Prioridade[]) => async (_sql: string, params: unknown[]) =>
  linhas
    .map((l) => ({ key: chaveN8n(l.claquete), claquete: l.claquete, data: l.data }))
    .filter((l) => (params[0] as string[]).includes(l.key) && l.data >= String(params[1]));

/** O Postgres do Teable, respondendo pelo nome da tabela na consulta. */
function banco(opcoes: { duplicado?: boolean; redatorNovo?: boolean; redatorSemId?: boolean; sessao?: boolean; prioridade?: Prioridade[] } = {}) {
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
    if (sql.includes('"prioridade"')) return listaDePrioridade(opcoes.prioridade ?? [{ claquete: 'Festa na Praça 19/11 SP', data: '2026-11-19' }])(sql, params);
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
    expect(chaveDaAtracao('Rio(Chef)manut_')).toBe('CHEF');
    expect(chaveDaAtracao('Rio-Mira 21/11')).toBe('MIRA');
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

  it('o card e a linha da produção nascem com a data em barra, com a mesma key', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, consultar: banco().consultar });
    await t.enviar({ meta: { ...meta, claquete: 'Festa na Praça 19-11-2 SP' }, artes: ['X'], original }, new Date('2026-11-19T12:00:00Z'));
    expect(pedidos.find((p) => p.url.pathname === '/1/cards' && p.metodo === 'POST')!.corpo).toMatchObject({ name: 'Festa na Praça 19/11-2 SP' });
    const registro = pedidos.find((p) => p.url.pathname === '/api/table/tblProducao/record')!.corpo as { records: { fields: Record<string, unknown> }[] };
    expect(registro.records[0].fields).toMatchObject({ claquete: 'Festa na Praça 19/11-2 SP', key: chaveN8n('Festa na Praça 19-11-2 SP') });
  });

  it('a claquete com traço ainda acha a que já entrou hoje com outra grafia', async () => {
    const { buscar } = falsos();
    const t = criarTrello(ENV, { buscar, consultar: banco({ duplicado: true }).consultar });
    expect(await t.enviar({ meta: { ...meta, claquete: 'Festa na Praça 19-11 SP' }, artes: [], original })).toMatchObject({ duplicado: true });
  });

  it('a claquete já exibida não leva a prioridade ALTA, mesmo na lista de hoje', async () => {
    const { buscar, pedidos } = falsos();
    const { consultar } = banco({ prioridade: [{ claquete: 'Festa na Praça 19/11 SP', data: '2026-11-21' }] });
    const t = criarTrello(ENV, { buscar, consultar });
    await t.enviar({ meta, artes: ['X'], original }, new Date('2026-11-21T12:00:00Z'));
    expect(campoPut(pedidos, 'cPrio')).toBeUndefined();
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
    expect(pedidos.find((p) => p.url.pathname === '/api/table/tblRedatores/record')!.corpo).toMatchObject({ records: [{ fields: { redator: 'Nova Pessoa', redator_ID: 'opNovoRedator' } }] });
    expect(pedidos.find((p) => p.url.pathname === '/api/table/tblKeyRedatores/record')!.corpo).toMatchObject({ records: [{ fields: { key: 'NOVA PESSOA', redator: [{ id: 'rec1' }] } }] });
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

  it('o redator e o editor guardados com a opção do quadro antigo: a opção é recriada no campo de agora e o Teable atualizado', async () => {
    // trocado o quadro (#76): a linha do Teable guarda a opção e o campo do quadro velho
    const env = { ...ENV, TRELLO_CAMPO_EDITOR: 'cEditorNovo', TEABLE_EDITORES: 'tblEditores' };
    const { buscar: base, pedidos } = falsos();
    // o campo do editor no quadro novo já tem a opção com o nome dela: é usada, sem criar outra
    const buscar = async (endereco: string, init: RequestInit = {}) =>
      new URL(endereco).pathname === '/1/customFields/cEditorNovo' && (init.method ?? 'GET') === 'GET'
        ? { ok: true, status: 200, json: async () => ({ id: 'cEditorNovo', options: [{ id: 'opBrunoJa', value: { text: 'BRUNO REGIS' } }] }), text: async () => '' }
        : base(endereco, init);
    const doBanco = banco();
    const consultar = async (sql: string, params: unknown[] = []) => {
      if (sql.includes('"redatores"') && !sql.includes('MAX(')) return [{ id: 'recAna', redator: 'Ana Lima', redator_ID: 'opAnaVelha', customField_ID: 'cRedatorVelho' }];
      if (sql.includes('"editores"')) return [{ id: 'recBruno', editor: 'Bruno Regis', editor_ID: 'opBrunoVelho', customField_ID: 'cEditorVelho' }];
      return doBanco.consultar(sql, params);
    };
    await criarTrello(env, { buscar, consultar }).enviar({ meta, artes: ['X'] });
    expect(campoPut(pedidos, 'cRedator')).toEqual({ idValue: 'opNovoRedator' });
    expect(campoPut(pedidos, 'cEditorNovo')).toEqual({ idValue: 'opBrunoJa' });
    expect(pedidos.find((p) => p.url.pathname === '/1/customField/cRedator/options')!.corpo).toEqual({ pos: 'bottom', value: { text: 'Ana Lima' } });
    expect(pedidos.some((p) => p.url.pathname === '/1/customField/cEditorNovo/options')).toBe(false);
    const patch = (tabela: string) => pedidos.find((p) => p.metodo === 'PATCH' && p.url.pathname.startsWith(`/api/table/${tabela}/record/`));
    expect(patch('tblRedatores')!.url.pathname).toBe('/api/table/tblRedatores/record/recAna');
    expect(patch('tblRedatores')!.corpo).toMatchObject({ record: { fields: { redator_ID: 'opNovoRedator', customField_ID: 'cRedator' } } });
    expect(patch('tblEditores')!.url.pathname).toBe('/api/table/tblEditores/record/recBruno');
    expect(patch('tblEditores')!.corpo).toMatchObject({ record: { fields: { editor_ID: 'opBrunoJa', customField_ID: 'cEditorNovo' } } });
  });

  it('a opção guardada no mesmo campo de agora vale como está: nada é criado', async () => {
    const { buscar, pedidos } = falsos();
    await criarTrello({ ...ENV, TRELLO_CAMPO_EDITOR: 'cEditor' }, { buscar, consultar: banco().consultar }).enviar({ meta, artes: ['X'] });
    expect(campoPut(pedidos, 'cRedator')).toEqual({ idValue: 'opAna' });
    expect(campoPut(pedidos, 'cEditor')).toEqual({ idValue: 'opBruno' });
    expect(pedidos.some((p) => p.url.pathname.endsWith('/options') || p.metodo === 'PATCH')).toBe(false);
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
    expect(a.r1).toEqual({ status: ['EM APROVAÇÃO'], designers: ['Rafa Lins'], entregue: false, entrega: '2026-11-21T03:00:00.000Z', entrada: '2026-11-20T10:00:00.000Z', claquete: 'SHOW DA NOITE 20/11 SP' });
    expect(a.r2).toMatchObject({ status: ['FINALIZADO'], designers: ['Bia Costa', 'Rafa Lins'], entregue: true, entrega: null });
    expect(a.r3.status).toEqual(['CAIU']); // a linha mais recente com a mesma claquete
    expect(a.r4).toBeUndefined();
    // a entrada na produção da arte vai junto (a agenda por entrada); sem a data_entrada, null
    expect(a.r3.entrada).toBe('2026-11-20T08:00:00.000Z');
    expect(consultas[0].sql).toContain('"bseBase"."producao"');
    const n = consultas.length;
    await t.andamento(itens);
    expect(consultas).toHaveLength(n);
  });

  it('a atração ligada na produção da arte de cada card, numa leitura só (#54)', async () => {
    const consultas: { sql: string; params: unknown[] }[] = [];
    const linhas = [
      { card_ID: 'c1', atracao: '[{"id":"recEnc","title":"Encontro"}]' },
      { card_ID: 'c2', atracao: [{ id: 'recShow', title: 'Show da Noite' }] },
      { card_ID: 'c3', atracao: null },
    ];
    const consultar = async (sql: string, params: unknown[] = []) => (consultas.push({ sql, params }), linhas.filter((l) => (params[0] as string[]).includes(l.card_ID)));
    const t = criarTrello(ENV, { consultar });
    expect(await t.atracoesDosCards(['c1', 'c2', 'c3', 'sumiu'])).toEqual({ c1: 'Encontro', c2: 'Show da Noite' });
    expect(consultas).toHaveLength(1);
    expect(consultas[0].sql).toContain('"bseBase"."producao"');
    expect(consultas[0].sql).toContain('"atracao"');
    expect(await t.atracoesDosCards([])).toEqual({});
    expect(await t.atracoesDosCards(['sumiu', 'c3', 'c2', 'c1'])).toEqual({ c1: 'Encontro', c2: 'Show da Noite' }); // guardado por 30 s
    expect(consultas).toHaveLength(1);
  });

  it('devolve a claquete como está hoje na produção da arte (o nome do card renomeado)', async () => {
    const consultas: { sql: string; params: unknown[] }[] = [];
    const consultar = async (sql: string, params: unknown[] = []) => {
      consultas.push({ sql, params });
      if (!sql.includes('"card_ID"')) return [];
      return [
        { card_ID: 'c1', claquete: 'Eliana(Reperc)7/6', status: null, designers: null, entregue: false, data_entrega: null, data_entrada: null },
        { card_ID: 'c2', claquete: '  ', status: null, designers: null, entregue: false, data_entrega: null, data_entrada: null },
        { card_ID: 'c3', claquete: null, status: null, designers: null, entregue: false, data_entrega: null, data_entrada: null },
      ].filter((l) => (params[0] as string[]).includes(l.card_ID));
    };
    const a = await criarTrello(ENV, { consultar }).andamento([
      { id: 'r1', card: 'c1', claquete: 'Eliana (Reperc) 7-6' },
      { id: 'r2', card: 'c2', claquete: 'NOME 14-6' },
      { id: 'r3', card: 'c3', claquete: 'NOME 15-6' },
    ]);
    expect(a.r1.claquete).toBe('Eliana(Reperc)7/6');
    // sem nome na produção da arte, nada: a tela usa o guardado no padrão
    expect(a.r2).not.toHaveProperty('claquete');
    expect(a.r3).not.toHaveProperty('claquete');
  });

  it('conta as artes da produção da arte uma vez cada, como a lista do editor (artesUnicas)', () => {
    expect(artesDaProducao('VEM AI | HOJE | AMANHA')).toBe(3);
    // a mesma arte escrita de outro jeito (acento, caixa, pontuação) conta uma vez
    expect(artesDaProducao('Vem aí | VEM AI! | hoje')).toBe(2);
    // a arte com mais de um tipo vai ao checklist uma vez por tipo, mas é uma arte só
    expect(artesDaProducao('HOJE (RDP) | HOJE (CRT) | AMANHA')).toBe(2);
    // parênteses que são do texto da arte (um tipo só não ganha sufixo): ficam como estão
    expect(artesDaProducao('ELIANA (AO VIVO) | ELIANA')).toBe(2);
    // uma por linha também vale; vazio ou nulo não dá contagem
    expect(artesDaProducao('VEM AI\nHOJE')).toBe(2);
    expect(artesDaProducao('')).toBeNull();
    expect(artesDaProducao('  |  ')).toBeNull();
    expect(artesDaProducao(null)).toBeNull();
  });

  it('o andamento traz a contagem de artes da produção da arte, sem as repetidas; sem a coluna preenchida, não traz', async () => {
    const consultar = async (sql: string, params: unknown[] = []) => {
      if (!sql.includes('"card_ID"')) return [];
      return [
        { card_ID: 'c1', claquete: 'NOME 14/6', artes: 'HOJE (RDP) | HOJE (CRT) | VEM AI | Vem aí', status: null, designers: null, entregue: false, data_entrega: null, data_entrada: null },
        { card_ID: 'c2', claquete: 'NOME 15/6', artes: null, status: null, designers: null, entregue: false, data_entrega: null, data_entrada: null },
      ].filter((l) => (params[0] as string[]).includes(l.card_ID));
    };
    const consultas: string[] = [];
    const a = await criarTrello(ENV, { consultar: (sql: string, p?: unknown[]) => (consultas.push(sql), consultar(sql, p)) }).andamento([
      { id: 'r1', card: 'c1', claquete: 'NOME 14-6' },
      { id: 'r2', card: 'c2', claquete: 'NOME 15-6' },
    ]);
    expect(consultas.some((q) => q.includes('"artes"'))).toBe(true);
    expect(a.r1.artes).toBe(2);
    expect(a.r2).not.toHaveProperty('artes');
  });

  it('sem Postgres ou com erro, devolve vazio', async () => {
    expect(await criarTrello({ ...ENV, ...comTabelas({ ARTE_producao: '' }) }, { consultar: async () => [] }).andamento([{ id: 'r', card: 'c' }])).toEqual({});
    const t = criarTrello(ENV, { consultar: async () => { throw new Error('coluna não existe'); } });
    expect(await t.andamento([{ id: 'r', card: 'c', claquete: '' }])).toEqual({});
  });

  it('diz quais roteiros estão na lista de prioridade, os enviados e os da fila de revisão, pela chave da claquete', async () => {
    const consultar = async (sql: string, params: unknown[] = []) => {
      if (sql.includes('"bseBase"."prioridade"')) return ['SHOW DA NOITE 20 11 SP', 'ENCONTRO 25 11 AH'].filter((k) => (params[0] as string[]).includes(k)).map((key) => ({ key }));
      return [
        { card_ID: 'c1', claquete: 'SHOW DA NOITE 20/11 SP', status: ['PRODUZINDO'], designers: [], entregue: false, data_entrega: null, data_entrada: null },
        { card_ID: 'c2', claquete: 'FESTA 20/11', status: ['PRODUZINDO'], designers: [], entregue: false, data_entrega: null, data_entrada: null },
      ].filter((l) => (params[0] as string[]).includes(l.card_ID));
    };
    const itens = [
      { id: 'r1', card: 'c1', claquete: 'Show da Noite(20/11) SP' },
      { id: 'r2', card: 'c2', claquete: 'FESTA 20/11' },
      { id: 'r3', card: null, claquete: 'Encontro 25/11 (AH)', naFila: true },
      { id: 'r4', card: null, claquete: 'Profissão Repórter 26/11', naFila: true },
    ];
    const a = await criarTrello(ENV, { consultar }).andamento(itens);
    expect(a.r1).toMatchObject({ status: ['PRODUZINDO'], prioridade: true });
    expect(a.r2.prioridade).toBeUndefined();
    expect(a.r3).toEqual({ status: [], designers: [], entregue: false, entrega: null, prioridade: true });
    expect(a.r4).toBeUndefined();

    // sem a tabela de prioridade, nada é destacado e o andamento continua
    const sem = await criarTrello({ ...ENV, tabelas: { ...ENV.tabelas, prioridade: { pg: '' } } }, { consultar }).andamento(itens);
    expect(sem.r1).toEqual({ status: ['PRODUZINDO'], designers: [], entregue: false, entrega: null, entrada: null, claquete: 'SHOW DA NOITE 20/11 SP' });
    expect(Object.keys(sem)).toEqual(['r1', 'r2']);

    // a lista de prioridade fora do ar não derruba o andamento
    const falha = async (sql: string, params: unknown[] = []) => (sql.includes('prioridade') ? Promise.reject(new Error('caiu')) : consultar(sql, params));
    const comFalha = await criarTrello(ENV, { consultar: falha }).andamento(itens);
    expect(Object.keys(comFalha)).toEqual(['r1', 'r2']);
  });
});

describe('lista de prioridade no andamento', () => {
  it('conta só a key de uma lista de hoje em diante cuja claquete ainda não foi exibida', async () => {
    const consultar = async (sql: string, params: unknown[] = []) =>
      sql.includes('"bseBase"."prioridade"')
        ? listaDePrioridade([
            { claquete: 'Terra 27/11 (A)', data: '2026-11-25' }, // lista antiga
            { claquete: 'Encontro 24/11 (H)', data: '2026-11-26' }, // lista de hoje, já exibida
            { claquete: 'Encontro 26/11 (H)', data: '2026-11-26' }, // lista de hoje, ainda não exibida
            { claquete: 'Chef(Manut) D', data: '2026-11-27' }, // sem data na claquete
          ])(sql, params)
        : [];
    const itens = ['Terra 27/11 (A)', 'Encontro 24/11 (H)', 'Encontro 26/11 (H)', 'Chef(Manut) D'].map((claquete, i) => ({ id: `r${i}`, card: null, claquete, naFila: true }));
    const a = await criarTrello(ENV, { consultar, agora: () => new Date('2026-11-26T15:00:00Z') }).andamento(itens);
    expect(Object.keys(a).filter((id) => a[id].prioridade)).toEqual(['r2', 'r3']);
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
  it('sem o link do PDF no Teable, nada: os anexos do card não são lidos no Trello (ADR 0006)', async () => {
    const pedidos: string[] = [];
    const buscar = async (url: string) => (pedidos.push(url), { ok: true, status: 200, json: async () => [{ url: 'https://trello.com/1/cards/x/attachments/y/download/a.pdf', mimeType: 'application/pdf' }], arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' });
    const t = criarTrello(ENV, { buscar, consultar: linha('') });
    expect(await t.pdfDaProducao('Festa na Praça 19/11 SP')).toBeNull();
    expect(pedidos).toEqual([]);
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

describe('filmes na fila', () => {
  it('o andamento vem do card no Trello (sem a ARTE_producao) e as artes da exibição', async () => {
    const pedidos: string[] = [];
    const buscar = async (endereco: string) => {
      const url = new URL(endereco);
      pedidos.push(url.pathname + '?' + (url.searchParams.get('urls') ?? ''));
      const card = {
        labels: [{ name: 'FILME' }, { name: 'PRODUZINDO' }],
        members: [{ fullName: 'Juliana Barão' }],
        dueComplete: false,
      };
      return { ok: true, status: 200, json: async () => [{ 200: card }], text: async () => '' };
    };
    const consultas: string[] = [];
    const consultar = async (sql: string) => {
      consultas.push(sql);
      return [{ id: 'recExib', card: '6b04334f81cc4c3dcdf0ebca', link: 'https://trello.com/c/AbC', inedito: true, labels: null, data: '2026-12-06', filme: 'Duro de Matar (1988)', filme_id: 'recFilme', sessao: 'Cinemaço', artes: 'DURO DE MATAR | HOJE', artes_existentes: 'AMANHÃ' }];
    };
    const t = criarTrello(ENV, { buscar, consultar });
    const [f] = await t.filmesProximos(14);
    expect(consultas[0]).not.toContain('"producao"');
    expect(pedidos[0]).toContain('/1/batch');
    expect(pedidos[0]).toContain('/cards/6b04334f81cc4c3dcdf0ebca');
    expect(f).toMatchObject({ titulo: 'Duro de Matar', ano: 1988, status: ['PRODUZINDO'], designers: ['Juliana Barão'], entregue: false, artes: ['DURO DE MATAR', 'HOJE'], existentes: ['AMANHÃ'] });
    // a segunda vez (dentro de 2 min) não pergunta de novo ao Trello
    await t.filmesProximos(14);
    expect(pedidos).toHaveLength(1);
  });
});

describe('✓ já existe: no envio, a arte confirmada entra no acervo da atração', () => {
  it('guarda só as confirmadas (com a atração, o dia e o tipo); as novas esperam o card sair', async () => {
    const guardadas: { atracao: string; data: string; artes: { texto: string; tipos: string[] }[] }[] = [];
    const acervo = {
      ligado: true,
      grava: true,
      registrar: async (x: (typeof guardadas)[number]) => (guardadas.push(x), x.artes.length),
      parar: async () => {},
    };
    const trello = { ligado: true, parar: async () => {}, enviar: async () => ({ card: { id: 'c9', url: 'https://trello.com/c/C9' }, avisos: [] }) };
    const app = criarApp({ db: abrirBanco(':memory:'), env: {}, trello, acervo });
    const servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    const ana = (caminho: string, init: RequestInit = {}) =>
      fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json', ...init.headers } });
    try {
      await ana('/api/roteiros/rot-ja-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Festa 19/11', programa: 'Festa na Praça', dataExibicao: '2026-11-19' }, doc: { type: 'doc', content: [] } }, nArtes: 2 }) });
      const r = await (
        await ana('/api/roteiros/rot-ja-1/trello', { method: 'POST', body: JSON.stringify({ artes: [{ texto: 'HOJE', tipo: 'RDP', tipos: ['RDP'], existe: true }, { texto: 'A GRANDE FESTA', tipo: 'CRT', tipos: ['CRT'], existe: false }], texto: 'x' }) })
      ).json();
      expect(r.estado).toBe('enviado');
      await new Promise((ok) => setTimeout(ok, 50));
      expect(guardadas).toEqual([{ atracao: 'Festa na Praça', data: '2026-11-19', artes: [{ texto: 'HOJE', tipos: ['RDP'] }] }]);
    } finally {
      servidor.close();
    }
  });
});

describe('card avulso: o mesmo jeito de criar card, fora do envio de roteiros', () => {
  it('cria o card na lista pedida, com etiquetas, checklist, campos, data e anexos', async () => {
    const { buscar, pedidos } = falsos();
    const t = criarTrello(ENV, { buscar, consultar: banco().consultar });
    const r = await t.criarCard({
      lista: 'listaFilmes',
      nome: 'RIVAIS (2024)',
      desc: 'descrição do filme',
      etiquetas: ['etqSessao', 'etqFilme'],
      data: '2026-12-06T22:00:00.000Z',
      checklist: { nome: 'ARTES PRODUZIDAS', itens: ['TÍTULO', 'CARTÃO'] },
      campos: { cComplexidade: { idValue: 'opMedia' }, cIA: { value: { checked: 'true' } } },
      anexos: [{ url: 'https://trello.com/c/OUTRO' }, { nome: 'Rivais.jpg', tipo: 'image/jpeg', dados: Buffer.from('jpg') }],
    });

    expect(r).toMatchObject({ id: 'card1', url: 'https://trello.com/c/CARD1', avisos: [] });
    expect(r.anexos).toHaveLength(2);
    const card = pedidos.find((p) => p.url.pathname === '/1/cards' && p.metodo === 'POST')!;
    expect(card.corpo).toEqual({ idList: 'listaFilmes', name: 'RIVAIS (2024)', desc: 'descrição do filme', idLabels: 'etqSessao,etqFilme', due: '2026-12-06T22:00:00.000Z' });
    expect(pedidos.filter((p) => p.url.pathname === '/1/checklists/checklist1/checkItems').map((p) => p.url.searchParams.get('name'))).toEqual(['TÍTULO', 'CARTÃO']);
    expect(pedidos.find((p) => p.url.pathname === '/1/checklists')!.url.searchParams.get('name')).toBe('ARTES PRODUZIDAS');
    expect(campoPut(pedidos, 'cComplexidade')).toEqual({ idValue: 'opMedia' });
    expect(campoPut(pedidos, 'cIA')).toEqual({ value: { checked: 'true' } });
    const anexos = pedidos.filter((p) => p.url.pathname === '/1/cards/card1/attachments');
    expect(anexos[0].url.searchParams.get('url')).toBe('https://trello.com/c/OUTRO');
    expect(anexos[1].corpo).toMatchObject({ name: 'Rivais.jpg', mimeType: 'image/jpeg', file: 'arquivo:Rivais.jpg' });
  });

  it('sem card não há envio; o resto que falhar vira aviso', async () => {
    const semCard = falsos({ falharCard: true });
    await expect(criarTrello(ENV, { buscar: semCard.buscar }).criarCard({ lista: 'l', nome: 'X' })).rejects.toThrow(/401/);
    const semChecklist = falsos({ falharChecklist: true });
    const r = await criarTrello(ENV, { buscar: semChecklist.buscar }).criarCard({ lista: 'l', nome: 'X', checklist: { nome: 'ARTES', itens: ['A'] } });
    expect(r.id).toBe('card1');
    expect(r.avisos).toEqual([expect.stringMatching(/^criar a checklist: .*500/)]);
  });
});

describe('complexidade da arte: o card leva a maior das artes a produzir', () => {
  /* o campo Complexidade e as opções BAIXA, MÉDIA, ALTA, inventados (o mesmo campo que o card do filme copia) */
  const COM_CAMPO = { ...ENV, TRELLO_CAMPO_COMPLEXIDADE: 'cComplexidade', TRELLO_COMPLEXIDADE_OPCOES: 'opBaixa, opMedia, opAlta' };
  const registro = (pedidos: Pedido[]) =>
    (pedidos.find((p) => p.url.pathname === '/api/table/tblProducao/record')!.corpo as { records: { fields: Record<string, unknown> }[] }).records[0].fields;
  const enviar = async (env: Record<string, string>, artes: unknown[]) => {
    const { buscar, pedidos } = falsos();
    await criarTrello(env, { buscar, ...banco(), sftp: async () => {} }).enviar({ meta, doc: DOC, artes, original });
    return pedidos;
  };

  it('a maior vai no campo do card e na produção da arte', async () => {
    const pedidos = await enviar(COM_CAMPO, [{ texto: 'A GRANDE FESTA', complexidade: 2 }, { texto: 'SÁBADO', complexidade: 3 }, { texto: 'DOMINGO' }]);
    expect(campoPut(pedidos, 'cComplexidade')).toEqual({ idValue: 'opAlta' });
    expect(registro(pedidos).complexidade).toBe(3);
  });

  it('sem marca, vai BAIXA e 1', async () => {
    const pedidos = await enviar(COM_CAMPO, [{ texto: 'A GRANDE FESTA' }, 'SÁBADO']);
    expect(campoPut(pedidos, 'cComplexidade')).toEqual({ idValue: 'opBaixa' });
    expect(registro(pedidos).complexidade).toBe(1);
  });

  it('a arte que já existe não conta (a que está fora nem chega ao servidor)', async () => {
    const pedidos = await enviar(COM_CAMPO, [{ texto: 'A GRANDE FESTA', complexidade: 2 }, { texto: 'HOJE', existe: true, complexidade: 3 }]);
    expect(campoPut(pedidos, 'cComplexidade')).toEqual({ idValue: 'opMedia' });
    expect(registro(pedidos).complexidade).toBe(2);
    // só artes que já existem: nenhuma a produzir, BAIXA
    const soExistem = await enviar(COM_CAMPO, [{ texto: 'HOJE', existe: true, complexidade: 3 }]);
    expect(campoPut(soExistem, 'cComplexidade')).toEqual({ idValue: 'opBaixa' });
    expect(registro(soExistem).complexidade).toBe(1);
  });

  it('o campo não configurado não é preenchido, mas a produção da arte é gravada com o número', async () => {
    const pedidos = await enviar(ENV, [{ texto: 'A GRANDE FESTA', complexidade: 3 }]);
    expect(campoPut(pedidos, 'cComplexidade')).toBeUndefined();
    expect(registro(pedidos).complexidade).toBe(3);
    // o campo sem as opções também não é preenchido
    const semOpcoes = await enviar({ ...ENV, TRELLO_CAMPO_COMPLEXIDADE: 'cComplexidade' }, [{ texto: 'A GRANDE FESTA', complexidade: 3 }]);
    expect(campoPut(semOpcoes, 'cComplexidade')).toBeUndefined();
    expect(registro(semOpcoes).complexidade).toBe(3);
  });

  describe('sessão de filme: vale a maior entre a do card do filme e a da revisão', () => {
    /** Envia a sessão; o card do filme vem com a complexidade MÉDIA (o falso), ou sem o campo. */
    const enviarSessao = async (artes: unknown[], filmeSemCampo = false) => {
      const { buscar, pedidos } = falsos();
      const buscarFilme = async (endereco: string, init: RequestInit = {}) =>
        filmeSemCampo && (init.method ?? 'GET') === 'GET' && new URL(endereco).pathname.endsWith('/cards/cardFilme')
          ? { ok: true, status: 200, json: async () => ({ id: 'cardFilme', idMembers: [], customFieldItems: [{ idCustomField: 'cIA', value: { checked: 'true' } }] }), text: async () => '' }
          : buscar(endereco, init);
      const t = criarTrello(COM_CAMPO, { buscar: buscarFilme, consultar: banco({ sessao: true }).consultar });
      await t.enviar({ meta: { ...meta, claquete: 'Sessão da Tarde 19/11', praca: 'G5' }, artes, original: { ...original, nome: 'sessao.pdf', tipo: 'application/pdf' } });
      const puts = pedidos.filter((p) => p.metodo === 'PUT' && p.url.pathname.endsWith('/customField/cComplexidade/item')).map((p) => p.corpo);
      return { puts, producao: registro(pedidos).complexidade, pedidos };
    };

    it('filme MÉDIA e revisão BAIXA dão MÉDIA', async () => {
      const { puts, producao, pedidos } = await enviarSessao([{ texto: 'X' }]);
      expect(puts).toEqual([{ idValue: 'opMedia' }]);
      expect(producao).toBe(2);
      expect(campoPut(pedidos, 'cIA')).toEqual({ value: { checked: 'true' } });
    });

    it('filme MÉDIA e revisão ALTA dão ALTA', async () => {
      const { puts, producao } = await enviarSessao([{ texto: 'X', complexidade: 3 }]);
      expect(puts).toEqual([{ idValue: 'opAlta' }]);
      expect(producao).toBe(3);
    });

    it('filme sem o campo: vale a da revisão', async () => {
      const { puts, producao } = await enviarSessao([{ texto: 'X' }], true);
      expect(puts).toEqual([{ idValue: 'opBaixa' }]);
      expect(producao).toBe(1);
    });
  });

  it('a rota passa a complexidade de cada arte ao envio', async () => {
    const recebidos: { artes: unknown[] }[] = [];
    const trello = { ligado: true, parar: async () => {}, enviar: async (r: { artes: unknown[] }) => (recebidos.push(r), { card: { id: 'c7', url: 'https://trello.com/c/C7' }, avisos: [] }) };
    const servidor = createServer(criarApp({ db: abrirBanco(':memory:'), env: {}, trello }));
    await new Promise<void>((ok) => servidor.listen(0, ok));
    const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
    const ana = (caminho: string, init: RequestInit = {}) =>
      fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'ana@empresa.com', 'content-type': 'application/json', ...init.headers } });
    try {
      await ana('/api/roteiros/rot-cx-1', { method: 'PUT', body: JSON.stringify({ roteiro: { meta: { claquete: 'Festa 19/11' }, doc: { type: 'doc', content: [] } }, nArtes: 2 }) });
      await ana('/api/roteiros/rot-cx-1/trello', { method: 'POST', body: JSON.stringify({ artes: [{ texto: 'HOJE', tipo: '', complexidade: 3 }, { texto: 'AMANHÃ', tipo: '' }], texto: 'x' }) });
      expect(recebidos[0].artes).toMatchObject([{ texto: 'HOJE', complexidade: 3 }, { texto: 'AMANHÃ', complexidade: 1 }]);
    } finally {
      servidor.close();
    }
  });
});

describe('complexidade da arte na versão nova (V2): recalcula a do card quando a maior muda', () => {
  const COM_CAMPO = { ...ENV, TRELLO_CAMPO_COMPLEXIDADE: 'cComplexidade', TRELLO_COMPLEXIDADE_OPCOES: 'opBaixa, opMedia, opAlta' };
  const v2De = { card: 'cardVelho', url: 'https://trello.com/c/cardVelho', registro: 'recP1' };
  /** Envia a V2 com a linha da produção da arte numa complexidade; devolve os pedidos ao Trello e ao Teable. */
  const enviarV2 = async (env: Record<string, string>, atual: number | null | Error, artes: unknown[], sessao = false) => {
    const { buscar, pedidos } = falsos();
    const buscarComCard = async (endereco: string, init: RequestInit = {}) => {
      const u = new URL(endereco);
      if ((init.method ?? 'GET') === 'GET' && u.pathname.endsWith('/cards/cardVelho')) return { ok: true, status: 200, json: async () => ({ id: 'cardVelho', shortUrl: 'https://trello.com/c/VELHO' }), text: async () => '' };
      if ((init.method ?? 'GET') === 'GET' && u.pathname.endsWith('/cards/cardVelho/checklists'))
        return { ok: true, status: 200, json: async () => [{ id: 'chkVelho', name: 'ARTES PRODUZIDAS', checkItems: [{ name: 'A GRANDE FESTA' }] }], text: async () => '' };
      return buscar(endereco, init);
    };
    // a linha da produção da arte, pelo registro (mesma base) ou pelo card (outra base)
    const consultar = async (sql: string, params: unknown[] = []) => {
      if (atual instanceof Error) throw atual;
      if (sql.includes('"complexidade"') && sql.includes('"producao"')) return ['recP1', 'cardVelho'].includes(String(params[0])) ? [{ id: 'recP1', complexidade: atual }] : [];
      // a sessão de filme: a atração e o card do filme (com a complexidade MÉDIA), como no envio do card novo
      return sessao ? banco({ sessao: true }).consultar(sql, params) : [];
    };
    const m = sessao ? { ...meta, claquete: 'Sessão da Tarde 19/11', praca: 'G5', v2De } : { ...meta, v2De };
    await criarTrello(env, { buscar: buscarComCard, consultar, sftp: async () => {} }).enviar({ meta: m, doc: DOC, artes, texto: 'texto novo', original });
    const patch = pedidos.find((p) => p.metodo === 'PATCH' && p.url.host === 'teable:3000');
    return { pedidos, patch: patch && { rota: patch.url.pathname, campos: (patch.corpo as { record: { fields: Record<string, unknown> } }).record.fields } };
  };
  const putDoCard = (pedidos: Pedido[]) => pedidos.filter((p) => p.metodo === 'PUT' && p.url.pathname.endsWith('/cards/cardVelho/customField/cComplexidade/item')).map((p) => p.corpo);

  it('a maior que sobe: o campo do card e a produção da arte vão para a nova', async () => {
    const { pedidos, patch } = await enviarV2(COM_CAMPO, 1, [{ texto: 'A GRANDE FESTA' }, { texto: 'SÁBADO', complexidade: 3 }]);
    expect(putDoCard(pedidos)).toEqual([{ idValue: 'opAlta' }]);
    expect(patch?.rota).toContain('/record/recP1');
    expect(patch?.campos).toMatchObject({ complexidade: 3, artes_quantidade: 2 });
  });

  it('a maior que desce: a arte que já existe deixa de contar', async () => {
    const { pedidos, patch } = await enviarV2(COM_CAMPO, 3, [{ texto: 'A GRANDE FESTA', complexidade: 2 }, { texto: 'SÁBADO', existe: true, complexidade: 3 }]);
    expect(putDoCard(pedidos)).toEqual([{ idValue: 'opMedia' }]);
    expect(patch?.campos).toMatchObject({ complexidade: 2 });
  });

  it('a maior que fica igual: nada de complexidade é escrito (nem no card, nem na produção da arte)', async () => {
    const { pedidos, patch } = await enviarV2(COM_CAMPO, 2, [{ texto: 'A GRANDE FESTA', complexidade: 2 }, { texto: 'SÁBADO' }]);
    expect(putDoCard(pedidos)).toEqual([]);
    expect(patch?.campos).not.toHaveProperty('complexidade');
    expect(patch?.campos).toMatchObject({ artes: 'A GRANDE FESTA | SÁBADO' });
  });

  it('o campo não configurado: só a produção da arte é atualizada', async () => {
    const { pedidos, patch } = await enviarV2(ENV, 1, [{ texto: 'SÁBADO', complexidade: 3 }]);
    expect(pedidos.filter((p) => p.metodo === 'PUT' && p.url.pathname.includes('/customField/'))).toEqual([]);
    expect(patch?.campos).toMatchObject({ complexidade: 3 });
  });

  it('sessão de filme: vale a maior entre a do card do filme e a da revisão', async () => {
    const sobe = await enviarV2(COM_CAMPO, 1, [{ texto: 'X' }], true);
    expect(putDoCard(sobe.pedidos)).toEqual([{ idValue: 'opMedia' }]);
    expect(sobe.patch?.campos).toMatchObject({ complexidade: 2 });
    // a da revisão é maior: vale a da revisão; a do filme igual à atual: nada é escrito
    expect(putDoCard((await enviarV2(COM_CAMPO, 2, [{ texto: 'X', complexidade: 3 }], true)).pedidos)).toEqual([{ idValue: 'opAlta' }]);
    const igual = await enviarV2(COM_CAMPO, 2, [{ texto: 'X' }], true);
    expect(putDoCard(igual.pedidos)).toEqual([]);
    expect(igual.patch?.campos).not.toHaveProperty('complexidade');
  });

  it('sem ler a complexidade atual (o Postgres caiu), nada de complexidade é escrito, mas as artes e o texto sim', async () => {
    const { pedidos, patch } = await enviarV2(COM_CAMPO, new Error('caiu'), [{ texto: 'SÁBADO', complexidade: 3 }]);
    expect(putDoCard(pedidos)).toEqual([]);
    expect(patch?.rota).toContain('/record/recP1');
    expect(patch?.campos).not.toHaveProperty('complexidade');
    expect(patch?.campos).toMatchObject({ artes: 'SÁBADO', texto: 'texto novo' });
  });
});

describe('a conferência da produção da arte', () => {
  it('acusa a produção da arte que parou (a base escolhida não é a em que o n8n grava)', async () => {
    const colunas = ['card_ID', 'claquete', 'key', 'status', 'data_entrada', 'artes_quantidade', 'artes', 'texto', 'doc', 'redator', 'editor', 'designers', 'entregue', 'data_entrega', 'praca', 'arquivado', 'filme', 'atracao', 'complexidade'];
    const comUltima = (dias: number) => async (sql: string) => {
      if (sql.includes('information_schema')) return colunas.map((column_name) => ({ column_name }));
      if (sql.includes('max("data_entrada")')) return [{ ultima: new Date(Date.now() - dias * 86_400_000) }];
      if (sql.includes('count(*)')) return [{ n: 7 }];
      return [];
    };
    const producao = async (dias: number) => (await criarTrello({ ...ENV, TRELLO_KEY: '' }, { consultar: comUltima(dias) }).conferir()).find((i: { item: string }) => i.item === 'Postgres: producao');
    const parou = await producao(4);
    expect(parou.ok).toBe(false);
    expect(parou.detalhe).toMatch(/Conexões/);
    expect((await producao(0.1)).ok).toBe(true);
  });
});
