// @vitest-environment node
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarTrello } from '../servidor/trello.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarFilmes } from '../servidor/filmes.mjs';
// @ts-expect-error módulo JS sem tipos
import { criarCadastros } from '../servidor/cadastros.mjs';
// @ts-expect-error módulo JS sem tipos
import { teableFalso } from './fixtures/teable-falso.mjs';
import type { EstadoDosFilmes, LigacoesDosFilmes } from '../src/modelo/ligarOsFilmes';

/* A seção Filmes da Configuração (#75) pela API, com o Trello, o Teable, o Postgres e a leitura do n8n de mentira: as
   listas, as etiquetas, as sessões e os filmes são fictícios. Salvar passa pela conferência e vale na hora: o próximo
   card de filme que a aba Filmes cria já vai para a lista nova, com a praça e as etiquetas novas. */

const CHEFE = 'chefe@empresa.com';
const ANA = 'ana@empresa.com';
const LISTAS = [
  { id: 'lSP', name: 'SP ENTRADA', closed: false },
  { id: 'lFilmes', name: 'CARDS DE FILME', closed: false },
  { id: 'lFilmesNova', name: 'ESTREIAS', closed: false },
  { id: 'lFilmesVelha', name: 'FILMES 2024', closed: true },
];
const ETIQUETAS = [
  { id: 'eFilme', name: 'FILME', color: 'purple' },
  { id: 'eSuper', name: 'SUPERCINE', color: 'blue' },
  { id: 'eTQ', name: 'Tela Quente', color: 'red' },
  { id: 'eTQ2', name: 'TELA QUENTE', color: 'orange' },
];
const CAMPOS = [{ id: 'cPraca', name: 'Praça', type: 'list', options: [['oG5', 'G5'], ['oSP', 'SP']].map(([id, text]) => ({ id, value: { text } })) }];
/** As sessões do cadastro de atrações: as de acervo do filme (o Domingo Maior não tem etiqueta no quadro). */
const ATRACOES = [
  { id: 'recSuper', nome: 'Supercine', acervo: 'filme' },
  { id: 'recTQ', nome: 'Tela Quente', acervo: 'filme' },
  { id: 'recDM', nome: 'Domingo Maior', acervo: 'filme' },
  { id: 'recBBB', nome: 'Big Brother', acervo: 'proprio' },
];
/** O Portainer de hoje: o card de filme vai para a lista dos filmes, com a opção G5 e a etiqueta FILME. */
const PORTAINER = {
  CADASTRO_ADMINS: CHEFE,
  ACESSO: 'privado',
  TRELLO_KEY: 'k',
  TRELLO_TOKEN: 't',
  TRELLO_LISTA_SP: 'lSP',
  TRELLO_CAMPO_PRACA: 'cPraca',
  TRELLO_PRACAS: 'G5=oG5,SP=oSP',
  TRELLO_LISTA_FILMES: 'lFilmes',
  TRELLO_FILMES_ETIQUETAS: 'eFilme',
  TRELLO_FILMES_ETIQUETAS_SESSAO: 'SUPERCINE=eSuper',
  TRELLO_FILMES_PRACA: 'oG5',
  N8N_FILMES_LER: 'http://n8n:5678/webhook/ler-pagina',
  FILMES_INTERVALO_MS: '0',
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'um-token-so',
  TEABLE_FILMES: 'tblFilmes',
  TEABLE_FILMES_POSTER: 'fldPoster',
  TEABLE_EXIBICOES: 'tblExibicoes',
  TEABLE_PG_URL: 'postgres://teste',
  TEABLE_PG_ESQUEMA: 'bse_teste',
};
/** O Teable da descoberta (#76): as tabelas na base, com o nome no Postgres e os ids da API de sempre. */
const TABELAS = { filmes: 'filmes_teste', exibicoes: 'exibicoes_teste', ARTES_acervo: 'acervo_teste', atracoes: 'atracoes_teste' };
const teable = () => teableFalso(TABELAS, { base: 'bse_teste', url: 'http://teable:3000', ids: { filmes: 'tblFilmes', exibicoes: 'tblExibicoes' } });

/** O Trello e o Teable falsos (um fetch só), e a leitura do n8n: guardam os cards criados e os campos de cada um. */
function falsos() {
  const cards: { idList: string; name: string; idLabels?: string }[] = [];
  const campos: Record<string, string> = {};
  const escritasNoTrello: string[] = [];
  const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados, text: async () => JSON.stringify(dados) });
  const buscar = async (endereco: string, init: RequestInit = {}) => {
    const url = new URL(endereco);
    const metodo = init.method ?? 'GET';
    if (url.host === 'n8n:5678') {
      const pagina = Number((init.body as FormData).get('original_page_number'));
      const titulo = pagina === 2 ? 'RIVAIS' : 'O RETORNO';
      return ok({ movies: [{ titulo, sessao: 'TELA QUENTE', data: '07/12/2026', inedito: false, ano_de_producao: pagina === 2 ? 2020 : 2021 }] });
    }
    if (url.host === 'teable:3000') return ok({ records: [{ id: 'recQualquer' }] });
    const rota = url.pathname.replace(/^\/1/, '');
    if (metodo === 'GET' && /^\/lists\/\w+$/.test(rota)) return ok({ id: rota.split('/')[2], idBoard: 'quadroFalso' });
    if (metodo === 'GET' && rota === '/boards/quadroFalso/lists') return ok(LISTAS);
    if (metodo === 'GET' && rota === '/boards/quadroFalso/customFields') return ok(CAMPOS);
    if (metodo === 'GET' && rota === '/boards/quadroFalso/labels') return ok(ETIQUETAS);
    if (metodo !== 'GET') escritasNoTrello.push(`${metodo} ${rota}`);
    if (rota === '/cards' && metodo === 'POST') {
      cards.push(JSON.parse(String(init.body)));
      return ok({ id: `card${cards.length}`, shortUrl: `https://trello.com/c/FALSO${cards.length}` });
    }
    const item = rota.match(/^\/cards\/(\w+)\/customField\/(\w+)\/item$/);
    if (metodo === 'PUT' && item) campos[`${item[1]}.${item[2]}`] = String(JSON.parse(String(init.body)).idValue ?? '');
    if (metodo === 'GET') return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    return ok({ id: 'x' });
  };
  // o Postgres do Teable: os dois filmes do cadastro, nenhuma exibição, as sessões de filme
  const consultar = async (sql: string) => {
    if (sql.includes('"filmes_teste"')) return [{ __id: 'recRivais', titulo: 'Rivais', ano_de_producao: 2020 }, { __id: 'recRetorno', titulo: 'O Retorno', ano_de_producao: 2021 }];
    if (sql.includes('"atracoes_teste"')) return ATRACOES.filter((a) => a.acervo === 'filme').map((a) => ({ __id: a.id, atracao: a.nome }));
    return [];
  };
  return { buscar, consultar, cards, campos, escritasNoTrello };
}

let fechar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await fechar?.();
  fechar = null;
});

async function comServidor(env: Record<string, string> = PORTAINER) {
  const f = falsos();
  const db = abrirBanco(':memory:');
  const pasta = mkdtempSync(join(tmpdir(), 'cfg-filmes-'));
  const app = criarApp({
    db,
    env,
    buscarNoTeable: teable(),
    trello: (e: Record<string, string>) => criarTrello(e, { buscar: f.buscar, consultar: f.consultar }),
    filmes: (e: Record<string, string>, { trello }: { trello: unknown }) => criarFilmes(e, { db, pasta, buscar: f.buscar, consultar: f.consultar, trello }),
    // o cadastro de atrações do Teable, de mentira: só a leitura
    cadastros: (e: Record<string, string>, deps: object) => ({ ...criarCadastros(e, deps), ler: async () => ({ ligado: true, atracoes: ATRACOES }) }),
  });
  await app.tabelasProntas;
  const servidor = createServer(app);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  fechar = async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await app.fechar();
  };
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, corpo?: unknown, metodo?: string) =>
    fetch(base + caminho, {
      method: metodo ?? (corpo === undefined ? 'GET' : 'POST'),
      headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  const chefe = como(CHEFE);
  /** Uma prévia de uma página (a página n traz um filme da Tela Quente), lida e enviada; devolve o card criado. */
  const enviarFilme = async (n: number) => {
    const b64 = (s: string) => Buffer.from(s).toString('base64');
    const { id } = await (await chefe('/api/filmes/previas', { nome: `P${n}.pdf`, hash: `previa${n}`, paginas: [n] })).json();
    const pagina = { pdf: b64('%PDF'), imagem: b64('jpg'), tamanho: { width: 1000, height: 600 }, posteres: [{ dados: b64('jpg-poster'), caixa: { x: 100, y: 100, width: 100, height: 150 } }], textos: [], vagas: [] };
    await chefe(`/api/filmes/previas/${id}/paginas/${n}`, pagina, 'PUT');
    const filmes = async () => ((await (await chefe(`/api/filmes/previas/${id}`)).json()).paginas[0].filmes ?? []) as { envio?: { estado: string; erro?: string }; conferencia?: { marca: string } }[];
    for (let i = 0; i < 200 && !(await filmes())[0]?.conferencia; i++) await new Promise((r) => setTimeout(r, 10));
    expect((await chefe(`/api/filmes/previas/${id}/enviar`, {})).status).toBe(200);
    for (let i = 0; i < 200 && (await filmes())[0]?.envio?.estado === 'enviando'; i++) await new Promise((r) => setTimeout(r, 10));
    expect((await filmes())[0].envio).toMatchObject({ estado: 'enviado' });
    return f.cards.at(-1)!;
  };
  return { app, f, chefe, ana: como(ANA), enviarFilme };
}

interface SecaoFilmes {
  primeiraVez: boolean;
  salvo: LigacoesDosFilmes;
  proposta: LigacoesDosFilmes;
  estado: EstadoDosFilmes;
}
interface Conferencia {
  ok: boolean;
  itens: { tipo: string; titulo: string; detalhe: string }[];
  muda: { oque: string; antes: string; depois: string }[];
}
const lerFilmes = async (pedir: (caminho: string) => Promise<Response>) => ((await (await pedir('/api/configuracao')).json()) as { filmes: SecaoFilmes }).filmes;

describe('a seção Filmes: o estado', () => {
  it('na primeira vez, começa com o Portainer (a praça pela opção dela); as sessões vêm do cadastro; a etiqueta não achada e a em dobro são exceção', async () => {
    const { chefe } = await comServidor();
    const s = await lerFilmes(chefe);
    expect(s.primeiraVez).toBe(true);
    expect(s.proposta).toMatchObject({ praca: 'G5', lista: 'lFilmes', etiquetas: ['eFilme'] });
    expect(s.proposta.sessoes).toEqual([
      { nome: 'Supercine', etiqueta: 'eSuper' },
      { nome: 'Tela Quente', etiqueta: '' },
      { nome: 'Domingo Maior', etiqueta: '' },
    ]);
    expect(s.estado.excecoes.map((l) => [l.chave, l.problema, l.candidatos.join(',')])).toEqual([
      ['filmes.sessao.TELA QUENTE', 'dobro', 'eTQ,eTQ2'],
      ['filmes.sessao.DOMINGO MAIOR', 'nenhum', ''],
    ]);
    expect(s.estado.resumo).toBe('3 sessões · 1 não achado · 1 em dobro');
  });

  it('só administradores', async () => {
    const { ana } = await comServidor();
    expect((await ana('/api/configuracao')).status).toBe(403);
    expect((await ana('/api/configuracao/salvar', { filmes: {} })).status).toBe(403);
  });
});

describe('a seção Filmes: conferir e salvar', () => {
  it('a lista arquivada e a praça que não existe não passam: nada é salvo', async () => {
    const { chefe, app } = await comServidor();
    const s = await lerFilmes(chefe);
    const r = await chefe('/api/configuracao/salvar', { filmes: { ...s.proposta, lista: 'lFilmesVelha', praca: 'MG' } });
    expect(r.status).toBe(422);
    const { conferencia } = (await r.json()) as { conferencia: Conferencia };
    expect(conferencia.itens.filter((i) => i.tipo === 'erro').map((i) => i.titulo)).toEqual(['Praça dos cards', 'Lista dos cards de filme']);
    expect(app.modulos().env.TRELLO_LISTA_FILMES).toBe('lFilmes');
  });

  it('a praça dos filmes pode ser a praça nova que vem junto', async () => {
    const { chefe } = await comServidor();
    const tudo = (await (await chefe('/api/configuracao')).json()) as { pracas: { proposta: { pracas: object[] } }; filmes: SecaoFilmes };
    const pracas = { ...tudo.pracas.proposta, pracas: [...tudo.pracas.proposta.pracas, { sigla: 'MG', nome: 'Minas', padrao: false, regra: { onde: 'fim', palavras: ['MG'] }, tambem: [], entrada: 'lSP', saida: '', opcao: '' }] };
    const r = (await (await chefe('/api/configuracao/conferir', { pracas, filmes: { ...tudo.filmes.proposta, praca: 'MG' } })).json()) as Conferencia;
    expect(r.itens.filter((i) => i.titulo === 'Praça dos cards')).toEqual([{ tipo: 'aviso', titulo: 'Praça dos cards', detalhe: 'MG não tem a opção no campo Praça: o card de filme vai sem a praça.' }]);
  });

  it('salvar vale na hora: o próximo card de filme vai para a lista nova, com a praça e as etiquetas novas', async () => {
    const { chefe, f, enviarFilme } = await comServidor();
    const antes = await enviarFilme(2);
    expect(antes).toMatchObject({ idList: 'lFilmes', idLabels: 'eFilme' });
    expect(f.campos['card1.cPraca']).toBe('oG5');

    const s = await lerFilmes(chefe);
    const nova: LigacoesDosFilmes = {
      ...s.proposta,
      praca: 'SP',
      lista: 'lFilmesNova',
      sessoes: s.proposta.sessoes.map((x) => (x.nome === 'Tela Quente' ? { ...x, etiqueta: 'eTQ2' } : x)),
      aMao: ['filmes.lista', 'filmes.sessao.TELA QUENTE'],
    };
    const conferido = (await (await chefe('/api/configuracao/conferir', { filmes: nova })).json()) as Conferencia;
    expect(conferido.ok).toBe(true);
    expect(conferido.muda).toEqual([
      { oque: 'Praça dos cards de filme', antes: 'G5', depois: 'SP' },
      { oque: 'Lista dos cards de filme', antes: 'CARDS DE FILME', depois: 'ESTREIAS (à mão)' },
      { oque: 'Etiqueta de Tela Quente', antes: '—', depois: 'TELA QUENTE (à mão)' },
    ]);
    expect(conferido.itens).toContainEqual({ tipo: 'aviso', titulo: 'Etiqueta de Domingo Maior', detalhe: 'nada ligado: o card dessa sessão vai só com a etiqueta de todos.' });

    const escritas = f.escritasNoTrello.length;
    expect((await chefe('/api/configuracao/salvar', { filmes: nova })).status).toBe(200);
    // conferir e salvar só leem o Trello
    expect(f.escritasNoTrello.length).toBe(escritas);
    const depois = await enviarFilme(3);
    expect(depois).toMatchObject({ idList: 'lFilmesNova', idLabels: 'eFilme,eTQ2' });
    expect(f.campos['card2.cPraca']).toBe('oSP');

    const salvo = await lerFilmes(chefe);
    expect(salvo.primeiraVez).toBe(false);
    expect(salvo.salvo.aMao).toEqual(['filmes.lista', 'filmes.sessao.TELA QUENTE']);
    expect(salvo.estado.excecoes.map((l) => `${l.chave}:${l.como}:${l.problema}`)).toEqual(['filmes.lista:mao:', 'filmes.sessao.TELA QUENTE:mao:', 'filmes.sessao.DOMINGO MAIOR::nenhum']);
  });

  it('salvar os filmes não desfaz o ligado à mão das praças nem o do card', async () => {
    const { chefe } = await comServidor({ ...PORTAINER, TRELLO_LISTA_G5: 'lSP' });
    const tudo = (await (await chefe('/api/configuracao')).json()) as { pracas: { proposta: { aMao: string[] } }; filmes: SecaoFilmes };
    expect(tudo.pracas.proposta.aMao).toEqual(['G5.entrada']);
    expect((await chefe('/api/configuracao/salvar', { filmes: { ...tudo.filmes.proposta, aMao: ['filmes.lista'] } })).status).toBe(200);
    const meio = (await (await chefe('/api/configuracao')).json()) as { pracas: { proposta: { aMao: string[] } }; filmes: SecaoFilmes };
    expect(meio.pracas.proposta.aMao).toEqual(['G5.entrada']);
    expect((await chefe('/api/configuracao/salvar', { pracas: meio.pracas.proposta })).status).toBe(200);
    const fim = (await (await chefe('/api/configuracao')).json()) as { pracas: { salvo: { aMao: string[] } }; filmes: SecaoFilmes };
    expect(fim.pracas.salvo.aMao).toEqual(['G5.entrada']);
    expect(fim.filmes.salvo.aMao).toEqual(['filmes.lista']);
  });

  it('a pausa e a espera da leitura: o padrão vazio, o número salvo vale na hora', async () => {
    const { chefe, app } = await comServidor();
    const s = await lerFilmes(chefe);
    expect(s.estado.pausa).toEqual({ ms: 0, como: 'configurado' });
    expect(s.estado.espera).toEqual({ ms: 240000, como: 'padrao' });
    expect((await chefe('/api/configuracao/salvar', { filmes: { ...s.proposta, pausaMs: '', esperaMs: '90000' } })).status).toBe(200);
    expect(app.modulos().env).toMatchObject({ FILMES_INTERVALO_MS: '', FILMES_TEMPO_MS: '90000' });
    const depois = await lerFilmes(chefe);
    expect(depois.estado.pausa).toEqual({ ms: 2500, como: 'padrao' });
    expect((await chefe('/api/configuracao/salvar', { filmes: { ...s.proposta, esperaMs: 'muito' } })).status).toBe(400);
  });
});
