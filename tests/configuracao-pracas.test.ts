// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
import { normalizarPraca, reconhecerPraca, type Praca } from '../src/modelo/pracas';
import type { Ligacao, LigacoesDasPracas } from '../src/modelo/ligarPeloNome';

/* A seção Praças da Configuração (#72) pela API, com o Trello de mentira: o quadro, as listas e o campo Praça são
   fictícios. Só administradores (CADASTRO_ADMINS). Nada é salvo sem passar pela conferência. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';
// o quadro de hoje: a G5 usa as listas do RJ (como no Portainer de verdade); INTER tem duas listas de saída
const LISTAS = [
  { id: 'lSP', name: 'SP ENTRADA', closed: false },
  { id: 'lSPs', name: 'SP ENTREGUE', closed: false },
  { id: 'lSP2', name: 'PAULISTA CHEGADA', closed: false },
  { id: 'lRJ', name: 'RIO ENTRADA', closed: false },
  { id: 'lRJs', name: 'RIO ENTREGUE', closed: false },
  { id: 'lIN', name: 'INTER ENTRADA', closed: false },
  { id: 'lINs', name: 'INTER ENTREGUE', closed: false },
  { id: 'lINs2', name: 'INTER ENTREGUE (2025)', closed: false },
  { id: 'lVelha', name: 'ARQUIVO 2024', closed: true },
  // a praça que ainda não existe no PROMeiro (#73): as listas já estão no quadro
  { id: 'lMG', name: 'MG ENTRADA', closed: false },
  { id: 'lMGs', name: 'MG PRONTO', closed: false },
];
const CAMPOS = [
  { id: 'cPraca', name: 'Praça', type: 'list', options: ['G5', 'SP', 'RJ', 'INTER'].map((t) => ({ id: `o${t}`, value: { text: t } })) },
  { id: 'cProjeto', name: 'Projeto', type: 'text' },
];
/** O Portainer de hoje: as listas e as opções das praças pelas variáveis de sempre. */
const PORTAINER = {
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA_G5: 'lRJ',
  TRELLO_SAIDA_G5: 'lRJs',
  TRELLO_LISTA_RJ: 'lRJ',
  TRELLO_SAIDA_RJ: 'lRJs',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_SAIDA_SP: 'lSPs',
  TRELLO_LISTA_INTER: 'lIN',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=oG5,SP=oSP,RJ=oRJ,INTER=oINTER',
};

/** As claquetes da produção da arte (o Postgres do Teable), para a contagem do que muda de praça. */
type LinhaDaProducao = { claquete: string; data_entrada: string };

function trelloFalso() {
  const pedidos: string[] = [];
  const cards: { idList: string }[] = [];
  // o campo Praça de cada servidor é uma cópia: a praça nova cria a opção nele
  const campos = CAMPOS.map((c) => ({ ...c, options: c.options?.map((o) => ({ ...o })) }));
  const itens: { card: string; campo: string; idValue: string }[] = [];
  const falhas = { criarOpcao: false };
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const rota = url.pathname.replace(/^\/1/, '');
    pedidos.push(`${metodo} ${rota}`);
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
    if (metodo === 'GET' && /^\/lists\/\w+$/.test(rota)) return ok({ id: rota.split('/')[2], idBoard: 'quadroFalso' });
    if (metodo === 'GET' && rota === '/boards/quadroFalso/lists') return ok(LISTAS);
    if (metodo === 'GET' && rota === '/boards/quadroFalso/customFields') return ok(campos);
    const opcaoNova = rota.match(/^\/customField\/(\w+)\/options$/);
    if (metodo === 'POST' && opcaoNova) {
      if (falhas.criarOpcao) return { ok: false, status: 500, json: async () => ({}), text: async () => 'fora do ar' };
      const campo = campos.find((c) => c.id === opcaoNova[1]);
      if (!campo?.options) return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
      const opcao = { id: `oNova${campo.options.length}`, value: { text: String(JSON.parse(String(init.body)).value?.text ?? '') } };
      campo.options.push(opcao);
      return ok({ ...opcao, idCustomField: campo.id });
    }
    const item = rota.match(/^\/cards\/(\w+)\/customField\/(\w+)\/item$/);
    if (metodo === 'PUT' && item) itens.push({ card: item[1], campo: item[2], idValue: String(JSON.parse(String(init.body)).idValue ?? '') });
    if (rota === '/cards' && metodo === 'POST') {
      cards.push(JSON.parse(String(init.body)));
      return ok({ id: `card${cards.length}`, shortUrl: `https://trello.com/c/FALSO${cards.length}` });
    }
    if (metodo === 'GET') return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    return ok({});
  };
  return {
    buscar,
    pedidos,
    falhas,
    opcoesDoCampo: () => campos.find((c) => c.id === 'cPraca')!.options!.map((o) => `${o.id}:${o.value.text}`),
    listasDosCards: () => cards.map((c) => c.idList),
    pracaDosCards: () => itens.filter((i) => i.campo === 'cPraca').map((i) => i.idValue),
  };
}

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor(env: Record<string, string> = PORTAINER, producao: LinhaDaProducao[] = []) {
  const falso = trelloFalso();
  // só a leitura das claquetes recentes da produção responde; o resto (a produção de hoje, o redator) vem vazio
  const consultar = async (sql: string) => (/"claquete", "data_entrada" FROM/.test(sql) && /now\(\) -/.test(sql) ? producao : []);
  const app = criarApp({ db: abrirBanco(':memory:'), env, trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar }) });
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
  const chefe = como(CHEFE);
  let n = 0;
  const enviar = async (claquete: string, praca: string) => {
    const id = `rot-pracas-${++n}`;
    await fetch(`${base}/api/roteiros/${id}`, {
      method: 'PUT',
      headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json' },
      body: JSON.stringify({ roteiro: { meta: { claquete, praca }, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, nArtes: 0 }),
    });
    return chefe(`/api/roteiros/${id}/trello`, { artes: [], texto: 'x' }).then((r) => r.json());
  };
  /** Um roteiro na fila do PROMeiro, só guardado (sem ir ao Trello). */
  const guardar = (claquete: string) =>
    fetch(`${base}/api/roteiros/rot-guardado-${++n}`, {
      method: 'PUT',
      headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json' },
      body: JSON.stringify({ roteiro: { meta: { claquete }, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, nArtes: 0 }),
    });
  return { app, falso, chefe, ana: como(ANA), enviar, guardar };
}

interface Secao {
  primeiraVez: boolean;
  quadro: { id: string; de: string } | null;
  salvo: LigacoesDasPracas;
  proposta: LigacoesDasPracas;
  estado: { resumo: string; excecoes: Ligacao[]; pracas: { sigla: string; entrada: Ligacao; saida: Ligacao; opcao: Ligacao }[] };
}
const lerSecao = async (pedir: (caminho: string) => Promise<Response>) => ((await (await pedir('/api/configuracao')).json()) as { pracas: Secao }).pracas;
const mudar = (c: LigacoesDasPracas, sigla: string, m: Partial<Praca>): LigacoesDasPracas => ({ ...c, pracas: c.pracas.map((p) => (p.sigla === sigla ? { ...p, ...m } : p)) });

describe('a seção Praças: o estado', () => {
  it('na primeira vez, começa com os valores do Portainer; o quadro vem da lista já configurada; nada é salvo', async () => {
    const { chefe, app } = await comServidor();
    const s = await lerSecao(chefe);
    expect(s.primeiraVez).toBe(true);
    expect(s.quadro).toMatchObject({ id: 'quadroFalso', de: 'lista' });
    expect(s.salvo.pracas.map((p) => [p.sigla, p.entrada, p.saida, p.opcao])).toEqual([
      ['G5', 'lRJ', 'lRJs', 'oG5'],
      ['RJ', 'lRJ', 'lRJs', 'oRJ'],
      ['SP', 'lSP', 'lSPs', 'oSP'],
      ['INTER', 'lIN', '', 'oINTER'],
    ]);
    // só as exceções: a G5 à mão (dividida com o RJ) e a saída de INTER em dobro
    expect(s.estado.excecoes.map((l) => [l.chave, l.como, l.problema, l.divididaCom ?? '', l.candidatos.join(',')])).toEqual([
      ['G5.entrada', 'mao', '', 'RJ', ''],
      ['G5.saida', 'mao', '', 'RJ', ''],
      ['INTER.saida', '', 'dobro', '', 'lINs,lINs2'],
    ]);
    expect(s.estado.resumo).toBe('4 praças · 1 em dobro · 2 à mão');
    expect(app.modulos().env.PRACAS).toBeUndefined();
  });

  it('com TRELLO_QUADRO, o quadro vem dele; sem nada no Portainer, liga pelo nome o que acha um só (como proposta)', async () => {
    const { chefe, falso } = await comServidor({ CADASTRO_ADMINS: CHEFE, TRELLO_KEY: 'k', TRELLO_TOKEN: 't', TRELLO_QUADRO: 'quadroFalso' });
    const s = await lerSecao(chefe);
    expect(s.quadro).toMatchObject({ id: 'quadroFalso', de: 'variavel' });
    expect(falso.pedidos.some((p) => p.startsWith('GET /lists/'))).toBe(false);
    expect(s.salvo.pracas.every((p) => !p.entrada && !p.saida && !p.opcao)).toBe(true);
    expect(s.proposta.campoPraca).toBe('cPraca');
    expect(s.proposta.pracas.map((p) => [p.sigla, p.entrada, p.saida, p.opcao])).toEqual([
      ['G5', '', '', 'oG5'],
      ['RJ', 'lRJ', 'lRJs', 'oRJ'],
      ['SP', 'lSP', 'lSPs', 'oSP'],
      ['INTER', 'lIN', '', 'oINTER'],
    ]);
    expect(s.estado.excecoes.map((l) => `${l.chave}:${l.problema}`)).toEqual(['G5.entrada:nenhum', 'G5.saida:nenhum', 'INTER.saida:dobro']);
  });

  it('sem quadro (nem TRELLO_QUADRO, nem lista configurada), a seção diz o que falta', async () => {
    const { chefe } = await comServidor({ CADASTRO_ADMINS: CHEFE, TRELLO_KEY: 'k', TRELLO_TOKEN: 't' });
    const r = await chefe('/api/configuracao');
    expect(r.status).toBe(200);
    const s = ((await r.json()) as { pracas: Secao & { erro: string } }).pracas;
    expect(s.quadro).toBeNull();
    expect(s.erro).toMatch(/TRELLO_QUADRO/);
  });
});

describe('a seção Praças: só administradores', () => {
  it('quem não é administrador não lê, não confere e não salva; o /api/eu diz quem é', async () => {
    const { ana, chefe } = await comServidor();
    expect((await ana('/api/configuracao')).status).toBe(403);
    expect((await ana('/api/configuracao/conferir', { pracas: {} })).status).toBe(403);
    expect((await ana('/api/configuracao/salvar', { pracas: {} })).status).toBe(403);
    expect((await (await ana('/api/eu')).json()).admin).toBe(false);
    expect((await (await chefe('/api/eu')).json()).admin).toBe(true);
  });
});

describe('a seção Praças: conferir e salvar', () => {
  it('ligar à mão: escolher a saída de INTER e salvar; ela fica marcada como ligada à mão', async () => {
    const { chefe } = await comServidor();
    const s = await lerSecao(chefe);
    const nova = { ...mudar(s.proposta, 'INTER', { saida: 'lINs' }), aMao: [...s.proposta.aMao, 'INTER.saida'] };
    const conferido = await (await chefe('/api/configuracao/conferir', { pracas: nova })).json();
    expect(conferido.ok).toBe(true);
    expect(conferido.muda).toEqual([{ oque: 'INTER: saída', antes: '—', depois: 'INTER ENTREGUE (à mão)' }]);
    const r = await chefe('/api/configuracao/salvar', { pracas: nova });
    expect(r.status).toBe(200);
    const depois = await lerSecao(chefe);
    expect(depois.primeiraVez).toBe(false);
    expect(depois.estado.excecoes.map((l) => `${l.chave}:${l.como}`)).toEqual(['G5.entrada:mao', 'G5.saida:mao', 'INTER.saida:mao']);
    expect(depois.estado.resumo).toBe('4 praças · tudo ligado · 3 à mão');
  });

  it('conferir com erro (lista arquivada, opção que não existe) não salva nada; salvar também recusa', async () => {
    const { chefe, app } = await comServidor();
    const s = await lerSecao(chefe);
    const errada = mudar(s.proposta, 'SP', { entrada: 'lVelha', opcao: 'oNada' });
    const conferido = await (await chefe('/api/configuracao/conferir', { pracas: errada })).json();
    expect(conferido.ok).toBe(false);
    expect(conferido.itens.filter((i: { tipo: string }) => i.tipo === 'erro').map((i: { titulo: string }) => i.titulo)).toEqual(['SP: entrada', 'SP: opção no campo Praça']);
    const r = await chefe('/api/configuracao/salvar', { pracas: errada });
    expect(r.status).toBe(422);
    expect((await r.json()).conferencia.ok).toBe(false);
    expect(app.modulos().env.PRACAS).toBeUndefined();
    expect((await lerSecao(chefe)).salvo.pracas.find((p) => p.sigla === 'SP')?.entrada).toBe('lSP');
  });

  it('salvar vale na hora: o próximo envio de SP vai para a lista nova, e a regra nova chega ao navegador', async () => {
    const { chefe, enviar, falso } = await comServidor();
    expect((await enviar('Festa 3/12 SP', 'SP')).estado).toBe('enviado');
    const s = await lerSecao(chefe);
    const nova = mudar(s.proposta, 'SP', { entrada: 'lSP2', regra: { onde: 'fim', palavras: ['SP', 'PAULISTA'] } });
    nova.aMao = [...nova.aMao, 'SP.entrada'];
    expect((await chefe('/api/configuracao/salvar', { pracas: nova })).status).toBe(200);
    expect((await enviar('Festa 4/12 SP', 'SP')).estado).toBe('enviado');
    expect(falso.listasDosCards()).toEqual(['lSP', 'lSP2']);
    const eu = await (await chefe('/api/eu')).json();
    expect(reconhecerPraca('FESTA 4/12 PAULISTA', eu.pracas)).toBe('SP');
    expect(eu.pracas.every((p: Praca) => !p.entrada && !p.opcao)).toBe(true);
  });

  it('uma praça com corpo inválido é recusada', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/configuracao/salvar', { pracas: { pracas: [{ nome: 'sem sigla' }], campoPraca: '', aMao: [] } })).status).toBe(400);
  });
});

/* ---------- a praça nova (#73) ---------- */

/** MG: termina em MG; as listas MG ENTRADA e MG PRONTO, ligadas pelo nome; a opção, o PROMeiro cria ao salvar. */
const MG: Praca = { sigla: 'MG', nome: 'Minas', padrao: false, regra: { onde: 'fim', palavras: ['MG'] }, tambem: [], entrada: 'lMG', saida: 'lMGs', opcao: '' };
const comNova = (c: LigacoesDasPracas, p: Praca = MG): LigacoesDasPracas => ({ ...c, pracas: [...c.pracas, p] });
interface Conferencia {
  ok: boolean;
  itens: { tipo: string; titulo: string; detalhe: string }[];
  muda: { oque: string; antes: string; depois: string }[];
  claquetes: { dias: number; total: number; mudam: { claquete: string; antes: string; depois: string }[] };
}
const erros = (c: Conferencia) => c.itens.filter((i) => i.tipo === 'erro').map((i) => `${i.titulo}: ${i.detalhe}`);
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('a praça nova', () => {
  it('criar MG: a conferência conta as claquetes recentes que mudam de praça, e nada vai ao Trello antes de salvar', async () => {
    // a produção da arte (o que entrou por qualquer caminho) e a fila do PROMeiro (o que foi revisado aqui)
    const producao = [
      { claquete: 'BAILE 3/12 MG', data_entrada: diasAtras(3) },
      { claquete: 'JOGO 2/12', data_entrada: diasAtras(2) },
      { claquete: 'FESTA 1/12 SP', data_entrada: diasAtras(1) },
    ];
    const { chefe, falso, guardar } = await comServidor({ ...PORTAINER, TEABLE_PG_ESQUEMA: 'promo', TEABLE_PG_ARTE: 'producao' }, producao);
    await guardar('BAILE 3/12 MG'); // o mesmo da produção: conta uma vez só
    await guardar('RIO SHOW 4/12 MG'); // do Rio: a regra do RJ vem antes
    await guardar('CHEF 5/12 MG');
    const s = await lerSecao(chefe);
    const conferido = (await (await chefe('/api/configuracao/conferir', { pracas: comNova(s.proposta) })).json()) as Conferencia;
    expect(erros(conferido)).toEqual([]);
    expect(conferido.ok).toBe(true);
    expect(conferido.claquetes.dias).toBe(90);
    expect(conferido.claquetes.total).toBe(5);
    expect(conferido.claquetes.mudam).toEqual([
      { claquete: 'CHEF 5/12 MG', antes: 'G5', depois: 'MG' },
      { claquete: 'BAILE 3/12 MG', antes: 'G5', depois: 'MG' },
    ]);
    expect(conferido.itens).toContainEqual({ tipo: 'aviso', titulo: 'Claquetes recentes', detalhe: '2 das 5 claquetes dos últimos 90 dias mudam de praça: 2 de G5 para MG.' });
    expect(conferido.itens).toContainEqual({ tipo: 'ok', titulo: 'MG: opção no campo Praça', detalhe: 'não existe: o PROMeiro cria "MG" ao salvar.' });
    expect(conferido.muda).toEqual([
      { oque: 'Praça nova MG', antes: '—', depois: 'termina em MG · depois de INTER' },
      { oque: 'MG: entrada', antes: '—', depois: 'MG ENTRADA' },
      { oque: 'MG: saída', antes: '—', depois: 'MG PRONTO' },
      { oque: 'Campo Praça', antes: 'G5, SP, RJ, INTER', depois: '+ MG' },
    ]);
    expect(falso.pedidos.filter((p) => !p.startsWith('GET'))).toEqual([]);
    expect(falso.opcoesDoCampo()).toEqual(['oG5:G5', 'oSP:SP', 'oRJ:RJ', 'oINTER:INTER']);
  });

  it('salvar MG: o PROMeiro cria a opção no campo Praça, e o próximo envio "… MG" vai para a entrada da MG com a opção MG', async () => {
    const { chefe, falso, enviar } = await comServidor();
    const s = await lerSecao(chefe);
    const r = await chefe('/api/configuracao/salvar', { pracas: comNova(s.proposta) });
    expect(r.status).toBe(200);
    expect(falso.pedidos.filter((p) => p.startsWith('POST'))).toEqual(['POST /customField/cPraca/options']);
    expect(falso.opcoesDoCampo()).toEqual(['oG5:G5', 'oSP:SP', 'oRJ:RJ', 'oINTER:INTER', 'oNova4:MG']);
    const depois = await lerSecao(chefe);
    expect(depois.salvo.pracas.map((p) => p.sigla)).toEqual(['G5', 'RJ', 'SP', 'INTER', 'MG']);
    expect(depois.estado.pracas.find((p) => p.sigla === 'MG')).toMatchObject({ entrada: { nome: 'MG ENTRADA', como: 'nome' }, saida: { nome: 'MG PRONTO' }, opcao: { id: 'oNova4', nome: 'MG' } });
    // o navegador recebe a praça nova: a claquete "… MG" é da MG (e a G5, que também lia MG, deixa de ser)
    const eu = await (await chefe('/api/eu')).json();
    const claquete = 'BAILE 5/12 MG';
    expect(reconhecerPraca(claquete, eu.pracas)).toBe('MG');
    expect(normalizarPraca('MG', eu.pracas)).toBe('MG');
    expect((await enviar(claquete, reconhecerPraca(claquete, eu.pracas))).estado).toBe('enviado');
    expect(falso.listasDosCards()).toEqual(['lMG']);
    expect(falso.pracaDosCards()).toEqual(['oNova4']);
  });

  it('conferir com erro: sem entrada e saída, ou com a sigla repetida, não salva nem cria a opção', async () => {
    const { chefe, falso, app } = await comServidor();
    const s = await lerSecao(chefe);
    const semListas = (await (await chefe('/api/configuracao/conferir', { pracas: comNova(s.proposta, { ...MG, entrada: '', saida: '' }) })).json()) as Conferencia;
    expect(semListas.ok).toBe(false);
    expect(erros(semListas)).toEqual(['MG: entrada: nada ligado: escolha a lista de entrada.', 'MG: saída: nada ligado: escolha a lista de saída.']);
    const repetida = (await (await chefe('/api/configuracao/conferir', { pracas: comNova(s.proposta, { ...MG, sigla: 'SP', regra: { onde: 'fim', palavras: ['PAULISTA'] } }) })).json()) as Conferencia;
    expect(erros(repetida)).toEqual(['Sigla SP: já é de outra praça. Use outra sigla.']);
    for (const errada of [{ ...MG, entrada: '' }, { ...MG, sigla: 'SP' }]) {
      const r = await chefe('/api/configuracao/salvar', { pracas: comNova(s.proposta, errada) });
      expect(r.status).toBe(422);
    }
    expect(falso.pedidos.filter((p) => !p.startsWith('GET'))).toEqual([]);
    expect(app.modulos().env.PRACAS).toBeUndefined();
  });

  it('se o Trello não cria a opção, nada é salvo; tentar de novo cria e salva', async () => {
    const { chefe, falso, app } = await comServidor();
    const s = await lerSecao(chefe);
    falso.falhas.criarOpcao = true;
    const r = await chefe('/api/configuracao/salvar', { pracas: comNova(s.proposta) });
    expect(r.status).toBe(502);
    expect((await r.json()).erro).toMatch(/nada foi salvo/);
    expect(app.modulos().env.PRACAS).toBeUndefined();
    expect((await lerSecao(chefe)).salvo.pracas.map((p) => p.sigla)).toEqual(['G5', 'RJ', 'SP', 'INTER']);
    falso.falhas.criarOpcao = false;
    expect((await chefe('/api/configuracao/salvar', { pracas: comNova(s.proposta) })).status).toBe(200);
    expect((await lerSecao(chefe)).salvo.pracas.find((p) => p.sigla === 'MG')?.opcao).toBe('oNova4');
  });

  it('a opção que já existe no campo (de uma tentativa que não salvou) é usada, não criada de novo', async () => {
    const { chefe, falso } = await comServidor();
    const s = await lerSecao(chefe);
    // a opção foi criada, mas a configuração não chegou a ser salva
    await criarTrello(PORTAINER, { buscar: falso.buscar }).criarOpcao('cPraca', 'MG');
    expect((await chefe('/api/configuracao/salvar', { pracas: comNova(s.proposta) })).status).toBe(200);
    expect(falso.opcoesDoCampo().filter((o) => o.endsWith(':MG'))).toEqual(['oNova4:MG']);
    expect((await lerSecao(chefe)).salvo.pracas.find((p) => p.sigla === 'MG')?.opcao).toBe('oNova4');
  });
});
