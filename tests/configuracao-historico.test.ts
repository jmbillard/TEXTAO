// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
import type { LigacoesDasPracas } from '../src/modelo/ligarPeloNome';
import type { LigacoesDoCard } from '../src/modelo/ligarOCard';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* O histórico da Configuração (#78) pela API: toda gravação (as seções salvas pela barra, as ações de Pessoas e a troca
   do quadro em Conexões) entra no histórico, com quem, quando e o antigo → o novo com os nomes do Trello; voltar a uma
   linha passa pela mesma conferência da seção, vale na hora e também entra no histórico; o que não passa fica travado
   com o porquê. Só administradores. Trello e Teable de mentira: ids, nomes e e-mails inventados. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';
const BIA = 'bia@empresa.com';

type Lista = { id: string; name: string; closed: boolean };
function quadroFalso(prefixo: string) {
  const id = (x: string) => `${prefixo}${x}`;
  return {
    listas: [
      ['G5', 'G5 ENTRADA'],
      ['G5s', 'G5 ENTREGUE'],
      ['SP', 'SP ENTRADA'],
      ['SPs', 'SP ENTREGUE'],
      ['SP2', 'PAULISTA CHEGADA'],
      ['RJ', 'RIO ENTRADA'],
      ['RJs', 'RIO ENTREGUE'],
      ['IN', 'INTER ENTRADA'],
      ['INs', 'INTER ENTREGUE'],
      ['VT', 'VT'],
    ].map(([x, name]) => ({ id: id(`l${x}`), name, closed: false })) as Lista[],
    campos: [
      { id: id('cPraca'), name: 'Praça', type: 'list', options: ['G5', 'SP', 'RJ', 'INTER'].map((t) => ({ id: id(`o${t}`), value: { text: t } })) },
      { id: id('cPrio'), name: 'Prioridade', type: 'list', options: [{ id: id('pAlta'), value: { text: 'ALTA' } }, { id: id('pMedia'), value: { text: 'MÉDIA' } }] },
      { id: id('cProjeto'), name: 'Projeto', type: 'text' },
      { id: id('cProjeto2'), name: 'Projeto (novo)', type: 'text' },
    ],
  };
}

function trelloFalso() {
  const quadros: Record<string, { nome: string } & ReturnType<typeof quadroFalso>> = {
    qA: { nome: 'Promo 2026', ...quadroFalso('') },
    qB: { nome: 'Promo 2027', ...quadroFalso('n') },
  };
  const cards: { idList: string }[] = [];
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => '', arrayBuffer: async () => new ArrayBuffer(4) });
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    const rota = url.pathname.replace(/^\/1/, '');
    if (metodo === 'GET' && rota === '/members/me/boards') return ok(Object.entries(quadros).map(([id, q]) => ({ id, name: q.nome })));
    const doQuadro = /^\/boards\/(\w+)(\/\w+)?$/.exec(rota);
    if (metodo === 'GET' && doQuadro && quadros[doQuadro[1]]) {
      const q = quadros[doQuadro[1]];
      if (!doQuadro[2]) return ok({ id: doQuadro[1], name: q.nome });
      if (doQuadro[2] === '/lists') return ok(q.listas);
      if (doQuadro[2] === '/customFields') return ok(q.campos);
      return ok([]);
    }
    if (rota === '/cards' && metodo === 'POST') {
      cards.push(JSON.parse(String(init.body)));
      return ok({ id: `card${cards.length}`, shortUrl: `https://trello.com/c/FALSO${cards.length}` });
    }
    if (metodo === 'GET') return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    return ok({});
  };
  return { buscar, quadros, listasDosCards: () => cards.map((c) => c.idList) };
}

const PORTAINER = {
  CADASTRO_ADMINS: CHEFE,
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_QUADRO: 'qA',
  TRELLO_LISTA_G5: 'lG5',
  TRELLO_SAIDA_G5: 'lG5s',
  TRELLO_LISTA_RJ: 'lRJ',
  TRELLO_SAIDA_RJ: 'lRJs',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_SAIDA_SP: 'lSPs',
  TRELLO_LISTA_INTER: 'lIN',
  TRELLO_SAIDA_INTER: 'lINs',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=oG5,SP=oSP,RJ=oRJ,INTER=oINTER',
  TRELLO_CAMPO_PRIORIDADE: 'cPrio',
  TRELLO_PRIORIDADE_ALTA: 'pAlta',
  TRELLO_PRIORIDADE_MEDIA: 'pMedia',
  TRELLO_CAMPO_PROJETO: 'cProjeto',
  TRELLO_LISTA_VT: 'lVT',
  TEABLE_PG_ESQUEMA: 'bseFalso',
  ...TEABLE_FALSO,
};

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor() {
  const falso = trelloFalso();
  const app = criarApp({
    db: abrirBanco(':memory:'),
    env: PORTAINER,
    buscarNoTeable: teableFalso({ designers: 'designers_d1' }, { base: 'bseFalso', registros: { designers: [] }, bases: { bseNova: { nome: 'Base nova', nomes: {} } } }),
    trello: (e: Record<string, string>) => criarTrello(e, { buscar: falso.buscar, consultar: async () => [] }),
    agendar: () => ({ unref() {} }),
  });
  await app.tabelasProntas;
  await app.pessoasProntas;
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
  // o chefe já entrou no PROMeiro: o histórico mostra o nome dele
  await chefe('/api/eu');
  let n = 0;
  const enviar = async (claquete: string, praca: string) => {
    const id = `rot-hist-${++n}`;
    await fetch(`${base}/api/roteiros/${id}`, {
      method: 'PUT',
      headers: { 'cf-access-authenticated-user-email': CHEFE, 'content-type': 'application/json' },
      body: JSON.stringify({ roteiro: { meta: { claquete, praca }, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, nArtes: 0 }),
    });
    return chefe(`/api/roteiros/${id}/trello`, { artes: [], texto: 'x' }).then((r) => r.json());
  };
  return { app, falso, chefe, ana: como(ANA), bia: como(BIA), enviar };
}

interface Linha {
  oque: string;
  antes: string;
  depois: string;
}
interface Entrada {
  id: number;
  em: string;
  por: string;
  quem: string;
  linhas: Linha[];
  voltouDe: number | null;
  voltar: { pode: boolean; motivo?: string };
}
const lerHistorico = async (pedir: (c: string) => Promise<Response>) => ((await (await pedir('/api/configuracao/historico')).json()) as { entradas: Entrada[] }).entradas;
const lerPracas = async (pedir: (c: string) => Promise<Response>) => ((await (await pedir('/api/configuracao')).json()) as { pracas: { proposta: LigacoesDasPracas }; card: { proposta: LigacoesDoCard } });
const comEntrada = (c: LigacoesDasPracas, sigla: string, entrada: string): LigacoesDasPracas => ({ ...c, pracas: c.pracas.map((p) => (p.sigla === sigla ? { ...p, entrada } : p)) });

/** Salva a entrada de SP na lista PAULISTA CHEGADA, pela barra (a seção Praças). */
async function trocarAEntradaDeSP(chefe: (c: string, corpo?: unknown) => Promise<Response>) {
  const { pracas } = await lerPracas(chefe);
  const r = await chefe('/api/configuracao/salvar', { pracas: { ...comEntrada(pracas.proposta, 'SP', 'lSP2'), aMao: [...pracas.proposta.aMao, 'SP.entrada'] } });
  expect(r.status).toBe(200);
}

describe('o histórico: toda gravação entra', () => {
  it('salvar uma seção: quem (pelo nome), quando e o antigo → o novo com os nomes do Trello, não os ids', async () => {
    const { chefe } = await comServidor();
    await trocarAEntradaDeSP(chefe);
    const [e] = await lerHistorico(chefe);
    expect(e).toMatchObject({ por: CHEFE, quem: 'Chefe', voltouDe: null });
    expect(Date.now() - Date.parse(e.em)).toBeLessThan(60_000);
    expect(e.linhas).toContainEqual({ oque: 'Praças · SP: entrada', antes: 'SP ENTRADA', depois: 'PAULISTA CHEGADA (à mão)' });
    expect(JSON.stringify(e.linhas)).not.toMatch(/"lSP2?"/);
  });

  it('o card: o campo pelo nome', async () => {
    const { chefe } = await comServidor();
    const { card } = await lerPracas(chefe);
    expect((await chefe('/api/configuracao/salvar', { card: { ...card.proposta, ids: { ...card.proposta.ids, projeto: 'cProjeto2' } } })).status).toBe(200);
    expect((await lerHistorico(chefe))[0].linhas).toContainEqual({ oque: 'Card · Projeto', antes: 'Projeto', depois: 'Projeto (novo)' });
  });

  it('Pessoas (vale na hora, sem a barra) também entra: o administrador posto e o tirado', async () => {
    const { chefe } = await comServidor();
    await chefe('/api/configuracao/pessoas', { acao: 'administrador', email: BIA });
    await chefe('/api/configuracao/pessoas', { acao: 'tirar', email: BIA });
    const [tirou, pos] = await lerHistorico(chefe);
    expect(pos.linhas).toEqual([{ oque: 'Administradores', antes: '—', depois: `+ ${BIA}` }]);
    expect(tirou.linhas).toEqual([{ oque: 'Administradores', antes: BIA, depois: '—' }]);
  });

  it('trocar o quadro em Conexões (salva direto) também entra, pelo nome dos quadros', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/configuracao/trocar', { quadro: 'qB', confirmacao: 'Promo 2027' })).status).toBe(200);
    const [e] = await lerHistorico(chefe);
    expect(e.linhas[0]).toEqual({ oque: 'Quadro do Trello', antes: 'Promo 2026', depois: 'Promo 2027' });
    expect(e.linhas).toContainEqual(expect.objectContaining({ oque: 'Ligações', depois: 'ligadas de novo pelo nome no quadro novo' }));
  });

  it('trocar a base do Teable também entra, pelo nome das bases', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/configuracao/trocar', { base: 'bseNova', confirmacao: 'Base nova' })).status).toBe(200);
    expect((await lerHistorico(chefe))[0].linhas[0]).toEqual({ oque: 'Base do Teable', antes: 'Base falsa', depois: 'Base nova' });
  });

  it('só administradores veem o histórico e voltam', async () => {
    const { chefe, ana } = await comServidor();
    await trocarAEntradaDeSP(chefe);
    const [e] = await lerHistorico(chefe);
    expect((await ana('/api/configuracao/historico')).status).toBe(403);
    expect((await ana('/api/configuracao/voltar', { id: e.id })).status).toBe(403);
  });
});

describe('voltar a uma linha do histórico', () => {
  it('aplica o valor antigo na hora (o próximo card já vai para a lista antiga) e entra no histórico', async () => {
    const { chefe, enviar, falso } = await comServidor();
    await trocarAEntradaDeSP(chefe);
    await enviar('FESTA 1/12 SP', 'SP');
    const [e] = await lerHistorico(chefe);
    expect(e.voltar).toEqual({ pode: true });
    const r = await chefe('/api/configuracao/voltar', { id: e.id });
    expect(r.status).toBe(200);
    await enviar('FESTA 2/12 SP', 'SP');
    expect(falso.listasDosCards()).toEqual(['lSP2', 'lSP']);
    const [voltou, antiga] = ((await r.json()) as { entradas: Entrada[] }).entradas;
    expect(voltou).toMatchObject({ voltouDe: e.id, por: CHEFE });
    expect(voltou.linhas).toContainEqual({ oque: 'Praças · SP: entrada', antes: 'PAULISTA CHEGADA', depois: 'SP ENTRADA' });
    // a linha de que voltou já é o que vale: não tem mais para onde voltar
    expect(antiga.voltar).toMatchObject({ pode: false, motivo: expect.stringMatching(/vale agora/) });
  });

  it('travado quando o valor antigo não passa na conferência (a lista foi arquivada): diz o porquê e nada muda', async () => {
    const { chefe, enviar, falso } = await comServidor();
    await trocarAEntradaDeSP(chefe);
    falso.quadros.qA.listas.find((l) => l.id === 'lSP')!.closed = true;
    const [e] = await lerHistorico(chefe);
    expect(e.voltar.pode).toBe(false);
    expect(e.voltar.motivo).toMatch(/SP: entrada.*"SP ENTRADA" está arquivada/);
    const r = await chefe('/api/configuracao/voltar', { id: e.id });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/arquivada/);
    await enviar('FESTA 3/12 SP', 'SP');
    expect(falso.listasDosCards()).toEqual(['lSP2']);
    expect(await lerHistorico(chefe)).toHaveLength(1);
  });

  it('voltar pode tirar outra pessoa dos administradores', async () => {
    const { chefe, app } = await comServidor();
    await chefe('/api/configuracao/pessoas', { acao: 'administrador', email: BIA });
    const [pos] = await lerHistorico(chefe);
    expect(pos.voltar).toEqual({ pode: true });
    expect((await chefe('/api/configuracao/voltar', { id: pos.id })).status).toBe(200);
    expect(app.modulos().cadastros.podeApagar(BIA)).toBe(false);
  });

  it('voltar não tira quem está voltando dos administradores: travado', async () => {
    const { chefe, bia, app } = await comServidor();
    await chefe('/api/configuracao/pessoas', { acao: 'administrador', email: BIA });
    // a Bia (que não é chave-mestra) vê a linha em que ela virou administradora: voltar tiraria ela
    const [e] = await lerHistorico(bia);
    expect(e.voltar).toMatchObject({ pode: false, motivo: expect.stringMatching(/tiraria você/) });
    expect((await bia('/api/configuracao/voltar', { id: e.id })).status).toBe(422);
    expect(app.modulos().cadastros.podeApagar(BIA)).toBe(true);
  });

  it('voltar a troca do quadro: o quadro antigo volta, com as ligações de antes', async () => {
    const { chefe, enviar, falso } = await comServidor();
    await chefe('/api/configuracao/trocar', { quadro: 'qB', confirmacao: 'Promo 2027' });
    const [e] = await lerHistorico(chefe);
    expect(e.voltar).toEqual({ pode: true });
    expect((await chefe('/api/configuracao/voltar', { id: e.id })).status).toBe(200);
    await enviar('FESTA 4/12 SP', 'SP');
    expect(falso.listasDosCards()).toEqual(['lSP']);
    expect((await lerHistorico(chefe))[0].linhas[0]).toEqual({ oque: 'Quadro do Trello', antes: 'Promo 2027', depois: 'Promo 2026' });
  });

  it('a linha que não existe: 404', async () => {
    const { chefe } = await comServidor();
    expect((await chefe('/api/configuracao/voltar', { id: 999 })).status).toBe(404);
  });
});
