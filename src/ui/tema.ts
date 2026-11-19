/* Tema claro ou escuro. "sistema" segue o computador; a escolha fica só neste navegador.
   O index.html aplica a mesma chave antes do app carregar, para a tela não piscar. */

export type Tema = 'sistema' | 'claro' | 'escuro';
const CHAVE = 'promeiro.tema';

export function temaSalvo(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === 'claro' || t === 'escuro' ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', tema === 'escuro' ? 'dark' : 'light');
  try {
    if (tema === 'sistema') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, tema);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}
