// @vitest-environment node
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error módulo JS sem tipos
import { criarAcervo } from '../servidor/acervo.mjs';
// @ts-expect-error módulo JS sem tipos
import { abrirBanco, criarApp } from '../servidor/app.mjs';
import { classificar, comoRegras, conferir, emLote, regrasDasDecisoes, type Escolhas, type LinhaDaImportacao, type RegraLembrada } from '../servidor/importacao-do-acervo.mjs';

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
    expect(r.linhas).toMatchObject([
      {
        n: 2,
        nome: 'CRT - AMANHA DEPOIS DO SHOW.mov',
        caminho: `${PASTA}/CRT - AMANHA DEPOIS DO SHOW.mov`,
        arte: 'AMANHÃ DEPOIS DO SHOW',
        tipo: 'CRT',
        estado: 'nova',
        motivo: '',
        versao: '',
        mudancas: [{ antes: 'AMANHA', depois: 'AMANHÃ', regra: 'acento' }],
        perguntas: [],
      },
    ]);
    expect(r.placar).toEqual({ nova: 1, completa: 0, corrige: 0, ja: 0, copia: 0, fora: 0, decidir: 0 });
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

  it('o nome sem "SIGLA - " (que não começa por um tipo) e o sem texto ficam de fora', () => {
    const r = classificar({ csv: csv('ABERTURA VIDEO.png', 'Volta - abertura.mov', 'CRT - .mov'), acervo: [], tipos: TIPOS });
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
    expect(resumo(r.linhas)).toEqual(['CRT - AMANHA DEPOIS DO SHOW.mov → ja AMANHÃ DEPOIS DO SHOW (CRT)', 'CRT - SABADO.mov → nova SÁBADO (CRT)']);
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

type Mudanca = { antes: string; depois: string; regra: string };
type LinhaComRegras = Linha & { mudancas: Mudanca[]; versao: string };
/** O que mudou na linha, como a conferência mostra: "antes → depois · regra". */
const mudou = (l: LinhaComRegras) => l.mudancas.map((m) => `${m.antes} → ${m.depois} · ${m.regra}`);

describe('as regras de conversão (#59): cada linha diz o antes → depois e a regra', () => {
  it('a hora "2 10" vira "2:10"; o dia fica junto ("HOJE 3:00") e o período fica no texto', () => {
    const r = classificar({ csv: csv('RDP - 2 10.mov', 'CRT - HOJE 3 00.mov', 'CRT - 3 40 DA TARDE.mov', 'CRT - DOMINGO 10H.mov', 'RDP - 11h30.mov'), acervo: [], tipos: TIPOS });
    expect(r.linhas.map((l: LinhaComRegras) => [l.arte, mudou(l)])).toEqual([
      ['2:10', ['2 10 → 2:10 · hora']],
      ['HOJE 3:00', ['3 00 → 3:00 · hora']],
      ['3:40 DA TARDE', ['3 40 → 3:40 · hora']],
      ['DOMINGO 10:00', ['10H → 10:00 · hora']],
      ['11:30', ['11H30 → 11:30 · hora']],
    ]);
  });

  it('o número que não é hora fica como está (25 99, DIA 5)', () => {
    const r = classificar({ csv: csv('RDP - 25 99.mov', 'CRT - DIA 5.mov', 'CRT - TEMPORADA 2024.mov'), acervo: [], tipos: TIPOS });
    expect(r.linhas.map((l: LinhaComRegras) => [l.arte, l.mudancas])).toEqual([
      ['25 99', []],
      ['DIA 5', []],
      ['TEMPORADA 2024', []],
    ]);
  });

  it('PROX vira PRÓXIMO; antes do dia da semana (e de SEMANA), PRÓXIMA', () => {
    const r = classificar({ csv: csv('CRT - PROX SABADO.mov', 'CRT - PROX SEGUNDA.mov', 'CRT - PROX. SEMANA.mov', 'RDP - PROX CAPITULO.mov', 'CRT - PROX SEXTA 9 30.mov'), acervo: [], tipos: TIPOS });
    expect(r.linhas.map((l: LinhaComRegras) => [l.arte, mudou(l)])).toEqual([
      ['PRÓXIMO SÁBADO', ['PROX → PRÓXIMO · abreviação', 'SABADO → SÁBADO · acento']],
      ['PRÓXIMA SEGUNDA', ['PROX → PRÓXIMA · abreviação']],
      ['PRÓXIMA SEMANA', ['PROX → PRÓXIMA · abreviação']],
      ['PRÓXIMO CAPÍTULO', ['PROX → PRÓXIMO · abreviação', 'CAPITULO → CAPÍTULO · acento']],
      ['PRÓXIMA SEXTA 9:30', ['PROX → PRÓXIMA · abreviação', '9 30 → 9:30 · hora']],
    ]);
  });

  it('os acentos do dicionário (NAO, AMANHA, SABADO…), palavra a palavra; a palavra fora do dicionário fica como está', () => {
    const r = classificar({ csv: csv('RDP - TEM OU NAO TEM.mov', 'CRT - AMANHA 2 10.mov', 'CRT - TODO SABADO 10 DA NOITE.mov', 'RDP - JOSE DA SILVA.mov', 'CRT - QUAL E.mov', 'CRT - JÁ É SÁBADO.mov'), acervo: [], tipos: TIPOS });
    expect(r.linhas.map((l: LinhaComRegras) => [l.arte, mudou(l)])).toEqual([
      ['TEM OU NÃO TEM', ['NAO → NÃO · acento']],
      ['AMANHÃ 2:10', ['2 10 → 2:10 · hora', 'AMANHA → AMANHÃ · acento']],
      ['TODO SÁBADO 10 DA NOITE', ['SABADO → SÁBADO · acento']], // "10" sozinho não é hora
      ['JOSE DA SILVA', []], // o acento de nome próprio vem das fontes da grafia, não do dicionário
      ['QUAL É', ['QUAL E → QUAL É · acento']],
      ['JÁ É SÁBADO', []], // o que já vem com acento não muda
    ]);
  });

  it('as versões (D/E, VERT, 6S…) são a mesma arte: vão para "Versões e cópias", e a primeira sem versão é a que vale', () => {
    const r = classificar({
      csv: csv('CRT - TODO SABADO VERT.mov', 'CRT - TODO SABADO 6S.mov', 'CRT - TODO SABADO.mov', 'RDP - 10 50 DA NOITE D.mov', 'RDP - 10 50 DA NOITE E.mov', 'RDP - HOJE VERT 15S.mov', 'RDP - D.mov'),
      acervo: [],
      tipos: TIPOS,
    });
    expect(r.linhas.map((l: LinhaComRegras) => [l.arte, l.estado, l.versao, l.motivo])).toEqual([
      ['TODO SÁBADO', 'copia', 'VERT', 'versão VERT da linha 4 (CRT - TODO SABADO.mov)'],
      ['TODO SÁBADO', 'copia', '6S', 'versão 6S da linha 4 (CRT - TODO SABADO.mov)'],
      ['TODO SÁBADO', 'nova', '', ''],
      ['10:50 DA NOITE', 'nova', 'D', 'versão D sem o original no CSV: vale como a arte'],
      ['10:50 DA NOITE', 'copia', 'E', 'versão E da linha 5 (RDP - 10 50 DA NOITE D.mov)'],
      ['HOJE', 'nova', 'VERT 15S', 'versão VERT 15S sem o original no CSV: vale como a arte'],
      ['D', 'nova', '', ''], // a marca sozinha é o texto, não uma versão
    ]);
    // o texto que uma fonte da grafia escreve inteiro não tem versão
    const vitamina = classificar({ csv: csv('RDP - VITAMINA D.mov'), acervo: [], tipos: TIPOS, grafias: { roteiros: ['VITAMINA D'] } });
    expect(vitamina.linhas.map((l: LinhaComRegras) => [l.arte, l.estado, l.versao])).toEqual([['VITAMINA D', 'nova', '']]);
    expect(mudou(r.linhas[0])).toEqual(['VERT →  · versão', 'SABADO → SÁBADO · acento']);
    expect(r.placar).toMatchObject({ nova: 4, copia: 3 });
  });

  it('a grafia vem da primeira fonte que tem a arte: acervo da atração, roteiros da atração, roteiros de todas, acervo de todas', () => {
    const nomes = ['RDP - CAUA FICTICIO.mov', 'RDP - BANDA DO ZE.mov', 'RDP - JOAO DA FICCAO.mov', 'RDP - MARIA INVENTADA.mov', 'RDP - NINGUEM SABE.mov'];
    const acervo = [{ id: 'rec1', arte: 'Cauã Fictício', tipo: 'CRT' }];
    const grafias = {
      roteirosDaAtracao: ['CAUA FICTICIO', 'BANDA DO ZÉ', 'BANDA DO ZÉ'],
      roteiros: ['CAUÃ FICTÍCIO!', 'BANDA DO ZÉ!', 'JOÃO DA FICÇÃO', 'JOAO DA FICCAO', 'JOAO DA FICCAO'],
      acervo: ['CAUÃ FICTICIO', 'JOAO DA FICCAO', 'MARIA INVENTADA (CRT)', 'Maria Inventadá'],
    };
    const r = classificar({ csv: csv(...nomes), acervo, tipos: TIPOS, grafias });
    expect(r.linhas.map((l: LinhaComRegras) => [l.arte, mudou(l)])).toEqual([
      ['CAUÃ FICTÍCIO', ['CAUA FICTICIO → CAUÃ FICTÍCIO · grafia do acervo da atração']],
      ['BANDA DO ZÉ', ['BANDA DO ZE → BANDA DO ZÉ · grafia dos roteiros da atração']],
      ['JOÃO DA FICÇÃO', ['JOAO DA FICCAO → JOÃO DA FICÇÃO · grafia dos roteiros']], // a forma com acento ganha da mais escrita
      ['MARIA INVENTADÁ', ['MARIA INVENTADA → MARIA INVENTADÁ · grafia do acervo']],
      ['NINGUEM SABE', []],
    ]);
  });

  it('a grafia passa por cima do dicionário: a fonte que escreve sem acento decide, e nada muda', () => {
    const r = classificar({ csv: csv('CRT - NAO PERCA.mov', 'CRT - SABADO DE SOL.mov'), acervo: [{ id: 'rec1', arte: 'NAO PERCA', tipo: 'RDP' }], tipos: TIPOS, grafias: { roteiros: ['SÁBADO DE SOL!'] } });
    expect(r.linhas.map((l: LinhaComRegras) => [l.arte, mudou(l)])).toEqual([
      ['NAO PERCA', []],
      ['SÁBADO DE SOL!', ['SABADO DE SOL → SÁBADO DE SOL! · grafia dos roteiros']],
    ]);
  });

  it('o nome do Mac (acento decomposto, NFD) é lido como o mesmo texto', () => {
    const r = classificar({ csv: csv('CRT - SÁBADO 2 10.mov'), acervo: [], tipos: TIPOS });
    expect(r.linhas.map((l: LinhaComRegras) => [l.arte, mudou(l)])).toEqual([['SÁBADO 2:10', ['2 10 → 2:10 · hora']]]);
  });
});

/* ---------- para decidir (#60): a pergunta na linha, a edição e o lote ---------- */

const perguntas = (l: LinhaDaImportacao) => l.perguntas.map((q) => `${q.texto} [${q.opcoes.map((o) => o.rotulo).join(' | ')}]${q.resposta ? ` → ${q.resposta}` : ''}`);
/** Classifica e confere com as escolhas de quem confere, como a tela faz. */
const conferido = (r: { linhas: LinhaDaImportacao[] }, escolhas: Escolhas, acervo: { id: string; arte: string; tipo: string }[] = []) => conferir({ linhas: r.linhas, acervo, tipos: TIPOS, escolhas });

describe('para decidir (#60): cada pergunta na linha', () => {
  it('a sigla que não é tipo (COMP) pergunta: fica fora ou ganha um tipo do campo; nunca um tipo novo', () => {
    const r = classificar({ csv: csv('COMP - ABERTURA EP 12.mov', 'COMP - ENCERRAMENTO EP 12.mov', 'COMP - VINHETA.mov'), acervo: [], tipos: TIPOS });
    expect(resumo(r.linhas)).toEqual(['COMP - ABERTURA EP 12.mov → decidir ABERTURA EP 12', 'COMP - ENCERRAMENTO EP 12.mov → decidir ENCERRAMENTO EP 12', 'COMP - VINHETA.mov → decidir VINHETA']);
    expect(perguntas(r.linhas[0])).toEqual(['COMP não é tipo do acervo. [Fica fora]']);
    expect(r.placar.decidir).toBe(3);
    const d = conferido(r, { 2: { respostas: { sigla: 'fora' } }, 3: { tipo: 'CRT' }, 4: { tipo: 'COMP' } });
    expect(resumo(d.linhas)).toEqual(['COMP - ABERTURA EP 12.mov → fora ABERTURA EP 12', 'COMP - ENCERRAMENTO EP 12.mov → nova ENCERRAMENTO EP 12 (CRT)', 'COMP - VINHETA.mov → decidir VINHETA (COMP)']);
    expect(d.linhas.map((l) => l.motivo)).toEqual(['decisão: fica fora', '', 'COMP não é tipo do acervo.']);
    expect(d.faltam).toBe(1);
  });

  it('o arquivo sem sigla que começa por um tipo: o tipo sai do começo do nome; confirmar ou deixar fora', () => {
    const r = classificar({ csv: csv('MOLDURA VIDEO.png', 'FOTO PALCO NOVO.png'), acervo: [], tipos: TIPOS });
    expect(resumo(r.linhas)).toEqual(['MOLDURA VIDEO.png → decidir MOLDURA VÍDEO (MOLDURA)', 'FOTO PALCO NOVO.png → decidir FOTO PALCO NOVO (FOTO)']);
    expect(perguntas(r.linhas[0])).toEqual(['Sem “SIGLA - ”: o tipo saiu do começo do nome. [MOLDURA está certo | Fica fora]']);
    const d = conferido(r, { 2: { respostas: { tipoDoNome: 'confirmar' } }, 3: { respostas: { tipoDoNome: 'fora' } } });
    expect(resumo(d.linhas)).toEqual(['MOLDURA VIDEO.png → nova MOLDURA VÍDEO (MOLDURA)', 'FOTO PALCO NOVO.png → fora FOTO PALCO NOVO (FOTO)']);
    expect(perguntas(d.linhas[0])).toEqual(['Sem “SIGLA - ”: o tipo saiu do começo do nome. [MOLDURA está certo | Fica fora] → confirmar']);
    // trocar o tipo na linha também responde
    expect(resumo(conferido(r, { 3: { tipo: 'LETT' } }).linhas)[1]).toBe('FOTO PALCO NOVO.png → nova FOTO PALCO NOVO (LETT)');
  });

  it('o acento sugerido pela palavra nas fontes (nome próprio, fora do dicionário): o sugerido ou como está', () => {
    // MÁRCIA escrita 3 vezes com acento nos roteiros e no acervo de todas; ROSARIO mais sem acento que com
    const grafias = { roteiros: ['MÁRCIA FICTÍCIA', 'MÁRCIA SOUZA', 'ROSÁRIO DE EXEMPLO', 'ROSARIO DA SILVA', 'ROSARIO LIMA'], acervo: ['DONA MÁRCIA', 'Márcia em caixa baixa não conta'] };
    const r = classificar({ csv: csv('RDP - MARCIA DO VALE.mov', 'RDP - HELENA ROSARIO.mov', 'RDP - MARCIA LUZ.mov'), acervo: [], tipos: TIPOS, grafias });
    expect(resumo(r.linhas)).toEqual(['RDP - MARCIA DO VALE.mov → decidir MARCIA DO VALE (RDP)', 'RDP - HELENA ROSARIO.mov → nova HELENA ROSARIO (RDP)', 'RDP - MARCIA LUZ.mov → decidir MARCIA LUZ (RDP)']);
    expect(perguntas(r.linhas[0])).toEqual(['Acento? [MÁRCIA DO VALE | Como está]']);
    const d = conferido(r, { 2: { respostas: { acento: 'sugerido' } }, 4: { respostas: { acento: 'como-esta' } } });
    expect(resumo(d.linhas)).toEqual(['RDP - MARCIA DO VALE.mov → nova MÁRCIA DO VALE (RDP)', 'RDP - HELENA ROSARIO.mov → nova HELENA ROSARIO (RDP)', 'RDP - MARCIA LUZ.mov → nova MARCIA LUZ (RDP)']);
    expect(mudou(d.linhas[0] as LinhaComRegras)).toEqual(['MARCIA DO VALE → MÁRCIA DO VALE · acento sugerido']);
  });

  it('o rodapé composto (dois nomes num rodapé) pergunta se o roteiro escreve assim; o que o roteiro escreve, não', () => {
    const r = classificar({
      csv: csv('RDP - ANA LUZ E BENTO LUZ.mov', 'RDP - PEDRO FICTICIO RAFAELA FICTICIO.mov', 'RDP - DUPLA DE TESTE E AMIGOS.mov', 'RDP - TEM OU NAO TEM.mov', 'CRT - ANA LUZ E BENTO LUZ.mov'),
      acervo: [],
      tipos: TIPOS,
      grafias: { roteiros: ['DUPLA DE TESTE E AMIGOS'] },
    });
    expect(r.linhas.map((l) => l.estado)).toEqual(['decidir', 'decidir', 'nova', 'nova', 'nova']);
    expect(perguntas(r.linhas[1])).toEqual(['Dois nomes num rodapé. O roteiro escreve assim? [Sim, importar | Fica fora]']);
    const d = conferido(r, { 2: { respostas: { composto: 'importar' } }, 3: { respostas: { composto: 'fora' } } });
    expect(d.linhas.slice(0, 2).map((l) => l.estado)).toEqual(['nova', 'fora']);
  });

  it('o nome parecido com um do acervo (distância pequena sobre a chave): é a mesma (erro no arquivo) ou é outra arte', () => {
    const acervo = [
      { id: 'recBanda', arte: 'BANDA MAR ABERTO', tipo: 'RDP' },
      { id: 'recVitor', arte: 'VITOR FICTICIO', tipo: '' },
      { id: 'recHoje', arte: 'HOJE 3:10', tipo: 'CRT' },
      { id: 'recNoite', arte: 'NOITE', tipo: 'CRT' },
    ];
    const r = classificar({
      csv: csv('RDP - BANDA MAR ABERTTO.mov', 'RDP - BANDA MAR ABERTTO - Copy.mov', 'RDP - VICTOR FICTICIO.mov', 'CRT - HOJE 3 00.mov', 'CRT - NOITES.mov', 'LETT - BANDA MAR ABERTTO.mov'),
      acervo,
      tipos: TIPOS,
    });
    expect(resumo(r.linhas)).toEqual([
      'RDP - BANDA MAR ABERTTO.mov → decidir BANDA MAR ABERTTO (RDP)',
      'RDP - BANDA MAR ABERTTO - Copy.mov → copia BANDA MAR ABERTTO (RDP)', // a cópia não pergunta de novo
      'RDP - VICTOR FICTICIO.mov → decidir VICTOR FICTICIO (RDP)', // parecida com a sem tipo
      'CRT - HOJE 3 00.mov → nova HOJE 3:00 (CRT)', // outro número é outra arte
      'CRT - NOITES.mov → nova NOITES (CRT)', // a chave do acervo com menos de 6 letras não conta
      'LETT - BANDA MAR ABERTTO.mov → nova BANDA MAR ABERTTO (LETT)', // em outro tipo não pergunta
    ]);
    expect(perguntas(r.linhas[0])).toEqual(['Parece BANDA MAR ABERTO (RDP), que já está no acervo. [É a mesma: erro no arquivo | O do acervo está errado: corrigir | É outra arte]']);
    expect(perguntas(r.linhas[2])).toEqual(['Parece VITOR FICTICIO, que já está no acervo. [É a mesma: erro no arquivo | O do acervo está errado: corrigir | É outra arte]']);
    const d = conferido(r, { 2: { respostas: { parecida: 'mesma' } }, 4: { respostas: { parecida: 'mesma' } } }, acervo);
    expect(resumo(d.linhas).slice(0, 3)).toEqual([
      'RDP - BANDA MAR ABERTTO.mov → ja BANDA MAR ABERTO (RDP)',
      'RDP - BANDA MAR ABERTTO - Copy.mov → copia BANDA MAR ABERTTO (RDP)',
      'RDP - VICTOR FICTICIO.mov → completa VITOR FICTICIO (RDP)',
    ]);
    expect(mudou(d.linhas[0] as LinhaComRegras)).toEqual(['BANDA MAR ABERTTO → BANDA MAR ABERTO · erro no arquivo']);
    const outra = conferido(r, { 2: { respostas: { parecida: 'outra' } } }, acervo);
    expect(outra.linhas[0]).toMatchObject({ estado: 'nova', arte: 'BANDA MAR ABERTTO' });
    expect(outra.plano.criar).toContainEqual({ arte: 'BANDA MAR ABERTTO', tipo: 'RDP' });
  });

  it('o erro que está no próprio acervo: o roteiro escreve como o arquivo; "corrigir" renomeia a mesma linha do acervo', () => {
    const acervo = [
      { id: 'recSorisso', arte: 'SORISSO FICTICIO', tipo: 'RDP' },
      { id: 'recTrio', arte: 'TRIO PÉ DE SERA', tipo: '' },
    ];
    const r = classificar({ csv: csv('RDP - SORRISO FICTICIO.mov', 'RDP - TRIO PE DE SERRA.mov'), acervo, tipos: TIPOS, grafias: { roteiros: ['SORRISO FICTÍCIO', 'TRIO PÉ DE SERRA'] } });
    expect(r.linhas.map((l) => [l.estado, l.arte])).toEqual([
      ['decidir', 'SORRISO FICTÍCIO'],
      ['decidir', 'TRIO PÉ DE SERRA'],
    ]);
    expect(perguntas(r.linhas[0])).toEqual(['O acervo tem SORISSO FICTICIO (RDP), quase igual. [O do acervo está errado: corrigir | É a mesma: erro no arquivo | São artes diferentes]']);
    const d = conferido(r, { 2: { respostas: { parecida: 'corrigir' } }, 3: { respostas: { parecida: 'corrigir' } } }, acervo);
    expect(d.linhas.map((l) => [l.estado, l.motivo])).toEqual([
      ['corrige', '“SORISSO FICTICIO” no acervo vira “SORRISO FICTÍCIO” (a mesma linha)'],
      ['corrige', '“TRIO PÉ DE SERA” no acervo vira “TRIO PÉ DE SERRA” (a mesma linha) e ganha o tipo RDP'],
    ]);
    expect(d.placar).toMatchObject({ corrige: 2, decidir: 0 });
    expect(d.plano).toEqual({
      criar: [],
      tipar: [],
      renomear: [
        { id: 'recSorisso', arte: 'SORRISO FICTÍCIO', antigo: 'SORISSO FICTICIO' },
        { id: 'recTrio', arte: 'TRIO PÉ DE SERRA', antigo: 'TRIO PÉ DE SERA', tipo: 'RDP' },
      ],
      semMudanca: 0,
    });
    // duas linhas não renomeiam a mesma linha do acervo: a segunda volta a perguntar
    const duas = classificar({ csv: csv('RDP - SORRISO FICTICIO.mov', 'RDP - SORISO FICTICIO.mov'), acervo, tipos: TIPOS });
    const d2 = conferido(duas, { 2: { respostas: { parecida: 'corrigir' } }, 3: { respostas: { parecida: 'corrigir' } } }, acervo);
    expect(d2.linhas.map((l) => [l.estado, l.motivo])).toEqual([
      ['corrige', '“SORISSO FICTICIO” no acervo vira “SORRISO FICTICIO” (a mesma linha)'],
      ['decidir', '“SORISSO FICTICIO” já é corrigida por outra linha: escolha outra resposta.'],
    ]);
  });
});

describe('a edição na linha (#60): o estado é recalculado pela chave', () => {
  const acervo = [
    { id: 'recHoje', arte: 'HOJE', tipo: 'CRT' },
    { id: 'recPlateia', arte: 'PLATEIA', tipo: '' },
  ];
  const r = classificar({ csv: csv('CRT - HOJ.mov', 'RDP - PLATEIA.mov', 'CRT - DOMINGO.mov', 'CRT - SEGUNDA.mov'), acervo, tipos: TIPOS });

  it('corrigir o nome leva a linha para "já no acervo"; trocar o tipo, para "completa"; igualar a outra, para cópia', () => {
    expect(resumo(r.linhas)).toEqual(['CRT - HOJ.mov → nova HOJ (CRT)', 'RDP - PLATEIA.mov → completa PLATEIA (RDP)', 'CRT - DOMINGO.mov → nova DOMINGO (CRT)', 'CRT - SEGUNDA.mov → nova SEGUNDA (CRT)']);
    const d = conferido(r, { 2: { arte: ' Hoje ' }, 3: { tipo: 'LETT' }, 5: { arte: 'domingo' } }, acervo);
    expect(resumo(d.linhas)).toEqual(['CRT - HOJ.mov → ja Hoje (CRT)', 'RDP - PLATEIA.mov → completa PLATEIA (LETT)', 'CRT - DOMINGO.mov → nova DOMINGO (CRT)', 'CRT - SEGUNDA.mov → copia domingo (CRT)']);
    expect(mudou(d.linhas[0] as LinhaComRegras)).toEqual(['HOJ → Hoje · à mão']);
    expect(d.linhas[3].motivo).toBe('a mesma arte da linha 4 (CRT - DOMINGO.mov)');
  });

  it('o nome apagado volta ao do arquivo; o tipo apagado fica para decidir; o que não é opção do campo também', () => {
    const d = conferido(r, { 2: { arte: '  ' }, 4: { tipo: '' }, 5: { tipo: 'VNH' } }, acervo);
    expect(d.linhas.map((l) => [l.estado, l.arte, l.motivo])).toEqual([
      ['nova', 'HOJ', ''],
      ['completa', 'PLATEIA', '“PLATEIA” estava sem tipo'],
      ['decidir', 'DOMINGO', 'Falta o tipo.'],
      ['decidir', 'SEGUNDA', 'VNH não é tipo do acervo.'],
    ]);
    expect(d.faltam).toBe(2);
  });

  it('a linha tirada fica fora, e a edição de quem confere responde ao acento', () => {
    const grafias = { roteiros: ['MÁRCIA UM', 'MÁRCIA DOIS'] };
    const comAcento = classificar({ csv: csv('RDP - MARCIA DO VALE.mov', 'RDP - MARCIA DA SERRA.mov'), acervo: [], tipos: TIPOS, grafias });
    const d = conferido(comAcento, { 2: { arte: 'MÁRCIA DO VALLE' }, 3: { tirada: true } });
    expect(d.linhas.map((l) => [l.estado, l.arte, l.motivo])).toEqual([
      ['nova', 'MÁRCIA DO VALLE', ''],
      ['fora', 'MARCIA DA SERRA', 'tirada da importação'],
    ]);
    expect(d.faltam).toBe(0);
  });
});

describe('as decisões em lote (#60)', () => {
  const grafias = { roteiros: ['MÁRCIA UM', 'MÁRCIA DOIS', 'JOÃO TRÊS', 'JOÃO QUATRO'] };
  const r = classificar({
    csv: csv('RDP - MARCIA DO VALE.mov', 'RDP - JOAO PEDREIRA.mov', 'COMP - ABERTURA EP 12.mov', 'COMP - ENCERRAMENTO EP 12.mov', 'VNH - ABERTURA.mov', 'CRT - HOJE.mov', 'CRT - DOMINGO.mov'),
    acervo: [],
    tipos: TIPOS,
    grafias,
  });
  const lote = (escolhas: Escolhas, acao: Parameters<typeof emLote>[2]) => emLote(conferido(r, escolhas).linhas, escolhas, acao);

  it('aceitar todos os acentos sugeridos', () => {
    expect(r.faltam).toBe(5);
    const escolhas = lote({ 3: { respostas: { acento: 'como-esta' } } }, { acentos: true });
    expect(conferido(r, escolhas).linhas.slice(0, 2).map((l) => l.arte)).toEqual(['MÁRCIA DO VALE', 'JOAO PEDREIRA']); // a que já tinha resposta fica
    expect(conferido(r, escolhas).faltam).toBe(3);
  });

  it('deixar fora todas com uma sigla', () => {
    const d = conferido(r, lote({}, { siglaFora: 'COMP' }));
    expect(d.linhas.slice(2, 5).map((l) => [l.nome, l.estado])).toEqual([
      ['COMP - ABERTURA EP 12.mov', 'fora'],
      ['COMP - ENCERRAMENTO EP 12.mov', 'fora'],
      ['VNH - ABERTURA.mov', 'decidir'],
    ]);
  });

  it('dar um tipo às marcadas e tirar as marcadas', () => {
    const comTipo = lote({ 4: { respostas: { sigla: 'fora' } } }, { tipo: 'LETT', ns: [4, 5, 6] });
    expect(resumo(conferido(r, comTipo).linhas).slice(2, 6)).toEqual([
      'COMP - ABERTURA EP 12.mov → fora ABERTURA EP 12 (LETT)', // a resposta "fica fora" continua valendo
      'COMP - ENCERRAMENTO EP 12.mov → nova ENCERRAMENTO EP 12 (LETT)',
      'VNH - ABERTURA.mov → nova ABERTURA (LETT)',
      'CRT - HOJE.mov → nova HOJE (CRT)',
    ]);
    const tiradas = lote(comTipo, { tirar: true, ns: [7, 8] });
    expect(conferido(r, tiradas).linhas.slice(5).map((l) => [l.estado, l.motivo])).toEqual([
      ['fora', 'tirada da importação'],
      ['fora', 'tirada da importação'],
    ]);
  });
});

/* ---------- as regras desta atração (#63): as decisões lembradas para as próximas ---------- */

describe('as regras desta atração (#63): aplicadas na prévia', () => {
  it('as regras no formato das cargas à mão (trocas, ignorar, versões, cópias, semSigla) valem na prévia, e a linha diz "regra desta atração"', () => {
    const regras = {
      trocas: [
        { re: '\\bDP\\b', por: 'DAQUI A POUCO', motivo: 'DP = DAQUI A POUCO' },
        { re: '^DIA 5$', por: 'DIA 05', motivo: 'o roteiro escreve DIA 05', fixo: true },
      ],
      ignorar: [{ re: '^COMP - ', motivo: 'COMP não é tipo do acervo: fica fora' }],
      versoes: ['\\s+(B)$'],
      copias: ['\\s+copy$'],
      semSigla: [{ re: '^ABERTURA\\b', tipo: 'LETT' }],
    };
    const r = classificar({
      csv: csv('CRT - DP.mov', 'CRT - DP 3 00.mov', 'CRT - DIA 5.mov', 'COMP - VINHETA EP 12.mov', 'RDP - CANTORA.mov', 'RDP - CANTORA B.mov', 'RDP - CANTORA copy.mov', 'ABERTURA DO PROGRAMA.mov'),
      acervo: [],
      tipos: TIPOS,
      regras,
    });
    expect(resumo(r.linhas)).toEqual([
      'CRT - DP.mov → nova DAQUI A POUCO (CRT)',
      'CRT - DP 3 00.mov → nova DAQUI A POUCO 3:00 (CRT)',
      'CRT - DIA 5.mov → nova DIA 05 (CRT)',
      'COMP - VINHETA EP 12.mov → fora',
      'RDP - CANTORA.mov → nova CANTORA (RDP)',
      'RDP - CANTORA B.mov → copia CANTORA (RDP)',
      'RDP - CANTORA copy.mov → copia CANTORA (RDP)',
      'ABERTURA DO PROGRAMA.mov → nova ABERTURA DO PROGRAMA (LETT)',
    ]);
    expect(r.linhas[0].mudancas).toEqual([{ antes: 'DP', depois: 'DAQUI A POUCO', regra: 'regra desta atração', daAtracao: true }]);
    expect(mudou(r.linhas[1] as LinhaComRegras)).toEqual(['DP → DAQUI A POUCO · regra desta atração', '3 00 → 3:00 · hora']);
    expect(r.linhas[3].motivo).toBe('COMP não é tipo do acervo: fica fora · regra desta atração');
    expect([r.linhas[5].versao, mudou(r.linhas[5] as LinhaComRegras)]).toEqual(['B', ['B →  · versão · regra desta atração']]);
    expect(mudou(r.linhas[6] as LinhaComRegras)).toEqual(['copy →  · cópia · regra desta atração']);
    expect(mudou(r.linhas[7] as LinhaComRegras)).toEqual(['sem “SIGLA - ” → LETT · tipo · regra desta atração']);
    expect(r.placar.decidir).toBe(0);
  });

  it('a regra com o tipo fora do campo, ou a expressão inválida, não vale', () => {
    const r = classificar({ csv: csv('ABERTURA DO PROGRAMA.mov', 'CRT - DP.mov'), acervo: [], tipos: TIPOS, regras: { semSigla: [{ re: '^ABERTURA', tipo: 'VNH' }], trocas: [{ re: '(', por: 'X' }] } });
    expect(resumo(r.linhas)).toEqual(['ABERTURA DO PROGRAMA.mov → fora', 'CRT - DP.mov → nova DP (CRT)']);
  });
});

describe('as regras desta atração (#63): as decisões da conferência viram regras', () => {
  /** A conferência decidida → as regras → a próxima prévia do mesmo CSV, já com as regras. */
  const lembrado = (texto: string, escolhas: Escolhas, { acervo = [] as { id: string; arte: string; tipo: string }[], grafias = {} } = {}) => {
    const decidido = classificar({ csv: texto, acervo, tipos: TIPOS, grafias, escolhas });
    const regras = regrasDasDecisoes({ linhas: decidido.linhas, escolhas });
    return { regras, decidido, proxima: classificar({ csv: texto, acervo, tipos: TIPOS, grafias, regras: comoRegras(regras) }) };
  };
  const semMotivo = (regras: RegraLembrada[]) => regras.map(({ motivo, ...r }) => r);

  it('a abreviação da casa editada na linha (DP, JH) vira a troca da palavra; a próxima prévia já escreve por extenso', () => {
    const { regras, proxima } = lembrado(csv('CRT - DP.mov', 'CRT - DEPOIS DO JH.mov', 'RDP - DIA 5.mov'), { 2: { arte: 'DAQUI A POUCO' }, 3: { arte: 'DEPOIS DO JORNAL HOJE' }, 4: { arte: 'DIA 05' } });
    expect(semMotivo(regras)).toEqual([
      { tipo: 'troca', re: '\\bDP\\b', por: 'DAQUI A POUCO' },
      { tipo: 'troca', re: '\\bJH\\b', por: 'JORNAL HOJE' },
      { tipo: 'troca', re: '^DIA 5$', por: 'DIA 05', fixo: true },
    ]);
    expect(regras.map((r) => r.motivo)).toEqual(['DP = DAQUI A POUCO', 'JH = JORNAL HOJE', 'DIA 5 → DIA 05']);
    expect(resumo(proxima.linhas)).toEqual(['CRT - DP.mov → nova DAQUI A POUCO (CRT)', 'CRT - DEPOIS DO JH.mov → nova DEPOIS DO JORNAL HOJE (CRT)', 'RDP - DIA 5.mov → nova DIA 05 (RDP)']);
    // a troca da palavra vale para outro arquivo da atração
    expect(resumo(classificar({ csv: csv('RDP - ANTES DO JH.mov'), tipos: TIPOS, regras: comoRegras(regras) }).linhas)).toEqual(['RDP - ANTES DO JH.mov → nova ANTES DO JORNAL HOJE (RDP)']);
  });

  it('a versão própria da atração (a letra ou o número que sai do fim na edição) vira a versão: a letra vale para toda arte, o número só para aquela', () => {
    const { regras, proxima } = lembrado(csv('CRT - HOJE.mov', 'CRT - HOJE B.mov', 'CRT - AMANHA.mov', 'CRT - AMANHA 2.mov'), { 3: { arte: 'HOJE' }, 5: { arte: 'AMANHÃ' } });
    expect(semMotivo(regras)).toEqual([
      { tipo: 'versao', re: '\\s+(B)$' },
      { tipo: 'versao', re: '(?<=^AMANHA)\\s+(2)$' },
    ]);
    expect(proxima.linhas.map((l) => [l.estado, l.arte, l.versao])).toEqual([
      ['nova', 'HOJE', ''],
      ['copia', 'HOJE', 'B'],
      ['nova', 'AMANHÃ', ''],
      ['copia', 'AMANHÃ', '2'],
    ]);
    expect(resumo(classificar({ csv: csv('CRT - DOMINGO B.mov', 'CRT - DIA 2.mov'), tipos: TIPOS, regras: comoRegras(regras) }).linhas)).toEqual(['CRT - DOMINGO B.mov → nova DOMINGO (CRT)', 'CRT - DIA 2.mov → nova DIA 2 (CRT)']);
  });

  it('o erro no arquivo ("é a mesma") e o nome editado viram a troca do nome inteiro; o nome errado do acervo corrigido também', () => {
    const acervo = [
      { id: 'recBanda', arte: 'BANDA MAR ABERTO', tipo: 'RDP' },
      { id: 'recSorisso', arte: 'SORISSO FICTICIO', tipo: 'RDP' },
    ];
    const { regras, proxima } = lembrado(csv('RDP - BANDA MAR ABERTTO.mov', 'RDP - SORRISO FICTICIO.mov', 'RDP - MARVILA.mov'), { 2: { respostas: { parecida: 'mesma' } }, 3: { respostas: { parecida: 'corrigir' } }, 4: { arte: 'MARVVILA' } }, { acervo, grafias: { roteiros: ['SORRISO FICTÍCIO'] } });
    expect(semMotivo(regras)).toEqual([
      { tipo: 'troca', re: '^BANDA MAR ABERTTO$', por: 'BANDA MAR ABERTO', fixo: true },
      { tipo: 'troca', re: '^SORISSO FICTICIO$', por: 'SORRISO FICTÍCIO', fixo: true },
      { tipo: 'troca', re: '^MARVILA$', por: 'MARVVILA', fixo: true },
    ]);
    expect(resumo(proxima.linhas)[0]).toBe('RDP - BANDA MAR ABERTTO.mov → ja BANDA MAR ABERTO (RDP)');
    expect(resumo(proxima.linhas)[2]).toBe('RDP - MARVILA.mov → nova MARVVILA (RDP)');
    // o arquivo com o nome que estava errado no acervo vem já certo
    expect(resumo(classificar({ csv: csv('RDP - SORISSO FICTICIO.mov'), tipos: TIPOS, regras: comoRegras(regras) }).linhas)).toEqual(['RDP - SORISSO FICTICIO.mov → nova SORRISO FICTÍCIO (RDP)']);
  });

  it('"é outra arte" não vira regra: gravada, a arte já está no acervo e não pergunta de novo', () => {
    const acervo = [{ id: 'recBanda', arte: 'BANDA MAR ABERTO', tipo: 'RDP' }];
    expect(lembrado(csv('RDP - BANDA MAR ABERTTO.mov'), { 2: { respostas: { parecida: 'outra' } } }, { acervo }).regras).toEqual([]);
  });

  it('o acento (o sugerido ou como está) e o rodapé composto importado viram a troca fixa do nome: a próxima não pergunta', () => {
    const grafias = { roteiros: ['MÁRCIA UM', 'MÁRCIA DOIS', 'MÁRCIA TRÊS'] };
    const { regras, proxima } = lembrado(csv('RDP - MARCIA DO VALE.mov', 'RDP - MARCIA LUZ.mov', 'RDP - ANA LUZ E BENTO LUZ.mov'), { 2: { respostas: { acento: 'sugerido' } }, 3: { respostas: { acento: 'como-esta' } }, 4: { respostas: { composto: 'importar' } } }, { grafias });
    expect(semMotivo(regras)).toEqual([
      { tipo: 'troca', re: '^MARCIA DO VALE$', por: 'MÁRCIA DO VALE', fixo: true },
      { tipo: 'troca', re: '^MARCIA LUZ$', por: 'MARCIA LUZ', fixo: true },
      { tipo: 'troca', re: '^ANA LUZ E BENTO LUZ$', por: 'ANA LUZ E BENTO LUZ', fixo: true },
    ]);
    expect(resumo(proxima.linhas)).toEqual(['RDP - MARCIA DO VALE.mov → nova MÁRCIA DO VALE (RDP)', 'RDP - MARCIA LUZ.mov → nova MARCIA LUZ (RDP)', 'RDP - ANA LUZ E BENTO LUZ.mov → nova ANA LUZ E BENTO LUZ (RDP)']);
    expect(mudou(proxima.linhas[1] as LinhaComRegras)).toEqual(['MARCIA LUZ → MARCIA LUZ · regra desta atração']);
  });

  it('a sigla que não é tipo: todas fora vira ignorar a sigla; todas com o mesmo tipo vira semSigla; dividida, a regra é de cada arquivo', () => {
    const fora = lembrado(csv('COMP - ABERTURA EP 12.mov', 'COMP - ENCERRAMENTO EP 12.mov'), { 2: { respostas: { sigla: 'fora' } }, 3: { respostas: { sigla: 'fora' } } });
    expect(semMotivo(fora.regras)).toEqual([{ tipo: 'ignorar', re: '^\\s*COMP\\s+-\\s+' }]);
    expect(fora.regras[0].motivo).toBe('COMP não é tipo do acervo: fica fora');
    expect(resumo(classificar({ csv: csv('COMP - OUTRA EP 13.mov', 'COMP  -  OUTRA EP 14.mov'), tipos: TIPOS, regras: comoRegras(fora.regras) }).linhas)).toEqual(['COMP - OUTRA EP 13.mov → fora', 'COMP  -  OUTRA EP 14.mov → fora']);
    const comTipo = lembrado(csv('VNH - ABERTURA.mov', 'VNH - ENCERRAMENTO.mov'), { 2: { tipo: 'LETT' }, 3: { tipo: 'LETT' } });
    expect(semMotivo(comTipo.regras)).toEqual([{ tipo: 'semSigla', re: '^\\s*VNH\\s+-\\s+', tipoDaArte: 'LETT' }]);
    expect(resumo(comTipo.proxima.linhas)).toEqual(['VNH - ABERTURA.mov → nova ABERTURA (LETT)', 'VNH - ENCERRAMENTO.mov → nova ENCERRAMENTO (LETT)']);
    const dividida = lembrado(csv('COMP - ABERTURA.mov', 'COMP - VINHETA.mov'), { 2: { respostas: { sigla: 'fora' } }, 3: { tipo: 'CRT' } });
    expect(semMotivo(dividida.regras)).toEqual([
      { tipo: 'ignorar', re: '^COMP - ABERTURA$' },
      { tipo: 'semSigla', re: '^COMP - VINHETA$', tipoDaArte: 'CRT' },
    ]);
    expect(resumo(dividida.proxima.linhas)).toEqual(['COMP - ABERTURA.mov → fora', 'COMP - VINHETA.mov → nova VINHETA (CRT)']);
  });

  it('o tipo do começo do nome confirmado (ou trocado), o tipo trocado na linha e a linha tirada ou fora viram a regra do arquivo', () => {
    const { regras, proxima } = lembrado(csv('MOLDURA VIDEO.png', 'FOTO PALCO NOVO.png', 'CRT - PLATEIA.mov', 'CRT - VINHETA 1.mov', 'RDP - ANA LUZ E BENTO LUZ.mov', 'MOLDURA AZUL.png'), {
      2: { respostas: { tipoDoNome: 'confirmar' } },
      3: { tipo: 'LETT' },
      4: { tipo: 'LETT' },
      5: { tirada: true },
      6: { respostas: { composto: 'fora' } },
      7: { respostas: { tipoDoNome: 'fora' } },
    });
    expect(semMotivo(regras)).toEqual([
      { tipo: 'semSigla', re: '^MOLDURA VIDEO$', tipoDaArte: 'MOLDURA' },
      { tipo: 'semSigla', re: '^FOTO PALCO NOVO$', tipoDaArte: 'LETT' },
      { tipo: 'tipo', re: '^CRT - PLATEIA$', tipoDaArte: 'LETT' },
      { tipo: 'ignorar', re: '^CRT - VINHETA 1$' },
      { tipo: 'ignorar', re: '^RDP - ANA LUZ E BENTO LUZ$' },
      { tipo: 'ignorar', re: '^MOLDURA AZUL$' },
    ]);
    expect(regras.map((r) => r.motivo)).toEqual(['MOLDURA VIDEO é MOLDURA', 'FOTO PALCO NOVO é LETT', 'CRT - PLATEIA é LETT', 'CRT - VINHETA 1 fica fora (tirada da importação)', 'RDP - ANA LUZ E BENTO LUZ fica fora', 'MOLDURA AZUL fica fora']);
    expect(resumo(proxima.linhas)).toEqual([
      'MOLDURA VIDEO.png → nova MOLDURA VÍDEO (MOLDURA)',
      'FOTO PALCO NOVO.png → nova FOTO PALCO NOVO (LETT)',
      'CRT - PLATEIA.mov → nova PLATEIA (LETT)',
      'CRT - VINHETA 1.mov → fora',
      'RDP - ANA LUZ E BENTO LUZ.mov → fora',
      'MOLDURA AZUL.png → fora',
    ]);
    expect(mudou(proxima.linhas[2] as LinhaComRegras)).toEqual(['tipo CRT → LETT · regra desta atração']);
    expect(proxima.faltam).toBe(0);
  });

  it('sem escolha, nada vira regra; a regra que já valeu não se repete', () => {
    const regras = { trocas: [{ re: '\\bDP\\b', por: 'DAQUI A POUCO' }] };
    const r = classificar({ csv: csv('CRT - DP.mov', 'CRT - HOJE.mov'), tipos: TIPOS, regras });
    expect(regrasDasDecisoes({ linhas: r.linhas, escolhas: {} })).toEqual([]);
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
  TEABLE_PG_ARTE: 'producao',
};
const PROGRAMA = { id: 'recProg', title: 'Programa Fictício' };
type LinhaDoTeable = { id: string; arte: string; tipo: string | null; atracao: { id: string; title: string }[]; claquete: unknown[]; filme: null | { id: string; title: string }; modificado?: string };
type Pedido = { metodo: string; url: string; corpo: null | { typecast?: boolean; records: { id?: string; fields: Record<string, unknown> }[] } };

/** O Teable de mentira: o Postgres (o acervo, que muda com o que a API grava, e as atrações) e a API (os campos e os
    registros). Cada linha tem a data de modificação do Teable (__last_modified_time), que muda a cada gravação: pela
    API ou por alguém mexendo no Teable (mexer). falharNo: o pedido de escrita (1, 2…) que dá timeout. */
function teableFalso() {
  const linhas: LinhaDoTeable[] = [
    { id: 'recA1', arte: 'AMANHÃ DEPOIS DO SHOW', tipo: 'CRT', atracao: [PROGRAMA], claquete: [], filme: null },
    { id: 'recA2', arte: 'PLATEIA', tipo: null, atracao: [PROGRAMA], claquete: [], filme: null },
    { id: 'recA3', arte: 'SÁBADO', tipo: 'RDP', atracao: [PROGRAMA], claquete: [], filme: null },
    { id: 'recOutra', arte: 'HOJE', tipo: 'RDP', atracao: [{ id: 'recNovela', title: 'Novela Fictícia' }], claquete: [], filme: null },
    { id: 'recDoFilme', arte: 'SESSÃO ÍNTIMA', tipo: 'CRT', atracao: [], claquete: [], filme: { id: 'recFilme', title: 'Filme Fictício' } },
  ];
  const atracoes = [
    { id: 'recProg', atracao: 'Programa Fictício', acervo: 'próprio' },
    { id: 'recNovela', atracao: 'Novela Fictícia', acervo: null },
    { id: 'recSessao', atracao: 'Sessão Fictícia', acervo: 'do filme' },
    { id: 'recShows', atracao: 'Shows Fictícios', acervo: 'sem acervo' },
  ];
  // a produção da arte: as artes de cada roteiro enviado ("A | B", a de dois tipos uma vez por tipo), com a atração
  const roteiros = [
    { atracao: JSON.stringify([PROGRAMA]), artes: 'VEM AÍ (RDP) | VEM AÍ (LETT) | PLATEIA' },
    { atracao: [{ id: 'recNovela', title: 'Novela Fictícia' }], artes: 'VEM AÍ! | JOÃO FICTÍCIO' },
    { atracao: null, artes: null },
  ];
  const leituras = { acervo: 0 };
  const consultar = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('"bseBase"."acervo"')) return leituras.acervo++, linhas.map((l) => ({ ...l }));
    if (sql.includes('"bseBase"."producao"')) return roteiros;
    if (sql.includes('"atracoes"') && sql.includes('"acervo"')) return atracoes;
    if (sql.includes('"atracoes"')) return atracoes.filter((a) => a.atracao.toLowerCase() === String(params[0]).toLowerCase()).map(({ id }) => ({ id }));
    return [];
  };
  const pedidos: Pedido[] = [];
  let novas = 0;
  let relogio = 0;
  const carimbo = () => new Date(Date.UTC(2026, 10, 20, 12, 0, relogio++)).toISOString();
  for (const l of linhas) l.modificado = carimbo();
  /** Alguém mexe na linha direto no Teable: muda o campo e a data de modificação. */
  const mexer = (id: string, campos: Partial<LinhaDoTeable>) => Object.assign(linhas.find((l) => l.id === id)!, campos, { modificado: carimbo() });
  const falha = { no: 0, escritas: 0, gravou: false };
  const buscar = async (url: string, init: RequestInit = {}) => {
    const pedido: Pedido = { metodo: init.method ?? 'GET', url, corpo: init.body ? JSON.parse(String(init.body)) : null };
    pedidos.push(pedido);
    const falhar = pedido.metodo !== 'GET' && ++falha.escritas === falha.no;
    if (falhar && !falha.gravou) throw new Error('The operation was aborted due to timeout');
    let resposta: unknown = {};
    if (url.endsWith('/api/table/tblAcervo/field'))
      resposta = [
        { id: 'fldArte', name: 'arte', type: 'singleLineText' },
        { id: 'fldTipo', name: 'tipo', type: 'singleSelect', options: { choices: ['CRT', 'RDP', 'LETT', 'FOTO', 'LOGO', 'LOGO GLOBO'].map((name, i) => ({ id: `cho${i}`, name })) } },
      ];
    else if (pedido.metodo === 'POST')
      resposta = {
        records: pedido.corpo!.records.map((r) => {
          const nova = { id: `recNova${++novas}`, arte: String(r.fields.arte), tipo: (r.fields.tipo as string) ?? null, atracao: [PROGRAMA], claquete: [], filme: null, modificado: carimbo() };
          linhas.push(nova);
          return { id: nova.id, fields: r.fields };
        }),
      };
    else if (pedido.metodo === 'PATCH') for (const r of pedido.corpo!.records) Object.assign(linhas.find((l) => l.id === r.id)!, r.fields, { modificado: carimbo() });
    else if (pedido.metodo === 'DELETE')
      for (const [, id] of [...new URL(url).searchParams].filter(([k]) => /^recordIds\[\d+\]$/.test(k))) {
        const i = linhas.findIndex((l) => l.id === id);
        if (i >= 0) linhas.splice(i, 1);
      }
    if (falhar) throw new Error('The operation was aborted due to timeout'); // gravou, mas a resposta não chegou
    return { ok: true, status: 200, json: async () => resposta, text: async () => '' };
  };
  return { linhas, consultar, buscar, pedidos, leituras, mexer, falharNo: (n: number, { gravou = false } = {}) => Object.assign(falha, { no: n, escritas: 0, gravou }) };
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
      expect(previa.placar).toEqual({ nova: 2, completa: 1, corrige: 0, ja: 1, copia: 1, fora: 1, decidir: 1 });
      // o acervo da atração vai junto: a tela confere de novo a cada escolha, contra ele
      expect(previa.acervo).toEqual([
        { id: 'recA1', arte: 'AMANHÃ DEPOIS DO SHOW', tipo: 'CRT' },
        { id: 'recA2', arte: 'PLATEIA', tipo: '' },
        { id: 'recA3', arte: 'SÁBADO', tipo: 'RDP' },
      ]);
      expect(resumo(previa.linhas)).toEqual([
        'CRT - AMANHA DEPOIS DO SHOW.mov → ja AMANHÃ DEPOIS DO SHOW (CRT)',
        'RDP - PLATEIA.mov → completa PLATEIA (RDP)',
        'LETT - VEM AI.mov → nova VEM AÍ (LETT)',
        'RDP - VEM AI - Copy.mov → copia VEM AÍ (RDP)',
        'RDP - VEM AI.mov → nova VEM AÍ (RDP)',
        '_ARQUIVOS VELHOS → fora',
        'COMP - ABERTURA.mov → decidir ABERTURA',
      ]);
    });
  });
});

describe('a prévia com as regras de conversão (#59)', () => {
  it('a grafia vem do acervo da atração, dos roteiros dela, dos roteiros de todas e do acervo de todas, nessa ordem', async () => {
    await comServidor(async ({ como }) => {
      const texto = csv('RDP - VEM AI.mov', 'CRT - JOAO FICTICIO.mov', 'RDP - HOJE 3 00.mov', 'RDP - HOJE 3 00 VERT.mov', 'CRT - PROX SABADO.mov', 'CRT - SESSAO INTIMA.mov');
      const r = await como(CHEFE)('/api/acervo/importar/previa', { atracao: 'Programa Fictício', arquivo: 'x.csv', csv: texto });
      expect(r.status).toBe(200);
      const previa = await r.json();
      expect(previa.linhas.map((l: LinhaComRegras) => [l.arte, l.estado, mudou(l)])).toEqual([
        ['VEM AÍ', 'nova', ['VEM AI → VEM AÍ · grafia dos roteiros da atração']], // o "(RDP)" do envio não é o texto
        ['JOÃO FICTÍCIO', 'nova', ['JOAO FICTICIO → JOÃO FICTÍCIO · grafia dos roteiros']],
        ['HOJE 3:00', 'nova', ['3 00 → 3:00 · hora']],
        ['HOJE 3:00', 'copia', ['VERT →  · versão', '3 00 → 3:00 · hora']],
        ['PRÓXIMO SÁBADO', 'nova', ['PROX → PRÓXIMO · abreviação', 'SABADO → SÁBADO · acento']],
        ['SESSÃO ÍNTIMA', 'nova', ['SESSAO INTIMA → SESSÃO ÍNTIMA · grafia do acervo']],
      ]);
      expect(previa.placar).toEqual({ nova: 5, completa: 0, corrige: 0, ja: 0, copia: 1, fora: 0, decidir: 0 });
    });
  });
});

describe('quem importa e onde', () => {
  const corpoDaPrevia = (atracao: string) => ({ atracao, arquivo: 'x.csv', csv: csv('RDP - VEM AI.mov') });
  const corpoDoGravar = (atracao: string) => ({ atracao, arquivo: 'x.csv', csv: csv('RDP - VEM AI.mov'), escolhas: {} });

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
  type Como = (email: string) => (caminho: string, corpo?: unknown) => Promise<Response>;
  /** Grava o CSV com as escolhas da conferência: o servidor classifica de novo, contra o acervo relido. */
  const gravar = (como: Como, texto: string, escolhas: Escolhas = {}) => como(CHEFE)('/api/acervo/importar', { atracao: 'Programa Fictício', arquivo: 'PROGRAMA_SERVICO.csv', csv: texto, escolhas });
  const escritas = (teable: ReturnType<typeof teableFalso>) => teable.pedidos.filter((p) => p.metodo !== 'GET');

  it('cria as novas ligadas à atração, dá o tipo à que estava sem, e devolve o resumo antes → depois', async () => {
    await comServidor(async ({ como, teable }) => {
      const r = await gravar(como, csv('LETT - VEM AI.mov', 'RDP - VEM AI.mov', 'RDP - PLATEIA.mov', 'CRT - AMANHA DEPOIS DO SHOW.mov'));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ antes: 3, depois: 5, novas: 2, ganharamTipo: 1, renomeadas: [], semMudanca: 1, importacao: expect.any(String), lembradas: 0 });
      const post = teable.pedidos.filter((p) => p.metodo === 'POST');
      expect(post).toHaveLength(1);
      expect(post[0].url).toBe('http://teable:3000/api/table/tblAcervo/record');
      expect(post[0].corpo!.typecast).toBe(false); // o tipo já foi conferido contra as opções do campo
      expect(post[0].corpo!.records.map((x) => x.fields)).toEqual([
        { arte: 'VEM AÍ', tipo: 'LETT', atracao: [{ id: 'recProg' }] },
        { arte: 'VEM AÍ', tipo: 'RDP', atracao: [{ id: 'recProg' }] },
      ]);
      expect(teable.pedidos.filter((p) => p.metodo === 'PATCH').map((p) => p.corpo!.records)).toEqual([[{ id: 'recA2', fields: { tipo: 'RDP' } }]]);
    });
  });

  it('as escolhas da conferência valem: o nome e o tipo editados, a linha tirada, a resposta "fica fora"', async () => {
    await comServidor(async ({ como, teable }) => {
      const texto = csv('RDP - VEM AI.mov', 'CRT - DOMINGO.mov', 'COMP - ABERTURA.mov', 'RDP - CONVIDADO.mov');
      const r = await gravar(como, texto, { 2: { arte: 'VEM AÍ!' }, 3: { tipo: 'LETT' }, 4: { respostas: { sigla: 'fora' } }, 5: { tirada: true } });
      expect(await r.json()).toMatchObject({ novas: 2, semMudanca: 2 });
      expect(escritas(teable).flatMap((p) => p.corpo!.records.map((x) => `${x.fields.arte} (${x.fields.tipo})`))).toEqual(['VEM AÍ! (RDP)', 'DOMINGO (LETT)']);
    });
  });

  it('recusa gravar com decisão pendente, e nada é gravado', async () => {
    await comServidor(async ({ como, teable }) => {
      const texto = csv('COMP - ABERTURA.mov', 'COMP - VINHETA.mov', 'RDP - VEM AI.mov');
      const r = await gravar(como, texto, { 2: { respostas: { sigla: 'fora' } } });
      expect(r.status).toBe(422);
      expect((await r.json()).erro).toBe('Falta 1 decisão na conferência: nada foi gravado.');
      expect(escritas(teable)).toEqual([]);
      const decidido = await gravar(como, texto, { 2: { respostas: { sigla: 'fora' } }, 3: { tipo: 'CRT' } });
      expect(await decidido.json()).toMatchObject({ novas: 2 });
    });
  });

  it('"o do acervo está errado: corrigir" renomeia a mesma linha do acervo (mantém o id) e devolve o nome antigo', async () => {
    await comServidor(async ({ como, teable }) => {
      teable.linhas.push({ id: 'recSorisso', arte: 'SORISSO FICTICIO', tipo: 'RDP', atracao: [PROGRAMA], claquete: [], filme: null });
      const texto = csv('RDP - SORRISO FICTICIO.mov', 'CRT - PLATEIAS.mov');
      // sem a resposta, as duas perguntam
      expect((await (await como(CHEFE)('/api/acervo/importar/previa', { atracao: 'Programa Fictício', arquivo: 'x.csv', csv: texto })).json()).placar).toMatchObject({ decidir: 2 });
      const r = await gravar(como, texto, { 2: { respostas: { parecida: 'corrigir' } }, 3: { respostas: { parecida: 'corrigir' } } });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({
        antes: 4,
        depois: 4,
        novas: 0,
        ganharamTipo: 0,
        renomeadas: [
          { id: 'recSorisso', antes: 'SORISSO FICTICIO', depois: 'SORRISO FICTICIO' },
          { id: 'recA2', antes: 'PLATEIA', depois: 'PLATEIAS' },
        ],
        semMudanca: 0,
        importacao: expect.any(String),
        lembradas: 0,
      });
      expect(teable.pedidos.filter((p) => p.metodo === 'POST')).toEqual([]);
      expect(teable.pedidos.filter((p) => p.metodo === 'PATCH').map((p) => [p.corpo!.typecast, p.corpo!.records])).toEqual([
        [
          false,
          [
            { id: 'recSorisso', fields: { arte: 'SORRISO FICTICIO' } },
            { id: 'recA2', fields: { arte: 'PLATEIAS', tipo: 'CRT' } }, // estava sem tipo: ganha o da linha
          ],
        ],
      ]);
      expect(teable.linhas.filter((l) => ['recSorisso', 'recA2'].includes(l.id)).map((l) => [l.id, l.arte, l.tipo])).toEqual([
        ['recA2', 'PLATEIAS', 'CRT'],
        ['recSorisso', 'SORRISO FICTICIO', 'RDP'],
      ]);
    });
  });

  it('o cache do acervo é esquecido: a ficha lê o total novo logo depois', async () => {
    await comServidor(async ({ como }) => {
      const ficha = async () => (await (await como(CHEFE)('/api/acervo/atracao?atracao=Programa%20Fict%C3%ADcio')).json()).total;
      expect(await ficha()).toBe(3);
      await gravar(como, csv('LETT - VEM AI.mov'));
      expect(await ficha()).toBe(4);
    });
  });

  it('relê o acervo logo antes de gravar: o que entrou durante a conferência não duplica', async () => {
    await comServidor(async ({ como, teable }) => {
      // a prévia lê o acervo (e o guarda por 1 min); um envio grava VEM AÍ (RDP) no meio da conferência
      const texto = csv('RDP - VEM AI.mov', 'LETT - VEM AI.mov');
      await como(CHEFE)('/api/acervo/importar/previa', { atracao: 'Programa Fictício', arquivo: 'x.csv', csv: texto });
      teable.linhas.push({ id: 'recDoEnvio', arte: 'Vem aí', tipo: 'RDP', atracao: [PROGRAMA], claquete: [], filme: null });
      const r = await gravar(como, texto);
      expect(await r.json()).toEqual({ antes: 4, depois: 5, novas: 1, ganharamTipo: 0, renomeadas: [], semMudanca: 1, importacao: expect.any(String), lembradas: 0 });
      expect(teable.pedidos.filter((p) => p.metodo === 'POST').flatMap((p) => p.corpo!.records.map((x) => x.fields.tipo))).toEqual(['LETT']);
    });
  });

  it('o tipo que não é opção do campo tipo é recusado e nada é gravado (o typecast nunca cria opção nova)', async () => {
    await comServidor(async ({ como, teable }) => {
      const r = await gravar(como, csv('RDP - VEM AI.mov', 'COMP - ABERTURA.mov', 'COMP - ENCERRAMENTO.mov', 'CRT - VINHETA.mov'), { 3: { tipo: 'COMP' }, 4: { tipo: 'COMP' }, 5: { tipo: 'VNH' } });
      expect(r.status).toBe(422);
      expect((await r.json()).erro).toBe('Tipo que não está no campo tipo do acervo: COMP, VNH. Nada foi gravado.');
      expect(escritas(teable)).toEqual([]);
    });
  });

  it('grava em lotes de 100', async () => {
    await comServidor(async ({ como, teable }) => {
      const texto = csv(...Array.from({ length: 230 }, (_, i) => `RDP - CONVIDADO FICTICIO ${i + 1}.mov`));
      expect(await (await gravar(como, texto)).json()).toMatchObject({ antes: 3, depois: 233, novas: 230 });
      expect(teable.pedidos.filter((p) => p.metodo === 'POST').map((p) => p.corpo!.records.length)).toEqual([100, 100, 30]);
    });
  });

  it('o pedido malformado: sem o CSV, ou o CSV sem nada a gravar, não grava', async () => {
    await comServidor(async ({ como, teable }) => {
      const sem = await como(CHEFE)('/api/acervo/importar', { atracao: 'Programa Fictício', escolhas: {} });
      expect(sem.status).toBe(400);
      expect((await sem.json()).erro).toBe('O CSV veio vazio.');
      const nada = await gravar(como, csv('_PASTA', 'CRT - AMANHA DEPOIS DO SHOW.mov'), 'x' as unknown as Escolhas);
      // nada a gravar não entra no histórico
      expect(await nada.json()).toEqual({ antes: 3, depois: 3, novas: 0, ganharamTipo: 0, renomeadas: [], semMudanca: 2, importacao: null, lembradas: 0 });
      expect(escritas(teable)).toEqual([]);
    });
  });
});

describe('o histórico das importações e o desfazer (#61)', () => {
  type Como = (email: string) => (caminho: string, corpo?: unknown) => Promise<Response>;
  const gravar = (como: Como, texto: string, escolhas: Escolhas = {}, arquivo = 'PROGRAMA_SERVICO.csv') => como(CHEFE)('/api/acervo/importar', { atracao: 'Programa Fictício', arquivo, csv: texto, escolhas });
  const historico = async (como: Como, email = CHEFE) => (await (await como(email)('/api/acervo/importacoes?atracao=Programa%20Fict%C3%ADcio')).json()).importacoes;

  it('cada importação gravada fica no histórico da atração: quando, o arquivo, quem e +N', async () => {
    await comServidor(async ({ como }) => {
      const r = await gravar(como, csv('LETT - VEM AI.mov', 'RDP - VEM AI.mov', 'RDP - PLATEIA.mov'));
      const feito = await r.json();
      expect(feito).toMatchObject({ antes: 3, depois: 5, novas: 2, ganharamTipo: 1 });
      expect(feito.importacao).toEqual(expect.any(String));
      await gravar(como, csv('CRT - DOMINGO.mov'), {}, 'PROGRAMA_FOTOS.csv');
      const lista = await historico(como);
      // a mais nova primeiro
      expect(lista.map((i: { arquivo: string; por: string; novas: number; ganharamTipo: number; estado: string }) => [i.arquivo, i.por, i.novas, i.ganharamTipo, i.estado])).toEqual([
        ['PROGRAMA_FOTOS.csv', 'Chefe', 1, 0, 'gravada'],
        ['PROGRAMA_SERVICO.csv', 'Chefe', 2, 1, 'gravada'],
      ]);
      expect(lista[1]).toMatchObject({ id: feito.importacao, podeDesfazer: true });
      expect(Date.parse(lista[1].em)).toBeGreaterThan(Date.now() - 60_000);
      // o histórico é de cada atração
      expect((await (await como(CHEFE)('/api/acervo/importacoes?atracao=Novela%20Fict%C3%ADcia')).json()).importacoes).toEqual([]);
    });
  });

  const desfazer = (como: Como, id: string, email = CHEFE) => como(email)('/api/acervo/importacoes/desfazer', { id });
  const acervoDoPrograma = (teable: ReturnType<typeof teableFalso>) =>
    teable.linhas.filter((l) => l.atracao[0]?.id === 'recProg').map((l) => `${l.id} ${l.arte} (${l.tipo ?? ''})`).sort();

  it('desfazer apaga as criadas e devolve o tipo e o nome antigos: o acervo volta ao que era', async () => {
    await comServidor(async ({ como, teable }) => {
      teable.linhas.push({ id: 'recSorisso', arte: 'SORISSO FICTICIO', tipo: 'RDP', atracao: [PROGRAMA], claquete: [], filme: null });
      const antes = acervoDoPrograma(teable);
      const texto = csv('LETT - VEM AI.mov', 'RDP - VEM AI.mov', 'RDP - PLATEIA.mov', 'RDP - SORRISO FICTICIO.mov', 'CRT - PLATEIAS.mov');
      const feito = await (await gravar(como, texto, { 5: { respostas: { parecida: 'corrigir' } }, 6: { respostas: { parecida: 'outra' } } })).json();
      expect(feito).toMatchObject({ antes: 4, depois: 7, novas: 3, ganharamTipo: 1, renomeadas: [{ id: 'recSorisso', antes: 'SORISSO FICTICIO', depois: 'SORRISO FICTICIO' }] });
      expect(acervoDoPrograma(teable)).not.toEqual(antes);
      const r = await desfazer(como, feito.importacao);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ antes: 4, depois: 4, apagadas: 3, devolvidas: 2, naoVoltaram: [] });
      expect(acervoDoPrograma(teable)).toEqual(antes);
      // PLATEIA estava sem tipo: o tipo é apagado (null), e a gravação nunca cria opção
      expect(teable.pedidos.filter((p) => p.metodo === 'PATCH').at(-1)!.corpo).toMatchObject({ typecast: false, records: expect.arrayContaining([{ id: 'recA2', fields: { tipo: null } }]) });
      // no histórico, desfeita por quem; desfazer de novo é recusado
      const [h] = await historico(como);
      expect(h).toMatchObject({ estado: 'desfeita', podeDesfazer: false, desfeita: { por: 'Chefe', naoVoltaram: [] } });
      expect((await desfazer(como, feito.importacao)).status).toBe(409);
      // a ficha lê o total de volta
      expect((await (await como(CHEFE)('/api/acervo/atracao?atracao=Programa%20Fict%C3%ADcio')).json()).total).toBe(4);
    });
  });

  it('a linha que alguém mexeu no Teable depois da importação não volta, e o PROMeiro diz qual', async () => {
    await comServidor(async ({ como, teable }) => {
      teable.linhas.push({ id: 'recSorisso', arte: 'SORISSO FICTICIO', tipo: 'RDP', atracao: [PROGRAMA], claquete: [], filme: null });
      const texto = csv('LETT - VEM AI.mov', 'RDP - VEM AI.mov', 'RDP - PLATEIA.mov', 'RDP - SORRISO FICTICIO.mov');
      const feito = await (await gravar(como, texto, { 5: { respostas: { parecida: 'corrigir' } } })).json();
      const criada = teable.linhas.find((l) => l.arte === 'VEM AÍ' && l.tipo === 'LETT')!;
      // depois da importação: alguém corrige o tipo de uma criada e renomeia de novo a que foi corrigida
      teable.mexer(criada.id, { tipo: 'CRT' });
      teable.mexer('recSorisso', { arte: 'SORRISO FICTÍCIO' });
      const r = await desfazer(como, feito.importacao);
      expect(await r.json()).toEqual({
        antes: 4,
        depois: 5,
        apagadas: 1,
        devolvidas: 1,
        naoVoltaram: [
          { id: criada.id, arte: 'VEM AÍ', tipo: 'CRT', motivo: 'continua no acervo' },
          { id: 'recSorisso', arte: 'SORRISO FICTÍCIO', tipo: 'RDP', motivo: 'não voltou a “SORISSO FICTICIO”' },
        ],
      });
      expect(acervoDoPrograma(teable)).toEqual(['recA1 AMANHÃ DEPOIS DO SHOW (CRT)', 'recA2 PLATEIA ()', 'recA3 SÁBADO (RDP)', `${criada.id} VEM AÍ (CRT)`, 'recSorisso SORRISO FICTÍCIO (RDP)'].sort());
      // o aviso fica no histórico
      expect((await historico(como))[0].desfeita.naoVoltaram.map((x: { arte: string }) => x.arte)).toEqual(['VEM AÍ', 'SORRISO FICTÍCIO']);
    });
  });

  it('o prazo: até 7 dias depois desfaz; depois, não (nem aparece para desfazer no histórico)', async () => {
    await comServidor(async ({ como }) => {
      const feito = await (await gravar(como, csv('LETT - VEM AI.mov'))).json();
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 7 * 86_400_000 + 60_000 });
      try {
        expect((await historico(como))[0]).toMatchObject({ estado: 'gravada', podeDesfazer: false });
        const r = await desfazer(como, feito.importacao);
        expect(r.status).toBe(422);
        expect((await r.json()).erro).toBe('Passou o prazo: a importação só pode ser desfeita até 7 dias depois.');
      } finally {
        vi.useRealTimers();
      }
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 7 * 86_400_000 - 60_000 });
      try {
        expect((await historico(como))[0].podeDesfazer).toBe(true);
        expect(await (await desfazer(como, feito.importacao)).json()).toMatchObject({ apagadas: 1 });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('só administradores desfazem e retomam; os outros veem o histórico sem poder desfazer', async () => {
    await comServidor(async ({ como, teable }) => {
      const feito = await (await gravar(como, csv('LETT - VEM AI.mov'))).json();
      const ana = 'ana@empresa.com';
      expect((await historico(como, ana))[0]).toMatchObject({ arquivo: 'PROGRAMA_SERVICO.csv', podeDesfazer: false, podeRetomar: false });
      const r = await desfazer(como, feito.importacao, ana);
      expect(r.status).toBe(403);
      expect((await r.json()).erro).toBe('Só administradores desfazem a importação.');
      expect((await como(ana)('/api/acervo/importacoes/retomar', { id: feito.importacao })).status).toBe(403);
      expect(teable.pedidos.filter((p) => p.metodo === 'DELETE')).toEqual([]);
      expect((await desfazer(como, 'nao-existe')).status).toBe(404);
    });
  });

  const muitas = (n: number) => csv(...Array.from({ length: n }, (_, i) => `RDP - CONVIDADO FICTICIO ${i + 1}.mov`));
  const retomar = (como: Como, id: string) => como(CHEFE)('/api/acervo/importacoes/retomar', { id });

  it('a gravação interrompida num lote fica registrada até onde foi, e pode ser retomada', async () => {
    await comServidor(async ({ como, teable }) => {
      teable.falharNo(2); // o 2º lote dá timeout: só o 1º (100) entrou
      const r = await gravar(como, csv('RDP - PLATEIA.mov') + '\n' + muitas(230).split('\n').slice(1).join('\n'));
      expect(r.status).toBe(502);
      const { erro, importacao } = await r.json();
      expect(erro).toBe('A gravação parou no lote 2 de 4 (The operation was aborted due to timeout). O lote anterior ficou gravado: dá para desfazer ou retomar em Importações, na ficha.');
      expect(teable.linhas.length).toBe(5 + 100);
      expect((await historico(como))[0]).toMatchObject({ id: importacao, estado: 'interrompida', novas: 230, criadas: 100, ganharamTipo: 1, podeDesfazer: true, podeRetomar: true });
      teable.falharNo(0);
      const retomada = await retomar(como, importacao);
      expect(retomada.status).toBe(200);
      expect(await retomada.json()).toMatchObject({ antes: 3, depois: 233, novas: 230, ganharamTipo: 1, importacao });
      expect(teable.linhas.filter((l) => l.arte.startsWith('CONVIDADO')).length).toBe(230);
      expect(teable.linhas.find((l) => l.id === 'recA2')!.tipo).toBe('RDP');
      expect((await historico(como))[0]).toMatchObject({ estado: 'gravada', criadas: 230, podeRetomar: false });
      expect((await retomar(como, importacao)).status).toBe(409);
    });
  });

  it('o lote que gravou mas não respondeu (timeout) não duplica ao retomar, e o desfazer apaga também as dele', async () => {
    await comServidor(async ({ como, teable }) => {
      teable.falharNo(2, { gravou: true });
      const { importacao } = await (await gravar(como, muitas(230))).json();
      expect(teable.linhas.length).toBe(5 + 200); // o 2º lote entrou no Teable, mas os ids não chegaram
      expect((await historico(como))[0]).toMatchObject({ estado: 'interrompida', criadas: 100 });
      teable.falharNo(0);
      expect(await (await retomar(como, importacao)).json()).toMatchObject({ depois: 233 });
      expect(teable.linhas.filter((l) => l.arte.startsWith('CONVIDADO')).length).toBe(230);
      expect(teable.pedidos.filter((p) => p.metodo === 'POST').map((p) => p.corpo!.records.length)).toEqual([100, 100, 30]);
      expect(await (await desfazer(como, importacao)).json()).toMatchObject({ apagadas: 230, depois: 3, naoVoltaram: [] });
    });
  });

  it('a gravação interrompida também pode ser desfeita: apaga o que entrou, mesmo do lote sem resposta', async () => {
    await comServidor(async ({ como, teable }) => {
      teable.falharNo(2, { gravou: true });
      const { importacao } = await (await gravar(como, csv('RDP - PLATEIA.mov') + '\n' + muitas(230).split('\n').slice(1).join('\n'))).json();
      teable.falharNo(0);
      const r = await desfazer(como, importacao);
      // os 200 criados (100 com o id, 100 achados pela arte); a PLATEIA (no 4º lote) nunca ganhou o tipo: nada a devolver
      expect(await r.json()).toEqual({ antes: 3, depois: 3, apagadas: 200, devolvidas: 0, naoVoltaram: [] });
      expect(teable.linhas.length).toBe(5);
      expect((await historico(como))[0]).toMatchObject({ estado: 'desfeita', podeRetomar: false });
      expect((await retomar(como, importacao)).status).toBe(409);
    });
  });
});

describe('lembrar as decisões nas próximas desta atração (#63)', () => {
  type Como = (email: string) => (caminho: string, corpo?: unknown) => Promise<Response>;
  const ATRACAO = 'Programa Fictício';
  const gravar = (como: Como, texto: string, escolhas: Escolhas, lembrar?: boolean) =>
    como(CHEFE)('/api/acervo/importar', { atracao: ATRACAO, arquivo: 'PROGRAMA_SERVICO.csv', csv: texto, escolhas, ...(lembrar === undefined ? {} : { lembrar }) });
  const previa = async (como: Como, texto: string, atracao = ATRACAO) => (await (await como(CHEFE)('/api/acervo/importar/previa', { atracao, arquivo: 'DE_NOVO.csv', csv: texto })).json());
  const regras = async (como: Como, email = CHEFE, atracao = ATRACAO) => como(email)(`/api/acervo/regras?atracao=${encodeURIComponent(atracao)}`);
  const TEXTO = csv('CRT - DP.mov', 'COMP - ABERTURA EP 12.mov', 'CRT - VINHETA 1.mov', 'RDP - CONVIDADO.mov');
  const ESCOLHAS: Escolhas = { 2: { arte: 'DAQUI A POUCO' }, 3: { respostas: { sigla: 'fora' } }, 4: { tirada: true } };

  it('gravar com a opção guarda as decisões como regras da atração; a prévia seguinte já vem decidida e diz "regra desta atração"', async () => {
    await comServidor(async ({ como }) => {
      expect((await previa(como, TEXTO)).faltam).toBe(1);
      const r = await gravar(como, TEXTO, ESCOLHAS, true);
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ novas: 2, lembradas: 3 });
      const depois = await previa(como, TEXTO);
      expect(depois.faltam).toBe(0);
      expect(depois.linhas.map((l: Linha) => `${l.nome} → ${l.estado} ${l.arte} · ${l.motivo}`)).toEqual([
        'CRT - DP.mov → ja DAQUI A POUCO · “DAQUI A POUCO” (CRT)',
        'COMP - ABERTURA EP 12.mov → fora  · COMP não é tipo do acervo: fica fora · regra desta atração',
        'CRT - VINHETA 1.mov → fora  · CRT - VINHETA 1 fica fora (tirada da importação) · regra desta atração',
        'RDP - CONVIDADO.mov → ja CONVIDADO · “CONVIDADO” (RDP)',
      ]);
      expect(depois.linhas[0].mudancas).toEqual([{ antes: 'DP', depois: 'DAQUI A POUCO', regra: 'regra desta atração', daAtracao: true }]);
      // a regra é desta atração: a outra não a aplica
      const outra = await previa(como, csv('CRT - DP.mov'), 'Novela Fictícia');
      expect(outra.linhas[0].arte).toBe('DP');
    });
  });

  it('sem a opção, nada é guardado: a prévia seguinte pergunta de novo', async () => {
    await comServidor(async ({ como }) => {
      for (const lembrar of [undefined, false]) {
        const r = await gravar(como, csv('COMP - ABERTURA EP 12.mov', `RDP - CONVIDADO ${lembrar}.mov`), { 2: { respostas: { sigla: 'fora' } } }, lembrar);
        expect(await r.json()).toMatchObject({ novas: 1, lembradas: 0 });
      }
      expect((await previa(como, csv('COMP - ABERTURA EP 12.mov'))).faltam).toBe(1);
      expect((await (await regras(como)).json()).regras).toEqual([]);
    });
  });

  it('a gravação recusada (decisão pendente) não guarda nada', async () => {
    await comServidor(async ({ como }) => {
      const r = await gravar(como, csv('COMP - ABERTURA.mov', 'COMP - VINHETA.mov', 'CRT - DP.mov'), { 2: { respostas: { sigla: 'fora' } }, 4: { arte: 'DAQUI A POUCO' } }, true);
      expect(r.status).toBe(422);
      expect((await (await regras(como)).json()).regras).toEqual([]);
    });
  });

  it('"Regras desta atração": o administrador vê quem lembrou, quando e o que cada uma faz, e apaga a lembrada errada', async () => {
    await comServidor(async ({ como }) => {
      await gravar(como, TEXTO, ESCOLHAS, true);
      const lista = (await (await regras(como)).json()).regras;
      expect(lista.map((x: { tipo: string; motivo: string; quem: string }) => [x.tipo, x.motivo, x.quem])).toEqual([
        ['troca', 'DP = DAQUI A POUCO', 'Chefe'],
        ['ignorar', 'COMP não é tipo do acervo: fica fora', 'Chefe'],
        ['ignorar', 'CRT - VINHETA 1 fica fora (tirada da importação)', 'Chefe'],
      ]);
      expect(Date.parse(lista[0].em)).toBeGreaterThan(Date.now() - 60_000);
      // quem não é administrador não vê nem apaga
      expect((await regras(como, 'lia@empresa.com')).status).toBe(403);
      expect((await como('lia@empresa.com')('/api/acervo/regras/apagar', { id: lista[1].id })).status).toBe(403);
      // apagar a lembrada errada: a próxima prévia volta a perguntar
      const apagou = await como(CHEFE)('/api/acervo/regras/apagar', { id: lista[1].id });
      expect(apagou.status).toBe(200);
      expect((await (await regras(como)).json()).regras.map((x: { motivo: string }) => x.motivo)).toEqual(['DP = DAQUI A POUCO', 'CRT - VINHETA 1 fica fora (tirada da importação)']);
      expect((await previa(como, csv('COMP - ABERTURA EP 12.mov'))).faltam).toBe(1);
      expect((await como(CHEFE)('/api/acervo/regras/apagar', { id: lista[1].id })).status).toBe(404);
    });
  });

  it('decidir de novo o mesmo nome troca a regra, não junta outra', async () => {
    await comServidor(async ({ como }) => {
      await gravar(como, csv('CRT - DP.mov'), { 2: { arte: 'DEPOIS' } }, true);
      await gravar(como, csv('CRT - DP.mov'), { 2: { arte: 'DAQUI A POUCO' } }, true);
      expect((await (await regras(como)).json()).regras.map((x: { motivo: string }) => x.motivo)).toEqual(['DP = DAQUI A POUCO']);
    });
  });
});
