import { useEffect, useRef, useState } from 'react';

/** Mostra um PDF página por página, na largura da coluna, nítido em tela de alta densidade. */
/** `reserva`: o que mostrar quando não há PDF (ou ele não abre). */
export function VisorPdf({ carregar, rotulo, reserva }: { carregar: () => Promise<ArrayBuffer | null>; rotulo: string; reserva?: React.ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'lendo' | 'pronto' | 'sem' | 'erro'>('lendo');
  useEffect(() => {
    let vivo = true;
    const alvo = caixa.current;
    void (async () => {
      try {
        const dados = await carregar();
        if (!vivo || !alvo) return;
        if (!dados) return setEstado('sem');
        const pdfjs = (await import('../importar/pdfjs')).default;
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(dados), isEvalSupported: false }).promise;
        alvo.replaceChildren();
        const largura = alvo.clientWidth || 520;
        const densidade = Math.min(window.devicePixelRatio || 1, 2.5);
        for (let n = 1; n <= Math.min(pdf.numPages, 30) && vivo; n++) {
          const pagina = await pdf.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const vista = pagina.getViewport({ scale: (largura / base.width) * densidade });
          const tela = document.createElement('canvas');
          tela.width = Math.floor(vista.width);
          tela.height = Math.floor(vista.height);
          tela.className = 'pagina-pdf';
          tela.setAttribute('aria-label', `${rotulo}, página ${n} de ${pdf.numPages}`);
          alvo.append(tela);
          await pagina.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;
          if (n === 1 && vivo) setEstado('pronto');
        }
        void pdf.destroy?.();
      } catch {
        if (vivo) setEstado('erro');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [carregar, rotulo]);
  return (
    <div className={`visor-pdf ${estado}`}>
      {estado === 'lendo' && <p className="suave visor-aviso">Abrindo o PDF…</p>}
      {(estado === 'sem' || estado === 'erro') && (reserva ?? <p className="suave visor-aviso">{estado === 'sem' ? 'Sem o roteiro em PDF.' : 'Não consegui abrir o PDF.'}</p>)}
      <div ref={caixa} className="visor-paginas" />
    </div>
  );
}
