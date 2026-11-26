/*
 * Importação do acervo por CSV: o CSV exportado da pasta de output de uma atração (nome;caminho;criado em) vira as
 * artes do acervo dela, conferidas antes de gravar (ADR 0005). Este módulo é puro: lê o CSV, converte o nome de cada
 * arquivo numa arte (o texto e o tipo) e classifica a linha contra o acervo da atração. Quem lê o acervo e grava no
 * Teable é servidor/acervo.mjs.
 *
 * Estados de uma linha: nova · completa (a mesma arte está no acervo sem tipo: só ganha o tipo) · corrige (o nome
 * parecido que estava errado no acervo: a mesma linha é renomeada) · ja (a mesma arte e o mesmo tipo já estão lá) ·
 * copia (cópia de outro arquivo, versão da mesma arte ou a mesma arte repetida no CSV) · fora (pasta, nome fora do
 * padrão, a linha tirada ou decidida fora) · decidir (a pergunta para quem confere: a sigla que não é tipo, o tipo
 * tirado do começo do nome, o acento sugerido, o rodapé composto, o nome parecido com um do acervo).
 *
 * A conferência (#60) é o mesmo cálculo na prévia, na tela e no gravar: conferir aplica as escolhas de quem confere
 * (o nome e o tipo editados, as respostas, as linhas tiradas) e recalcula o estado pela chave. A tela importa este
 * módulo (os tipos estão em importacao-do-acervo.d.mts); por isso ele não depende de nada do servidor.
 *
 * As regras de conversão (#59) escrevem a arte como o roteiro escreve, nesta ordem: a versão sai do fim (D/E, VERT,
 * 6S), PROX vira PRÓXIMO/PRÓXIMA, a hora vira H:MM (pronta: o dia junto, o período no texto) ou, fora da hora, os
 * acentos do dicionário e a grafia da primeira fonte que tem a arte (o acervo da atração, os roteiros dela, os de todas,
 * o acervo de todas). Cada regra aplicada vira uma mudança { antes, depois, regra } da linha. As fontes chegam como
 * dados: quem as lê é servidor/acervo.mjs.
 */
import { chaveDeArte as chaveDoTexto } from '../src/modelo/diferencas.ts';

/** A chave da arte (a mesma do acervo e do envio), também do que vem vazio. */
const chaveDeArte = (texto) => chaveDoTexto(String(texto ?? ''));

/** CSV com ";" e aspas (aspas dobradas dentro do campo), BOM, CRLF ou LF; a primeira linha é o cabeçalho, com a coluna
    nome (sem ela, o erro diz o formato). Cada linha vem com o número dela no arquivo (o cabeçalho é a 1). */
export function lerCsv(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  let n = 1;
  let inicio = 1;
  const s = String(texto ?? '').replace(/^﻿/, '');
  const fechar = () => {
    linha.push(campo);
    campo = '';
    if (linha.some((x) => x.trim() !== '')) linhas.push({ n: inicio, campos: linha });
    linha = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') (campo += '"'), i++;
      else if (c === '"') aspas = false;
      else {
        if (c === '\n') n++;
        campo += c;
      }
    } else if (c === '"') aspas = true;
    else if (c === ';') linha.push(campo), (campo = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      fechar();
      inicio = ++n;
    } else campo += c;
  }
  if (campo !== '' || linha.length) fechar();
  const [cab, ...resto] = linhas;
  const nomes = (cab?.campos ?? []).map((x) => x.trim().toLowerCase());
  if (!nomes.includes('nome')) throw Object.assign(new Error('O CSV não tem a coluna nome: o esperado é nome;caminho;criado em, separado por ";".'), { status: 422 });
  return resto.map((l) => ({ n: l.n, ...Object.fromEntries(nomes.map((nome, i) => [nome, (l.campos[i] ?? '').trim()])) }));
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// o arquivo copiado de outro ("- Copy", "- cópia 2", "(1)"): o mesmo arquivo de novo
const COPIA = [/\s*-\s*(copy|c[oó]pia)(\s*\d+)?$/i, /\s*\(\d+\)$/];
// a versão com alfa é a arte em lettering, seja qual for a sigla do prefixo
const ALFA = /[_\s-]+(alfa|alpha)$/i;
const LETTERING = 'LETT';

// a mesma letra sem o acento, no mesmo lugar: o texto sem acento tem o mesmo tamanho (o nome vem em NFC)
const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');

// o dia (ou o quando) que fica junto da hora, e o período, que fica no texto ("3:40 DA TARDE" é outra arte)
const DIAS = [
  'HOJE', 'AMANHA', 'DAQUI A POUCO', 'PROXIMO SABADO', 'PROXIMO DOMINGO', 'TODO SABADO', 'TODO DOMINGO', 'TODOS OS SABADOS',
  'PROXIMA SEGUNDA', 'PROXIMA TERCA', 'PROXIMA QUARTA', 'PROXIMA QUINTA', 'PROXIMA SEXTA',
  'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO',
].join('|');
const PERIODOS = ['DA MANHA', 'DA TARDE', 'DA NOITE', 'DA MADRUGADA'].join('|');
const HORA = new RegExp(`^(?:(${DIAS})\\s+)?((\\d{1,2})(?:[\\s:H.]+(\\d{2})|H))(?:\\s+(${PERIODOS}))?$`, 'd');

// os acentos que o nome do arquivo perde e que a palavra sempre tem: um dicionário fechado (o acento de nome próprio
// vem da grafia das fontes, não daqui)
const ACENTOS = {
  AMANHA: 'AMANHÃ', MANHA: 'MANHÃ', SABADO: 'SÁBADO', SABADOS: 'SÁBADOS', TERCA: 'TERÇA', TERCAS: 'TERÇAS',
  PROXIMO: 'PRÓXIMO', PROXIMA: 'PRÓXIMA', PROXIMOS: 'PRÓXIMOS', PROXIMAS: 'PRÓXIMAS', ULTIMO: 'ÚLTIMO', ULTIMA: 'ÚLTIMA',
  ULTIMOS: 'ÚLTIMOS', ULTIMAS: 'ÚLTIMAS', NAO: 'NÃO', SAO: 'SÃO', JA: 'JÁ', SESSAO: 'SESSÃO', CAPITULO: 'CAPÍTULO',
  CAPITULOS: 'CAPÍTULOS', EPISODIO: 'EPISÓDIO', EPISODIOS: 'EPISÓDIOS', INEDITO: 'INÉDITO', INEDITA: 'INÉDITA',
  INEDITOS: 'INÉDITOS', INEDITAS: 'INÉDITAS', VIDEO: 'VÍDEO', VIDEOS: 'VÍDEOS', AUDITORIO: 'AUDITÓRIO', CEARA: 'CEARÁ',
};
// a frase que pede mais que o acento palavra a palavra
const FRASES = [[/^QUAL E$/, 'QUAL É']];

/** Os acentos do dicionário, palavra a palavra; cada palavra trocada vira uma mudança "acento". */
function acentuar(t, mudancas) {
  const feitas = new Set();
  let s = t.replace(/[\p{L}\p{N}]+/gu, (p) => {
    const certa = ACENTOS[p];
    if (!certa) return p;
    if (!feitas.has(p)) feitas.add(p), mudancas.push({ antes: p, depois: certa, regra: 'acento' });
    return certa;
  });
  for (const [re, por] of FRASES) if (re.test(s)) mudancas.push({ antes: s, depois: por, regra: 'acento' }), (s = s.replace(re, por));
  return s;
}

// PROX é PRÓXIMO; antes do dia da semana (feminino: "PROX SEGUNDA") e de SEMANA, PRÓXIMA
const PROX = /\b(PROX)\b\.?(\s+\S+)?/g;
const FEMININAS = /^(SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SEMANA)\b/;
function abreviacoes(t, mudancas) {
  const feitas = new Set();
  return t.replace(PROX, (_, escrita, seguinte = '') => {
    const certa = FEMININAS.test(semAcento(seguinte.trim())) ? 'PRÓXIMA' : 'PRÓXIMO';
    if (!feitas.has(certa)) feitas.add(certa), mudancas.push({ antes: escrita, depois: certa, regra: 'abreviação' });
    return certa + seguinte;
  });
}

// as versões da mesma arte no fim do nome: o lado (D/E), o formato (VERT, HORIZ) e a duração (6S, 15S)
const VERSOES = [/\s+(D|E)$/, /\s+(VERT|VERTICAL|HORIZ|HORIZONTAL)$/, /\s+(\d{1,2}S)$/];
/** Tira do fim do texto as marcas de versão (mais de uma: "HOJE VERT 6S"), sem deixar o texto vazio. O texto que uma
    fonte da grafia escreve inteiro, ou uma frase conhecida ("QUAL E"), não tem versão. */
function versao(t, mudancas, grafia) {
  const marcas = [];
  if (grafia(t) || FRASES.some(([re]) => re.test(semAcento(t)))) return { t, versao: '' };
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const re of VERSOES) {
      const m = re.exec(semAcento(t));
      if (m && m.index > 0) (t = t.slice(0, m.index).trim()), marcas.unshift(m[1]), (mudou = true);
    }
  }
  if (marcas.length) mudancas.push({ antes: marcas.join(' '), depois: '', regra: 'versão' });
  return { t, versao: marcas.join(' ') };
}

/** A hora escrita no nome do arquivo ("2 10", "10H", "11H30") vira H:MM, com o dia junto e o período no texto. */
function hora(t, mudancas) {
  const m = HORA.exec(semAcento(t));
  if (!m) return null;
  const [, , escrita, h, mm = '00'] = m;
  if (Number(h) > 23 || Number(mm) > 59) return null;
  // o dia e o período como vieram no nome (com o acento que já tinham): o texto sem acento tem as mesmas posições
  const [dia, periodo] = [m.indices[1], m.indices[5]].map((i) => (i ? t.slice(i[0], i[1]) : ''));
  const certa = `${Number(h)}:${mm}`;
  mudancas.push({ antes: escrita, depois: certa, regra: 'hora' });
  return [dia && acentuar(dia, mudancas), certa, periodo && acentuar(periodo, mudancas)].filter(Boolean).join(' ');
}

// o rodapé que junta dois nomes ("ANA LUZ E BENTO LUZ", "PEDRO FICTICIO RAFAELA FICTICIO"): o roteiro costuma
// escrever um nome por rodapé
const RODAPE = 'RDP';
const LIGACOES = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
function rodapeComposto(arte) {
  const palavras = chaveDeArte(arte).split(' ');
  const e = palavras.indexOf('E');
  if (e >= 2 && palavras.length - e - 1 >= 2) return true;
  // o sobrenome repetido: dois nomes da mesma família sem o "E"
  const nomes = palavras.filter((p) => p.length >= 4 && !LIGACOES.has(p));
  return palavras.length >= 4 && new Set(nomes).size < nomes.length;
}

/**
 * As palavras das fontes da grafia (só o texto em maiúsculas, palavras de 3 letras ou mais): a palavra sem acento →
 * quantas vezes cada forma aparece. Dá o acento sugerido de uma palavra que o dicionário não conhece (nome próprio).
 */
function palavrasDasFontes(fontes) {
  const palavras = new Map();
  for (const textos of fontes)
    for (const bruto of textos ?? []) {
      const u = String(bruto ?? '');
      if (u !== u.toLocaleUpperCase('pt-BR')) continue;
      for (const p of u.split(/[^\p{L}]+/u).filter((x) => x.length > 2)) {
        const sem = semAcento(p);
        const formas = palavras.get(sem) ?? new Map();
        formas.set(p, (formas.get(p) ?? 0) + 1);
        palavras.set(sem, formas);
      }
    }
  return palavras;
}
/** O acento sugerido palavra a palavra: a forma com acento escrita ao menos 2 vezes e 3 vezes mais que a sem. */
function acentoSugerido(arte, palavras) {
  let mudou = false;
  const sugestao = arte.replace(/\p{L}+/gu, (p) => {
    const formas = palavras.get(p);
    if (p.length < 3 || semAcento(p) !== p || !formas) return p;
    const sem = formas.get(p) ?? 0;
    const [forma, vezes] = [...formas].filter(([f]) => f !== p).sort((a, b) => b[1] - a[1])[0] ?? [p, 0];
    if (vezes < 2 || vezes <= 3 * sem) return p;
    mudou = true;
    return forma;
  });
  return mudou ? sugestao : null;
}

const FORA = { valor: 'fora', rotulo: 'Fica fora' };

/** O nome do arquivo → { arte, tipo, copia, versao, motivo, mudancas, perguntas, naFonte } ou { fora: motivo }. As
    perguntas daqui são as do nome (a sigla que não é tipo, o tipo tirado do começo do nome, o acento sugerido, o
    rodapé composto); a do nome parecido com o acervo sai da comparação (conferir).
    @param grafia (texto) => { texto, fonte } | null: a grafia das fontes para o texto
    @param palavras as palavras das fontes, para o acento sugerido */
function arteDoNome(nome, tipos, grafia = () => null, palavras = new Map()) {
  const semExt = nome.replace(/\.[a-z0-9]{2,4}$/i, '');
  if (semExt === nome) return { fora: 'é uma pasta, não um arquivo' };
  const perguntas = [];
  // a sigla mais longa primeiro (LOGO GLOBO antes de LOGO)
  const porTamanho = [...tipos].sort((a, b) => b.length - a.length);
  const prefixo = (s) => new RegExp(`^\\s*${escapar(s)}\\s+-\\s+`, 'i');
  const sigla = porTamanho.find((s) => prefixo(s).test(semExt));
  let resto;
  let tipo;
  if (sigla) (resto = semExt.replace(prefixo(sigla), '')), (tipo = sigla);
  else {
    // a sigla que não é tipo do acervo ("COMP - "): pergunta; nunca vira uma opção nova do campo
    const outra = /^\s*([A-Z]{2,6})\s+-\s+/.exec(semExt);
    // sem "SIGLA - ", o nome que começa por um tipo ("MOLDURA VIDEO.png"): o tipo sai dali, e o nome inteiro é a arte
    const doNome = outra ? null : porTamanho.find((s) => new RegExp(`^\\s*${escapar(s)}(\\s|$)`, 'i').test(semExt));
    if (outra) {
      (resto = semExt.slice(outra[0].length)), (tipo = '');
      perguntas.push({ tipo: 'sigla', sigla: outra[1], texto: `${outra[1]} não é tipo do acervo.`, opcoes: [FORA] });
    } else if (doNome) {
      (resto = semExt), (tipo = doNome);
      perguntas.push({ tipo: 'tipoDoNome', texto: 'Sem “SIGLA - ”: o tipo saiu do começo do nome.', opcoes: [{ valor: 'confirmar', rotulo: `${doNome} está certo` }, FORA] });
    } else return { fora: 'sem o prefixo do tipo (“SIGLA - ”)' };
  }
  let copia = false;
  let motivo = '';
  for (const re of COPIA) if (re.test(resto)) (resto = resto.replace(re, '')), (copia = true);
  if (ALFA.test(resto)) {
    resto = resto.replace(ALFA, '');
    const lett = tipos.find((t) => t.toUpperCase() === LETTERING);
    if (lett) (tipo = lett), (motivo = '_alfa: lettering');
  }
  const mudancas = [];
  const t0 = resto.normalize('NFC').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  const v = versao(t0, mudancas, grafia);
  const t = abreviacoes(v.t, mudancas);
  let arte = hora(t, mudancas);
  let naFonte = false;
  // a hora sai pronta; o resto ganha os acentos e, depois, a grafia da primeira fonte que tiver a arte
  if (arte === null) {
    const marcas = mudancas.length;
    arte = acentuar(t, mudancas);
    const g = grafia(t);
    naFonte = !!g && g.fonte.startsWith('dos roteiros');
    if (g && g.texto !== arte) {
      // a grafia decide: os acentos do dicionário dão lugar a ela
      mudancas.splice(marcas);
      if (g.texto !== t) mudancas.push({ antes: t, depois: g.texto, regra: `grafia ${g.fonte}` });
      arte = g.texto;
    }
    if (!g) {
      const sugestao = acentoSugerido(arte, palavras);
      if (sugestao) perguntas.push({ tipo: 'acento', texto: 'Acento?', sugestao, opcoes: [{ valor: 'sugerido', rotulo: sugestao }, { valor: 'como-esta', rotulo: 'Como está' }] });
      if (tipo === RODAPE && rodapeComposto(arte))
        perguntas.push({ tipo: 'composto', texto: 'Dois nomes num rodapé. O roteiro escreve assim?', opcoes: [{ valor: 'importar', rotulo: 'Sim, importar' }, FORA] });
    }
  }
  if (!chaveDeArte(arte)) return { fora: 'sem texto depois do prefixo' };
  return { arte, tipo, copia, versao: v.versao, motivo, mudancas, perguntas, naFonte };
}

// as fontes da grafia, na ordem: a primeira que tiver a arte (pela chave) decide como ela se escreve
const FONTES = ['do acervo da atração', 'dos roteiros da atração', 'dos roteiros', 'do acervo'];
// a forma com acento ou com "&", "'", ".", "!" ganha da forma sem, na mesma fonte
const temMarca = (f) => /[^\x00-\x7F]|[&'.!]/.test(f);

/**
 * A grafia das fontes, na ordem de FONTES: o texto (como o roteiro ou o acervo escreve) com a mesma chave da arte. Na
 * mesma fonte, a forma com marca ganha; depois, a mais escrita.
 * @param fontes listas de textos, uma por fonte, na ordem de FONTES
 * @returns (texto) => { texto, fonte } | null
 */
function grafiaDasFontes(fontes) {
  const mapas = fontes.map((textos) => {
    const m = new Map(); // chave → Map(forma → vezes)
    for (const bruto of textos ?? []) {
      let f = String(bruto ?? '').trim().replace(/^[(\s]+|[,.:;\s]+$/g, '').toLocaleUpperCase('pt-BR');
      // o parêntese que sobra do roteiro ("CANTORA FICTICIA)") sai; o que fecha um aberto fica
      while (f.endsWith(')') && (f.match(/\(/g) ?? []).length < (f.match(/\)/g) ?? []).length) f = f.slice(0, -1).trim();
      if (!f || f.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N} &'.!\-–(),]*$/u.test(f)) continue;
      const k = chaveDeArte(f);
      const formas = m.get(k) ?? new Map();
      formas.set(f, (formas.get(f) ?? 0) + 1);
      m.set(k, formas);
    }
    return m;
  });
  return (texto) => {
    const k = chaveDeArte(texto);
    for (let i = 0; i < mapas.length; i++) {
      const formas = mapas[i].get(k);
      if (formas) return { texto: [...formas].sort((a, b) => temMarca(b[0]) - temMarca(a[0]) || b[1] - a[1])[0][0], fonte: FONTES[i] };
    }
    return null;
  };
}

/* ---------- o nome parecido com um do acervo ---------- */

/** A distância de edição entre a e b, ou Infinity se passar de max (só a faixa de largura max é calculada). */
function distancia(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  let antes = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const agora = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      agora[j] = Math.min(antes[j] + 1, agora[j - 1] + 1, antes[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      menor = Math.min(menor, agora[j]);
    }
    if (menor > max) return Infinity;
    antes = agora;
  }
  return antes[b.length] <= max ? antes[b.length] : Infinity;
}
const digitos = (k) => k.replace(/\D/g, '');
// as respostas guardadas por acervo (a tela confere de novo a cada clique, com o mesmo acervo)
const parecidasPorAcervo = new WeakMap();
/**
 * A linha do acervo com o nome quase igual (o mesmo tipo, ou sem tipo): a distância de edição sobre a chave é 1 (2 a
 * partir de 12 letras), os números são os mesmos ("HOJE 3:00" e "HOJE 3:10" são outras artes) e a chave tem 6 letras
 * ou mais. @returns { id, arte, tipo } | null
 */
function parecidaNoAcervo(acervo, chave, tipo) {
  let memo = parecidasPorAcervo.get(acervo);
  if (!memo) parecidasPorAcervo.set(acervo, (memo = new Map()));
  const k = `${chave}|${tipo}`;
  if (memo.has(k)) return memo.get(k);
  let melhor = null;
  if (chave.length >= 6) {
    const max = chave.length >= 12 ? 2 : 1;
    for (const x of acervo) {
      if (x.tipo && x.tipo !== tipo) continue;
      const kx = chaveDeArte(x.arte);
      if (kx.length < 6 || digitos(kx) !== digitos(chave)) continue;
      const d = distancia(chave, kx, max);
      if (d > 0 && d !== Infinity && (!melhor || d < melhor.d)) melhor = { d, alvo: { id: x.id, arte: x.arte, tipo: x.tipo ?? '' } };
    }
  }
  memo.set(k, melhor?.alvo ?? null);
  return melhor?.alvo ?? null;
}
/** A pergunta do nome parecido: o lado que os roteiros escrevem vem primeiro ("o do acervo está errado" quando o
    roteiro escreve como o arquivo). */
function perguntaDaParecida(alvo, naFonte) {
  const nome = `${alvo.arte}${alvo.tipo ? ` (${alvo.tipo})` : ''}`;
  const mesma = { valor: 'mesma', rotulo: 'É a mesma: erro no arquivo' };
  const corrigir = { valor: 'corrigir', rotulo: 'O do acervo está errado: corrigir' };
  return naFonte
    ? { tipo: 'parecida', alvo, texto: `O acervo tem ${nome}, quase igual.`, opcoes: [corrigir, mesma, { valor: 'outra', rotulo: 'São artes diferentes' }] }
    : { tipo: 'parecida', alvo, texto: `Parece ${nome}, que já está no acervo.`, opcoes: [mesma, corrigir, { valor: 'outra', rotulo: 'É outra arte' }] };
}

/* ---------- conferir: as escolhas de quem confere sobre a classificação ---------- */

/** A resposta que a escolha dá à pergunta: a opção escolhida, ou a edição na linha (o tipo responde à sigla e ao tipo
    do nome; o nome responde ao acento e ao rodapé composto). */
function respostaDe(q, e) {
  const r = e.respostas?.[q.tipo];
  if (r && q.opcoes.some((o) => o.valor === r)) return r;
  if ((q.tipo === 'sigla' || q.tipo === 'tipoDoNome') && e.tipo) return e.tipo;
  if ((q.tipo === 'acento' || q.tipo === 'composto') && chaveDeArte(e.arte)) return 'à mão';
  return '';
}

/** A ordem de comparar: o arquivo sem marca primeiro, depois a versão, por fim a cópia (o original é que vale). */
const ordemDoOriginal = (x) => (x.copia ? 2 : x.versao ? 1 : 0);

/**
 * A conferência: as escolhas de quem confere (o nome e o tipo editados na linha, as respostas às perguntas, a linha
 * tirada) aplicadas sobre a classificação, e o estado de cada linha recalculado pela chave da arte contra o acervo e
 * as outras linhas. É o mesmo cálculo na prévia (sem escolhas), na tela (a cada clique) e no gravar (que recusa com
 * decisão pendente).
 * @param linhas as linhas da prévia (cada uma com a origem: o que o nome do arquivo deu)
 * @param acervo as linhas do acervo da atração ({ id, arte, tipo })
 * @param tipos as opções do campo tipo (o tipo fora delas fica para decidir)
 * @param escolhas { [n]: { arte?, tipo?, tirada?, respostas?: { [pergunta]: valor } } }
 * @returns { linhas, placar, faltam, plano: { criar: [{ arte, tipo }], tipar: [{ id, tipo }],
 *   renomear: [{ id, arte, antigo, tipo? }], semMudanca } }
 */
export function conferir({ linhas, acervo = [], tipos = [], escolhas = {} }) {
  const saida = linhas.map((l) => {
    const o = l.origem;
    const base = { n: l.n, nome: l.nome, caminho: l.caminho, versao: o.versao ?? '', copia: !!o.copia, origem: o };
    if (o.fora) return { ...base, arte: '', tipo: '', estado: 'fora', motivo: o.fora, mudancas: [], perguntas: [] };
    const e = escolhas[l.n] ?? {};
    let arte = o.arte;
    let tipo = o.tipo;
    const mudancas = [...o.mudancas];
    const perguntas = o.perguntas.map((q) => ({ ...q, resposta: respostaDe(q, e) }));
    const acento = perguntas.find((q) => q.tipo === 'acento' && q.resposta === 'sugerido');
    if (acento) mudancas.push({ antes: arte, depois: acento.sugestao, regra: 'acento sugerido' }), (arte = acento.sugestao);
    const editada = typeof e.arte === 'string' ? e.arte.trim().replace(/\s+/g, ' ') : '';
    if (chaveDeArte(editada) && editada !== arte) mudancas.push({ antes: arte, depois: editada, regra: 'à mão' }), (arte = editada);
    if (typeof e.tipo === 'string') tipo = e.tipo;
    const linha = { ...base, arte, tipo, mudancas, perguntas, naFonte: o.naFonte && !editada, motivo: o.motivo ?? '' };
    if (e.tirada) return { ...linha, estado: 'fora', motivo: 'tirada da importação' };
    if (perguntas.some((q) => q.resposta === 'fora')) return { ...linha, estado: 'fora', motivo: 'decisão: fica fora' };
    const pendente = perguntas.find((q) => !q.resposta);
    if (pendente) return { ...linha, estado: 'decidir', motivo: pendente.texto };
    if (!tipo) return { ...linha, estado: 'decidir', motivo: 'Falta o tipo.' };
    if (tipos.length && !tipos.includes(tipo)) return { ...linha, estado: 'decidir', motivo: `${tipo} não é tipo do acervo.` };
    return { ...linha, estado: '' }; // a comparar, abaixo
  });

  // a comparação pela chave, na ordem do original: a mesma arte e tipo de novo é cópia; contra o acervo, já no acervo,
  // completa (a mesma arte sem tipo, uma vez), corrige (o nome parecido que estava errado no acervo) ou nova
  const porChave = new Map();
  for (const x of acervo) {
    const k = chaveDeArte(x.arte);
    porChave.set(k, [...(porChave.get(k) ?? []), x]);
  }
  const usadas = new Set(); // as linhas do acervo que já ganham o tipo ou o nome
  const vistas = new Map(); // chave|tipo → a primeira linha com a arte
  const aComparar = saida.filter((l) => l.estado === '').sort((a, b) => ordemDoOriginal(a) - ordemDoOriginal(b) || a.n - b.n);
  for (const l of aComparar) {
    const e = escolhas[l.n] ?? {};
    // a cópia de uma linha já vista não pergunta nada
    const kAntes = `${chaveDeArte(l.arte)}|${l.tipo}`;
    // o nome parecido com um do acervo (só quando a chave não está lá em tipo nenhum)
    const alvo = vistas.has(kAntes) || porChave.has(chaveDeArte(l.arte)) ? null : parecidaNoAcervo(acervo, chaveDeArte(l.arte), l.tipo);
    let parecida = null;
    if (alvo) {
      parecida = { ...perguntaDaParecida(alvo, l.naFonte), resposta: '' };
      const r = e.respostas?.parecida;
      if (r && parecida.opcoes.some((x) => x.valor === r)) parecida.resposta = r;
      l.perguntas = [...l.perguntas, parecida];
      if (parecida.resposta === 'mesma') l.mudancas = [...l.mudancas, { antes: l.arte, depois: alvo.arte, regra: 'erro no arquivo' }], (l.arte = alvo.arte);
    }
    const sozinha = l.copia ? 'cópia sem o original no CSV: vale como a arte' : l.versao ? `versão ${l.versao} sem o original no CSV: vale como a arte` : '';
    const k = `${chaveDeArte(l.arte)}|${l.tipo}`;
    const original = vistas.get(k) ?? vistas.get(kAntes);
    if (original) {
      l.estado = 'copia';
      l.motivo = `${l.copia ? 'cópia' : l.versao ? `versão ${l.versao}` : 'a mesma arte'} da linha ${original.n} (${original.nome})`;
      continue;
    }
    vistas.set(k, l).set(kAntes, l);
    if (parecida && !parecida.resposta) {
      l.estado = 'decidir';
      l.motivo = parecida.texto;
      continue;
    }
    const juntar = (motivo) => [sozinha, l.motivo, motivo].filter(Boolean).join(' · ');
    if (parecida?.resposta === 'corrigir' && usadas.has(alvo.id)) {
      // duas linhas não renomeiam a mesma linha do acervo: a segunda volta a perguntar
      l.estado = 'decidir';
      l.motivo = `“${alvo.arte}” já é corrigida por outra linha: escolha outra resposta.`;
      continue;
    }
    if (parecida?.resposta === 'corrigir') {
      usadas.add(alvo.id);
      l.estado = 'corrige';
      l.id = alvo.id;
      l.antigo = alvo.arte;
      l.motivo = juntar(`“${alvo.arte}” no acervo vira “${l.arte}” (a mesma linha)${alvo.tipo ? '' : ` e ganha o tipo ${l.tipo}`}`);
      continue;
    }
    const mesmas = porChave.get(chaveDeArte(l.arte)) ?? [];
    const igual = mesmas.find((x) => (x.tipo ?? '') === l.tipo);
    const semTipo = mesmas.find((x) => !x.tipo && !usadas.has(x.id));
    if (igual) (l.estado = 'ja'), (l.motivo = juntar(`“${igual.arte}”${igual.tipo ? ` (${igual.tipo})` : ''}`));
    else if (semTipo) usadas.add(semTipo.id), (l.estado = 'completa'), (l.id = semTipo.id), (l.motivo = juntar(`“${semTipo.arte}” estava sem tipo`));
    else (l.estado = 'nova'), (l.motivo = juntar(''));
  }

  const placar = { nova: 0, completa: 0, corrige: 0, ja: 0, copia: 0, fora: 0, decidir: 0 };
  const plano = { criar: [], tipar: [], renomear: [], semMudanca: 0 };
  const final = saida.map(({ naFonte, ...l }) => l);
  for (const l of final) {
    placar[l.estado]++;
    if (l.estado === 'nova') plano.criar.push({ arte: l.arte, tipo: l.tipo });
    else if (l.estado === 'completa') plano.tipar.push({ id: l.id, tipo: l.tipo });
    else if (l.estado === 'corrige') plano.renomear.push({ id: l.id, arte: l.arte, antigo: l.antigo, ...(acervo.find((x) => x.id === l.id)?.tipo ? {} : { tipo: l.tipo }) });
    else plano.semMudanca++;
  }
  return { linhas: final, placar, faltam: placar.decidir, plano };
}

/** As escolhas que chegam no pedido de gravar, só com o que a conferência usa (a linha → { arte, tipo, tirada,
    respostas }); o resto é ignorado. */
export function escolhasDoPedido(v) {
  const saida = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return saida;
  for (const [n, e] of Object.entries(v).slice(0, 50_000)) {
    if (!/^\d{1,6}$/.test(n) || !e || typeof e !== 'object') continue;
    const x = {};
    if (typeof e.arte === 'string') x.arte = e.arte.slice(0, 300);
    if (typeof e.tipo === 'string') x.tipo = e.tipo.trim().slice(0, 40);
    if (e.tirada === true) x.tirada = true;
    if (e.respostas && typeof e.respostas === 'object')
      x.respostas = Object.fromEntries(Object.entries(e.respostas).filter(([k, r]) => k.length <= 20 && typeof r === 'string').map(([k, r]) => [k, r.slice(0, 40)]));
    saida[n] = x;
  }
  return saida;
}

/**
 * As decisões em lote, como novas escolhas (as outras ficam como estão):
 *   { acentos: true }        aceita todos os acentos sugeridos ainda sem resposta;
 *   { siglaFora: 'COMP' }    as linhas com a sigla que não é tipo ficam fora;
 *   { tipo: 'CRT', ns }      dá o tipo às linhas marcadas;
 *   { tirar: ns }            tira as linhas marcadas da importação.
 * @param linhas as linhas conferidas (com as perguntas e as respostas de agora)
 */
export function emLote(linhas, escolhas, acao) {
  const novas = { ...escolhas };
  const responder = (n, pergunta, valor) => (novas[n] = { ...novas[n], respostas: { ...novas[n]?.respostas, [pergunta]: valor } });
  for (const l of linhas) {
    const aberta = (tipo) => l.perguntas.find((q) => q.tipo === tipo && !q.resposta);
    if (acao.acentos && aberta('acento')) responder(l.n, 'acento', 'sugerido');
    if (acao.siglaFora && aberta('sigla')?.sigla === acao.siglaFora) responder(l.n, 'sigla', 'fora');
    if (acao.ns?.includes(l.n) && l.origem && !l.origem.fora) {
      if (acao.tipo) novas[l.n] = { ...novas[l.n], tipo: acao.tipo };
      if (acao.tirar) novas[l.n] = { ...novas[l.n], tirada: true };
    }
  }
  return novas;
}

/**
 * @param csv o texto do CSV
 * @param acervo as linhas do acervo da atração ({ id, arte, tipo }); é também a primeira fonte da grafia
 * @param tipos as opções do campo tipo do acervo (as siglas)
 * @param grafias as outras fontes da grafia, que a rota lê: { roteirosDaAtracao, roteiros, acervo } (listas de textos:
 *   as artes dos roteiros desta atração, as dos roteiros das outras e o acervo das outras)
 * @param escolhas as escolhas de quem confere (veja conferir); sem elas, a prévia
 * @returns o que conferir devolve: as linhas ({ n, nome, caminho, arte, tipo, estado, motivo, versao, copia, mudancas,
 *   perguntas, origem }), o placar, quantas faltam decidir e o plano de gravação
 */
export function classificar({ csv, acervo = [], tipos = [], grafias = {}, escolhas = {} }) {
  const fontes = [acervo.map((x) => x.arte), grafias.roteirosDaAtracao, grafias.roteiros, grafias.acervo];
  const grafia = grafiaDasFontes(fontes);
  const palavras = palavrasDasFontes(fontes);
  const linhas = lerCsv(csv).map((l) => {
    const nome = l.nome ?? '';
    const { fora = '', arte = '', tipo = '', copia = false, versao = '', motivo = '', mudancas = [], perguntas = [], naFonte = false } = arteDoNome(nome, tipos, grafia, palavras);
    return { n: l.n, nome, caminho: l.caminho ?? '', origem: { fora, arte, tipo, copia, versao, motivo, mudancas, perguntas, naFonte } };
  });
  return conferir({ linhas, acervo, tipos, escolhas });
}
