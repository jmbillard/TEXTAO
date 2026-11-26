/*
 * Importação do acervo por CSV: o CSV exportado da pasta de output de uma atração (nome;caminho;criado em) vira as
 * artes do acervo dela, conferidas antes de gravar (ADR 0005). Este módulo é puro: lê o CSV, converte o nome de cada
 * arquivo numa arte (o texto e o tipo) e classifica a linha contra o acervo da atração. Quem lê o acervo e grava no
 * Teable é servidor/acervo.mjs.
 *
 * Estados de uma linha: nova · completa (a mesma arte está no acervo sem tipo: só ganha o tipo) · ja (a mesma arte e
 * o mesmo tipo já estão lá) · copia (cópia de outro arquivo, versão da mesma arte ou a mesma arte repetida no CSV) ·
 * fora (pasta, nome fora do padrão) · decidir (a pergunta para quem confere; ainda não produzido).
 *
 * As regras de conversão (#59) escrevem a arte como o roteiro escreve, nesta ordem: a versão sai do fim (D/E, VERT,
 * 6S), PROX vira PRÓXIMO/PRÓXIMA, a hora vira H:MM (pronta: o dia junto, o período no texto) ou, fora da hora, os
 * acentos do dicionário e a grafia da primeira fonte que tem a arte (o acervo da atração, os roteiros dela, os de todas,
 * o acervo de todas). Cada regra aplicada vira uma mudança { antes, depois, regra } da linha. As fontes chegam como
 * dados: quem as lê é servidor/acervo.mjs.
 */
import { chaveDeArte } from './acervo.mjs';

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

/** O nome do arquivo → { arte, tipo, copia, versao, motivo, mudancas } ou { fora: motivo }.
    @param grafia (texto) => { texto, fonte } | null: a grafia das fontes para o texto */
function arteDoNome(nome, tipos, grafia = () => null) {
  const semExt = nome.replace(/\.[a-z0-9]{2,4}$/i, '');
  if (semExt === nome) return { fora: 'é uma pasta, não um arquivo' };
  // a sigla mais longa primeiro (LOGO GLOBO antes de LOGO)
  const sigla = [...tipos].sort((a, b) => b.length - a.length).find((s) => new RegExp(`^\\s*${escapar(s)}\\s+-\\s+`, 'i').test(semExt));
  if (!sigla) return { fora: 'sem o prefixo do tipo (“SIGLA - ”)' };
  let resto = semExt.replace(new RegExp(`^\\s*${escapar(sigla)}\\s+-\\s+`, 'i'), '');
  let tipo = sigla;
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
  // a hora sai pronta; o resto ganha os acentos e, depois, a grafia da primeira fonte que tiver a arte
  if (arte === null) {
    const marcas = mudancas.length;
    arte = acentuar(t, mudancas);
    const g = grafia(t);
    if (g && g.texto !== arte) {
      // a grafia decide: os acentos do dicionário dão lugar a ela
      mudancas.splice(marcas);
      if (g.texto !== t) mudancas.push({ antes: t, depois: g.texto, regra: `grafia ${g.fonte}` });
      arte = g.texto;
    }
  }
  if (!chaveDeArte(arte)) return { fora: 'sem texto depois do prefixo' };
  return { arte, tipo, copia, versao: v.versao, motivo, mudancas };
}

/**
 * A comparação com o acervo da atração, linha a linha: a mesma chave e o mesmo tipo já estão lá (ja); a mesma chave
 * sem tipo ganha o tipo, uma vez só (completa, com o id da linha do acervo); o resto é arte nova.
 * @param acervo as linhas do acervo da atração ({ id, arte, tipo })
 * @returns (arte, tipo) => { estado, motivo, id? }
 */
export function contraOAcervo(acervo) {
  const porChave = new Map();
  for (const x of acervo) {
    const k = chaveDeArte(x.arte);
    porChave.set(k, [...(porChave.get(k) ?? []), x]);
  }
  const tipadas = new Set();
  return (arte, tipo) => {
    const mesmas = porChave.get(chaveDeArte(arte)) ?? [];
    const igual = mesmas.find((x) => (x.tipo ?? '') === tipo);
    if (igual) return { estado: 'ja', motivo: `“${igual.arte}”${igual.tipo ? ` (${igual.tipo})` : ''}` };
    const semTipo = tipo ? mesmas.find((x) => !x.tipo && !tipadas.has(x.id)) : null;
    if (semTipo) {
      tipadas.add(semTipo.id);
      return { estado: 'completa', motivo: `“${semTipo.arte}” estava sem tipo`, id: semTipo.id };
    }
    return { estado: 'nova', motivo: '' };
  };
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

/** A ordem de classificar: o arquivo sem marca primeiro, depois a versão, por fim a cópia (o original é que vale). */
const ordemDoOriginal = (x) => (x.copia ? 2 : x.versao ? 1 : 0);

/**
 * @param csv o texto do CSV
 * @param acervo as linhas do acervo da atração ({ id, arte, tipo }); é também a primeira fonte da grafia
 * @param tipos as opções do campo tipo do acervo (as siglas)
 * @param grafias as outras fontes da grafia, que a rota lê: { roteirosDaAtracao, roteiros, acervo } (listas de textos:
 *   as artes dos roteiros desta atração, as dos roteiros das outras e o acervo das outras)
 * @returns { linhas: [{ n, nome, caminho, arte, tipo, estado, motivo, versao, mudancas: [{ antes, depois, regra }] }],
 *   placar: { nova, completa, ja, copia, fora, decidir } }
 */
export function classificar({ csv, acervo = [], tipos = [], grafias = {} }) {
  const grafia = grafiaDasFontes([acervo.map((x) => x.arte), grafias.roteirosDaAtracao, grafias.roteiros, grafias.acervo]);
  const lidas = lerCsv(csv).map((l) => {
    const nome = l.nome ?? '';
    const { arte = '', tipo = '', copia = false, versao = '', motivo = '', mudancas = [], fora } = arteDoNome(nome, tipos, grafia);
    return { linha: { n: l.n, nome, caminho: l.caminho ?? '', arte, tipo, estado: fora ? 'fora' : 'nova', motivo: fora ?? motivo, versao, mudancas }, copia, versao, fora: !!fora };
  });
  // a versão e a cópia vêm depois: o original (o arquivo sem a marca) é que vale
  const vistas = new Map(); // chave|tipo → a primeira linha com a arte
  const comparar = contraOAcervo(acervo);
  const ordem = lidas.filter((x) => !x.fora).sort((a, b) => ordemDoOriginal(a) - ordemDoOriginal(b) || a.linha.n - b.linha.n);
  for (const { linha: l, copia, versao } of ordem) {
    const k = `${chaveDeArte(l.arte)}|${l.tipo}`;
    const original = vistas.get(k);
    if (original) {
      l.estado = 'copia';
      l.motivo = `${copia ? 'cópia' : versao ? `versão ${versao}` : 'a mesma arte'} da linha ${original.n} (${original.nome})`;
      continue;
    }
    vistas.set(k, l);
    const { estado, motivo } = comparar(l.arte, l.tipo);
    l.estado = estado;
    const sozinha = copia ? 'cópia sem o original no CSV: vale como a arte' : versao ? `versão ${versao} sem o original no CSV: vale como a arte` : '';
    l.motivo = [sozinha, l.motivo, motivo].filter(Boolean).join(' · ');
  }
  const linhas = lidas.map((x) => x.linha);
  const placar = { nova: 0, completa: 0, ja: 0, copia: 0, fora: 0, decidir: 0 };
  for (const l of linhas) placar[l.estado]++;
  return { linhas, placar };
}

/**
 * O que gravar das linhas que a conferência decidiu ({ arte, tipo }), contra o acervo relido logo antes: a comparação
 * é a da prévia, e a mesma arte e tipo repetida conta uma vez.
 * @returns { criar: [{ arte, tipo }], tipar: [{ id, tipo }], semMudanca }
 */
export function planoDeGravacao(linhas, acervo) {
  const comparar = contraOAcervo(acervo);
  const plano = { criar: [], tipar: [], semMudanca: 0 };
  const vistas = new Set();
  for (const { arte, tipo } of linhas) {
    const k = `${chaveDeArte(arte)}|${tipo}`;
    const c = vistas.has(k) ? { estado: 'ja' } : comparar(arte, tipo);
    vistas.add(k);
    if (c.estado === 'nova') plano.criar.push({ arte, tipo });
    else if (c.estado === 'completa') plano.tipar.push({ id: c.id, tipo });
    else plano.semMudanca++;
  }
  return plano;
}
