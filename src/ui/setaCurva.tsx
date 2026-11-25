/* A seta curva das anotações à mão (a do "ainda não salvo" da folha de rascunho dos Cadastros): uma só, para as
   anotações do app inteiro. O traço vai da cauda (3, 19) até a ponta (47, 9.5), numa caixa de 54 × 26. */

/** O traço da seta: o corpo curvo e a ponta. Desenhado com pathLength 1, para o rabisco aparecer. */
export const SETA_CURVA = 'M3 19 C 14 23, 30 22, 46 10 M 38 8.5 L 47 9.5 L 44.5 18';
const CAUDA = [3, 19] as const;
const PONTA = [47, 9.5] as const;

/** A seta solta, como SVG próprio (a folha de rascunho posiciona pelo CSS). */
export function SetaCurva({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 54 26" aria-hidden="true">
      <path pathLength={1} d={SETA_CURVA} />
    </svg>
  );
}

/** A mesma seta dentro de um desenho SVG, da cauda `de` até a ponta `ate`; `espelhar` vira a curva para o outro lado.
    O traço mantém a espessura `larg` (nas unidades do desenho), qualquer que seja o tamanho da seta. */
export function SetaCurvaEm({ de, ate, espelhar = false, larg = 1.8, className }: { de: readonly [number, number]; ate: readonly [number, number]; espelhar?: boolean; larg?: number; className?: string }) {
  const [cx, cy] = [PONTA[0] - CAUDA[0], PONTA[1] - CAUDA[1]];
  const [dx, dy] = [ate[0] - de[0], ate[1] - de[1]];
  const escala = Math.hypot(dx, dy) / Math.hypot(cx, cy);
  const giro = ((Math.atan2(dy, dx) - Math.atan2(espelhar ? -cy : cy, cx)) * 180) / Math.PI;
  const t = `translate(${de[0]} ${de[1]}) rotate(${giro.toFixed(1)}) scale(${escala.toFixed(3)} ${(espelhar ? -escala : escala).toFixed(3)}) translate(${-CAUDA[0]} ${-CAUDA[1]})`;
  return (
    <g transform={t} className={className}>
      <path pathLength={1} d={SETA_CURVA} style={{ strokeWidth: larg / escala }} />
    </g>
  );
}
