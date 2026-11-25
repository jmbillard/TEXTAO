import { describe, expect, it } from 'vitest';
import { esticarRisco, linhasDoTrecho, meioDasLetras, tracarRiscos } from '../src/ui/riscos';

const caixa = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('as linhas de um trecho riscado (a partir dos retângulos do navegador)', () => {
  it('um retângulo por linha vira uma linha', () => {
    expect(linhasDoTrecho([caixa(10, 0, 200, 20), caixa(0, 30, 80, 50)])).toEqual([caixa(10, 0, 200, 20), caixa(0, 30, 80, 50)]);
  });

  it('os pedaços da mesma linha (o trecho cortado por outra marca) se juntam numa só', () => {
    expect(linhasDoTrecho([caixa(10, 0, 60, 20), caixa(60, 1, 120, 19), caixa(0, 30, 80, 50)])).toEqual([caixa(10, 0, 120, 20), caixa(0, 30, 80, 50)]);
  });

  it('retângulos vazios (a quebra no fim da linha) ficam de fora', () => {
    expect(linhasDoTrecho([caixa(10, 0, 200, 20), caixa(200, 0, 200.5, 20), caixa(0, 30, 0, 30)])).toEqual([caixa(10, 0, 200, 20)]);
  });

  it('as linhas saem de cima para baixo, mesmo fora de ordem', () => {
    expect(linhasDoTrecho([caixa(0, 30, 80, 50), caixa(10, 0, 200, 20)]).map((l) => l.top)).toEqual([0, 30]);
  });
});

describe('o meio das letras', () => {
  const m = { ascent: 18, cap: 13, xAltura: 10 };
  it('em caixa alta, o meio das maiúsculas, a partir do alto da caixa da linha', () => {
    expect(meioDasLetras(m, 'ORQUESTRA SINFÔNICA')).toBe(18 - 6.5);
  });
  it('com minúsculas, o meio da altura do x', () => {
    expect(meioDasLetras(m, 'Maria Lina')).toBe(18 - 5);
  });
});

describe('esticar um risco do modelo (viewBox 0 0 100 14) sobre uma linha', () => {
  it('leva o x de 0..100 para x0..x1 e o y do meio (7) para a altura pedida', () => {
    expect(esticarRisco('M0 7 C 50 7, 50 7, 100 7', 10, 210, 40, 1)).toBe('M10.0 40.0 C 110.0 40.0, 110.0 40.0, 210.0 40.0');
  });
  it('a ondulação do traço cresce com a amplitude', () => {
    expect(esticarRisco('M0 5 L 100 9', 0, 100, 50, 2)).toBe('M0.0 46.0 L 100.0 54.0');
  });
});

describe('os riscos de um trecho, um por linha', () => {
  const tracos = ['M0 7 L 100 7', 'M0 6 L 100 8', 'M0 8 L 100 6'];
  const linhas = [caixa(110, 200, 410, 220), caixa(100, 230, 200, 250)];

  it('cada linha ganha um risco na altura do meio das letras, relativo à origem da camada, com 4px a mais de cada lado', () => {
    const r = tracarRiscos(linhas, { origem: { x: 100, y: 190 }, meio: 11, fs: 16, tracos, amplitude: 0 });
    expect(r.map((x) => x.d)).toEqual(['M6.0 21.0 L 314.0 21.0', 'M-4.0 51.0 L 104.0 51.0']);
  });

  it('linhas seguidas usam traços diferentes; a semente escolhe o primeiro', () => {
    const r = tracarRiscos(linhas, { origem: { x: 0, y: 0 }, meio: 10, fs: 16, tracos, semente: 1, amplitude: 1 });
    expect(r[0].d).toBe('M106.0 209.0 L 414.0 211.0');
    expect(r[1].d).toBe('M96.0 241.0 L 204.0 239.0');
  });

  it('as linhas se escrevem uma depois da outra, cerca de 0,4 s no total, cada uma pelo seu comprimento', () => {
    const r = tracarRiscos(linhas, { origem: { x: 0, y: 0 }, meio: 10, fs: 16, tracos });
    const total = r[r.length - 1].atraso + r[r.length - 1].dur;
    expect(total).toBeCloseTo(0.4, 2);
    expect(r[0].atraso).toBe(0);
    expect(r[1].atraso).toBeCloseTo(r[0].dur, 5);
    expect(r[0].dur).toBeGreaterThan(r[1].dur);
  });

  it('uma linha curtinha não some: cada uma leva pelo menos 0,12 s', () => {
    const r = tracarRiscos([caixa(0, 0, 1000, 20), caixa(0, 30, 10, 50)], { origem: { x: 0, y: 0 }, meio: 10, fs: 16, tracos });
    expect(r[1].dur).toBeGreaterThanOrEqual(0.12);
  });

  it('redesenhado no meio da escrita, continua de onde estava (atraso negativo)', () => {
    const r = tracarRiscos(linhas, { origem: { x: 0, y: 0 }, meio: 10, fs: 16, tracos, decorrido: 0.1 });
    expect(r[0].atraso).toBeCloseTo(-0.1, 5);
  });

  it('sem linhas, sem riscos', () => {
    expect(tracarRiscos([], { origem: { x: 0, y: 0 }, meio: 10, fs: 16, tracos })).toEqual([]);
  });
});
