#!/usr/bin/env node
// Monta um protótipo na moldura: um único HTML autocontido (conteúdo + moldura + estilos.css do app + fontes em base64).
// Uso: node .claude/skills/prototype/moldura/montar.mjs <conteudo.html> [saida.html]
// Sem saída: grava <conteudo>-moldura.html ao lado do conteúdo.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../../..');
const [entrada, saidaArg] = process.argv.slice(2);
if (!entrada) {
  console.error('uso: node montar.mjs <conteudo.html> [saida.html]');
  process.exit(1);
}
const saida = saidaArg || entrada.replace(/\.html?$/, '') + '-moldura.html';
const b64 = (p) => readFileSync(p).toString('base64');

// 1. o estilos.css do app, com as texturas do papel embutidas
let css = readFileSync(resolve(RAIZ, 'src/estilos.css'), 'utf8');
for (const n of ['papel-claro', 'papel-escuro', 'papel-grao'])
  css = css.split(`url('/${n}.svg')`).join(`url('data:image/svg+xml;base64,${b64(resolve(RAIZ, 'public', n + '.svg'))}')`);

// 2. as fontes do app (as mesmas de src/main.tsx), inclusive a manuscrita (Caveat)
const nm = resolve(RAIZ, 'node_modules');
const fonte = (fam, arq, peso, estilo = 'normal') =>
  `@font-face{font-family:'${fam}';font-style:${estilo};font-display:block;font-weight:${peso};src:url(data:font/woff2;base64,${b64(resolve(nm, arq))}) format('woff2');}`;
const fontes = [
  fonte('Inter Variable', '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', '100 900'),
  fonte('Inter Variable', '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', '100 900'),
  fonte('Newsreader Variable', '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2', '200 800'),
  fonte('Newsreader Variable', '@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2', '200 800', 'italic'),
  fonte('IBM Plex Mono', '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 400),
  fonte('IBM Plex Mono', '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', 500),
  fonte('Caveat', '@fontsource/caveat/files/caveat-latin-600-normal.woff2', 600),
  fonte('Caveat', '@fontsource/caveat/files/caveat-latin-ext-600-normal.woff2', 600),
].join('\n');

// 3. o conteúdo e o manifesto dele
let conteudo = readFileSync(entrada, 'utf8');
const m = conteudo.match(/<script type="application\/json" id="manifesto">([\s\S]*?)<\/script>/);
if (!m) throw new Error('o conteúdo não tem <script type="application/json" id="manifesto">');
const manifesto = JSON.parse(m[1]);
if (!manifesto.nome || !Array.isArray(manifesto.telas) || !manifesto.telas.length) throw new Error('manifesto: precisa de "nome" e de "telas" [{ id, rotulo }]');
for (const lista of [manifesto.telas, manifesto.alternativas || []]) {
  const ids = lista.map((x) => x.id);
  if (ids.some((id) => !id || typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('manifesto: ids vazios ou repetidos em ' + JSON.stringify(ids));
}
const cabeca = conteudo.match(/<head[^>]*>/i);
if (!cabeca) throw new Error('o conteúdo precisa ser um documento com <head>');
const injetar = `\n<!--MOLDURA-PARAMS-->\n<script>${readFileSync(resolve(AQUI, 'runtime.js'), 'utf8')}</script>\n<style>\n${fontes}\n${css}\n</style>\n`;
conteudo = conteudo.replace(cabeca[0], cabeca[0] + injetar);

// 4. a moldura com tudo dentro (o conteúdo vai como string JS, escapado para não fechar o <script>)
const js = (v) => JSON.stringify(v).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const html = readFileSync(resolve(AQUI, 'moldura.html'), 'utf8')
  .replace('__NOME__', esc(manifesto.nome))
  .replace('/*__DADOS__*/', () => `const MANIFESTO = ${js(manifesto)};\nconst CONTEUDO = ${js(conteudo)};`);
writeFileSync(saida, html);
console.log(`${saida}  ${(html.length / 1024).toFixed(0)} KB · ${manifesto.telas.length} telas · ${(manifesto.alternativas || []).length} alternativas`);
