// Moldura de protótipo: o lado do conteúdo. O montar.mjs injeta este arquivo no <head> do conteúdo.
// O conteúdo chama Moldura.ao(desenhar) uma vez; desenhar({ tela, alt, tema, aparelho }) roda de novo a cada troca
// na barra do topo. Para trocar de tela por dentro do conteúdo (um botão do próprio protótipo), use Moldura.ir(tela).
// Fora da moldura (o arquivo de conteúdo aberto sozinho) os parâmetros vêm de ?tela=…&alt=…&tema=claro|escuro.
// Num contexto restrito (srcdoc, sandbox, origem opaca) location, history, storage e o acesso ao parent podem lançar
// SecurityError: tudo isso passa por seguro() e, se lançar, o estado fica em memória. O conteúdo não usa storage nem
// history; tela, alt e tema chegam só por window.__MOLDURA__ e postMessage.
(function () {
  function seguro(fn, alt) { try { return fn(); } catch (e) { return alt; } }
  var q = new URLSearchParams(seguro(function () { return location.search; }, ''));
  var p = { tela: q.get('tela'), alt: q.get('alt'), tema: q.get('tema') || 'claro', aparelho: q.get('aparelho'), captura: q.get('captura') === '1' };
  if (window.__MOLDURA__) Object.assign(p, window.__MOLDURA__);
  var fn = null;
  var dentro = seguro(function () { return window.parent !== window; }, false);
  function avisar(d) { if (dentro) seguro(function () { parent.postMessage(d, '*'); }); }
  function tema() {
    document.documentElement.dataset.theme = p.tema === 'escuro' ? 'dark' : 'light';
    document.documentElement.classList.toggle('captura', !!p.captura);
  }
  function padroes() {
    var el = document.getElementById('manifesto');
    if (!el) return;
    var m = JSON.parse(el.textContent);
    if (!p.tela && m.telas && m.telas.length) p.tela = m.telas[0].id;
    if (!p.alt && m.alternativas && m.alternativas.length) p.alt = m.alternativas[0].id;
  }
  tema();
  addEventListener('message', function (e) {
    var d = e.data && e.data.moldura;
    if (!d) return;
    Object.assign(p, d);
    tema();
    if (fn) fn(Object.assign({}, p));
  });
  window.Moldura = {
    ao: function (f) {
      fn = f;
      padroes();
      f(Object.assign({}, p));
      avisar({ molduraPronta: true });
    },
    ir: function (tela, alt) {
      if (dentro) return avisar({ molduraIr: { tela: tela, alt: alt || p.alt } });
      p.tela = tela;
      if (alt) p.alt = alt;
      if (fn) fn(Object.assign({}, p));
    },
    get params() { return Object.assign({}, p); },
  };
})();
