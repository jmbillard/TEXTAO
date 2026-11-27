// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { TEABLE_FALSO, teableFalso } from './fixtures/teable-falso.mjs';

/* A Produção (#86) pela API: a carga inicial lê a produção da arte INTEIRA do Teable de mentira (as tabelas achadas
   pelo nome, o Postgres respondendo as linhas) e cada linha vira uma Produção do PROMeiro, com id próprio. Rodar de
   novo atualiza, não duplica (a chave é o registro do Teable). Nada do Trello: o ambiente nem tem o Trello. */

const ENV = { CADASTRO_ADMINS: 'chefe@empresa.com', ...TEABLE_FALSO, TEABLE_PG_URL: 'postgres://falso', TEABLE_PG_ESQUEMA: 'bseFalso' };
const NOMES = { ARTE_producao: 'arte_producao_pg', exibicoes: 'exibicoes_pg' };

// ids de card fictícios (24 caracteres hexadecimais)
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;
type Campos = Record<string, unknown>;
const registro = (id: string, fields: Campos) => ({ id, fields });

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

async function comServidor({ db = abrirBanco(':memory:'), registros = { ARTE_producao: producaoDaArte(), exibicoes: exibicoes() } } = {}) {
  const teable = teableFalso(NOMES, { registros });
  const app = criarApp({ db, env: ENV, buscarNoTeable: teable, abrirPg: teable.abrirPg });
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
   etapa, montada só do que o PROMeiro guarda (nada do Trello: o ambiente nem tem o Trello). Uma faixa por praça, na
   ordem das praças da Configuração (aqui, as de fábrica); o Entregue só com os dos últimos 3 dias; as arquivadas fora;
   as sem card na faixa delas; a ordem pelo prazo e, no mesmo prazo, a ALTA primeiro. */
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
  type Faixa = { praca: string; nome: string; colunas: Record<'entrada' | 'produzindo' | 'entregue', Card[]> };
  type Tela = { entregueDias: number; faixas: Faixa[] };

  async function tela(db = abrirBanco(':memory:')) {
    const s = await comServidor({ db, registros: { ARTE_producao: linhas(), exibicoes: [] } });
    await s.app.releituraPronta;
    const r = await s.ana('/api/producoes/por-praca');
    return { ...s, r, corpo: (await r.json()) as Tela };
  }
  const claquetes = (cs: Card[]) => cs.map((c) => c.claquete);
  const daPraca = (t: Tela, sigla: string) => t.faixas.find((f) => f.praca === sigla)!;

  it('qualquer pessoa logada lê; uma faixa por praça, na ordem das praças, com as três colunas', async () => {
    const { r, corpo } = await tela();
    expect(r.status).toBe(200);
    expect(corpo.entregueDias).toBe(3);
    expect(corpo.faixas.map((f) => [f.praca, f.nome])).toEqual([
      ['G5', 'Rede (G5)'],
      ['RJ', 'Rio'],
      ['SP', 'São Paulo'],
      ['INTER', 'Internacional'],
    ]);
    // a praça sem nada também tem a faixa, com as colunas vazias
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

  it('as Produções sem card (a linha sem card, o filme) ficam na faixa da praça delas', async () => {
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
