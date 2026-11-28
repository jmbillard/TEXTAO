// As conferências de coerência entre as telas (#171), para os e2e de cada tela usarem as mesmas:
// - nada de check verde: o estado vai na bolinha (BolinhaDeEstado), nunca num ✓ em --ok;
// - a lupa no lugar de todas: na linha do título (cabeca-com-lupa), na ponta direita; com a navegação do tempo
//   (nav-do-tempo, o "voltar para hoje"), logo antes dela. No celular, o quadrado na ponta da linha do título.

/** Os ✓ à vista pintados em --ok (o ícone "certo" ou o caractere), com a classe de onde estão. Vazio é o certo. */
async function checksVerdes(p) {
  return p.evaluate(() => {
    const amostra = document.createElement('i');
    amostra.style.color = 'var(--ok)';
    document.body.appendChild(amostra);
    const ok = getComputedStyle(amostra).color;
    amostra.remove();
    const aVista = (e) => {
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && Number(c.opacity) > 0;
    };
    const icones = [...document.querySelectorAll('svg path[d="M20 6L9 17l-5-5"]')].map((d) => d.closest('svg'));
    const texto = [];
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) if (/[✓✔]/.test(n.nodeValue) && n.parentElement) texto.push(n.parentElement);
    return [...icones, ...texto].filter((e) => aVista(e) && getComputedStyle(e).color === ok).map((e) => `${e.parentElement?.className || e.tagName}`);
  });
}

/**
 * Onde a lupa está: se está na cabeça (cabeca-com-lupa), na mesma linha do título, e o que está à direita dela nessa
 * linha (só pode ser a navegação do tempo). `ok` junta as três.
 */
async function lugarDaLupa(p, seletor = '.lupa-da-cabeca') {
  return p.evaluate((sel) => {
    const lupa = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
    if (!lupa) return { ok: false, motivo: 'sem lupa' };
    const cabeca = lupa.closest('.cabeca-com-lupa');
    if (!cabeca) return { ok: false, motivo: 'a lupa fora da cabeça' };
    const l = lupa.getBoundingClientRect();
    const c = cabeca.getBoundingClientRect();
    const titulo = cabeca.querySelector('h1, h2');
    const t = titulo.getBoundingClientRect();
    const naLinhaDoTitulo = l.top < t.bottom && l.bottom > t.top;
    // o que está à direita da lupa, na faixa de altura dela, dentro da cabeça
    const folhas = [...cabeca.querySelectorAll('button, a, input, label, b, span, nav')].filter((e) => {
      if (lupa.contains(e) || e.contains(lupa)) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.left >= l.right - 1 && r.top < l.bottom && r.bottom > l.top && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e).opacity) > 0;
    });
    const sobra = folhas.filter((e) => !e.closest('.nav-do-tempo, .ct-voltar, .voltar-hoje'));
    const naPonta = sobra.length === 0;
    return {
      ok: naLinhaDoTitulo && naPonta,
      naLinhaDoTitulo,
      naPonta,
      direita: Math.round(c.right - l.right),
      motivo: naPonta ? '' : `à direita da lupa: ${sobra.map((e) => e.className || e.tagName).join(', ')}`,
    };
  }, seletor);
}

module.exports = { checksVerdes, lugarDaLupa };
