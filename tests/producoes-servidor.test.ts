// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';

/* A Produção (#86) pela API: a carga inicial lê a produção da arte INTEIRA do Teable de mentira (as tabelas achadas
   pelo nome, o Postgres respondendo as linhas) e cada linha vira uma Produção do PROMeiro, com id próprio. Rodar de
   novo atualiza, não duplica (a chave é o registro do Teable). Nada do Trello: o ambiente nem tem o Trello. */

const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg' };

// ids de card fictícios (24 caracteres hexadecimais)
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
type Campos = Record<string, unknown>;
const registro = (id: string, fields: Campos) => ({ id, fields });
type Registros = Record<string, ReturnType<typeof registro>[]>;

function producaoDaArte() {
  return [
    // com card, designer e status detalhado; o envio do PROMeiro liga ao Roteiro
    registro('recLinha1', { card_ID: card(1), claquete: 'Show da Noite 20/11 SP', status: '["PRODUZINDO","AGUARDANDO MATERIAL"]', designers: '["Designer Um"]', data_entrada: '2026-11-18T12:00:00.000Z', artes: 'HOJE\nAMANHÃ', artes_quantidade: 2, arquivado: false, entregue: false, praca: null, filme: null }),
    registro('recLinha2', { card_ID: card(2), claquete: 'Festa na Praça 19/11', status: '[]', designers: '["Designer Dois"]', data_entrada: '2026-11-15T12:00:00.000Z', data_entrega: '2026-11-16T18:00:00.000Z', entregue: true, praca: '[{"id":"x","title":"REDE"}]' }),
    // sem card
    registro('recLinha3', { card_ID: '', claquete: 'Cozinha de Vó 18/11', status: null, designers: null, data_entrada: '2026-11-10T12:00:00.000Z' }),
    // arquivada
    registro('recLinha4', { card_ID: card(4), claquete: 'Novela Sinfonia 12/11', status: '["FINALIZADO"]', designers: '["Designer Um"]', arquivado: true, entregue: true, data_entrada: '2026-11-01T12:00:00.000Z' }),
    // de filme, com o filme ligado na linha
    registro('recLinha5', { card_ID: card(5), claquete: 'Filme da Tarde 21/11', status: '["FILME"]', designers: null, filme: [{ id: 'recFilme1', title: 'Filme da Tarde' }], data_entrada: '2026-11-19T12:00:00.000Z' }),
    // de filme, ligado pela exibição do card
    registro('recLinha6', { card_ID: card(6), claquete: 'Corujão 22/11', status: '["FINALIZADO"]', designers: '["Designer Dois"]', data_entrada: '2026-11-19T12:00:00.000Z' }),
  ];
}
const exibicoes = () => [registro('recExib1', { card_ID: card(6), data_de_exibicao: '2026-11-22T03:00:00.000Z', filme: { id: 'recFilme2', title: 'Filme da Madrugada (1999)' } })];

let parar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await parar?.();
  parar = null;
});

async function comServidor({ db = abrirBanco(':memory:'), registros = { ARTE_producao: producaoDaArte(), exibicoes: exibicoes() } as Registros, env = ENV as Record<string, string>, nomes = NOMES as Record<string, string>, trello = undefined as unknown } = {}) {
  const teable = teableFalso(nomes, { registros });
  const app = criarApp({ db, env, buscarNoTeable: teable, abrirPg: teable.abrirPg, ...(trello ? { trello } : {}) });
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  parar = async () => {
    await app.fechar();
    await new Promise<void>((ok) => servidor.close(() => ok()));
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  return { app, db, teable, registros, chefe: como('chefe@empresa.com'), ana: como('ana@empresa.com') };
}

type Contagem = { ligado: boolean; carregando: boolean; total: number; porEtapa: Record<string, number>; comCard: number; semCard: number; comRoteiro: number; comFilme: number; ultimaCarga: { linhas: number; novas: number; atualizadas: number } | null };
type Producao = { id: string; claquete: string; praca: string; etapa: string; marcador: string; designers: string[]; cardId: string | null; teableRegistro: string; roteiroId: string | null; filmeId: string | null; filmeTitulo: string | null; exibicaoEm: string | null; entradaEm: string | null; entregaEm: string | null; artes: string[]; arquivada: boolean };

const ler = async (r: Response) => (await r.json()) as Contagem;
const porRegistro = async (chefe: (c: string, i?: RequestInit) => Promise<Response>, rec: string) => ((await (await chefe(`/api/producoes?registro=${rec}`)).json()) as { producoes: Producao[] }).producoes;

/** Um Roteiro guardado que foi enviado para o card (o envio liga Roteiro ↔ card). */
function roteiroEnviado(db: { prepare: (s: string) => { run: (...a: unknown[]) => void } }, id: string, cardId: string, dataExibicao: string) {
  const agora = '2026-11-18T10:00:00.000Z';
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'ana@empresa.com', 'Ana', JSON.stringify({ claquete: 'Show da Noite 20/11 SP', dataExibicao }), '{}', agora, agora);
  db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run(id, cardId, agora);
}

describe('a carga inicial das Produções', () => {
  it('todas as linhas da produção da arte viram Produção (com e sem card, filmes, arquivadas), com a etapa', async () => {
    const { chefe } = await comServidor();
    const r = await chefe('/api/producoes/recarregar', { method: 'POST' });
    expect(r.status).toBe(200);
    // (a carga da subida pode ter corrido antes: as novas são dela ou desta)
    expect(await r.json()).toMatchObject({ linhas: 6 });
    const c = await ler(await chefe('/api/producoes'));
    expect(c).toMatchObject({ ligado: true, carregando: false, total: 6, porEtapa: { entrada: 2, produzindo: 1, entregue: 2, arquivada: 1 }, comCard: 5, semCard: 1, comFilme: 2 });
    const [show] = await porRegistro(chefe, 'recLinha1');
    expect(show).toMatchObject({ claquete: 'Show da Noite 20/11 SP', praca: 'SP', etapa: 'produzindo', marcador: 'Aguardando material', designers: ['Designer Um'], cardId: card(1), artes: ['HOJE', 'AMANHÃ'], arquivada: false });
    // o id é do PROMeiro, não o card nem o registro do Teable
    expect(show.id).not.toBe(card(1));
    expect(show.id).not.toBe('recLinha1');
    expect((await porRegistro(chefe, 'recLinha2'))[0]).toMatchObject({ praca: 'G5', etapa: 'entregue', entregaEm: '2026-11-16T18:00:00.000Z' });
    expect((await porRegistro(chefe, 'recLinha3'))[0]).toMatchObject({ cardId: null, etapa: 'entrada', entradaEm: '2026-11-10T12:00:00.000Z' });
    expect((await porRegistro(chefe, 'recLinha4'))[0]).toMatchObject({ etapa: 'arquivada', arquivada: true });
  });

  it('liga ao Roteiro pelo envio e ao filme pela linha ou pela exibição do card', async () => {
    const db = abrirBanco(':memory:');
    roteiroEnviado(db, 'roteiro-show-1', card(1), '2026-11-20');
    const { chefe } = await comServidor({ db });
    await chefe('/api/producoes/recarregar', { method: 'POST' });
    expect((await ler(await chefe('/api/producoes'))).comRoteiro).toBe(1);
    expect((await porRegistro(chefe, 'recLinha1'))[0]).toMatchObject({ roteiroId: 'roteiro-show-1', exibicaoEm: '2026-11-20', filmeId: null });
    expect((await porRegistro(chefe, 'recLinha5'))[0]).toMatchObject({ filmeId: 'recFilme1', filmeTitulo: 'Filme da Tarde', roteiroId: null });
    expect((await porRegistro(chefe, 'recLinha6'))[0]).toMatchObject({ filmeId: 'recFilme2', filmeTitulo: 'Filme da Madrugada (1999)', exibicaoEm: '2026-11-22T03:00:00.000Z', etapa: 'entregue' });
  });

  it('rodar de novo não duplica: atualiza a mesma Produção (o mesmo id) e acrescenta só as linhas novas', async () => {
    const { chefe, registros } = await comServidor();
    await chefe('/api/producoes/recarregar', { method: 'POST' });
    const [antes] = await porRegistro(chefe, 'recLinha3');
    // a linha sem card ganhou designer, e entrou uma linha nova
    Object.assign(registros.ARTE_producao[2].fields, { designers: '["Designer Um"]' });
    registros.ARTE_producao.push(registro('recLinha7', { card_ID: card(7), claquete: 'Praia do Sol 22/11', data_entrada: '2026-11-20T12:00:00.000Z' }));
    const r = await chefe('/api/producoes/recarregar', { method: 'POST' });
    expect(await r.json()).toMatchObject({ linhas: 7, novas: 1, atualizadas: 6 });
    const c = await ler(await chefe('/api/producoes'));
    expect(c).toMatchObject({ total: 7, porEtapa: { entrada: 2, produzindo: 2, entregue: 2, arquivada: 1 } });
    const depois = await porRegistro(chefe, 'recLinha3');
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ id: antes.id, etapa: 'produzindo', designers: ['Designer Um'] });
  });

  it('roda sozinha na subida quando não há nenhuma Produção; com Produções guardadas, não lê a tabela inteira de novo', async () => {
    const db = abrirBanco(':memory:');
    const primeira = await comServidor({ db });
    let c = await ler(await primeira.chefe('/api/producoes'));
    for (let i = 0; i < 50 && (c.carregando || !c.total); i++) {
      await new Promise((ok) => setTimeout(ok, 20));
      c = await ler(await primeira.chefe('/api/producoes'));
    }
    expect(c).toMatchObject({ total: 6, ultimaCarga: { linhas: 6, novas: 6 } });
    await parar?.();
    parar = null;
    const segunda = await comServidor({ db });
    await segunda.app.releituraPronta;
    // só a releitura (as linhas mudadas desde a marca), nunca a carga inteira
    const lidas = segunda.teable.estado.consultas.filter((s: string) => s.includes('"arte_producao_pg"'));
    expect(lidas.length).toBeGreaterThan(0);
    for (const s of lidas) expect(s).toMatch(/WHERE p\."__last_modified_time" >= \$1/);
    expect(await ler(await segunda.chefe('/api/producoes'))).toMatchObject({ total: 6, ultimaCarga: null });
  });

  it('com o Teable fora do ar, recarregar falha e as Produções guardadas ficam', async () => {
    const { chefe, teable } = await comServidor();
    await chefe('/api/producoes/recarregar', { method: 'POST' });
    teable.estado.fora = true;
    const r = await chefe('/api/producoes/recarregar', { method: 'POST' });
    expect(r.status).toBe(502);
    expect((await r.json()).erro).toMatch(/produção da arte/);
    expect(await ler(await chefe('/api/producoes'))).toMatchObject({ total: 6 });
  });

  it('só administradores veem a contagem e recarregam', async () => {
    const { ana } = await comServidor();
    expect((await ana('/api/producoes')).status).toBe(403);
    expect((await ana('/api/producoes/recarregar', { method: 'POST' })).status).toBe(403);
    expect((await ana('/api/producoes?registro=recLinha1')).status).toBe(403);
  });
});

/* A releitura (ADR 0006: o PROMeiro só escreve no Trello; lê do Teable): as linhas que o Teable mudou viram eventos da
   Produção, sem o Trello. O Postgres de mentira devolve a tabela inteira a cada releitura (não olha o WHERE): o que
   não mudou não vira nada. */
describe('a releitura da produção da arte: os eventos nascem do Teable', () => {
  type Evento = { tipo: string; campo?: string; antes: string | null; depois: string | null; quem: unknown; quando: string; acao: string | null };
  const eventosDe = async (chefe: (c: string, i?: RequestInit) => Promise<Response>, rec: string) =>
    ((await (await chefe(`/api/producoes?registro=${rec}`)).json()) as { producoes: (Producao & { eventos: Evento[] })[] }).producoes[0];

  async function carregado() {
    const s = await comServidor();
    await s.app.releituraPronta;
    return s;
  }

  it('a linha que não mudou não vira evento', async () => {
    const { app, chefe } = await carregado();
    expect(await app.relerAProducao()).toMatchObject({ lidas: 6, novas: 0, mudadas: 0, anotados: 0 });
    expect((await eventosDe(chefe, 'recLinha1')).eventos).toEqual([]);
  });

  it('o designer que entrou, a etapa, a prioridade e a complexidade mudadas viram eventos e mudam a Produção', async () => {
    const { app, chefe, registros } = await carregado();
    const quando = '2026-11-26T13:05:00.000Z';
    Object.assign(registros.ARTE_producao[2].fields, { designers: '["Designer Um"]', complexidade: 2, __last_modified_time: quando });
    Object.assign(registros.ARTE_producao[0].fields, { entregue: true, data_entrega: '2026-11-26T15:20:00.000Z', prioridade: 'ALTA', __last_modified_time: '2026-11-26T15:20:30.000Z' });
    expect(await app.relerAProducao()).toMatchObject({ mudadas: 2, novas: 0, anotados: 5 });
    const cozinha = await eventosDe(chefe, 'recLinha3');
    expect(cozinha).toMatchObject({ etapa: 'produzindo', designers: ['Designer Um'] });
    expect(cozinha.eventos.map((e) => [e.tipo, e.campo ?? '', e.antes, e.depois, e.quando])).toEqual([
      ['etapa', '', 'entrada', 'produzindo', quando],
      ['designer-entrou', '', null, 'Designer Um', quando],
      ['campo', 'complexidade', null, 'MÉDIA', quando],
    ]);
    // sem quem (o Teable não diz) e sem id de ação do Trello
    expect(cozinha.eventos.every((e) => e.quem === null && e.acao === null)).toBe(true);
    const show = await eventosDe(chefe, 'recLinha1');
    expect(show).toMatchObject({ etapa: 'entregue', entregaEm: '2026-11-26T15:20:00.000Z' });
    expect(show.eventos.map((e) => [e.tipo, e.campo ?? '', e.antes, e.depois])).toEqual([
      ['etapa', '', 'produzindo', 'entregue'],
      ['campo', 'prioridade', null, 'ALTA'],
    ]);
  });

  it('a mesma mudança relida de novo não duplica; a linha nova vira Produção com "criada"', async () => {
    const { app, chefe, registros } = await carregado();
    Object.assign(registros.ARTE_producao[2].fields, { designers: '["Designer Um"]', __last_modified_time: '2026-11-26T13:05:00.000Z' });
    await app.relerAProducao();
    expect(await app.relerAProducao()).toMatchObject({ mudadas: 0, anotados: 0 });
    expect((await eventosDe(chefe, 'recLinha3')).eventos).toHaveLength(2);
    registros.ARTE_producao.push(registro('recLinha7', { card_ID: card(7), claquete: 'Praia do Sol 22/11', data_entrada: '2026-11-26T16:00:00.000Z', __last_modified_time: '2026-11-26T16:00:05.000Z' }));
    expect(await app.relerAProducao()).toMatchObject({ novas: 1, anotados: 1 });
    const praia = await eventosDe(chefe, 'recLinha7');
    expect(praia).toMatchObject({ claquete: 'Praia do Sol 22/11', etapa: 'entrada', cardId: card(7) });
    expect(praia.eventos.map((e) => [e.tipo, e.depois, e.quando])).toEqual([['criada', 'entrada', '2026-11-26T16:00:00.000Z']]);
    // a linha do tempo (#89) lê esses eventos
    const linha = (await (await chefe(`/api/linha-do-tempo?card=${card(7)}`)).json()) as { eventos: { tipo: string; quem: string | null }[] };
    expect(linha.eventos).toEqual([{ tipo: 'criada', antes: null, depois: 'entrada', quem: null, quando: '2026-11-26T16:00:00.000Z' }]);
  });

  it('a próxima releitura pede desde a modificação mais nova lida (menos 2 minutos), guardada no SQLite; o Roteiro ligado fica', async () => {
    const db = abrirBanco(':memory:');
    roteiroEnviado(db, 'roteiro-show-1', card(1), '2026-11-20');
    const { app, teable, registros, chefe } = await comServidor({ db });
    await app.releituraPronta;
    Object.assign(registros.ARTE_producao[0].fields, { designers: '["Designer Dois"]', __last_modified_time: '2026-11-26T13:05:00.000Z' });
    await app.relerAProducao();
    await app.relerAProducao();
    expect(teable.estado.parametros.at(-1)).toEqual(['2026-11-26T13:03:00.000Z']);
    expect((await porRegistro(chefe, 'recLinha1'))[0]).toMatchObject({ designers: ['Designer Dois'], roteiroId: 'roteiro-show-1', exibicaoEm: '2026-11-20' });
    expect((await ler(await chefe('/api/producoes'))) as unknown).toMatchObject({ ultimaReleitura: { desde: '2026-11-26T13:03:00.000Z' } });
  });

  it('com o Teable fora do ar, a releitura não muda nada e tenta de novo na próxima', async () => {
    const { app, teable } = await carregado();
    teable.estado.fora = true;
    expect(await app.relerAProducao()).toBeNull();
  });
});

/* A tela de produções (#109): a rota de leitura, para qualquer pessoa logada, com as Produções abertas por praça e
   etapa, montada só do que o PROMeiro guarda (nada do Trello: o ambiente nem tem o Trello). Um bloco por praça, na
   ordem das praças da Configuração (aqui, as de fábrica); o Entregue só com os dos últimos 3 dias; as arquivadas fora;
   as sem card no bloco delas; a ordem pelo prazo e, no mesmo prazo, a ALTA primeiro. */
describe('a tela de produções: as Produções abertas por praça e etapa', () => {
  const DIA = 86_400_000;
  const agora = Date.now();
  /** "27/11": o dia daqui a n dias, em São Paulo (a data na claquete, que vira o prazo). */
  const dm = (n: number) => new Date(agora + n * DIA).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const diaIso = (n: number) => new Date(agora + n * DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const ha = (n: number) => new Date(agora - n * DIA).toISOString();
  const linhas = () => [
    // SP: duas no mesmo prazo (a ALTA primeiro) e uma sem card com o prazo mais perto
    registro('recTela1', { card_ID: card(11), claquete: `Show da Noite ${dm(3)} SP`, status: '[]', designers: null, artes: 'HOJE\nAMANHÃ\nDOMINGO', data_entrada: ha(1) }),
    registro('recTela2', { card_ID: card(12), claquete: `Festa na Praça ${dm(3)} SP`, status: '[]', designers: null, artes: 'HOJE', prioridade: 'ALTA', data_entrada: ha(1) }),
    registro('recTela3', { card_ID: '', claquete: `Cozinha de Vó ${dm(1)} SP`, status: null, designers: null, data_entrada: ha(2) }),
    // G5: produzindo, entregue ontem (fica), entregue há 5 dias (sai) e um filme sem card
    registro('recTela4', { card_ID: card(14), claquete: `Novela Sinfonia ${dm(2)}`, status: '["PRODUZINDO","AGUARDANDO MATERIAL"]', designers: '["Designer Um","Designer Dois"]', artes: 'HOJE | AMANHÃ', data_entrada: ha(2) }),
    registro('recTela5', { card_ID: card(15), claquete: `Jogo Final ${dm(0)}`, status: '["FINALIZADO"]', designers: '["Designer Um"]', entregue: true, data_entrada: ha(3), data_entrega: ha(1) }),
    registro('recTela6', { card_ID: card(16), claquete: `Jogo Antigo ${dm(-4)}`, status: '["FINALIZADO"]', designers: '["Designer Dois"]', entregue: true, data_entrada: ha(8), data_entrega: ha(5) }),
    registro('recTela8', { card_ID: '', claquete: `Filme da Tarde ${dm(4)}`, status: '["FILME"]', designers: null, filme: [{ id: 'recFilme9', title: 'Filme da Tarde' }], data_entrada: ha(1) }),
    // RJ: arquivada (sai)
    registro('recTela7', { card_ID: card(17), claquete: `RIO Show ${dm(2)}`, status: '["PRODUZINDO"]', designers: '["Designer Um"]', arquivado: true, data_entrada: ha(2) }),
  ];
  type Card = { id: string; claquete: string; atracao: string; semCard: boolean; artes: { aProduzir: number | null; entregues: number }; designers: string[]; alta: boolean; prazo: string | null; marcador: string };
  type Bloco = { praca: string; nome: string; colunas: Record<'entrada' | 'produzindo' | 'entregue', Card[]> };
  type Tela = { entregueDias: number; blocos: Bloco[] };

  async function tela(db = abrirBanco(':memory:')) {
    const s = await comServidor({ db, registros: { ARTE_producao: linhas(), exibicoes: [] } });
    await s.app.releituraPronta;
    const r = await s.ana('/api/producoes/por-praca');
    return { ...s, r, corpo: (await r.json()) as Tela };
  }
  const claquetes = (cs: Card[]) => cs.map((c) => c.claquete);
  const daPraca = (t: Tela, sigla: string) => t.blocos.find((f) => f.praca === sigla)!;

  it('qualquer pessoa logada lê; um bloco por praça, na ordem das praças, com as três colunas', async () => {
    const { r, corpo } = await tela();
    expect(r.status).toBe(200);
    expect(corpo.entregueDias).toBe(3);
    expect(corpo.blocos.map((f) => [f.praca, f.nome])).toEqual([
      ['G5', 'Rede (G5)'],
      ['RJ', 'Rio'],
      ['SP', 'São Paulo'],
      ['INTER', 'Internacional'],
    ]);
    // a praça sem nada também tem o bloco, com as colunas vazias
    expect(daPraca(corpo, 'INTER').colunas).toEqual({ entrada: [], produzindo: [], entregue: [] });
  });

  it('cada Produção na coluna da etapa dela; a ordem é o prazo e, no mesmo prazo, a ALTA primeiro', async () => {
    const { corpo } = await tela();
    const sp = daPraca(corpo, 'SP').colunas;
    expect(claquetes(sp.entrada)).toEqual([`Cozinha de Vó ${dm(1)} SP`, `Festa na Praça ${dm(3)} SP`, `Show da Noite ${dm(3)} SP`]);
    expect(sp.produzindo).toEqual([]);
    const g5 = daPraca(corpo, 'G5').colunas;
    expect(claquetes(g5.produzindo)).toEqual([`Novela Sinfonia ${dm(2)}`]);
  });

  it('o card traz o que a tela mostra: a claquete, a atração, as artes, os designers, a prioridade e o prazo', async () => {
    const db = abrirBanco(':memory:');
    // o Roteiro enviado para o card diz a atração
    const em = new Date(agora).toISOString();
    db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run('roteiro-festa', 'ana@empresa.com', 'Ana', JSON.stringify({ claquete: `Festa na Praça ${dm(3)} SP`, programa: 'Festa na Praça' }), '{}', em, em);
    db.prepare("INSERT INTO envios (roteiro_id, estado, card_id, em) VALUES (?, 'ok', ?, ?)").run('roteiro-festa', card(12), em);
    const { corpo } = await tela(db);
    const [, festa] = daPraca(corpo, 'SP').colunas.entrada;
    expect(festa).toMatchObject({ claquete: `Festa na Praça ${dm(3)} SP`, atracao: 'Festa na Praça', semCard: false, artes: { aProduzir: 1, entregues: 0 }, designers: [], alta: true, prazo: diaIso(3) });
    const [novela] = daPraca(corpo, 'G5').colunas.produzindo;
    expect(novela).toMatchObject({ artes: { aProduzir: 2, entregues: 0 }, designers: ['Designer Um', 'Designer Dois'], alta: false, marcador: 'Aguardando material', prazo: diaIso(2) });
    // nenhum id do Trello nem do Teable vai para a tela
    expect(JSON.stringify(corpo)).not.toMatch(/c0ffee|recTela/);
  });

  it('o Entregue mostra só os entregues dos últimos 3 dias; as arquivadas não aparecem', async () => {
    const { corpo } = await tela();
    expect(claquetes(daPraca(corpo, 'G5').colunas.entregue)).toEqual([`Jogo Final ${dm(0)}`]);
    expect(daPraca(corpo, 'RJ').colunas).toEqual({ entrada: [], produzindo: [], entregue: [] });
    expect(JSON.stringify(corpo)).not.toMatch(/Jogo Antigo|RIO Show/);
  });

  it('as Produções sem card (a linha sem card, o filme) ficam no bloco da praça delas', async () => {
    const { corpo } = await tela();
    const [cozinha] = daPraca(corpo, 'SP').colunas.entrada;
    expect(cozinha).toMatchObject({ claquete: `Cozinha de Vó ${dm(1)} SP`, semCard: true });
    const filme = daPraca(corpo, 'G5').colunas.entrada.find((c) => c.claquete.startsWith('Filme da Tarde'));
    expect(filme).toMatchObject({ semCard: true, atracao: 'Filme da Tarde', prazo: diaIso(4) });
  });

  it('só GET', async () => {
    const { ana } = await tela();
    expect((await ana('/api/producoes/por-praca', { method: 'POST' })).status).toBe(405);
  });
});

/* Pegar e voltar para a Entrada (#110): a rota de mudar a etapa, para quem está ligado a um designer (pelo e-mail no
   cadastro de designers, o mesmo que a Configuração · Pessoas lê), com o Trello e o Teable de mentira. O PROMeiro só
   ESCREVE no Trello (o membro do card, mover de lista), nunca lê; a Produção muda na hora, e nada vai para o Teable. */
describe('a tela de produções: pegar, voltar para a Entrada e entregar', () => {
  const DIA = 86_400_000;
  const ha = (n: number) => new Date(Date.now() - n * DIA).toISOString();
  const AMBIENTE = { ...ENV, TRELLO_KEY: 'chave-falsa', TRELLO_TOKEN: 'token-falso-do-trello', TRELLO_LISTA_SP: 'entradaSP', TRELLO_SAIDA_SP: 'saidaSP' };
  const linhas = () => [
    registro('recPeg1', { card_ID: card(21), claquete: 'Show da Noite 20/12 SP', status: '[]', designers: null, data_entrada: ha(1), __last_modified_time: ha(1) }),
    registro('recPeg2', { card_ID: card(22), claquete: 'Festa na Praça 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza","Designer Dois"]', data_entrada: ha(2), __last_modified_time: ha(2) }),
    registro('recPeg3', { card_ID: card(23), claquete: 'Jogo Final 20/12 SP', status: '["FINALIZADO"]', designers: '["Ana Souza"]', entregue: true, data_entrada: ha(3), data_entrega: ha(1), __last_modified_time: ha(1) }),
    registro('recPeg4', { card_ID: '', claquete: 'Cozinha de Vó 20/12 SP', status: null, designers: null, data_entrada: ha(1), __last_modified_time: ha(1) }),
    // a de entregar (#111): os itens do checklist na coluna de artes (a de dois tipos, um item por tipo)
    registro('recPeg5', { card_ID: card(25), claquete: 'Novela Sinfonia 20/12 SP', status: '["PRODUZINDO"]', designers: '["Ana Souza"]', artes: 'HOJE (RDP) | HOJE (CRT) | AMANHÃ', data_entrada: ha(2), __last_modified_time: ha(2) }),
  ];
  // o cadastro de designers (fictício): a Ana tem o e-mail e o id do membro no Trello; a Bia não está lá
  // o Caio (#112) é outro designer ligado, para o desfazer de uma pessoa diante da mudança de outra
  const designers = () => [
    registro('recDesignerAna', { designer: 'Ana Souza', email: 'ana@empresa.com', designer_ID: 'membroAna', status: 'ativo' }),
    registro('recDesignerCaio', { designer: 'Caio Prates', email: 'caio@empresa.com', designer_ID: 'membroCaio', status: 'ativo' }),
  ];

  type Pedido = { metodo: string; caminho: string; consulta: Record<string, string> };
  /** O Trello de mentira: anota cada pedido (sem a chave e o token) e responde ok, ou recusa onde `recusar` disser. */
  function trelloFalso() {
    const pedidos: Pedido[] = [];
    const estado = { recusar: null as null | ((p: Pedido) => boolean) };
    const buscar = async (endereco: string, init: RequestInit = {}) => {
      const url = new URL(endereco);
      const consulta = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'key' && k !== 'token'));
      const p = { metodo: init.method ?? 'GET', caminho: url.pathname.replace(/^\/1/, ''), consulta };
      pedidos.push(p);
      if (estado.recusar?.(p)) return new Response('invalid value for idMembers', { status: 400 });
      return Response.json({});
    };
    return { pedidos, estado, buscar };
  }

  type Card = { id: string; claquete: string; etapa: string; designers: string[] };
  type Tela = { blocos: { praca: string; colunas: Record<string, Card[]> }[]; voce: { designer: string | null; porQue?: string } };
  type EventoDaLinha = { tipo: string; antes: string | null; depois: string | null; quem: string | null; quando: string; origem?: string };

  async function preparado() {
    const t = trelloFalso();
    const s = await comServidor({
      env: AMBIENTE,
      nomes: { ...NOMES, designers: 'designers_pg' },
      registros: { ARTE_producao: linhas(), exibicoes: [], designers: designers() },
      trello: (env: unknown, deps: Record<string, unknown>) => criarTrello(env, { ...deps, buscar: t.buscar }),
    });
    await s.app.releituraPronta;
    await s.app.pessoasProntas;
    // a carga e a verificação das pessoas não pedem nada ao Trello
    expect(t.pedidos).toEqual([]);
    const tela = async (quem = s.ana) => (await (await quem('/api/producoes/por-praca')).json()) as Tela;
    const daClaquete = async (inicio: string) => (await tela()).blocos.flatMap((f) => Object.values(f.colunas).flat()).find((c) => c.claquete.startsWith(inicio))!;
    const idDe = async (inicio: string) => (await daClaquete(inicio)).id;
    const mudar = (id: string, etapa: string, quem = s.ana, extra: Record<string, unknown> = {}) => quem('/api/producoes/etapa', { method: 'POST', body: JSON.stringify({ producao: id, etapa, ...extra }) });
    // as artes marcadas no checklist chegam pelo aviso do Trello; aqui, já guardadas na Produção
    const marcar = (id: string, artes: string[]) => s.db.prepare('UPDATE producoes SET artes_marcadas = ? WHERE id = ?').run(JSON.stringify(artes), id);
    const linhaDoTempo = async (id: string) => ((await (await s.ana(`/api/linha-do-tempo?producao=${id}`)).json()) as { eventos: EventoDaLinha[] }).eventos;
    const bia = (caminho: string, init: RequestInit = {}) => s.ana(caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'bia@empresa.com' } });
    const caio = (caminho: string, init: RequestInit = {}) => s.ana(caminho, { ...init, headers: { 'cf-access-authenticated-user-email': 'caio@empresa.com' } });
    const desfazer = (id: string, quem = s.ana) => quem('/api/producoes/desfazer', { method: 'POST', body: JSON.stringify({ producao: id }) });
    return { ...s, trello: t, tela, daClaquete, idDe, mudar, marcar, linhaDoTempo, bia, caio, desfazer };
  }
  const resumo = (evs: EventoDaLinha[]) => evs.map((e) => [e.tipo, e.antes, e.depois, e.quem, e.origem ?? '']);
  /** O resumo com a marca do desfazer (o evento que desfez uma mudança). */
  const comDesfeito = (evs: (EventoDaLinha & { desfez?: boolean })[]) => evs.map((e) => [e.tipo, e.antes, e.depois, e.desfez ? 'desfez' : '']);

  it('quem está ligado a um designer vê que pode pegar', async () => {
    const { tela } = await preparado();
    expect((await tela()).voce).toEqual({ designer: 'Ana Souza' });
  });

  it('"Peguei": quem clicou entra no card do Trello (o card fica na lista) e vira designer; a Produção vai para Produzindo', async () => {
    const { idDe, mudar, daClaquete, linhaDoTempo, trello, teable } = await preparado();
    const id = await idDe('Show da Noite');
    const pedidosAoTeable = teable.estado.pedidos.length;
    const r = await mudar(id, 'produzindo');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ feito: { antes: 'entrada', depois: 'produzindo', designer: { entrou: 'Ana Souza' } }, producao: { id, etapa: 'produzindo', designers: ['Ana Souza'] } });
    // só a escrita: o membro entra no card; nada de mover de lista, nada de ler
    expect(trello.pedidos).toEqual([{ metodo: 'POST', caminho: `/cards/${card(21)}/idMembers`, consulta: { value: 'membroAna' } }]);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    const evs = await linhaDoTempo(id);
    expect(resumo(evs)).toEqual([
      ['etapa', 'entrada', 'produzindo', 'Ana Souza', 'PROMeiro'],
      ['designer-entrou', null, 'Ana Souza', 'Ana Souza', 'PROMeiro'],
    ]);
    expect(Math.abs(Date.parse(evs[0].quando) - Date.now())).toBeLessThan(60_000);
    // nada escrito no Teable (a etapa e os designers da produção da arte continuam com o n8n)
    expect(teable.estado.pedidos.slice(pedidosAoTeable).filter((p: string) => !p.startsWith('GET'))).toEqual([]);
    // pegar de novo: já não está na Entrada
    expect((await mudar(id, 'produzindo')).status).toBe(409);
  });

  it('"Voltar para a Entrada": sai do card e dos designers; o card que estava na saída volta para a entrada da praça', async () => {
    const { idDe, mudar, daClaquete, linhaDoTempo, trello } = await preparado();
    const festa = await idDe('Festa na Praça');
    expect((await mudar(festa, 'entrada')).status).toBe(200);
    expect(trello.pedidos).toEqual([{ metodo: 'DELETE', caminho: `/cards/${card(22)}/idMembers/membroAna`, consulta: {} }]);
    expect(await daClaquete('Festa na Praça')).toMatchObject({ etapa: 'entrada', designers: ['Designer Dois'] });
    expect(resumo(await linhaDoTempo(festa))).toEqual([
      ['etapa', 'produzindo', 'entrada', 'Ana Souza', 'PROMeiro'],
      ['designer-saiu', 'Ana Souza', null, 'Ana Souza', 'PROMeiro'],
    ]);
    trello.pedidos.length = 0;
    const jogo = await idDe('Jogo Final');
    expect((await mudar(jogo, 'entrada')).status).toBe(200);
    expect(trello.pedidos).toEqual([
      { metodo: 'PUT', caminho: `/cards/${card(23)}`, consulta: { idList: 'entradaSP' } },
      { metodo: 'DELETE', caminho: `/cards/${card(23)}/idMembers/membroAna`, consulta: {} },
    ]);
    expect(await daClaquete('Jogo Final')).toMatchObject({ etapa: 'entrada', designers: [] });
    // na Entrada, não há o que voltar
    expect((await mudar(jogo, 'entrada')).status).toBe(409);
  });

  it('qualquer designer move qualquer card: voltar tira só quem clicou, e os outros designers ficam', async () => {
    const { idDe, mudar, daClaquete, trello } = await preparado();
    const festa = await idDe('Festa na Praça');
    // a festa é da Ana e do Designer Dois: a Ana volta e pega de novo, e o Designer Dois fica o tempo todo
    expect((await mudar(festa, 'entrada')).status).toBe(200);
    expect((await mudar(festa, 'produzindo')).status).toBe(200);
    expect(await daClaquete('Festa na Praça')).toMatchObject({ etapa: 'produzindo', designers: ['Designer Dois', 'Ana Souza'] });
    expect(trello.pedidos.map((p) => p.metodo)).toEqual(['DELETE', 'POST']);
  });

  it('a Produção sem card muda de etapa só no PROMeiro, sem erro', async () => {
    const { idDe, mudar, daClaquete, linhaDoTempo, trello } = await preparado();
    const id = await idDe('Cozinha de Vó');
    const r = await mudar(id, 'produzindo');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ feito: { semCard: true } });
    expect(await daClaquete('Cozinha de Vó')).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(resumo(await linhaDoTempo(id)).map((e) => e[0])).toEqual(['etapa', 'designer-entrou']);
    expect((await mudar(id, 'entrada')).status).toBe(200);
    expect(await daClaquete('Cozinha de Vó')).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(trello.pedidos).toEqual([]);
  });

  it('o Trello recusa: a Produção não muda, nenhum evento, e o motivo volta para a tela', async () => {
    const { idDe, mudar, daClaquete, linhaDoTempo, trello } = await preparado();
    trello.estado.recusar = () => true;
    const id = await idDe('Show da Noite');
    const r = await mudar(id, 'produzindo');
    expect(r.status).toBe(502);
    expect((await r.json()).erro).toMatch(/Trello recusou.*nada mudou/is);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(await linhaDoTempo(id)).toEqual([]);
  });

  it('o Trello recusa o segundo passo: o card que já foi movido volta para a saída (desfeito)', async () => {
    const { idDe, mudar, daClaquete, trello } = await preparado();
    trello.estado.recusar = (p) => p.metodo === 'DELETE';
    const jogo = await idDe('Jogo Final');
    expect((await mudar(jogo, 'entrada')).status).toBe(502);
    expect(trello.pedidos.map((p) => [p.metodo, p.consulta.idList ?? ''])).toEqual([
      ['PUT', 'entradaSP'],
      ['DELETE', ''],
      ['PUT', 'saidaSP'],
    ]);
    expect(await daClaquete('Jogo Final')).toMatchObject({ etapa: 'entregue', designers: ['Ana Souza'] });
  });

  it('quem não está ligado a um designer vê a tela, não pega, e a tela explica a quem pedir', async () => {
    const { tela, idDe, bia, trello } = await preparado();
    const voce = (await tela(bia)).voce;
    expect(voce.designer).toBeNull();
    expect(voce.porQue).toMatch(/administrador/);
    const r = await bia('/api/producoes/etapa', { method: 'POST', body: JSON.stringify({ producao: await idDe('Show da Noite'), etapa: 'produzindo' }) });
    expect(r.status).toBe(403);
    expect((await r.json()).erro).toBe(voce.porQue);
    expect(trello.pedidos).toEqual([]);
  });

  it('o pedido mal feito: a Produção que não existe, a etapa desconhecida e o método', async () => {
    const { mudar, ana, idDe } = await preparado();
    expect((await mudar('nao-existe', 'produzindo')).status).toBe(404);
    expect((await mudar(await idDe('Show da Noite'), 'arquivada')).status).toBe(400);
    expect((await ana('/api/producoes/etapa')).status).toBe(405);
  });

  it('"Entreguei" com todas as artes marcadas: o card vai para a saída da praça e a Produção para Entregue, com o evento', async () => {
    const { idDe, mudar, marcar, daClaquete, linhaDoTempo, trello, teable } = await preparado();
    const id = await idDe('Novela Sinfonia');
    // o checklist marcado, sem caixa nem acento
    marcar(id, ['hoje (rdp)', 'HOJE (CRT)', 'Amanha']);
    const pedidosAoTeable = teable.estado.pedidos.length;
    const r = await mudar(id, 'entregue');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ feito: { antes: 'produzindo', depois: 'entregue', semCard: false }, producao: { id, etapa: 'entregue', designers: ['Ana Souza'] } });
    // só a escrita: o card vai para a lista de saída da praça (a da Configuração)
    expect(trello.pedidos).toEqual([{ metodo: 'PUT', caminho: `/cards/${card(25)}`, consulta: { idList: 'saidaSP' } }]);
    const naTela = await daClaquete('Novela Sinfonia');
    expect(naTela).toMatchObject({ etapa: 'entregue' });
    const evs = await linhaDoTempo(id);
    expect(resumo(evs)).toEqual([['etapa', 'produzindo', 'entregue', 'Ana Souza', 'PROMeiro']]);
    expect(Math.abs(Date.parse(evs[0].quando) - Date.now())).toBeLessThan(60_000);
    expect(teable.estado.pedidos.slice(pedidosAoTeable).filter((p: string) => !p.startsWith('GET'))).toEqual([]);
    // entregar de novo: já está em Entregue
    expect((await mudar(id, 'entregue')).status).toBe(409);
  });

  it('"Entreguei" com arte faltando: devolve as que faltam e nada muda, nem no Trello', async () => {
    const { idDe, mudar, marcar, daClaquete, linhaDoTempo, trello } = await preparado();
    const id = await idDe('Novela Sinfonia');
    marcar(id, ['HOJE (RDP)']);
    const r = await mudar(id, 'entregue');
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ faltam: ['HOJE (CRT)', 'AMANHÃ'], producao: { id, etapa: 'produzindo' } });
    expect(corpo.feito).toBeUndefined();
    expect(trello.pedidos).toEqual([]);
    expect(await daClaquete('Novela Sinfonia')).toMatchObject({ etapa: 'produzindo' });
    expect(await linhaDoTempo(id)).toEqual([]);
  });

  it('"Entregar assim mesmo": com arte faltando, entrega e o card vai para a saída', async () => {
    const { idDe, mudar, daClaquete, linhaDoTempo, trello } = await preparado();
    const id = await idDe('Novela Sinfonia');
    const r = await mudar(id, 'entregue', undefined, { assimMesmo: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ feito: { antes: 'produzindo', depois: 'entregue' }, producao: { etapa: 'entregue' } });
    expect(trello.pedidos).toEqual([{ metodo: 'PUT', caminho: `/cards/${card(25)}`, consulta: { idList: 'saidaSP' } }]);
    expect(await daClaquete('Novela Sinfonia')).toMatchObject({ etapa: 'entregue' });
    expect(resumo(await linhaDoTempo(id))).toEqual([['etapa', 'produzindo', 'entregue', 'Ana Souza', 'PROMeiro']]);
  });

  it('a Produção sem card é entregue só no PROMeiro, sem erro', async () => {
    const { idDe, mudar, daClaquete, linhaDoTempo, trello } = await preparado();
    const id = await idDe('Cozinha de Vó');
    const r = await mudar(id, 'entregue');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ feito: { antes: 'entrada', depois: 'entregue', semCard: true } });
    expect(await daClaquete('Cozinha de Vó')).toMatchObject({ etapa: 'entregue' });
    expect(resumo(await linhaDoTempo(id)).map((e) => e[0])).toEqual(['etapa']);
    expect(trello.pedidos).toEqual([]);
  });

  it('entregar de novo depois de voltar: a entrega é a de agora (o card fica no Entregue dos últimos dias)', async () => {
    const { idDe, mudar, daClaquete } = await preparado();
    const jogo = await idDe('Jogo Final');
    const antes = (await daClaquete('Jogo Final')) as Card & { entregaEm: string };
    expect(Date.now() - Date.parse(antes.entregaEm)).toBeGreaterThan(60 * 60_000);
    expect((await mudar(jogo, 'entrada')).status).toBe(200);
    expect((await mudar(jogo, 'entregue')).status).toBe(200);
    const depois = (await daClaquete('Jogo Final')) as Card & { entregaEm: string };
    expect(depois.etapa).toBe('entregue');
    expect(Math.abs(Date.parse(depois.entregaEm) - Date.now())).toBeLessThan(60_000);
  });

  it('o Trello recusa a entrega: a Produção não muda, nenhum evento, e o motivo volta para a tela', async () => {
    const { idDe, mudar, daClaquete, linhaDoTempo, trello } = await preparado();
    trello.estado.recusar = () => true;
    const id = await idDe('Novela Sinfonia');
    const r = await mudar(id, 'entregue', undefined, { assimMesmo: true });
    expect(r.status).toBe(502);
    expect((await r.json()).erro).toMatch(/Trello recusou.*nada mudou/is);
    expect(await daClaquete('Novela Sinfonia')).toMatchObject({ etapa: 'produzindo' });
    expect(await linhaDoTempo(id)).toEqual([]);
  });

  it('conflito: a releitura atrasada não desfaz o que o PROMeiro fez; a mudança de fora depois dele vira evento e vale', async () => {
    const { idDe, mudar, daClaquete, linhaDoTempo, app, registros } = await preparado();
    const id = await idDe('Show da Noite');
    expect((await mudar(id, 'produzindo')).status).toBe(200);
    // o Teable ainda não sabe (o n8n não sincronizou): a linha relida, mais velha que o "pegar", não volta a etapa
    await app.relerAProducao();
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(resumo(await linhaDoTempo(id)).map((e) => e[0])).toEqual(['etapa', 'designer-entrou']);
    // depois, alguém tira a Ana do card direto no Trello e o n8n grava no Teable: vale o mais recente
    const depois = new Date(Date.now() + 60_000).toISOString();
    Object.assign(registros.ARTE_producao[0].fields, { designers: '[]', status: '[]', __last_modified_time: depois });
    await app.relerAProducao();
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(resumo(await linhaDoTempo(id))).toEqual([
      ['etapa', 'entrada', 'produzindo', 'Ana Souza', 'PROMeiro'],
      ['designer-entrou', null, 'Ana Souza', 'Ana Souza', 'PROMeiro'],
      ['etapa', 'produzindo', 'entrada', null, ''],
      ['designer-saiu', 'Ana Souza', null, null, ''],
    ]);
  });

  /* ---------- desfazer (#112): a ação contrária, gravada como evento novo, só da última mudança da pessoa ---------- */

  it('desfazer "Peguei": quem pegou sai do card e dos designers, a Produção volta para a Entrada, e os eventos novos dizem que desfez', async () => {
    const { idDe, mudar, desfazer, daClaquete, linhaDoTempo, trello } = await preparado();
    const id = await idDe('Show da Noite');
    expect((await mudar(id, 'produzindo')).status).toBe(200);
    trello.pedidos.length = 0;
    const r = await desfazer(id);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ feito: { antes: 'produzindo', depois: 'entrada', designer: { saiu: 'Ana Souza' } }, producao: { id, etapa: 'entrada', designers: [] } });
    expect(trello.pedidos).toEqual([{ metodo: 'DELETE', caminho: `/cards/${card(21)}/idMembers/membroAna`, consulta: {} }]);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entrada', designers: [] });
    // a mudança fica na linha do tempo; o desfazer é evento novo, com quem e a origem
    const evs = await linhaDoTempo(id);
    expect(comDesfeito(evs)).toEqual([
      ['etapa', 'entrada', 'produzindo', ''],
      ['designer-entrou', null, 'Ana Souza', ''],
      ['etapa', 'produzindo', 'entrada', 'desfez'],
      ['designer-saiu', 'Ana Souza', null, 'desfez'],
    ]);
    expect(resumo(evs).slice(2).map((e) => [e[3], e[4]])).toEqual([
      ['Ana Souza', 'PROMeiro'],
      ['Ana Souza', 'PROMeiro'],
    ]);
  });

  it('desfazer "Voltar para a Entrada" de Entregue: o card volta para a saída, quem saiu volta ao card, e a entrega é a de antes', async () => {
    const { idDe, mudar, desfazer, daClaquete, trello } = await preparado();
    const jogo = await idDe('Jogo Final');
    const antes = (await daClaquete('Jogo Final')) as Card & { entregaEm: string };
    expect((await mudar(jogo, 'entrada')).status).toBe(200);
    trello.pedidos.length = 0;
    expect((await desfazer(jogo)).status).toBe(200);
    expect(trello.pedidos).toEqual([
      { metodo: 'PUT', caminho: `/cards/${card(23)}`, consulta: { idList: 'saidaSP' } },
      { metodo: 'POST', caminho: `/cards/${card(23)}/idMembers`, consulta: { value: 'membroAna' } },
    ]);
    expect(await daClaquete('Jogo Final')).toMatchObject({ etapa: 'entregue', designers: ['Ana Souza'], entregaEm: antes.entregaEm });
  });

  it('desfazer "Entreguei": o card volta para a entrada da praça e a Produção para Produzindo', async () => {
    const { idDe, mudar, desfazer, daClaquete, linhaDoTempo, trello } = await preparado();
    const id = await idDe('Novela Sinfonia');
    expect((await mudar(id, 'entregue', undefined, { assimMesmo: true })).status).toBe(200);
    trello.pedidos.length = 0;
    expect((await desfazer(id)).status).toBe(200);
    expect(trello.pedidos).toEqual([{ metodo: 'PUT', caminho: `/cards/${card(25)}`, consulta: { idList: 'entradaSP' } }]);
    expect(await daClaquete('Novela Sinfonia')).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect(comDesfeito(await linhaDoTempo(id))).toEqual([
      ['etapa', 'produzindo', 'entregue', ''],
      ['etapa', 'entregue', 'produzindo', 'desfez'],
    ]);
  });

  it('a Produção sem card desfaz só no PROMeiro', async () => {
    const { idDe, mudar, desfazer, daClaquete, trello } = await preparado();
    const id = await idDe('Cozinha de Vó');
    expect((await mudar(id, 'produzindo')).status).toBe(200);
    const r = await desfazer(id);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ feito: { semCard: true } });
    expect(await daClaquete('Cozinha de Vó')).toMatchObject({ etapa: 'entrada', designers: [] });
    expect(trello.pedidos).toEqual([]);
  });

  it('só vale para a última mudança da pessoa naquele card: o desfeito não desfaz de novo, e a mudança de outra pessoa depois tranca', async () => {
    const { idDe, mudar, desfazer, daClaquete, caio, trello } = await preparado();
    const id = await idDe('Show da Noite');
    // sem nenhuma mudança da pessoa, não há o que desfazer
    expect((await desfazer(id)).status).toBe(409);
    expect((await mudar(id, 'produzindo')).status).toBe(200);
    expect((await desfazer(id)).status).toBe(200);
    // o desfazer não se desfaz
    const deNovo = await desfazer(id);
    expect(deNovo.status).toBe(409);
    expect((await deNovo.json()).erro).toMatch(/já foi desfeita/);
    // a Ana pega, o Caio entrega depois: a Ana não desfaz mais; o Caio desfaz a dele
    expect((await mudar(id, 'produzindo')).status).toBe(200);
    expect((await mudar(id, 'entregue', caio, { assimMesmo: true })).status).toBe(200);
    trello.pedidos.length = 0;
    const daAna = await desfazer(id);
    expect(daAna.status).toBe(409);
    expect((await daAna.json()).erro).toMatch(/mudou depois/);
    expect(trello.pedidos).toEqual([]);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entregue' });
    expect((await desfazer(id, caio)).status).toBe(200);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
  });

  it('a mudança de fora que chega depois (a releitura) tranca o desfazer', async () => {
    const { idDe, mudar, desfazer, daClaquete, app, registros } = await preparado();
    const id = await idDe('Show da Noite');
    expect((await mudar(id, 'produzindo')).status).toBe(200);
    Object.assign(registros.ARTE_producao[0].fields, { status: '["FINALIZADO"]', entregue: true, data_entrega: new Date().toISOString(), designers: '["Ana Souza"]', __last_modified_time: new Date(Date.now() + 60_000).toISOString() });
    await app.relerAProducao();
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entregue' });
    expect((await desfazer(id)).status).toBe(409);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'entregue' });
  });

  it('o Trello recusa o desfazer: a Produção fica como está, nenhum evento novo, e o motivo volta', async () => {
    const { idDe, mudar, desfazer, daClaquete, linhaDoTempo, trello } = await preparado();
    const id = await idDe('Show da Noite');
    expect((await mudar(id, 'produzindo')).status).toBe(200);
    trello.estado.recusar = () => true;
    const r = await desfazer(id);
    expect(r.status).toBe(502);
    expect((await r.json()).erro).toMatch(/Trello recusou.*nada mudou/is);
    expect(await daClaquete('Show da Noite')).toMatchObject({ etapa: 'produzindo', designers: ['Ana Souza'] });
    expect((await linhaDoTempo(id)).length).toBe(2);
  });

  it('o desfazer mal pedido: sem ligação, a Produção que não existe e o método', async () => {
    const { idDe, mudar, desfazer, bia, ana } = await preparado();
    const id = await idDe('Show da Noite');
    expect((await mudar(id, 'produzindo')).status).toBe(200);
    expect((await desfazer(id, bia)).status).toBe(403);
    expect((await desfazer('nao-existe')).status).toBe(404);
    expect((await ana('/api/producoes/desfazer')).status).toBe(405);
  });
});
