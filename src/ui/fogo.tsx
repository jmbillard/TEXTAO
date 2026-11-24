import { useId } from 'react';
import type { Complexidade } from '../modelo/exportar';

/*
  A complexidade da arte desenhada: o fogo cresce com o nível, em traço à mão nos tokens do app.
  BAIXA é a chaminha de uma vela; MÉDIA, um fogo de fogueira; ALTA, um incêndio.
  Um viewBox por nível (1 unidade = 1 px), com o chão em y≈21. A chama fica num grupo próprio (`.chama`), separada
  do que não se mexe (o pavio, as lenhas), para a animação poder tremular só ela.
*/
const FOGO: Record<Complexidade, { w: number; x0?: number; vivos: string[]; parados: string[]; hachura?: string }> = {
  // a vela: a chaminha; o pavio e a boca da vela ficam parados
  1: {
    w: 9,
    x0: 0.5,
    vivos: ['M5.6 6.6 C 5.9 8.4, 7.6 10.2, 7.5 13 C 7.4 15.3, 6.2 16.6, 5 16.5 C 3.5 16.4, 2.6 15.1, 2.8 13.4 C 3 11.4, 4.6 9.8, 5.2 7.4'],
    parados: ['M5 16.9 C 5.1 17.8, 5 18.5, 5.1 19.3', 'M2.4 22.2 C 2.3 21.2, 2.3 20.4, 2.4 19.6 C 4.2 19.3, 5.9 19.4, 7.7 19.7 C 7.8 20.5, 7.7 21.4, 7.8 22.2'],
  },
  // a fogueira: a chama e a língua de dentro; as duas lenhas cruzadas ficam paradas
  2: {
    w: 16,
    vivos: [
      'M8.5 5.2 C 9.7 8.2, 12.7 9.9, 13.3 13.4 C 13.8 16.5, 11.5 18.5, 8.2 18.4 C 4.9 18.3, 2.6 16.3, 2.9 13.4 C 3.1 11.5, 4.1 10.3, 5.1 9.3 C 5.2 10.7, 5.8 11.6, 6.7 12.1 C 6.4 9.5, 7.2 7.3, 8.7 5.6',
      'M8.1 17.9 C 6.7 17.5, 6.2 16.1, 6.8 14.9 C 7.3 13.9, 8.2 13.3, 8.6 12.1 C 9.6 13.5, 10.4 14.8, 10 16.3 C 9.7 17.3, 9 17.9, 8.4 18',
    ],
    parados: ['M1.4 21.7 C 5.9 20.5, 10.3 19.6, 14.7 18.8', 'M1.7 18.9 C 6.1 19.5, 10.5 20.6, 14.5 21.9'],
  },
  // o incêndio: três labaredas, com a hachura rabiscada por dentro
  3: {
    w: 24,
    vivos: [
      'M2.6 20.9 C 1.3 17.7, 2 14.4, 3.9 12.1 C 4 13.8, 4.8 15, 5.9 15.5 C 5.2 11.6, 6.8 8.1, 9.3 6 C 9.6 8.5, 10.6 9.8, 11.5 10.3 C 11 6.7, 12.4 3.5, 14.7 1.4 C 15.1 4.9, 16.9 7.3, 18.1 9.2 C 18.9 8.3, 19.3 7.1, 19.2 5.6 C 21.5 8.3, 22.7 11.6, 22.5 14.6 C 22.3 17.4, 21.7 19.2, 20.9 20.9 C 15.1 21.5, 8.7 21.3, 2.2 20.6',
    ],
    parados: [],
    hachura: 'M1.5 21 L6.5 9 L4.6 21.4 L9.6 6.2 L7.9 21.2 L12.8 3.4 L11.2 21.5 L15.9 3.6 L14.4 21.3 L19 6.4 L17.6 21.4 L22.3 9.6 L20.9 21.2',
  },
};

/** O fogo de um nível, parado, alinhado pelo chão. */
export function Fogo({ n }: { n: Complexidade }) {
  const f = FOGO[n];
  const clip = `fogo-${useId().replace(/:/g, '')}`;
  return (
    <svg className={`fogo n${n}`} width={f.w} height={24} viewBox={`${f.x0 ?? 0} 0 ${f.w} 24`} aria-hidden="true">
      <g className="chama">
        {f.hachura && (
          <>
            <clipPath id={clip}><path d={f.vivos[0]} /></clipPath>
            <path className="hachura" clipPath={`url(#${clip})`} d={f.hachura} />
          </>
        )}
        {f.vivos.map((d) => <path key={d} d={d} />)}
      </g>
      {f.parados.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
