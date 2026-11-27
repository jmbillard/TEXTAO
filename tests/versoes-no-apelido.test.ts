import { describe, expect, it } from 'vitest';
import { codigoAMao, mostraOCodigoDasVersoes, nomeComOSufixo, recusaDoCodigoDasVersoes, versoesDaChamada, versoesDoRoteiro } from '../src/modelo/versoesDoRoteiro';

/* As versões que a claquete sabe (#152), guardadas no apelido: o valor inicial vem do código do nome (o do apelido ou o
   da claquete) ou, sem código no nome, das artes do roteiro; o que foi feito à mão vale sobre os dois. O código é um
   sufixo opcional colado no fim do nome, uma vez só, no padrão. Claquetes e artes fictícias; 27/11/2026 é uma sexta. */

const DIA = '2026-11-27';
const lidas = (artes: string[], claquete: string) => versoesDoRoteiro(artes, claquete, DIA);
const codigo = (v: { lista: { codigo: string }[] }) => v.lista.map((x) => x.codigo).join('');

describe('versoesDaChamada: o valor inicial', () => {
  it('pelo nome: o código da claquete, mesmo com o roteiro dizendo outra coisa (o aviso compara com o roteiro)', () => {
    const v = versoesDaChamada({ lidas: lidas(['AMANHÃ'], 'Show Fictício 27/11 (H)'), claquete: 'Show Fictício 27/11 (H)', apelido: '', dia: DIA });
    expect([codigo(v), v.de]).toEqual(['H', 'claquete']);
    expect(v.conflito).toMatchObject({ daClaquete: '(H)', doRoteiro: '(A)' });
  });

  it('pelo nome: o código do apelido vem antes do da claquete', () => {
    const v = versoesDaChamada({ lidas: [], claquete: 'Show Fictício 27/11 (H)', apelido: 'A estreia 27/11 (N)', dia: DIA });
    expect([codigo(v), v.de]).toEqual(['N', 'apelido']);
  });

  it('pelo roteiro: o nome sem código fica com as versões lidas das artes, sem aviso', () => {
    const v = versoesDaChamada({ lidas: lidas(['HOJE', 'AMANHÃ'], 'Show Fictício 27/11'), claquete: 'Show Fictício 27/11', apelido: '', dia: DIA });
    expect([codigo(v), v.de, v.conflito]).toEqual(['AH', 'roteiro', null]);
  });

  it('sem código no nome e sem versão no roteiro: nenhuma versão', () => {
    expect(versoesDaChamada({ lidas: [], claquete: 'Show Fictício 27/11', apelido: '', dia: DIA })).toEqual({ lista: [], de: null, conflito: null });
  });
});

describe('versoesDaChamada: o que foi feito à mão vence', () => {
  it('vale sobre o código do nome e sobre o roteiro, com as etiquetas pela data da claquete', () => {
    const v = versoesDaChamada({ lidas: lidas(['AMANHÃ'], 'Show Fictício 27/11 (H)'), claquete: 'Show Fictício 27/11 (H)', apelido: 'Outro 27/11 (D)', mao: 'PN', dia: DIA });
    expect([codigo(v), v.de]).toEqual(['PN', 'mao']);
    expect(v.lista.map((x) => x.rotulo)).toEqual(['próxima sex', 'nesta sex']);
    // o aviso continua a comparar com o roteiro
    expect(v.conflito).toMatchObject({ daClaquete: '(NP)', doRoteiro: '(A)' });
  });

  it('a claquete sem código e sem versão no roteiro recebe as versões à mão', () => {
    const v = versoesDaChamada({ lidas: [], claquete: 'Show Fictício 27/11', apelido: '', mao: 'MNT', dia: DIA });
    expect([codigo(v), v.de, v.conflito]).toEqual(['MNT', 'mao', null]);
  });

  it('à mão igual ao roteiro: sem aviso', () => {
    const v = versoesDaChamada({ lidas: lidas(['HOJE', 'AMANHÃ'], 'Show 27/11 (H)'), claquete: 'Show 27/11 (H)', apelido: '', mao: 'HA', dia: DIA });
    expect(v.conflito).toBeNull();
  });
});

describe('codigoAMao: o código digitado no apelido', () => {
  it('vira o padrão: maiúsculas, sem parênteses, na ordem escrita; DIA é D, MÊS é M, MNT inteiro', () => {
    expect(codigoAMao('ah')).toEqual({ codigo: 'AH' });
    expect(codigoAMao(' (pnah) ')).toEqual({ codigo: 'PNAH' });
    expect(codigoAMao('dia')).toEqual({ codigo: 'D' });
    expect(codigoAMao('Mês')).toEqual({ codigo: 'M' });
    expect(codigoAMao('mnt')).toEqual({ codigo: 'MNT' });
  });

  it('vazio tira o que foi feito à mão (volta ao inicial)', () => {
    expect(codigoAMao('')).toEqual({ codigo: '' });
    expect(codigoAMao('  ()  ')).toEqual({ codigo: '' });
  });

  it('o código desconhecido ou com letra repetida é recusado', () => {
    expect(codigoAMao('XYZ')).toHaveProperty('recusa');
    expect(codigoAMao('AA')).toHaveProperty('recusa');
    expect(codigoAMao(42 as unknown as string)).toHaveProperty('recusa');
  });
});

describe('nomeComOSufixo: o código colado no fim do nome, uma vez só, no padrão', () => {
  const versoes = (claquete: string, artes: string[] = [], mao?: string) => versoesDaChamada({ lidas: lidas(artes, claquete), claquete, apelido: '', mao, dia: DIA }).lista;

  it('ligado: o nome sem o código de antes e o código no padrão no fim', () => {
    expect(nomeComOSufixo('CHAMADA_CODIGO_27/11 (ha)', versoes('CHAMADA_CODIGO_27/11 (ha)'), true)).toBe('CHAMADA_CODIGO_27/11 (HA)');
    expect(nomeComOSufixo('Show 27/11 AH', versoes('Show 27/11 AH'), true)).toBe('Show 27/11 (AH)');
    // as versões à mão trocam o código do nome, que não aparece duas vezes
    expect(nomeComOSufixo('Show 27/11 (H)', versoes('Show 27/11 (H)', [], 'AH'), true)).toBe('Show 27/11 (AH)');
  });

  it('o código antes da praça no fim também sai do nome; o sufixo vai depois da praça', () => {
    expect(nomeComOSufixo('Show 27/11 (H) RJ', versoes('Show 27/11 (H)'), true)).toBe('Show 27/11 RJ (H)');
    expect(nomeComOSufixo('Show 27/11 (H) RJ', versoes('Show 27/11 (H)'), false)).toBe('Show 27/11 RJ');
    expect(nomeComOSufixo('Show 27/11 SP', versoes('Show 27/11', ['AMANHÃ']), true)).toBe('Show 27/11 SP (A)');
  });

  it('desligado: só o nome, sem o código', () => {
    expect(nomeComOSufixo('CHAMADA_CODIGO_27/11 (AH)', versoes('CHAMADA_CODIGO_27/11 (AH)'), false)).toBe('CHAMADA_CODIGO_27/11');
  });

  it('o desconhecido aparece cru e o "?" da leitura só pelo dia continua, no sufixo', () => {
    expect(nomeComOSufixo('Show 27/11 (XYZ)', versoes('Show 27/11 (XYZ)'), true)).toBe('Show 27/11 (XYZ)');
    const soODia = versoesDoRoteiro(['SÁBADO, 22H'], 'Show 28/11', DIA);
    expect(nomeComOSufixo('Show 28/11', soODia, true)).toBe('Show 28/11 (N)?');
  });

  it('sem versão, o nome como está', () => {
    expect(nomeComOSufixo('Show 27/11', [], true)).toBe('Show 27/11');
  });
});

describe('a opção "Mostrar o código das versões", lembrada por pessoa', () => {
  it('começa ligada; só o false guardado desliga', () => {
    expect(mostraOCodigoDasVersoes(undefined)).toBe(true);
    expect(mostraOCodigoDasVersoes({})).toBe(true);
    expect(mostraOCodigoDasVersoes({ 'versoes.codigo': false })).toBe(false);
    expect(mostraOCodigoDasVersoes({ 'versoes.codigo': 'não' })).toBe(true);
  });

  it('só aceita ligada ou desligada', () => {
    expect(recusaDoCodigoDasVersoes(true)).toBe('');
    expect(recusaDoCodigoDasVersoes(false)).toBe('');
    expect(recusaDoCodigoDasVersoes('sim')).not.toBe('');
  });
});
