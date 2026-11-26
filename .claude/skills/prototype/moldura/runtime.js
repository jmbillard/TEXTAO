// Moldura de protótipo: o lado do conteúdo. O montar.mjs injeta este arquivo no <head> do conteúdo.
//
// O protótipo é um APP RODANDO, não uma sequência de telas: o DOM fica vivo entre um clique e outro. Três peças:
//
// 1. Mini-roteador. Moldura.tela é a tela (a rota do app) em que o aparelho está. Moldura.ir(tela) troca a tela
//    neste aparelho na hora (com a transição do app) e avisa a moldura, que leva os outros dois aparelhos junto, em
//    silêncio. Moldura.ao('tela', fn) roda fn(nova, anterior, como) no começo (anterior = null) e a cada troca;
//    como = { silencioso, inicio, cena, alt, aparelho }. silencioso é true no começo, quando a troca veio de outro
//    aparelho ou da barra da moldura: aí nada anima. Moldura.ao('alt', fn) idem para a alternativa da barra.
//    Menus, balões, campos digitados, filtros e o que está aberto NÃO são tela: ficam no estado do conteúdo e não
//    passam por Moldura.ir. Uma "cena" do manifesto é uma tela com um estado local já preparado (o menu aberto…):
//    chega só no começo (como.cena), para o hash e as capturas.
//
// 2. Partes. Moldura.partes({ nome: () => html }) registra as regiões da página (o elemento [data-parte="nome"]).
//    Moldura.desenhar() (ou desenhar('nome', …)) redesenha as partes MORFANDO o DOM: compara o HTML novo com o que
//    está na página e só mexe no que mudou. Os nós que continuam iguais são os mesmos nós: o foco, a seleção, o
//    texto digitado, o scroll de dentro e as transições de CSS sobrevivem. data-chave="…" (ou id) casa um nó entre
//    um desenho e outro numa lista que muda de ordem. Nunca faça innerHTML da página inteira.
//
// 3. Transições do app. Uma "vaga" (.vaga-y > .vaga-dentro, como em ui/vagas.tsx) que entra abre o seu espaço e uma
//    que sai fecha (vaga-abrir-y / vaga-fechar-y do estilos.css), sozinhas, a cada desenhar(). Moldura.animar(el,
//    'm-surgir') toca uma animação do app numa região (m-surgir: a troca de página; m-abrir: um menu; m-subir: um
//    aviso). No modo silencioso e nas capturas (html.captura) nada disso anima, e o que começaria a animar é
//    terminado na hora: os aparelhos que não foram clicados atualizam sem piscar.
//
// Fora da moldura (o conteúdo aberto sozinho) os parâmetros vêm de ?tela=…&cena=…&alt=…&tema=claro|escuro.
// Num contexto restrito (srcdoc, sandbox, origem opaca) location, history, storage e o acesso ao parent podem
// lançar SecurityError: tudo isso passa por seguro() e, se lançar, o estado fica em memória. O conteúdo não usa
// storage nem history; tela, alt e tema chegam só por window.__MOLDURA__ e postMessage.
(function () {
  function seguro(fn, alt) { try { return fn(); } catch (e) { return alt; } }
  var q = new URLSearchParams(seguro(function () { return location.search; }, ''));
  var p = { tela: q.get('tela'), cena: q.get('cena'), alt: q.get('alt'), tema: q.get('tema') || 'claro', aparelho: q.get('aparelho'), captura: q.get('captura') === '1', quem: null };
  if (window.__MOLDURA__) Object.assign(p, window.__MOLDURA__);
  var dentro = seguro(function () { return window.parent !== window; }, false);
  function avisar(d) { if (dentro) seguro(function () { parent.postMessage(d, '*'); }); }
  var ouvintes = { tela: [], alt: [], tudo: [] };
  var partes = {};
  var silencio = false; // true enquanto aplica uma troca que não foi clicada neste aparelho
  var comecou = false;

  function tema() {
    document.documentElement.dataset.theme = p.tema === 'escuro' ? 'dark' : 'light';
    document.documentElement.classList.toggle('captura', !!p.captura);
  }
  function padroes() {
    var el = document.getElementById('manifesto');
    if (!el) return;
    var m = JSON.parse(el.textContent);
    var cena = p.cena && (m.cenas || []).find(function (c) { return c.id === p.cena; });
    // compatível com o hash antigo: tela=<id de uma cena> abre a cena
    if (!cena && p.tela) cena = (m.cenas || []).find(function (c) { return c.id === p.tela; });
    if (cena) { p.cena = cena.id; p.tela = cena.tela; } else p.cena = null;
    if (!p.tela && m.telas && m.telas.length) p.tela = m.telas[0].id;
    if (!p.alt && m.alternativas && m.alternativas.length) p.alt = m.alternativas[0].id;
  }
  function anima() { return !silencio && !p.captura && comecou; }

  /* ---------- silêncio: o que começou a animar durante uma troca silenciosa termina na hora ---------- */
  function emSilencio(fn) {
    var antes = new Set(seguro(function () { return document.getAnimations(); }, []));
    var era = silencio;
    silencio = true;
    try { fn(); } finally { silencio = era; }
    seguro(function () {
      document.getAnimations().forEach(function (a) {
        if (antes.has(a)) return;
        try { a.finish(); } catch (e) { try { a.cancel(); } catch (e2) { /* infinita */ } }
      });
    });
  }

  /* ---------- morfar: patch do DOM vivo a partir do HTML novo ---------- */
  function chave(n) { return n.nodeType === 1 ? n.getAttribute('data-chave') || n.id || null : null; }
  function mesmo(a, b) { return a.nodeType === b.nodeType && a.nodeName === b.nodeName && chave(a) === chave(b); }
  function vaga(n) { return n.nodeType === 1 && (n.classList.contains('vaga-y') || n.classList.contains('vaga-x')); }
  function animarClasse(el, classe) {
    el.__vivas = el.__vivas || new Set();
    el.__vivas.add(classe);
    el.classList.remove(classe);
    void el.offsetWidth;
    el.classList.add(classe);
    var fim = function (e) {
      if (e && e.target !== el) return;
      el.classList.remove(classe);
      el.__vivas.delete(classe);
      el.removeEventListener('animationend', fim);
    };
    el.addEventListener('animationend', fim);
    setTimeout(fim, 900);
  }
  function atributos(a, b) {
    for (var i = a.attributes.length - 1; i >= 0; i--) { var n = a.attributes[i].name; if (!b.hasAttribute(n)) a.removeAttribute(n); }
    for (var j = 0; j < b.attributes.length; j++) {
      var at = b.attributes[j];
      var v = at.value;
      if (at.name === 'class' && a.__vivas && a.__vivas.size) a.__vivas.forEach(function (c) { if ((' ' + v + ' ').indexOf(' ' + c + ' ') < 0) v += ' ' + c; });
      if (a.getAttribute(at.name) !== v) a.setAttribute(at.name, v);
    }
    if (a.__vivas && a.__vivas.size && !b.hasAttribute('class')) a.setAttribute('class', Array.from(a.__vivas).join(' '));
    // campos: o valor digitado é do campo; só muda se o desenho pedir outro valor e o campo não estiver em foco
    if (a.nodeName === 'INPUT' || a.nodeName === 'TEXTAREA' || a.nodeName === 'SELECT') {
      var foco = a === document.activeElement;
      var nv = b.nodeName === 'TEXTAREA' ? b.textContent : b.getAttribute('value');
      if (nv != null && a.value !== nv && !foco && a.__valorDesenhado !== nv) a.value = nv;
      a.__valorDesenhado = nv;
      if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
    }
  }
  // as vagas que entram e saem num desenho; como no app (ui/vagas.tsx), mais de 12 de uma vez não animam
  var lote = null;
  var MAX_ANIMADAS = 12;
  function remover(pai, n, vivo) {
    if (n.__saindo) return;
    if (vivo && vaga(n)) { n.__saindo = true; lote.saem.push(n); return; }
    pai.removeChild(n);
  }
  function fecharLote() {
    var l = lote;
    lote = null;
    var anima = l.entram.length + l.saem.length <= MAX_ANIMADAS;
    l.entram.forEach(function (n) { if (anima) animarClasse(n, 'entrando'); });
    l.saem.forEach(function (n) {
      var tira = function () { if (n.parentNode) n.parentNode.removeChild(n); };
      if (!anima) return tira();
      n.classList.remove('entrando');
      n.classList.add('saindo');
      n.setAttribute('aria-hidden', 'true');
      n.inert = true;
      n.addEventListener('animationend', function (e) { if (e.target === n) tira(); });
      setTimeout(tira, 450);
    });
  }
  function filhos(de, para, vivo) {
    var porChave = new Map();
    for (var c = de.firstChild; c; c = c.nextSibling) { var k = chave(c); if (k && !c.__saindo) porChave.set(k, c); }
    var atual = de.firstChild;
    var pula = function () { while (atual && atual.__saindo) atual = atual.nextSibling; };
    var novos = Array.prototype.slice.call(para.childNodes);
    for (var i = 0; i < novos.length; i++) {
      var n = novos[i];
      pula();
      var alvo = null, kn = chave(n);
      if (kn) { alvo = porChave.get(kn) || null; if (alvo && !mesmo(alvo, n)) alvo = null; if (alvo) porChave.delete(kn); }
      else if (atual && !chave(atual) && mesmo(atual, n)) alvo = atual;
      if (alvo) {
        if (alvo === atual) atual = atual.nextSibling;
        else de.insertBefore(alvo, atual);
        no(alvo, n, vivo);
      } else {
        de.insertBefore(n, atual);
        if (vivo && vaga(n)) lote.entram.push(n);
      }
    }
    while (atual) { var prox = atual.nextSibling; remover(de, atual, vivo); atual = prox; }
  }
  function no(a, b, vivo) {
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    atributos(a, b);
    if (a.nodeName === 'TEXTAREA') return;
    filhos(a, b, vivo);
  }
  function morfar(el, html) {
    var t = document.createElement('template');
    t.innerHTML = html;
    var dono = !lote;
    if (dono) lote = { entram: [], saem: [] };
    filhos(el, t.content, anima());
    if (dono) fecharLote();
  }

  /* ---------- partes ---------- */
  function desenhar() {
    var nomes = arguments.length ? Array.prototype.slice.call(arguments) : Object.keys(partes);
    nomes.forEach(function (nome) {
      var fn = partes[nome];
      if (!fn) return;
      document.querySelectorAll('[data-parte="' + nome + '"]').forEach(function (el) { morfar(el, fn()); });
    });
  }

  /* ---------- roteador ---------- */
  function emitir(tipo, nova, anterior, como) {
    ouvintes[tipo].forEach(function (f) { f(nova, anterior, como); });
    if (tipo !== 'tudo' && ouvintes.tudo.length) ouvintes.tudo.forEach(function (f) { f(Object.assign({}, p), como); });
  }
  function como(extra) { return Object.assign({ silencioso: silencio, inicio: !comecou, cena: null, alt: p.alt, aparelho: p.aparelho }, extra || {}); }
  function trocar(d, silenciosa) {
    var antes = { tela: p.tela, alt: p.alt };
    if (d.tela) p.tela = d.tela;
    if (d.alt) p.alt = d.alt;
    var cena = d.cena || null;
    var aplica = function () {
      if (p.alt !== antes.alt) emitir('alt', p.alt, antes.alt, como());
      if (p.tela !== antes.tela || cena) emitir('tela', p.tela, antes.tela, como({ cena: cena }));
    };
    if (silenciosa) emSilencio(aplica); else aplica();
  }

  tema();
  // as transições do app, como classes para Moldura.animar (os @keyframes vêm do estilos.css)
  seguro(function () {
    var st = document.createElement('style');
    st.textContent = '.m-surgir{animation:surgir .28s var(--suave)}.m-abrir{animation:abrir .14s var(--suave)}'
      + '.m-subir{animation:subir .3s var(--suave)}.m-trocar{animation:etapa-trocar .3s var(--suave)}'
      + 'html.captura .vaga-y.saindo,html.captura .vaga-x.saindo{display:none}';
    (document.head || document.documentElement).appendChild(st);
  });
  addEventListener('message', function (e) {
    var d = e.data && e.data.moldura;
    if (!d) return;
    if (d.tema && d.tema !== p.tema) { p.tema = d.tema; tema(); }
    if (comecou) trocar(d, true);
  });
  window.Moldura = {
    get tela() { return p.tela; },
    get alt() { return p.alt; },
    get silencioso() { return silencio || !comecou; },
    get params() { return Object.assign({}, p); },
    ao: function (tipo, f) {
      if (typeof tipo === 'function') { f = tipo; tipo = 'tudo'; }
      ouvintes[tipo].push(f);
      if (!comecou) Moldura.comecar();
    },
    // começa o app: roda os ouvintes de 'alt' e 'tela' uma vez, em silêncio. Moldura.ao já chama sozinho (depois que
    // o script do conteúdo terminar de registrar os ouvintes e as partes).
    comecar: function () {
      if (Moldura.__agendado) return;
      Moldura.__agendado = true;
      padroes();
      var vai = function () {
        emSilencio(function () {
          var c = como({ inicio: true, silencioso: true, cena: p.cena });
          ouvintes.alt.forEach(function (f) { f(p.alt, null, c); });
          ouvintes.tela.forEach(function (f) { f(p.tela, null, c); });
          ouvintes.tudo.forEach(function (f) { f(Object.assign({}, p), c); });
        });
        comecou = true;
        avisar({ molduraPronta: true, quem: p.quem });
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vai);
      else Promise.resolve().then(vai);
    },
    ir: function (tela, alt) {
      if (tela === p.tela && (!alt || alt === p.alt)) return;
      trocar({ tela: tela, alt: alt }, false);
      avisar({ molduraIr: { tela: p.tela, alt: p.alt }, quem: p.quem });
    },
    partes: function (o) { Object.assign(partes, o); },
    desenhar: desenhar,
    morfar: morfar,
    animar: function (el, classe) { if (el && anima()) animarClasse(el, classe); },
    // uma vaga do app: o que entra abre o seu espaço, o que sai fecha (tag: 'div' ou 'li')
    vaga: function (k, html, tag) { tag = tag || 'div'; return '<' + tag + ' class="vaga-y" data-chave="' + k + '"><div class="vaga-dentro">' + html + '</div></' + tag + '>'; },
  };
})();
