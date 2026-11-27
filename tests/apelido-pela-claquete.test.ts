import { describe, expect, it } from 'vitest';
import { chaveDoApelido, juntarApelidosPelaClaquete, nomeComApelido } from '../src/modelo/versoesDoRoteiro';

/* O apelido da claquete pela claquete (#154): a chave é a claquete no padrão, a mesma da pauta e das Produções (sem
   pontuação, caixa, acento, o código das versões e a praça no fim), com ou sem roteiro no PROMeiro. Os apelidos de
   antes, guardados por roteiro, passam para a chave da claquete do roteiro; dois na mesma claquete, vale o mais recente.
   Claquetes fictícias. */

describe('chaveDoApelido: a claquete no padrão', () => {
  it('é a chave da pauta: sem pontuação, caixa, acento, o código das versões e a praça no fim', () => {
    expect(chaveDoApelido('Show Fictício 27/11 (AH)')).toBe('SHOW FICTICIO 27 11');
    expect(chaveDoApelido('show ficticio 27/11 AH')).toBe('SHOW FICTICIO 27 11');
    expect(chaveDoApelido('Show Fictício 27/11 (H) RJ')).toBe('SHOW FICTICIO 27 11');
    expect(chaveDoApelido('Show Fictício 27/11 RJ')).toBe('SHOW FICTICIO 27 11');
    expect(chaveDoApelido('Chef(Fut)3/11 (MES)')).toBe(chaveDoApelido('CHEF (FUT) 3/11 (M)'));
  });

  it('a claquete sabe as versões dela: o código no nome não muda a claquete; a claquete vazia não tem chave', () => {
    expect(chaveDoApelido('Show 25/11 (A)')).toBe(chaveDoApelido('Show 25/11 (H)'));
    expect(chaveDoApelido('Show 25/11 (A)')).toBe(chaveDoApelido('Show 25/11'));
    expect(chaveDoApelido('Outro Show 25/11')).not.toBe(chaveDoApelido('Show 25/11'));
    expect(chaveDoApelido('  ')).toBe('');
  });

  it('nomeComApelido acha o apelido pela claquete, em qualquer grafia', () => {
    const apelidos = new Map([[chaveDoApelido('Show 25/11'), 'A estreia fictícia']]);
    expect(nomeComApelido('SHOW 25/11 (A) SP', apelidos)).toBe('A estreia fictícia');
    expect(nomeComApelido('Outro 25/11', apelidos)).toBe('Outro 25/11');
  });
});

describe('juntarApelidosPelaClaquete: a migração dos apelidos por roteiro', () => {
  const antigo = (roteiro: string, claquete: string, apelido: string, em: string, versoes: string | null = null) => ({ roteiro, claquete, apelido, versoes, porEmail: 'ana@empresa.com', porNome: 'Ana', em });

  it('cada apelido vai para a chave da claquete do roteiro, com a claquete como original', () => {
    const { ficam, deixados } = juntarApelidosPelaClaquete([antigo('rot-1', 'Show Fictício 27/11 (A)', 'A estreia', '2026-11-01T10:00:00Z', 'AH'), antigo('rot-2', 'Festa Fictícia 28/11', '', '2026-11-02T10:00:00Z', 'N')]);
    expect(ficam).toEqual([
      { chave: 'FESTA FICTICIA 28 11', original: 'Festa Fictícia 28/11', apelido: '', versoes: 'N', porEmail: 'ana@empresa.com', porNome: 'Ana', em: '2026-11-02T10:00:00Z' },
      { chave: 'SHOW FICTICIO 27 11', original: 'Show Fictício 27/11 (A)', apelido: 'A estreia', versoes: 'AH', porEmail: 'ana@empresa.com', porNome: 'Ana', em: '2026-11-01T10:00:00Z' },
    ]);
    expect(deixados).toEqual([]);
  });

  it('dois apelidos na mesma claquete: vale o mais recente, e o outro fica deixado, com o motivo', () => {
    const { ficam, deixados } = juntarApelidosPelaClaquete([
      antigo('rot-novo', 'Show Fictício 27/11 (H) RJ', 'O novo', '2026-11-05T10:00:00Z'),
      antigo('rot-velho', 'Show Fictício 27/11 (A)', 'O velho', '2026-11-01T10:00:00Z', 'A'),
    ]);
    expect(ficam.map((a) => [a.chave, a.apelido, a.original])).toEqual([['SHOW FICTICIO 27 11', 'O novo', 'Show Fictício 27/11 (H) RJ']]);
    expect(deixados).toEqual([{ roteiro: 'rot-velho', apelido: 'O velho', versoes: 'A', motivo: 'a claquete SHOW FICTICIO 27 11 ficou com o apelido mais recente, do roteiro rot-novo' }]);
  });

  it('o roteiro sem claquete (ou que não existe mais) não tem para onde ir: fica deixado', () => {
    const { ficam, deixados } = juntarApelidosPelaClaquete([antigo('rot-sumiu', '', 'Nome velho', '2026-11-01T10:00:00Z')]);
    expect(ficam).toEqual([]);
    expect(deixados).toEqual([{ roteiro: 'rot-sumiu', apelido: 'Nome velho', versoes: null, motivo: 'o roteiro não tem claquete' }]);
  });
});
