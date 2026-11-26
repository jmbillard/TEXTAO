/*
 * Importação do acervo por CSV: o CSV exportado da pasta de output de uma atração (nome;caminho;criado em) vira as
 * artes do acervo dela, conferidas antes de gravar (ADR 0005). Este módulo é puro: lê o CSV, converte o nome de cada
 * arquivo numa arte (o texto e o tipo) e classifica a linha contra o acervo da atração. Quem lê o acervo e grava no
 * Teable é servidor/acervo.mjs.
 *
 * Estados de uma linha: nova · completa (a mesma arte está no acervo sem tipo: só ganha o tipo) · ja (a mesma arte e
 * o mesmo tipo já estão lá) · copia (cópia de outro arquivo, ou a mesma arte repetida no CSV) · fora (pasta, nome
 * fora do padrão) · decidir (a pergunta para quem confere; ainda não produzido nesta fatia).
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

/** O nome do arquivo → { arte, tipo, copia, motivo } ou { fora: motivo }. */
function arteDoNome(nome, tipos) {
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
  const arte = resto.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  if (!chaveDeArte(arte)) return { fora: 'sem texto depois do prefixo' };
  return { arte, tipo, copia, motivo };
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

/**
 * @param csv o texto do CSV
 * @param acervo as linhas do acervo da atração ({ id, arte, tipo })
 * @param tipos as opções do campo tipo do acervo (as siglas)
 * @returns { linhas: [{ n, nome, caminho, arte, tipo, estado, motivo }], placar: { nova, completa, ja, copia, fora, decidir } }
 */
export function classificar({ csv, acervo = [], tipos = [] }) {
  const lidas = lerCsv(csv).map((l) => {
    const nome = l.nome ?? '';
    const { arte = '', tipo = '', copia = false, motivo = '', fora } = arteDoNome(nome, tipos);
    return { linha: { n: l.n, nome, caminho: l.caminho ?? '', arte, tipo, estado: fora ? 'fora' : 'nova', motivo: fora ?? motivo }, copia, fora: !!fora };
  });
  // a cópia vem depois: o original (o arquivo sem a marca de cópia) é que vale
  const vistas = new Map(); // chave|tipo → a primeira linha com a arte
  const comparar = contraOAcervo(acervo);
  for (const { linha: l, copia } of [...lidas.filter((x) => !x.fora && !x.copia), ...lidas.filter((x) => !x.fora && x.copia)]) {
    const k = `${chaveDeArte(l.arte)}|${l.tipo}`;
    const original = vistas.get(k);
    if (original) {
      l.estado = 'copia';
      l.motivo = `${copia ? 'cópia' : 'a mesma arte'} da linha ${original.n} (${original.nome})`;
      continue;
    }
    vistas.set(k, l);
    const { estado, motivo } = comparar(l.arte, l.tipo);
    l.estado = estado;
    l.motivo = [copia ? 'cópia sem o original no CSV: vale como a arte' : '', l.motivo, motivo].filter(Boolean).join(' · ');
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
