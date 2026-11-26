// @vitest-environment node
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarAcervo } from '../servidor/acervo.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
// @ts-expect-error módulo JS sem tipos
import { classificar } from '../servidor/importacao-do-acervo.mjs';

/* A importação do acervo por CSV (#58): a função pura que converte cada arquivo do CSV da pasta de output numa arte e
   classifica a linha contra o acervo da atração. Os casos são fictícios, no formato dos CSVs já importados à mão. */

const TIPOS = ['CRT', 'RDP', 'LETT', 'FOTO', 'LOGO', 'LOGO GLOBO', 'MOLDURA'];
const PASTA = '/Volumes/SERVIDOR/PROMO/output/PROGRAMA FICTICIO/_servico';
const csv = (...nomes: string[]) => ['nome;caminho;criado em', ...nomes.map((n, i) => `${n};${PASTA}/${n};2024-08-12 19:${String(10 + i)}`)].join('\n');

type Linha = { n: number; nome: string; arte: string; tipo: string; estado: string; motivo: string };
const resumo = (ls: Linha[]) => ls.map((l) => `${l.nome} → ${l.estado}${l.arte ? ` ${l.arte}` : ''}${l.tipo ? ` (${l.tipo})` : ''}`);

describe('classificar o CSV da pasta de output', () => {
  it('cada arquivo vira uma arte: "SIGLA - " é o tipo e o resto é o texto', () => {
    const r = classificar({ csv: csv('CRT - AMANHA DEPOIS DO SHOW.mov'), acervo: [], tipos: TIPOS });
    expect(r.linhas).toEqual([
      { n: 2, nome: 'CRT - AMANHA DEPOIS DO SHOW.mov', caminho: `${PASTA}/CRT - AMANHA DEPOIS DO SHOW.mov`, arte: 'AMANHA DEPOIS DO SHOW', tipo: 'CRT', estado: 'nova', motivo: '' },
    ]);
    expect(r.placar).toEqual({ nova: 1, completa: 0, ja: 0, copia: 0, fora: 0, decidir: 0 });
  });

  it('lê o CSV como a pasta de output exporta: ";", aspas (com ";" e aspas dentro), BOM, CRLF ou LF', () => {
    const texto = '\uFEFF"nome";"caminho";"criado em"\r\n"RDP - BANDA ""FICTICIA"".mov";"/x/RDP - BANDA ""FICTICIA"".mov";"2024-01-02"\r\n\r\n"CRT - HOJE; AO VIVO.mov";"/x/a.mov";""\nLETT - DOMINGO.png;/x/b.png;2024-01-03';
    const r = classificar({ csv: texto, acervo: [], tipos: TIPOS });
    expect(r.linhas.map((l: Linha) => [l.n, l.nome, l.arte, l.tipo])).toEqual([
      [2, 'RDP - BANDA "FICTICIA".mov', 'BANDA "FICTICIA"', 'RDP'],
      [4, 'CRT - HOJE; AO VIVO.mov', 'HOJE; AO VIVO', 'CRT'],
      [5, 'LETT - DOMINGO.png', 'DOMINGO', 'LETT'],
    ]);
  });

  it('o CSV sem a coluna nome (separado por vírgula, ou outro arquivo) é recusado com o formato esperado', () => {
    expect(() => classificar({ csv: 'nome,caminho,criado em\nRDP - HOJE.mov,/x,2024', acervo: [], tipos: TIPOS })).toThrow('O CSV não tem a coluna nome: o esperado é nome;caminho;criado em, separado por ";".');
    expect(() => classificar({ csv: '', acervo: [], tipos: TIPOS })).toThrow('O CSV não tem a coluna nome');
  });

  it('a pasta (o nome sem extensão) fica de fora', () => {
    const r = classificar({ csv: csv('RDP - CONVIDADOS', 'RDP - CONVIDADOS.mov'), acervo: [], tipos: TIPOS });
    expect(r.linhas.map((l: Linha) => [l.estado, l.motivo])).toEqual([
      ['fora', 'é uma pasta, não um arquivo'],
      ['nova', ''],
    ]);
    expect(r.linhas[0]).toMatchObject({ arte: '', tipo: '' });
    expect(r.placar).toMatchObject({ nova: 1, fora: 1 });
  });

  it('a sigla mais longa primeiro (LOGO GLOBO antes de LOGO), sem caixa; o "_" vira espaço', () => {
    const r = classificar({ csv: csv('LOGO GLOBO - FICTICIO_2024.png', 'logo - Programa Ficticio.png', 'Rdp - Banda  Ficticia.mov'), acervo: [], tipos: TIPOS });
    expect(resumo(r.linhas)).toEqual([
      'LOGO GLOBO - FICTICIO_2024.png → nova FICTICIO 2024 (LOGO GLOBO)',
      'logo - Programa Ficticio.png → nova PROGRAMA FICTICIO (LOGO)',
      'Rdp - Banda  Ficticia.mov → nova BANDA FICTICIA (RDP)',
    ]);
  });

  it('o nome sem "SIGLA - " (ou com uma sigla que não é tipo do acervo) e o sem texto ficam de fora', () => {
    const r = classificar({ csv: csv('MOLDURA VIDEO.png', 'COMP - ABERTURA EP 12.mov', 'CRT - .mov'), acervo: [], tipos: TIPOS });
    expect(r.linhas.map((l: Linha) => [l.estado, l.arte, l.tipo, l.motivo])).toEqual([
      ['fora', '', '', 'sem o prefixo do tipo (“SIGLA - ”)'],
      ['fora', '', '', 'sem o prefixo do tipo (“SIGLA - ”)'],
      ['fora', '', '', 'sem texto depois do prefixo'],
    ]);
  });

  it('_alfa/_alpha é a arte em lettering: o tipo vira LETT, seja qual for a sigla do prefixo', () => {
    const r = classificar({ csv: csv('CRT - ESPECIAL DE NATAL_alfa.mov', 'RDP - BANDA FICTICIA_ALPHA.mov', 'CRT - BANDA FICTICIA alpha.mov'), acervo: [], tipos: TIPOS });
    expect(resumo(r.linhas)).toEqual([
      'CRT - ESPECIAL DE NATAL_alfa.mov → nova ESPECIAL DE NATAL (LETT)',
      'RDP - BANDA FICTICIA_ALPHA.mov → nova BANDA FICTICIA (LETT)',
      'CRT - BANDA FICTICIA alpha.mov → copia BANDA FICTICIA (LETT)', // a mesma arte de novo no CSV
    ]);
    expect(r.linhas[0].motivo).toBe('_alfa: lettering');
  });

  it('a cópia ("- Copy", "- cópia 2", "(1)") fica de fora quando o original está no CSV; sem ele, vale como a arte', () => {
    const r = classificar({
      csv: csv('RDP - CORAL FICTICIO - Copy.mov', 'RDP - CORAL FICTICIO.mov', 'CRT - HOJE (1).mov', 'CRT - HOJE.mov', 'CRT - DOMINGO - cópia 2.mov'),
      acervo: [],
      tipos: TIPOS,
    });
    expect(resumo(r.linhas)).toEqual([
      'RDP - CORAL FICTICIO - Copy.mov → copia CORAL FICTICIO (RDP)',
      'RDP - CORAL FICTICIO.mov → nova CORAL FICTICIO (RDP)',
      'CRT - HOJE (1).mov → copia HOJE (CRT)',
      'CRT - HOJE.mov → nova HOJE (CRT)',
      'CRT - DOMINGO - cópia 2.mov → nova DOMINGO (CRT)',
    ]);
    expect(r.linhas.map((l: Linha) => l.motivo)).toEqual([
      'cópia da linha 3 (RDP - CORAL FICTICIO.mov)',
      '',
      'cópia da linha 5 (CRT - HOJE.mov)',
      '',
      'cópia sem o original no CSV: vale como a arte',
    ]);
    expect(r.placar).toMatchObject({ nova: 3, copia: 2 });
  });

  it('a mesma arte repetida no CSV (sem acento, caixa nem pontuação) conta uma vez; em outro tipo é outra arte', () => {
    const r = classificar({ csv: csv('RDP - AO VIVO.mov', 'RDP - Ao vivo!.mxf', 'CRT - AO VIVO.mov'), acervo: [], tipos: TIPOS });
    expect(resumo(r.linhas)).toEqual(['RDP - AO VIVO.mov → nova AO VIVO (RDP)', 'RDP - Ao vivo!.mxf → copia AO VIVO! (RDP)', 'CRT - AO VIVO.mov → nova AO VIVO (CRT)']);
    expect(r.linhas[1].motivo).toBe('a mesma arte da linha 2 (RDP - AO VIVO.mov)');
  });

  it('"já no acervo": a mesma chave da arte e o mesmo tipo; em outro tipo é arte nova', () => {
    const acervo = [
      { id: 'recA1', arte: 'Amanhã depois do show', tipo: 'CRT' },
      { id: 'recA2', arte: 'SÁBADO', tipo: 'RDP' },
    ];
    const r = classificar({ csv: csv('CRT - AMANHA DEPOIS DO SHOW.mov', 'CRT - SABADO.mov'), acervo, tipos: TIPOS });
    expect(resumo(r.linhas)).toEqual(['CRT - AMANHA DEPOIS DO SHOW.mov → ja AMANHA DEPOIS DO SHOW (CRT)', 'CRT - SABADO.mov → nova SABADO (CRT)']);
    expect(r.linhas[0].motivo).toBe('“Amanhã depois do show” (CRT)');
    expect(r.placar).toMatchObject({ nova: 1, ja: 1 });
  });

  it('"completa o acervo": a mesma chave sem tipo no acervo só ganha o tipo (uma vez: o outro tipo é arte nova)', () => {
    const acervo = [{ id: 'recP', arte: 'PLATEIA', tipo: '' }];
    const r = classificar({ csv: csv('RDP - PLATEIA.mov', 'CRT - PLATEIA.mov'), acervo, tipos: TIPOS });
    expect(resumo(r.linhas)).toEqual(['RDP - PLATEIA.mov → completa PLATEIA (RDP)', 'CRT - PLATEIA.mov → nova PLATEIA (CRT)']);
    expect(r.linhas[0].motivo).toBe('“PLATEIA” estava sem tipo');
    expect(r.placar).toMatchObject({ nova: 1, completa: 1 });
  });
});

/* ---------- a API: a prévia e o gravar, com o Teable de mentira ---------- */

const ENV = {
  TEABLE_URL: 'http://teable:3000',
  TEABLE_TOKEN: 'tok',
  TEABLE_ACERVO: 'tblAcervo',
  TEABLE_PG_URL: 'postgres://x',
  TEABLE_PG_ESQUEMA: 'bseBase',
  TEABLE_PG_ACERVO: 'acervo',
  TEABLE_PG_ATRACOES: 'atracoes',
};
const PROGRAMA = { id: 'recProg', title: 'Programa Fictício' };
type LinhaDoTeable = { id: string; arte: string; tipo: string | null; atracao: { id: string; title: string }[]; claquete: unknown[]; filme: null };
type Pedido = { metodo: string; url: string; corpo: null | { typecast?: boolean; records: { id?: string; fields: Record<string, unknown> }[] } };

/** O Teable de mentira: o Postgres (o acervo, que muda com o que a API grava, e as atrações) e a API (os campos e os
    registros). */
function teableFalso() {
  const linhas: LinhaDoTeable[] = [
    { id: 'recA1', arte: 'AMANHÃ DEPOIS DO SHOW', tipo: 'CRT', atracao: [PROGRAMA], claquete: [], filme: null },
    { id: 'recA2', arte: 'PLATEIA', tipo: null, atracao: [PROGRAMA], claquete: [], filme: null },
    { id: 'recA3', arte: 'SÁBADO', tipo: 'RDP', atracao: [PROGRAMA], claquete: [], filme: null },
    { id: 'recOutra', arte: 'HOJE', tipo: 'RDP', atracao: [{ id: 'recNovela', title: 'Novela Fictícia' }], claquete: [], filme: null },
  ];
  const atracoes = [
    { id: 'recProg', atracao: 'Programa Fictício', acervo: 'próprio' },
    { id: 'recNovela', atracao: 'Novela Fictícia', acervo: null },
    { id: 'recSessao', atracao: 'Sessão Fictícia', acervo: 'do filme' },
    { id: 'recShows', atracao: 'Shows Fictícios', acervo: 'sem acervo' },
  ];
  const leituras = { acervo: 0 };
  const consultar = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('"bseBase"."acervo"')) return leituras.acervo++, linhas.map((l) => ({ ...l }));
    if (sql.includes('"atracoes"') && sql.includes('"acervo"')) return atracoes;
    if (sql.includes('"atracoes"')) return atracoes.filter((a) => a.atracao.toLowerCase() === String(params[0]).toLowerCase()).map(({ id }) => ({ id }));
    return [];
  };
  const pedidos: Pedido[] = [];
  let novas = 0;
  const buscar = async (url: string, init: RequestInit = {}) => {
    const pedido: Pedido = { metodo: init.method ?? 'GET', url, corpo: init.body ? JSON.parse(String(init.body)) : null };
    pedidos.push(pedido);
    let resposta: unknown = {};
    if (url.endsWith('/api/table/tblAcervo/field'))
      resposta = [
        { id: 'fldArte', name: 'arte', type: 'singleLineText' },
        { id: 'fldTipo', name: 'tipo', type: 'singleSelect', options: { choices: ['CRT', 'RDP', 'LETT', 'FOTO', 'LOGO', 'LOGO GLOBO'].map((name, i) => ({ id: `cho${i}`, name })) } },
      ];
    else if (pedido.metodo === 'POST')
      resposta = {
        records: pedido.corpo!.records.map((r) => {
          const nova = { id: `recNova${++novas}`, arte: String(r.fields.arte), tipo: (r.fields.tipo as string) ?? null, atracao: [PROGRAMA], claquete: [], filme: null };
          linhas.push(nova);
          return { id: nova.id, fields: r.fields };
        }),
      };
    else if (pedido.metodo === 'PATCH') for (const r of pedido.corpo!.records) Object.assign(linhas.find((l) => l.id === r.id)!, r.fields);
    return { ok: true, status: 200, json: async () => resposta, text: async () => '' };
  };
  return { linhas, consultar, buscar, pedidos, leituras };
}

/** O servidor de verdade com o Teable de mentira; o chefe é administrador. */
async function comServidor(teste: (api: { como: (email: string) => (caminho: string, corpo?: unknown) => Promise<Response>; teable: ReturnType<typeof teableFalso> }) => Promise<void>) {
  const teable = teableFalso();
  const acervo = criarAcervo(ENV, { consultar: teable.consultar, buscar: teable.buscar });
  const servidor = createServer(criarApp({ db: abrirBanco(':memory:'), env: { CADASTRO_ADMINS: 'chefe@empresa.com' }, trello: { ligado: false, parar: async () => {} }, acervo }));
  await new Promise<void>((ok) => servidor.listen(0, ok));
  const base = `http://localhost:${(servidor.address() as { port: number }).port}`;
  const como = (email: string) => (caminho: string, corpo?: unknown) =>
    fetch(base + caminho, { method: corpo === undefined ? 'GET' : 'POST', headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' }, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });
  try {
    await teste({ como, teable });
  } finally {
    servidor.close();
  }
}
const CHEFE = 'chefe@empresa.com';

describe('a prévia da importação (POST /api/acervo/importar/previa)', () => {
  it('a atração e o CSV → as linhas classificadas contra o acervo dela, o placar e as opções de tipo do campo', async () => {
    await comServidor(async ({ como }) => {
      const texto = csv('CRT - AMANHA DEPOIS DO SHOW.mov', 'RDP - PLATEIA.mov', 'LETT - VEM AI.mov', 'RDP - VEM AI - Copy.mov', 'RDP - VEM AI.mov', '_ARQUIVOS VELHOS', 'COMP - ABERTURA.mov');
      const r = await como(CHEFE)('/api/acervo/importar/previa', { atracao: 'Programa Fictício', arquivo: 'PROGRAMA_SERVICO.csv', csv: texto });
      expect(r.status).toBe(200);
      const previa = await r.json();
      expect(previa).toMatchObject({ atracao: 'Programa Fictício', arquivo: 'PROGRAMA_SERVICO.csv', antes: 3, tipos: ['CRT', 'RDP', 'LETT', 'FOTO', 'LOGO', 'LOGO GLOBO'] });
      expect(previa.placar).toEqual({ nova: 2, completa: 1, ja: 1, copia: 1, fora: 2, decidir: 0 });
      expect(resumo(previa.linhas)).toEqual([
        'CRT - AMANHA DEPOIS DO SHOW.mov → ja AMANHA DEPOIS DO SHOW (CRT)',
        'RDP - PLATEIA.mov → completa PLATEIA (RDP)',
        'LETT - VEM AI.mov → nova VEM AI (LETT)',
        'RDP - VEM AI - Copy.mov → copia VEM AI (RDP)',
        'RDP - VEM AI.mov → nova VEM AI (RDP)',
        '_ARQUIVOS VELHOS → fora',
        'COMP - ABERTURA.mov → fora',
      ]);
    });
  });
});

describe('quem importa e onde', () => {
  const corpoDaPrevia = (atracao: string) => ({ atracao, arquivo: 'x.csv', csv: csv('RDP - VEM AI.mov') });
  const corpoDoGravar = (atracao: string) => ({ atracao, arquivo: 'x.csv', linhas: [{ arte: 'VEM AI', tipo: 'RDP' }] });

  it('só administradores: quem não é recebe 403 na prévia e no gravar, e nada é lido nem gravado', async () => {
    await comServidor(async ({ como, teable }) => {
      const ana = como('ana@empresa.com');
      const previa = await ana('/api/acervo/importar/previa', corpoDaPrevia('Programa Fictício'));
      expect(previa.status).toBe(403);
      expect((await previa.json()).erro).toBe('Só administradores importam o acervo.');
      expect((await ana('/api/acervo/importar', corpoDoGravar('Programa Fictício'))).status).toBe(403);
      expect(teable.pedidos).toEqual([]);
      expect(teable.leituras.acervo).toBe(0);
    });
  });

  it('só atração de acervo próprio: a do filme e a sem acervo recebem 422; a que não está nos cadastros, 422', async () => {
    await comServidor(async ({ como, teable }) => {
      const chefe = como(CHEFE);
      for (const atracao of ['Sessão Fictícia', 'Shows Fictícios']) {
        const r = await chefe('/api/acervo/importar/previa', corpoDaPrevia(atracao));
        expect(r.status).toBe(422);
        expect((await r.json()).erro).toBe(`${atracao} não tem acervo próprio: a importação é só para atração de acervo próprio.`);
        expect((await chefe('/api/acervo/importar', corpoDoGravar(atracao))).status).toBe(422);
      }
      const virgula = await chefe('/api/acervo/importar/previa', { atracao: 'Programa Fictício', arquivo: 'x.csv', csv: 'nome,caminho\nRDP - X.mov,/x' });
      expect(virgula.status).toBe(422);
      expect((await virgula.json()).erro).toMatch(/^O CSV não tem a coluna nome/);
      const sem = await chefe('/api/acervo/importar/previa', corpoDaPrevia('Atração Inventada'));
      expect(sem.status).toBe(422);
      expect((await sem.json()).erro).toBe('A atração Atração Inventada não está nos cadastros.');
      expect(teable.pedidos.filter((p) => p.metodo !== 'GET')).toEqual([]);
    });
  });

  it('a atração sem valor no acervo vale próprio: importa', async () => {
    await comServidor(async ({ como }) => {
      const r = await como(CHEFE)('/api/acervo/importar/previa', corpoDaPrevia('Novela Fictícia'));
      expect(r.status).toBe(200);
      expect((await r.json()).antes).toBe(1);
    });
  });
});

describe('gravar a importação (POST /api/acervo/importar)', () => {
  const gravar = (como: (email: string) => (caminho: string, corpo?: unknown) => Promise<Response>, linhas: unknown[], atracao = 'Programa Fictício') =>
    como(CHEFE)('/api/acervo/importar', { atracao, arquivo: 'PROGRAMA_SERVICO.csv', linhas });

  it('cria as novas ligadas à atração, dá o tipo à que estava sem, e devolve o resumo antes → depois', async () => {
    await comServidor(async ({ como, teable }) => {
      const r = await gravar(como, [
        { arte: 'VEM AI', tipo: 'LETT' },
        { arte: 'VEM AI', tipo: 'RDP' },
        { arte: 'PLATEIA', tipo: 'RDP' },
      ]);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ antes: 3, depois: 5, novas: 2, ganharamTipo: 1, semMudanca: 0 });
      const post = teable.pedidos.filter((p) => p.metodo === 'POST');
      expect(post).toHaveLength(1);
      expect(post[0].url).toBe('http://teable:3000/api/table/tblAcervo/record');
      expect(post[0].corpo!.typecast).toBe(false); // o tipo já foi conferido contra as opções do campo
      expect(post[0].corpo!.records.map((x) => x.fields)).toEqual([
        { arte: 'VEM AI', tipo: 'LETT', atracao: [{ id: 'recProg' }] },
        { arte: 'VEM AI', tipo: 'RDP', atracao: [{ id: 'recProg' }] },
      ]);
      expect(teable.pedidos.filter((p) => p.metodo === 'PATCH').map((p) => p.corpo!.records)).toEqual([[{ id: 'recA2', fields: { tipo: 'RDP' } }]]);
    });
  });

  it('o cache do acervo é esquecido: a ficha lê o total novo logo depois', async () => {
    await comServidor(async ({ como }) => {
      const ficha = async () => (await (await como(CHEFE)('/api/acervo/atracao?atracao=Programa%20Fict%C3%ADcio')).json()).total;
      expect(await ficha()).toBe(3);
      await gravar(como, [{ arte: 'VEM AI', tipo: 'LETT' }]);
      expect(await ficha()).toBe(4);
    });
  });

  it('relê o acervo logo antes de gravar: o que entrou durante a conferência não duplica', async () => {
    await comServidor(async ({ como, teable }) => {
      // a prévia lê o acervo (e o guarda por 1 min); um envio grava VEM AI (RDP) no meio da conferência
      await como(CHEFE)('/api/acervo/importar/previa', { atracao: 'Programa Fictício', arquivo: 'x.csv', csv: csv('RDP - VEM AI.mov', 'LETT - VEM AI.mov') });
      teable.linhas.push({ id: 'recDoEnvio', arte: 'Vem aí', tipo: 'RDP', atracao: [PROGRAMA], claquete: [], filme: null });
      const r = await gravar(como, [
        { arte: 'VEM AI', tipo: 'RDP' },
        { arte: 'VEM AI', tipo: 'LETT' },
      ]);
      expect(await r.json()).toEqual({ antes: 4, depois: 5, novas: 1, ganharamTipo: 0, semMudanca: 1 });
      expect(teable.pedidos.filter((p) => p.metodo === 'POST').flatMap((p) => p.corpo!.records.map((x) => x.fields.tipo))).toEqual(['LETT']);
    });
  });

  it('o tipo que não é opção do campo tipo é recusado e nada é gravado (o typecast nunca cria opção nova)', async () => {
    await comServidor(async ({ como, teable }) => {
      const r = await gravar(como, [
        { arte: 'VEM AI', tipo: 'RDP' },
        { arte: 'ABERTURA', tipo: 'COMP' },
        { arte: 'ENCERRAMENTO', tipo: 'COMP' },
        { arte: 'VINHETA', tipo: 'VNH' },
      ]);
      expect(r.status).toBe(422);
      expect((await r.json()).erro).toBe('Tipo que não está no campo tipo do acervo: COMP, VNH. Nada foi gravado.');
      expect(teable.pedidos.filter((p) => p.metodo !== 'GET')).toEqual([]);
    });
  });

  it('grava em lotes de 100', async () => {
    await comServidor(async ({ como, teable }) => {
      const linhas = Array.from({ length: 230 }, (_, i) => ({ arte: `CONVIDADO FICTICIO ${i + 1}`, tipo: 'RDP' }));
      expect(await (await gravar(como, linhas)).json()).toMatchObject({ antes: 3, depois: 233, novas: 230 });
      expect(teable.pedidos.filter((p) => p.metodo === 'POST').map((p) => p.corpo!.records.length)).toEqual([100, 100, 30]);
    });
  });

  it('o pedido malformado: sem linhas, ou uma linha sem arte, é 400', async () => {
    await comServidor(async ({ como, teable }) => {
      expect((await gravar(como, [])).status).toBe(400);
      expect((await gravar(como, [{ arte: '  ', tipo: 'RDP' }])).status).toBe(400);
      expect((await como(CHEFE)('/api/acervo/importar', { atracao: 'Programa Fictício', linhas: 'x' })).status).toBe(400);
      expect(teable.pedidos.filter((p) => p.metodo !== 'GET')).toEqual([]);
    });
  });
});
