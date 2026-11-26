#!/usr/bin/env node
// Capturas de um protótipo montado na moldura: cada tela × alternativa × aparelho × tema, em tamanho real
// (o conteúdo sozinho, no modo #cru), e, com --moldura, a própria moldura (os três, ambos, foco, num celular).
// Usa o Playwright já instalado (require('playwright')); nunca rode `playwright install`.
//
// Uso: node .claude/skills/prototype/moldura/capturar.cjs <montado.html> <pasta> [opções]
//   --telas=a,b      só estas telas (padrão: todas do manifesto)
//   --alts=A,B       só estas alternativas (padrão: todas)
//   --tela-moldura=a a tela mostrada nas capturas da moldura (padrão: a primeira)
//   --moldura        também captura a moldura
//   --so-moldura     só a moldura
//   --janela         captura só a janela do aparelho, sem rolar a página inteira
// Saída: <pasta>/<aparelho>/<nn>-<tela>[-<alt>]-<tema>.png e <pasta>/moldura/*.png. No fim, lista erros de
// JavaScript e tudo que vaza para o lado da janela; "sem erros e nada vazando" é o resultado esperado.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
if (pos.length < 2) { console.error('uso: node capturar.cjs <montado.html> <pasta> [--telas=…] [--alts=…] [--moldura] [--so-moldura] [--janela]'); process.exit(1); }
const arquivo = path.resolve(pos[0]);
const pasta = path.resolve(pos[1]);
const html = fs.readFileSync(arquivo, 'utf8');
const manifesto = JSON.parse(html.match(/const MANIFESTO = (.*);\n/)[1]);
const APS = [['celular', 390, 844], ['tablet', 820, 1180], ['computador', 1440, 900]];
const telas = manifesto.telas.filter((t) => !opt.telas || opt.telas.split(',').includes(t.id));
const alts = (manifesto.alternativas || []).filter((a) => !opt.alts || opt.alts.split(',').includes(a.id));
const url = (hash) => 'file://' + arquivo + '#' + new URLSearchParams(hash).toString();

(async () => {
  const b = await chromium.launch();
  const erros = [];
  let n = 0;

  async function vazamentos(p) {
    return p.evaluate(() => {
      const W = document.documentElement.clientWidth, out = [];
      if (document.documentElement.scrollWidth > W + 1) out.push('a página rola para o lado: ' + document.documentElement.scrollWidth + 'px');
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && cs.visibility === 'hidden') continue;
        let pai = el.parentElement, recortado = false;
        while (pai && pai !== document.body) { const o = getComputedStyle(pai).overflowX; if (o !== 'visible') { recortado = true; break; } pai = pai.parentElement; }
        if (recortado) continue;
        if (r.right > W + 0.5 || r.left < -0.5) out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} ${Math.round(r.left)}–${Math.round(r.right)}`);
        if (out.length > 6) break;
      }
      return out;
    });
  }
  async function abrir(w, h, hash, nome) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    p.on('pageerror', (e) => erros.push(`${nome}: ${e.message}`));
    await p.goto(url(hash));
    await p.waitForLoadState('load');
    await p.waitForTimeout(300);
    await p.evaluate(async () => {
      await document.fonts.ready;
      for (const f of document.querySelectorAll('iframe')) { try { await f.contentDocument.fonts.ready; } catch (e) { /* sem acesso */ } }
    });
    await p.waitForTimeout(700);
    return p;
  }

  if (!opt['so-moldura']) {
    for (const [i, t] of telas.entries()) {
      for (const a of alts.length ? alts : [null]) {
        for (const [ap, w, h] of APS) {
          for (const tema of ['claro', 'escuro']) {
            const nome = `${ap}/${String(i + 1).padStart(2, '0')}-${t.id}${a ? '-' + a.id : ''}-${tema}`;
            const hash = { cru: '', tela: t.id, tema, aparelho: ap, captura: '1' };
            if (a) hash.alt = a.id;
            const p = await abrir(w, h, hash, nome);
            const v = await vazamentos(p);
            if (v.length) erros.push(`${nome} (${w}px): ${v.join(' | ')}`);
            fs.mkdirSync(path.join(pasta, ap), { recursive: true });
            await p.screenshot({ path: path.join(pasta, nome + '.png'), fullPage: !opt.janela });
            await p.close();
            n++;
          }
        }
      }
    }
  }

  if (opt.moldura || opt['so-moldura']) {
    const tela = opt['tela-moldura'] || manifesto.telas[0].id;
    const base = { tela, captura: '1' };
    if (alts[0]) base.alt = alts[0].id;
    const fotos = [
      ['computador-os-tres', 1440, 1000, { tema: 'claro' }, false],
      ['computador-ambos', 1440, 1000, { tema: 'ambos' }, true],
      ['computador-foco-celular', 1440, 1000, { tema: 'claro', foco: 'celular' }, false],
      ['computador-foco-computador', 1440, 1000, { tema: 'escuro', foco: 'computador' }, false],
      ['celular-390', 390, 844, { tema: 'claro' }, false],
      ['celular-390-ambos', 390, 844, { tema: 'ambos', foco: 'tablet' }, true],
    ];
    fs.mkdirSync(path.join(pasta, 'moldura'), { recursive: true });
    for (const [nome, w, h, hash, cheia] of fotos) {
      const p = await abrir(w, h, { ...base, ...hash }, 'moldura/' + nome);
      const v = await vazamentos(p);
      if (v.length) erros.push(`moldura/${nome} (${w}px): ${v.join(' | ')}`);
      await p.screenshot({ path: path.join(pasta, 'moldura', nome + '.png'), fullPage: cheia });
      await p.close();
      n++;
    }
  }

  await b.close();
  console.log(`${n} capturas em ${pasta}`);
  console.log(erros.length ? erros.join('\n') : 'sem erros e nada vazando');
  process.exitCode = erros.length ? 1 : 0;
})();
