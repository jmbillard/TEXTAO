// @vitest-environment node
/* Montar a pauta: ilhas e turnos (#124). As ilhas são um cadastro novo, no SQLite do PROMeiro (e por isso no backup):
   tipo, número e nome opcional; todos leem, a coordenação e os administradores cadastram e mudam, só administradores
   removem. Os turnos são dado da Configuração, como as praças: sem nada salvo, os de fábrica; salvos, valem na hora na
   montagem. Na posição, a ilha sai da lista; a de costume do editor vem do histórico das posições, e o servidor diz
   quando a ilha já está ocupada naquele turno. Nada vai ao Teable. Nomes, e-mails e ilhas inventados. */
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp, fazerBackup } from '../servidor/app.mjs';

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_REDATORES: 'tblRed',
  TEABLE_KEY_REDATORES: 'tblKeyRed',
  TEABLE_EDITORES: 'tblEdi',
  TEABLE_KEY_EDITORES: 'tblKeyEdi',
  CADASTRO_ADMINS: 'chefe@empresa.com',
};

/** O Teable de mentira: só a leitura dos cadastros de editores e redatores. */
function falso() {
  const tabelas: Record<string, { id: string; fields: Record<string, unknown> }[]> = {
    tblRed: [],
    tblEdi: [
      { id: 'recE1', fields: { editor: 'Rui Teixeira' } },
      { id: 'recE2', fields: { editor: 'Elis Furtado', email: 'elis.furtado@empresa.com' } },
      { id: 'recE3', fields: { editor: 'Gil Moura' } },
    ],
    tblKeyRed: [],
    tblKeyEdi: [],
  };
  const pedidos: string[] = [];
  const buscar = async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    pedidos.push(`${metodo} ${url}`);
    if (metodo !== 'GET') throw new Error(`ilhas e turnos não escrevem no Teable: ${metodo} ${url}`);
    const [, tabela] = /\/api\/table\/(\w+)\/record/.exec(new URL(url).pathname)!;
    return { ok: true, status: 200, json: async () => ({ records: tabelas[tabela] }), text: async () => '' };
  };
  return { pedidos, buscar };
}

interface Ilha {
  id: string;
  tipo: string;
  numero: string;
  nome: string;
}
interface Turno {
  id: string;
  nome: string;
  horario: string;
}

const SEXTA = '2026-11-27';

describe('montar a pauta: ilhas e turnos (#124)', () => {
  let servidor: Server;
  let base = '';
  let db: unknown;
  let teable: ReturnType<typeof falso>;
  const como = (email: string) => (caminho: string, init: RequestInit = {}) =>
    fetch(base + caminho, { ...init, headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json', ...init.headers } });
  const chefe = como('chefe@empresa.com');
  const bia = como('bia.coord@empresa.com');
  const elis = como('elis.furtado@empresa.com');
  const subir = async (banco: unknown) => {
    teable = falso();
    const app = criarApp({ db: banco, env: {}, cadastros: criarCadastros(ENV, { buscar: teable.buscar }) });
    servidor = createServer(app);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  };
  const cadastrar = (quem: ReturnType<typeof como>, ilha: object) => quem('/api/cadastros/ilhas', { method: 'POST', body: JSON.stringify(ilha) });
  const ilhas = async (): Promise<Ilha[]> => (await (await bia('/api/cadastros/ilhas')).json()).ilhas;
  const ler = async (dia = SEXTA) => (await bia(`/api/montar-pauta?dia=${dia}`)).json();
  const gravar = (posicoes: unknown, dia = SEXTA) => bia(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes }) });
  const posicao = (id: string, turno: string, editor: string, ilha: string, horario = '') => ({ id, turno, editor, ilha, horario, demandas: [] });
  const daIlha = async (rotulo: string) => (await ilhas()).find((i) => `${i.tipo} ${i.numero}` === rotulo)!.id;

  beforeAll(async () => {
    db = abrirBanco(':memory:');
    await subir(db);
    expect((await chefe('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email: 'bia.coord@empresa.com' }) })).status).toBe(200);
  });
  afterAll(() => servidor.close());

  describe('o cadastro das ilhas', () => {
    it('começa vazio; todos leem, e quem não é da coordenação nem administrador não cadastra', async () => {
      const r = await elis('/api/cadastros/ilhas');
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ilhas: [], podeCadastrar: false, podeRemover: false, usos: {} });
      const recusa = await cadastrar(elis, { tipo: 'AVID', numero: '46' });
      expect(recusa.status).toBe(403);
      expect((await recusa.json()).erro).toBe('Só a coordenação e os administradores cadastram ilhas.');
      expect(await (await bia('/api/cadastros/ilhas')).json()).toMatchObject({ podeCadastrar: true, podeRemover: false });
      expect(await (await chefe('/api/cadastros/ilhas')).json()).toMatchObject({ podeCadastrar: true, podeRemover: true });
    });

    it('tipo, número e nome opcional, no padrão: o tipo em maiúsculas, sem os espaços das pontas', async () => {
      const r = await cadastrar(bia, { tipo: ' avid ', numero: ' 46 ' });
      expect(r.status).toBe(201);
      expect((await r.json()).ilha).toMatchObject({ tipo: 'AVID', numero: '46', nome: '' });
      expect((await cadastrar(chefe, { tipo: 'VDI', numero: '7', nome: 'Sala da esquina' })).status).toBe(201);
      expect((await ilhas()).map(({ tipo, numero, nome }) => ({ tipo, numero, nome }))).toEqual([
        { tipo: 'AVID', numero: '46', nome: '' },
        { tipo: 'VDI', numero: '7', nome: 'Sala da esquina' },
      ]);
    });

    it('AVID 46, ILHA 46 e AVID 046 são a mesma sala: a repetida é recusada (#165)', async () => {
      const ilha = await cadastrar(bia, { tipo: 'ILHA', numero: '46' });
      expect(ilha.status).toBe(409);
      expect((await ilha.json()).erro).toBe('Já existe a AVID 46: ILHA 46 é a mesma sala.');
      expect((await cadastrar(bia, { tipo: 'AVID', numero: '046' })).status).toBe(409);
      // outro número é outra sala
      expect((await cadastrar(bia, { tipo: 'ILHA', numero: '12' })).status).toBe(201);
      expect((await ilhas()).map((i) => `${i.tipo} ${i.numero}`)).toEqual(['AVID 46', 'ILHA 12', 'VDI 7']);
    });

    it('a mesma ilha duas vezes, ou sem tipo ou número, é recusada', async () => {
      const dobro = await cadastrar(bia, { tipo: 'Avid', numero: '46' });
      expect(dobro.status).toBe(409);
      expect((await dobro.json()).erro).toBe('Já existe a AVID 46.');
      expect((await cadastrar(bia, { tipo: '', numero: '3' })).status).toBe(400);
      expect((await cadastrar(bia, { tipo: 'AVID', numero: '' })).status).toBe(400);
      expect((await cadastrar(bia, { tipo: 'AVID', numero: 'quarenta e seis' })).status).toBe(400);
      expect(await ilhas()).toHaveLength(3);
    });

    it('a coordenação muda o nome; só administradores removem', async () => {
      const id = await daIlha('ILHA 12');
      const r = await bia(`/api/cadastros/ilhas/${id}`, { method: 'PUT', body: JSON.stringify({ tipo: 'ILHA', numero: '12', nome: 'Ilha do fundo' }) });
      expect(r.status).toBe(200);
      expect((await r.json()).ilha).toMatchObject({ id, nome: 'Ilha do fundo' });
      // mudar para uma que já existe é recusado
      expect((await bia(`/api/cadastros/ilhas/${id}`, { method: 'PUT', body: JSON.stringify({ tipo: 'AVID', numero: '46' }) })).status).toBe(409);
      // e para a mesma sala de outra também (#165)
      expect((await bia(`/api/cadastros/ilhas/${id}`, { method: 'PUT', body: JSON.stringify({ tipo: 'ILHA', numero: '46' }) })).status).toBe(409);
      const recusa = await bia(`/api/cadastros/ilhas/${id}`, { method: 'DELETE' });
      expect(recusa.status).toBe(403);
      expect((await recusa.json()).erro).toBe('Só administradores removem ilhas.');
      expect((await chefe(`/api/cadastros/ilhas/${id}`, { method: 'DELETE' })).status).toBe(200);
      expect((await ilhas()).map((i) => `${i.tipo} ${i.numero}`)).toEqual(['AVID 46', 'VDI 7']);
      expect((await chefe('/api/cadastros/ilhas/nao-existe', { method: 'DELETE' })).status).toBe(404);
    });
  });

  describe('os turnos, dado da Configuração', () => {
    it('sem nada salvo, a montagem e a Configuração mostram os de fábrica', async () => {
      const d = await ler();
      expect(d.turnos).toEqual([
        { id: 'madrugada', nome: 'Madrugada', horario: '22h às 6h' },
        { id: 'manha', nome: 'Manhã', horario: '6h às 15h' },
        { id: 'tarde', nome: 'Tarde', horario: '14h às 23h' },
        { id: 'noite', nome: 'Noite', horario: '20h às 2h' },
      ]);
      const cfg = await (await chefe('/api/configuracao')).json();
      expect(cfg.turnos).toEqual({ salvo: d.turnos, deFabrica: true });
    });

    it('a conferência recusa o nome vazio, o repetido e o horário que não é horário', async () => {
      const r = await chefe('/api/configuracao/conferir', {
        method: 'POST',
        body: JSON.stringify({ turnos: [{ id: 'manha', nome: 'Manhã', horario: '6 as 15' }, { id: '', nome: 'manha', horario: '7 as 16' }, { id: '', nome: ' ', horario: '8 as 17' }, { id: '', nome: 'Plantão', horario: 'cedo' }] }),
      });
      expect(r.status).toBe(200);
      const c = await r.json();
      expect(c.ok).toBe(false);
      expect(c.itens.filter((i: { tipo: string }) => i.tipo === 'erro').map((i: { detalhe: string }) => i.detalhe)).toEqual([
        'dois turnos chamados "Manhã".',
        'um turno está sem nome.',
        'o horário do turno Plantão não é um horário ("cedo").',
      ]);
      expect((await chefe('/api/configuracao/salvar', { method: 'POST', body: JSON.stringify({ turnos: [{ id: '', nome: '', horario: '' }] }) })).status).toBe(422);
      expect((await ler()).turnos).toHaveLength(4);
    });

    it('salvos, valem na hora na montagem: o horário no padrão, o turno novo, a ordem e o que saiu', async () => {
      const novos = [
        { id: 'madrugada', nome: 'Madrugada', horario: '22h às 6h' },
        { id: 'manha', nome: 'Manhã', horario: '7 AS 16' },
        { id: '', nome: 'Plantão', horario: '10 às 19' },
        { id: 'tarde', nome: 'Tarde', horario: '14h às 23h' },
      ];
      const conferida = await (await chefe('/api/configuracao/conferir', { method: 'POST', body: JSON.stringify({ turnos: novos }) })).json();
      expect(conferida.ok).toBe(true);
      expect(conferida.muda).toEqual([
        { oque: 'Manhã', antes: '6h às 15h', depois: '7h às 16h' },
        { oque: 'Plantão', antes: '—', depois: '10h às 19h' },
        { oque: 'Noite', antes: '20h às 2h', depois: '—' },
      ]);
      const r = await chefe('/api/configuracao/salvar', { method: 'POST', body: JSON.stringify({ turnos: novos }) });
      expect(r.status).toBe(200);
      expect((await r.json()).turnos.deFabrica).toBe(false);
      expect((await ler()).turnos).toEqual([
        { id: 'madrugada', nome: 'Madrugada', horario: '22h às 6h' },
        { id: 'manha', nome: 'Manhã', horario: '7h às 16h' },
        { id: 'plantao', nome: 'Plantão', horario: '10h às 19h' },
        { id: 'tarde', nome: 'Tarde', horario: '14h às 23h' },
      ]);
      // o histórico da Configuração diz o que mudou, pelos nomes
      const hist = await (await chefe('/api/configuracao/historico')).json();
      expect(hist.entradas[0].linhas).toEqual([
        { oque: 'Turnos da edição · Manhã', antes: '6h às 15h', depois: '7h às 16h' },
        { oque: 'Turnos da edição · Plantão', antes: '—', depois: '10h às 19h' },
        { oque: 'Turnos da edição · Noite', antes: '20h às 2h', depois: '—' },
      ]);
    });

    it('os turnos da arte (#175): os de fábrica, conferidos e salvos à parte, com histórico, sem mexer nos da edição', async () => {
      const cfg = await (await chefe('/api/configuracao')).json();
      expect(cfg.turnosDaArte).toEqual({
        salvo: [
          { id: 'manha', nome: 'Manhã', horario: '7h às 16h' },
          { id: 'noite', nome: 'Noite', horario: '16h às 0h30' },
        ],
        deFabrica: true,
      });
      const daEdicao = (await ler()).turnos;
      expect((await chefe('/api/configuracao/salvar', { method: 'POST', body: JSON.stringify({ turnosDaArte: 'manhã' }) })).status).toBe(400);
      const ruim = await (await chefe('/api/configuracao/conferir', { method: 'POST', body: JSON.stringify({ turnosDaArte: [{ id: '', nome: 'Tarde', horario: 'cedo' }] }) })).json();
      expect(ruim.ok).toBe(false);
      expect(ruim.itens[0]).toMatchObject({ tipo: 'erro', titulo: 'Turnos da arte' });
      const novos = [
        { id: 'manha', nome: 'Manhã', horario: '7 as 16' },
        { id: '', nome: 'Tarde', horario: '12 às 21' },
        { id: 'noite', nome: 'Noite', horario: '16h às 0h30' },
      ];
      const r = await chefe('/api/configuracao/salvar', { method: 'POST', body: JSON.stringify({ turnosDaArte: novos }) });
      expect(r.status).toBe(200);
      const salva = await r.json();
      expect(salva.turnosDaArte).toEqual({
        salvo: [
          { id: 'manha', nome: 'Manhã', horario: '7h às 16h' },
          { id: 'tarde', nome: 'Tarde', horario: '12h às 21h' },
          { id: 'noite', nome: 'Noite', horario: '16h às 0h30' },
        ],
        deFabrica: false,
      });
      // os da edição e a montagem continuam como estavam
      expect(salva.turnos.salvo).toEqual(daEdicao);
      expect((await ler()).turnos).toEqual(daEdicao);
      const hist = await (await chefe('/api/configuracao/historico')).json();
      expect(hist.entradas[0].linhas).toEqual([{ oque: 'Turnos da arte · Tarde', antes: '—', depois: '12h às 21h' }]);
      expect(hist.entradas[0].voltar).toEqual({ pode: true });
    });

    it('a posição tem o seu horário; o turno desconhecido é recusado; o que saiu da Configuração continua no dia', async () => {
      expect((await gravar([posicao('t-1', 'plantao', 'Gil Moura', '', '10 as 18:30')], '2026-11-30')).status).toBe(200);
      expect((await ler('2026-11-30')).posicoes[0]).toMatchObject({ turno: 'plantao', horario: '10h às 18h30' });
      expect((await gravar([posicao('t-2', 'almoço', 'Gil Moura', '')], '2026-11-30')).status).toBe(400);
      // a Noite saiu da Configuração, mas o dia que já tinha uma posição nela continua com ela (e com o bloco)
      const sql = (comando: string) => (db as { prepare: (s: string) => { run: () => void } }).prepare(comando).run();
      sql("INSERT INTO escala_dias (dia, estado, gravado_por, gravado_em) VALUES ('2026-11-10', 'rascunho', 'bia.coord@empresa.com', '2026-11-09T12:00:00Z')");
      sql("INSERT INTO escala_posicoes (id, dia, ordem, turno, editor, horario) VALUES ('t-velha', '2026-11-10', 0, 'noite', 'Rui Teixeira', '20h às 2h')");
      const velho = await ler('2026-11-10');
      expect(velho.turnos.map((t: Turno) => t.id)).toEqual(['madrugada', 'manha', 'plantao', 'tarde', 'noite']);
      expect(velho.turnos.at(-1)).toEqual({ id: 'noite', nome: 'Noite', horario: '' });
      expect(velho.posicoes[0]).toMatchObject({ id: 't-velha', ilha: '' });
      expect((await gravar(velho.posicoes, '2026-11-10')).status).toBe(200);
    });
  });

  describe('a ilha na posição', () => {
    it('sai da lista: a montagem traz as ilhas, e a que não é do cadastro é recusada', async () => {
      const d = await ler();
      expect(d.ilhas.map((i: Ilha) => `${i.tipo} ${i.numero}`)).toEqual(['AVID 46', 'VDI 7']);
      const r = await gravar([posicao('p-1', 'tarde', 'Rui Teixeira', 'nao-existe')]);
      expect(r.status).toBe(400);
      expect((await r.json()).erro).toBe('Ilha desconhecida.');
      const avid = await daIlha('AVID 46');
      expect((await gravar([posicao('p-1', 'tarde', 'Rui Teixeira', avid)])).status).toBe(200);
      expect((await ler()).posicoes[0]).toMatchObject({ id: 'p-1', ilha: avid });
    });

    it('a de costume do editor vem do histórico: a que mais se repete antes do dia', async () => {
      const avid = await daIlha('AVID 46');
      const vdi = await daIlha('VDI 7');
      await gravar([posicao('h-1', 'manha', 'Rui Teixeira', avid), posicao('h-2', 'tarde', 'Elis Furtado', vdi)], '2026-11-20');
      await gravar([posicao('h-3', 'manha', 'Rui Teixeira', vdi)], '2026-11-19');
      await gravar([posicao('h-4', 'manha', 'rui teixeira', avid), posicao('h-5', 'tarde', 'Gil Moura', '')], '2026-11-13');
      // depois do dia não conta: a sugestão é do que já passou
      await gravar([posicao('h-6', 'manha', 'Elis Furtado', avid), posicao('h-7', 'tarde', 'Gil Moura', avid)], '2026-12-04');
      const d = await ler();
      expect(d.costume).toEqual({ 'RUI TEIXEIRA': avid, 'ELIS FURTADO': vdi });
    });

    it('a ilha ocupada naquele turno: o servidor diz quais posições dividem a ilha', async () => {
      const avid = await daIlha('AVID 46');
      const vdi = await daIlha('VDI 7');
      await gravar([
        posicao('p-1', 'tarde', 'Rui Teixeira', avid),
        posicao('p-2', 'tarde', 'Gil Moura', avid),
        posicao('p-3', 'madrugada', 'Elis Furtado', avid),
        posicao('p-4', 'tarde', 'Elis Furtado', vdi),
      ]);
      const d = await ler();
      expect(d.ocupadas).toEqual([
        { posicao: 'p-1', ilha: avid, com: ['p-2'] },
        { posicao: 'p-2', ilha: avid, com: ['p-1'] },
      ]);
    });

    it('a ilha removida do cadastro continua na posição que já tinha', async () => {
      const vdi = await daIlha('VDI 7');
      expect((await chefe(`/api/cadastros/ilhas/${vdi}`, { method: 'DELETE' })).status).toBe(200);
      const d = await ler();
      expect(d.posicoes.find((p: { id: string }) => p.id === 'p-4').ilha).toBe(vdi);
      expect((await gravar(d.posicoes)).status).toBe(200);
      // numa posição nova, não
      expect((await gravar([...d.posicoes, posicao('p-5', 'manha', 'Gil Moura', vdi)])).status).toBe(400);
    });

    it('as ilhas e as posições ficam no SQLite: valem depois de reiniciar e entram no backup', async () => {
      servidor.close();
      await subir(db);
      expect((await ilhas()).map((i) => `${i.tipo} ${i.numero}`)).toEqual(['AVID 46']);
      const pasta = mkdtempSync(join(tmpdir(), 'promeiro-backup-'));
      try {
        const copia = abrirBanco(fazerBackup(db, pasta));
        const app = criarApp({ db: copia, env: {}, cadastros: criarCadastros(ENV, { buscar: falso().buscar }) });
        const s = createServer(app);
        await new Promise<void>((ok) => s.listen(0, ok));
        const porta = (s.address() as { port: number }).port;
        const h = { 'cf-access-authenticated-user-email': 'bia.coord@empresa.com' };
        expect((await (await fetch(`http://localhost:${porta}/api/cadastros/ilhas`, { headers: h })).json()).ilhas).toHaveLength(1);
        const d = await (await fetch(`http://localhost:${porta}/api/montar-pauta?dia=${SEXTA}`, { headers: h })).json();
        expect(d.posicoes.map((p: { ilha: string }) => p.ilha).filter(Boolean)).toHaveLength(4);
        expect(d.turnos.map((t: Turno) => t.id)).toEqual(['madrugada', 'manha', 'plantao', 'tarde']);
        s.close();
      } finally {
        rmSync(pasta, { recursive: true, force: true });
      }
      // nada foi ao Teable além da leitura dos cadastros
      expect(teable.pedidos.every((p) => p.startsWith('GET '))).toBe(true);
    });
  });
});
