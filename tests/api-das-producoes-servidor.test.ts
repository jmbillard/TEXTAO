// @vitest-environment node
/* A API das Produções (#185): GET /api/publico/producoes, só de leitura, fora do login, com o PRODUCOES_API_TOKEN no
   cabeçalho, para o dashboard de um produtor da arte. As Produções e os eventos entram direto no SQLite (o relógio do
   servidor fica parado na sexta, 27/11/2026, em São Paulo); nada vai ao Teable nem ao Trello. Claquetes, nomes, ids de
   card e e-mails inventados. */
import { createServer, request, type Server } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { PEDIDOS_POR_MINUTO, criarLimiteDePedidos, periodoDoPedido, temposDaLinhaDoTempo } from '../servidor/api-das-producoes.mjs';
// @ts-expect-error módulo JS sem tipos
import { FICAM_NO_PORTAINER } from '../servidor/configuracao-portainer.mjs';
import { chaveDeArte } from '../src/modelo/diferencas';

const TOKEN = 'token-da-api-das-producoes';
const CHEFE = 'chefe@empresa.com';
const CADASTROS = { TEABLE_URL: 'http://teable:3000', TEABLE_TOKEN: 'um-token-so', TEABLE_REDATORES: 'tblRed', TEABLE_KEY_REDATORES: 'tblKeyRed', TEABLE_EDITORES: 'tblEdi', TEABLE_KEY_EDITORES: 'tblKeyEdi', CADASTRO_ADMINS: CHEFE };
const teableFalso = () => async (url: string, init: RequestInit = {}) => {
  if ((init.method ?? 'GET') !== 'GET') throw new Error(`a API das Produções não escreve no Teable: ${init.method} ${url}`);
  return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
};
/** Sexta, 27/11/2026, 14h em São Paulo. */
const AGORA = new Date('2026-11-27T17:00:00.000Z');
const card = (n: number) => `c0ffee${String(n).padStart(18, '0')}`;

type Linha = Partial<Record<'id' | 'claquete' | 'praca' | 'etapa' | 'designers' | 'artes' | 'artes_marcadas' | 'entrada_em' | 'entrega_em' | 'exibicao_em' | 'card_id' | 'roteiro_id' | 'atracao' | 'fogo_das_artes', string | null>> & { arquivada?: number };
function producao(db: { prepare: (s: string) => { run: (...a: unknown[]) => void } }, l: Linha) {
  const c = { praca: 'SP', etapa: 'entrada', designers: '[]', artes: '[]', artes_marcadas: '[]', entrada_em: null, entrega_em: null, exibicao_em: null, card_id: null, roteiro_id: null, atracao: null, fogo_das_artes: '{}', arquivada: 0, ...l };
  db.prepare(
    `INSERT INTO producoes (id, claquete, praca, etapa, designers, artes, artes_marcadas, entrada_em, entrega_em, exibicao_em, card_id, roteiro_id, atracao, fogo_das_artes, arquivada, criada_em, atualizada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(c.id, c.claquete, c.praca, c.etapa, c.designers, c.artes, c.artes_marcadas, c.entrada_em, c.entrega_em, c.exibicao_em, c.card_id, c.roteiro_id, c.atracao, c.fogo_das_artes, c.arquivada, '2026-11-01T12:00:00.000Z', '2026-11-01T12:00:00.000Z');
}
let nEvento = 0;
function evento(db: { prepare: (s: string) => { run: (...a: unknown[]) => void } }, id: string, tipo: string, antes: string | null, depois: string | null, quando: string, quem: string | null = null) {
  db.prepare('INSERT INTO eventos (id, producao_id, tipo, antes, depois, quem_nome, quando, anotado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`ev${++nEvento}`, id, tipo, antes, depois, quem, quando, quando);
}

/** As Produções de mentira em volta da semana de 23 a 29/11/2026. */
function semear(db: ReturnType<typeof abrirBanco>) {
  db.prepare('INSERT INTO roteiros (id, dono_email, dono_nome, meta, doc, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'roteiro-show',
    'redatora@empresa.com',
    'Redatora',
    JSON.stringify({ claquete: 'Show da Noite 28/11 SP', programa: 'Show da Noite', letra: 'B', versao: 2, complexidade: { [chaveDeArte('HOJE')]: 3, [chaveDeArte('AMANHÃ')]: 2 } }),
    '{}',
    '2026-11-25T12:00:00.000Z',
    '2026-11-25T12:00:00.000Z',
  );
  // entrou e foi entregue na quinta: a Ana pegou às 10h02 e entregou às 15h20
  producao(db, { id: 'p-show', claquete: 'Show da Noite 28/11 SP', etapa: 'entregue', designers: '["Ana Souza"]', artes: '["HOJE","AMANHÃ","DOMINGO"]', artes_marcadas: '["HOJE","AMANHÃ"]', entrada_em: '2026-11-26T13:00:00.000Z', entrega_em: '2026-11-26T18:25:00.000Z', exibicao_em: '2026-11-28T03:00:00.000Z', card_id: card(1), roteiro_id: 'roteiro-show' });
  evento(db, 'p-show', 'criada', null, 'entrada', '2026-11-26T12:40:00.000Z');
  evento(db, 'p-show', 'designer-entrou', null, 'Ana Souza', '2026-11-26T13:02:00.000Z', 'Ana Souza');
  evento(db, 'p-show', 'etapa', 'entrada', 'produzindo', '2026-11-26T13:02:00.000Z', 'Ana Souza');
  evento(db, 'p-show', 'arte-marcada', null, 'HOJE', '2026-11-26T16:00:00.000Z', 'Ana Souza');
  evento(db, 'p-show', 'etapa', 'produzindo', 'entregue', '2026-11-26T18:20:00.000Z', 'Ana Souza');
  // entrou na semana passada e ainda está em produção: esteve em produção na semana
  producao(db, { id: 'p-festa', claquete: 'Festa na Praça 05/12', praca: 'G5', etapa: 'produzindo', designers: '["Caio Prates","Lia Moura"]', artes: '["VINHETA","ASSINATURA"]', entrada_em: '2026-11-20T12:00:00.000Z', card_id: card(2), atracao: 'Festa na Praça', fogo_das_artes: JSON.stringify({ [chaveDeArte('VINHETA')]: 2 }) });
  evento(db, 'p-festa', 'designer-entrou', null, 'Caio Prates', '2026-11-21T14:00:00.000Z', 'Caio Prates');
  // entregue na semana passada: fora da semana, dentro do período que pega o dia 20
  producao(db, { id: 'p-jogo', claquete: 'Jogo Final 20/11 SP', etapa: 'entregue', designers: '["Ana Souza"]', entrada_em: '2026-11-19T12:00:00.000Z', entrega_em: '2026-11-20T15:00:00.000Z' });
  // arquivada na semana: nunca
  producao(db, { id: 'p-arquivada', claquete: 'Novela Sinfonia 27/11 SP', etapa: 'produzindo', entrada_em: '2026-11-25T12:00:00.000Z', arquivada: 1 });
  // entra na semana que vem
  producao(db, { id: 'p-depois', claquete: 'Corrida 05/12 SP', entrada_em: '2026-11-30T12:00:00.000Z' });
  // na Entrada, sem card e sem eventos, que vai ao ar no domingo
  producao(db, { id: 'p-entrada', claquete: 'Mundo Animal 29/11 SP', entrada_em: '2026-11-27T10:00:00.000Z', exibicao_em: '2026-11-29' });
}

type Resposta = { periodo: { de: string; ate: string }; gerado_em: string; producoes: Record<string, unknown>[] };

describe('a API das Produções (#185)', () => {
  let servidor: Server | null = null;
  afterEach(() => void servidor?.close());

  const subir = async ({ env = { PRODUCOES_API_TOKEN: TOKEN } as Record<string, string>, relogio = () => AGORA } = {}) => {
    const db = abrirBanco(':memory:');
    const app = criarApp({ db, env, relogio, cadastros: criarCadastros(CADASTROS, { buscar: teableFalso() }) });
    semear(db);
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor!.listen(0, ok));
    const base = `http://localhost:${(servidor!.address() as { port: number }).port}`;
    const pedir = (consulta = '', token: string | null = TOKEN, headers: Record<string, string> = {}) => fetch(`${base}/api/publico/producoes${consulta}`, { headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...headers } });
    const ler = async (consulta = '') => {
      const r = await pedir(consulta);
      expect(r.status).toBe(200);
      return (await r.json()) as Resposta;
    };
    return { base, db, pedir, ler };
  };

  it('com o token certo responde; sem ele ou com o errado, 401; sem o PRODUCOES_API_TOKEN, a rota fica desligada (404)', async () => {
    const { pedir } = await subir();
    expect((await pedir()).status).toBe(200);
    expect((await pedir('', null)).status).toBe(401);
    expect((await pedir('', 'token-errado')).status).toBe(401);
    expect((await pedir('', `${TOKEN.slice(0, -1)}X`)).status).toBe(401);
    servidor!.close();
    const desligada = await subir({ env: {} });
    expect((await desligada.pedir()).status).toBe(404);
    expect((await desligada.pedir('', '')).status).toBe(404);
    servidor!.close();
    const soEspacos = await subir({ env: { PRODUCOES_API_TOKEN: '   ' } });
    expect((await soEspacos.pedir('', '   ')).status).toBe(404);
  });

  it('o caminho torto é 404 e não chega às rotas com login, nem com o token e o cabeçalho do Access', async () => {
    const { base } = await subir();
    const cru = (caminho: string, metodo = 'GET') =>
      new Promise<number>((ok, falhou) => {
        const r = request(base + '/', { path: caminho, method: metodo, headers: { authorization: `Bearer ${TOKEN}`, 'cf-access-authenticated-user-email': CHEFE } }, (resposta) => (resposta.resume(), ok(resposta.statusCode ?? 0)));
        r.on('error', falhou);
        r.end();
      });
    for (const caminho of ['/api/publico/producoes/%2e%2e/%2e%2e/eu', '/api/publico/%2e%2e/producoes/por-praca', '/api/publico//producoes', '/API/publico/producoes', '/api/publico/producoes/', '/api/publico/producoess', '/api/publico/producoes/%2e%2e/%2e%2e/roteiros'])
      expect(await cru(caminho), caminho).toBe(404);
    // só leitura: o POST no mesmo endereço também é 404
    expect(await cru('/api/publico/producoes', 'POST')).toBe(404);
  });

  it('sem datas, a semana atual (de segunda a domingo); até 31 dias por vez; as datas erradas dão 400', async () => {
    const { pedir, ler } = await subir();
    const semana = await ler();
    expect(semana.periodo).toEqual({ de: '2026-11-23', ate: '2026-11-29' });
    expect(semana.gerado_em).toBe('2026-11-27T14:00:00-03:00');
    expect((await ler('?de=2026-11-01&ate=2026-12-01')).periodo).toEqual({ de: '2026-11-01', ate: '2026-12-01' });
    for (const consulta of ['?de=2026-11-01&ate=2026-12-02', '?de=2026-02-30&ate=2026-03-02', '?de=ontem&ate=hoje', '?de=2026-11-27', '?ate=2026-11-27', '?de=2026-11-28&ate=2026-11-27', '?de=27/11/2026&ate=28/11/2026']) {
      const r = await pedir(consulta);
      expect(r.status, consulta).toBe(400);
      expect(((await r.json()) as { erro: string }).erro, consulta).toBeTruthy();
    }
  });

  it('as Produções do período, com os tempos da linha do tempo e sem as arquivadas', async () => {
    const { ler } = await subir();
    const { producoes } = await ler();
    // a da semana passada ainda em produção entra; a entregue antes, a arquivada e a da semana que vem, não
    expect(producoes.map((p) => p.id)).toEqual(['p-festa', 'p-show', 'p-entrada']);
    expect(producoes[1]).toEqual({
      id: 'p-show',
      claquete: 'Show da Noite 28/11 SP',
      letra_e_versao: 'B V2',
      atracao: 'Show da Noite',
      praca: 'SP',
      etapa: 'entregue',
      // o card entrou antes da data de entrada da produção da arte: vale a linha do tempo
      entrou_em: '2026-11-26T09:40:00-03:00',
      pegou_em: '2026-11-26T10:02:00-03:00',
      // a entrega é a da linha do tempo, não a coluna
      entregue_em: '2026-11-26T15:20:00-03:00',
      ao_ar: '2026-11-28',
      designers: ['Ana Souza'],
      artes: { total: 3, feitas: 2, fogo: { baixa: 1, media: 1, alta: 1 } },
      tempo_em_producao_min: 318,
      trello: `https://trello.com/c/${card(1)}`,
    });
    expect(producoes[0]).toMatchObject({
      id: 'p-festa',
      letra_e_versao: null,
      atracao: 'Festa na Praça',
      praca: 'G5',
      etapa: 'produzindo',
      entrou_em: '2026-11-20T09:00:00-03:00',
      pegou_em: '2026-11-21T11:00:00-03:00',
      entregue_em: null,
      designers: ['Caio Prates', 'Lia Moura'],
      // o fogo guardado na Produção sem Roteiro (#174)
      artes: { total: 2, feitas: 0, fogo: { baixa: 1, media: 1, alta: 0 } },
      tempo_em_producao_min: null,
    });
    expect(producoes[2]).toMatchObject({ id: 'p-entrada', etapa: 'entrada', entrou_em: '2026-11-27T07:00:00-03:00', pegou_em: null, entregue_em: null, ao_ar: '2026-11-29', trello: null, tempo_em_producao_min: null, artes: { total: 0, feitas: 0, fogo: { baixa: 0, media: 0, alta: 0 } } });
    // sem o #178, nada de campanhas
    expect(producoes.every((p) => !('campanhas' in p))).toBe(true);
    // a entregue na semana passada aparece no período que pega o dia dela
    expect((await ler('?de=2026-11-20&ate=2026-11-20')).producoes.map((p) => p.id)).toEqual(['p-jogo', 'p-festa']);
  });

  it('responde em gzip para quem aceita', async () => {
    const { base } = await subir();
    const { cabecalhos, corpo } = await new Promise<{ cabecalhos: Record<string, unknown>; corpo: Buffer }>((ok, falhou) => {
      const r = request(`${base}/api/publico/producoes`, { headers: { authorization: `Bearer ${TOKEN}`, 'accept-encoding': 'gzip' } }, (resposta) => {
        const partes: Buffer[] = [];
        resposta.on('data', (p) => partes.push(p));
        resposta.on('end', () => ok({ cabecalhos: resposta.headers, corpo: Buffer.concat(partes) }));
      });
      r.on('error', falhou);
      r.end();
    });
    expect(cabecalhos['content-encoding']).toBe('gzip');
    expect((JSON.parse(gunzipSync(corpo).toString('utf8')) as Resposta).producoes).toHaveLength(3);
  });

  it(`passados ${PEDIDOS_POR_MINUTO} pedidos no minuto, 429 até o minuto virar`, async () => {
    let agora = AGORA;
    const { pedir } = await subir({ relogio: () => agora });
    for (let i = 0; i < PEDIDOS_POR_MINUTO; i++) expect((await pedir()).status).toBe(200);
    const r = await pedir();
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBe(60);
    // o token errado não gasta o limite (e continua 401)
    expect((await pedir('', 'token-errado')).status).toBe(401);
    agora = new Date(AGORA.getTime() + 60_000);
    expect((await pedir()).status).toBe(200);
  });

  it('o PRODUCOES_API_TOKEN é um segredo da Configuração (fica no Portainer)', () => {
    expect(FICAM_NO_PORTAINER.has('PRODUCOES_API_TOKEN')).toBe(true);
  });
});

describe('as regras da API das Produções', () => {
  it('a semana atual vai de segunda a domingo, também no domingo', () => {
    expect(periodoDoPedido(new URLSearchParams(), '2026-11-29')).toMatchObject({ de: '2026-11-23', ate: '2026-11-29', inicio: '2026-11-23T03:00:00.000Z', fim: '2026-11-30T03:00:00.000Z' });
  });

  it('o pegou é o primeiro designer ou a primeira ida para Produzindo; a entrega só vale na Entregue', () => {
    const eventos = [
      { tipo: 'etapa', antes: 'entrada', depois: 'produzindo', quando: '2026-11-26T12:00:00.000Z' },
      { tipo: 'designer-entrou', antes: null, depois: 'Ana Souza', quando: '2026-11-26T12:30:00.000Z' },
      { tipo: 'etapa', antes: 'produzindo', depois: 'entregue', quando: '2026-11-26T14:00:00.000Z' },
      { tipo: 'etapa', antes: 'entregue', depois: 'produzindo', quando: '2026-11-26T15:00:00.000Z' },
    ];
    expect(temposDaLinhaDoTempo({ etapa: 'produzindo', entradaEm: '2026-11-26T11:00:00.000Z', entregaEm: '2026-11-26T14:00:00.000Z', criadaEm: null }, eventos)).toEqual({ entrouEm: '2026-11-26T11:00:00.000Z', pegouEm: '2026-11-26T12:00:00.000Z', entregueEm: null });
  });

  it('o limite conta por minuto do relógio', () => {
    let t = new Date('2026-11-27T17:00:30.000Z');
    const limite = criarLimiteDePedidos({ porMinuto: 2, agora: () => t });
    expect([limite.conta().vale, limite.conta().vale, limite.conta()]).toEqual([true, true, { vale: false, espera: 30 }]);
    t = new Date('2026-11-27T17:01:00.000Z');
    expect(limite.conta().vale).toBe(true);
  });
});
