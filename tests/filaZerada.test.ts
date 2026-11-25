import { describe, expect, it } from 'vitest';
import { cenaLiberada, criarMemoriaDaFila, deveComemorar, escolherCena, sortear } from '../src/ui/filaZerada';

/* A comemoração da fila zerada: as regras puras. */

describe('quando a fila zerada comemora', () => {
  it('mandou a última (ou voltou do editor): de 1 para 0, numa leitura nova da fila, comemora', () => {
    expect(deveComemorar(1, 0, 'fila')).toBe(true);
  });
  it('a fila ao vivo zerou de uma vez (outra pessoa mandou as três): comemora', () => {
    expect(deveComemorar(3, 0, 'fila')).toBe(true);
  });
  it('abrir a página (ou recarregar) com a fila em dia não comemora', () => {
    expect(deveComemorar(null, 0, 'abriu')).toBe(false);
  });
  it('ainda sobra um, ou a conta não mudou: não comemora', () => {
    expect(deveComemorar(2, 1, 'fila')).toBe(false);
    expect(deveComemorar(0, 0, 'fila')).toBe(false);
  });
  it('tirou a última da fila (com o desfazer aberto): não comemora', () => {
    expect(deveComemorar(1, 0, 'tirar')).toBe(false);
  });
  it('a última foi ao ar na virada do dia: não comemora', () => {
    expect(deveComemorar(1, 0, 'virou-o-dia')).toBe(false);
  });
});

describe('uma cena a cada 15 minutos', () => {
  const MIN = 60 * 1000;
  const agora = Date.UTC(2026, 10, 25, 15, 0);
  it('a primeira zerada da aba tem cena', () => {
    expect(cenaLiberada(null, agora)).toBe(true);
  });
  it('a segunda zerada 3 minutos depois só tem o risco no título', () => {
    expect(cenaLiberada(agora - 3 * MIN, agora)).toBe(false);
  });
  it('um instante antes dos 15 minutos ainda é a mesma janela; aos 15 minutos a cena volta', () => {
    expect(cenaLiberada(agora - 15 * MIN + 1, agora)).toBe(false);
    expect(cenaLiberada(agora - 15 * MIN, agora)).toBe(true);
  });
});

describe('o sorteio da cena', () => {
  const sempre = (x: number) => () => x;
  it('a primeira da aba: qualquer uma pode sair', () => {
    expect(sortear(['fogos', 'aviao'], null, sempre(0))).toBe('fogos');
    expect(sortear(['fogos', 'aviao'], null, sempre(0.99))).toBe('aviao');
  });
  it('não repete a última: com duas cenas, elas alternam', () => {
    let ultima: string | null = 'fogos';
    const saidas: string[] = [];
    for (let i = 0; i < 4; i++) saidas.push((ultima = sortear(['fogos', 'aviao'], ultima, Math.random)));
    expect(saidas).toEqual(['aviao', 'fogos', 'aviao', 'fogos']);
  });
  it('a última guardada que não está mais no repertório não atrapalha', () => {
    expect(sortear(['fogos', 'aviao'], 'claquete', sempre(0.6))).toBe('aviao');
  });
});

describe('a memória da fila, entre uma leitura e outra', () => {
  const HOJE = '2026-11-25';
  const leitura = (conta: number, outros: { hoje?: string; tirando?: boolean; ultima?: string } = {}) => ({ conta, hoje: HOJE, tirando: false, ...outros });
  it('a primeira leitura da página não comemora, nem com a fila em dia', () => {
    const m = criarMemoriaDaFila();
    expect(m.ler(leitura(0))).toBeNull();
  });
  it('a última ficha sai: comemora, com a claquete dela (o bilhete do avião)', () => {
    const m = criarMemoriaDaFila();
    m.ler(leitura(1, { ultima: 'Rota do Sabor(Ch)26/11' }));
    expect(m.ler(leitura(0))).toEqual({ antes: 1, ultima: 'Rota do Sabor(Ch)26/11' });
  });
  it('zerou de uma vez: comemora, sem claquete', () => {
    const m = criarMemoriaDaFila();
    m.ler(leitura(1, { ultima: 'Rota do Sabor(Ch)26/11' }));
    m.ler(leitura(3));
    expect(m.ler(leitura(0))).toEqual({ antes: 3, ultima: null });
  });
  it('a leitura repetida com a fila ainda em dia não comemora de novo', () => {
    const m = criarMemoriaDaFila();
    m.ler(leitura(1));
    m.ler(leitura(0));
    expect(m.ler(leitura(0))).toBeNull();
  });
  it('tirou a última com o desfazer aberto: não comemora, nem quando o prazo do desfazer acaba', () => {
    const m = criarMemoriaDaFila();
    m.ler(leitura(1));
    expect(m.ler(leitura(0, { tirando: true }))).toBeNull();
    expect(m.ler(leitura(0))).toBeNull();
  });
  it('a última foi ao ar na virada do dia: não comemora; no dia novo, mandar a última comemora', () => {
    const m = criarMemoriaDaFila();
    m.ler(leitura(1, { hoje: '2026-11-24' }));
    expect(m.ler(leitura(0))).toBeNull();
    m.ler(leitura(1));
    expect(m.ler(leitura(0))).not.toBeNull();
  });
});

describe('a cena de cada zerada, guardada na aba', () => {
  const MIN = 60 * 1000;
  const t0 = Date.UTC(2026, 10, 25, 15, 0);
  const guarda = () => {
    const dados = new Map<string, string>();
    return { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => void dados.set(k, v) };
  };
  it('as cenas são os fogos e o avião, e se alternam de uma janela para a outra', () => {
    const g = guarda();
    const primeira = escolherCena(t0, Math.random, g);
    expect(['fogos', 'aviao']).toContain(primeira);
    const segunda = escolherCena(t0 + 16 * MIN, Math.random, g);
    const terceira = escolherCena(t0 + 32 * MIN, Math.random, g);
    expect([primeira, segunda, terceira]).toEqual(primeira === 'fogos' ? ['fogos', 'aviao', 'fogos'] : ['aviao', 'fogos', 'aviao']);
  });
  it('dentro dos 15 minutos da última cena: nenhuma (só o risco); a janela conta da última cena, não da última zerada', () => {
    const g = guarda();
    escolherCena(t0, () => 0, g);
    expect(escolherCena(t0 + 3 * MIN, () => 0, g)).toBeNull();
    expect(escolherCena(t0 + 15 * MIN, () => 0, g)).toBe('aviao');
  });
  it('a guarda da aba que falha (bloqueada ou cheia) não impede a cena', () => {
    const quebrada = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(escolherCena(t0, () => 0, quebrada)).toBe('fogos');
    const lixo = { getItem: () => '{nada', setItem: () => {} };
    expect(escolherCena(t0, () => 0, lixo)).toBe('fogos');
  });
});
