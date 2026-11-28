import { describe, expect, it } from 'vitest';
import { caminhosDosRegistros, caminhosPorCard, nomeNoFim, nosDoisSistemas, servidoresDosCaminhos } from '../src/modelo/caminhosDaArte';

/* Os caminhos da arte (#202): a pasta de saída e o projeto da Produção, em Windows e Mac, do registro do projeto do
   Padeiro (#144). Servidores, volumes, pastas e cards inventados. */

const registro = (card: string, data: string, aep: string, output = '') => ({ card, data, aep, output });

describe('o caminho nos dois sistemas', () => {
  it('o de rede dá o Windows e o Mac (o volume do servidor em /Volumes)', () => {
    expect(nosDoisSistemas('\\\\servidor-falso\\ARTE\\SHOWS\\FESTA\\01_PROJETOS\\FESTA.aep')).toEqual({
      win: '\\\\servidor-falso\\ARTE\\SHOWS\\FESTA\\01_PROJETOS\\FESTA.aep',
      mac: '/Volumes/ARTE/SHOWS/FESTA/01_PROJETOS/FESTA.aep',
    });
    // com a barra normal, como o contrato do Padeiro mostra, e a barra no fim
    expect(nosDoisSistemas('//servidor-falso/SAIDA/SHOWS/FESTA/')).toEqual({ win: '\\\\servidor-falso\\SAIDA\\SHOWS\\FESTA', mac: '/Volumes/SAIDA/SHOWS/FESTA' });
  });

  it('o do Mac dá o Windows com o servidor conhecido do volume, sem o -1 a -5 do volume montado de novo', () => {
    const servidores = servidoresDosCaminhos(['\\\\servidor-falso\\saida\\OUTRA']);
    expect(nosDoisSistemas('/Volumes/SAIDA-2/SHOWS/FESTA', servidores)).toEqual({ win: '\\\\servidor-falso\\SAIDA\\SHOWS\\FESTA', mac: '/Volumes/SAIDA/SHOWS/FESTA' });
    // sem o servidor do volume, só o Mac
    expect(nosDoisSistemas('/Volumes/ARTE/SHOWS/FESTA', servidores)).toEqual({ win: '', mac: '/Volumes/ARTE/SHOWS/FESTA' });
  });

  it('a letra do disco fica só no Windows, o caminho local só no Mac, e o vazio é null', () => {
    expect(nosDoisSistemas('Z:/SHOWS/FESTA')).toEqual({ win: 'Z:\\SHOWS\\FESTA', mac: '' });
    expect(nosDoisSistemas('/Users/designer/Desktop/FESTA.aep')).toEqual({ win: '', mac: '/Users/designer/Desktop/FESTA.aep' });
    expect(nosDoisSistemas('  ')).toBeNull();
  });

  it('o nome do arquivo no fim', () => {
    expect(nomeNoFim('\\\\servidor-falso\\ARTE\\01_PROJETOS\\FESTA CHAMADA.aep')).toBe('FESTA CHAMADA.aep');
    expect(nomeNoFim('/Volumes/SAIDA/FESTA/')).toBe('FESTA');
  });
});

describe('os caminhos da arte de um card', () => {
  it('cada caminho do registro mais novo que o tem: o aberto sem a pasta de saída não apaga a dela', () => {
    const r = caminhosDosRegistros([
      registro('c1', '2026-11-20T10:00:00.000Z', '//srv/ARTE/FESTA/01_PROJETOS/FESTA V1.aep', '//srv/SAIDA/FESTA'),
      registro('c1', '2026-11-25T10:00:00.000Z', '//srv/ARTE/FESTA/01_PROJETOS/FESTA V2.aep'),
      registro('c1', '2026-11-22T10:00:00.000Z', '//srv/ARTE/FESTA/01_PROJETOS/FESTA V1B.aep', '//srv/SAIDA/FESTA ANTIGA'),
    ]);
    expect(r?.projeto?.mac).toBe('/Volumes/ARTE/FESTA/01_PROJETOS/FESTA V2.aep');
    expect(r?.saida?.win).toBe('\\\\srv\\SAIDA\\FESTA ANTIGA');
  });

  it('sem caminho nenhum, null', () => {
    expect(caminhosDosRegistros([registro('c1', '2026-11-20T10:00:00.000Z', '', '')])).toBeNull();
    expect(caminhosDosRegistros([])).toBeNull();
  });

  it('por card: só os pedidos e com caminho; o servidor do volume sai dos outros registros e dos conhecidos', () => {
    const porCard = caminhosPorCard(
      [
        registro('c1', '2026-11-25T10:00:00.000Z', '/Volumes/ARTE-1/FESTA/01_PROJETOS/FESTA.aep', '/Volumes/SAIDA/FESTA'),
        registro('c2', '2026-11-20T10:00:00.000Z', '\\\\srv-falso\\ARTE\\OUTRA\\OUTRA.aep'),
        registro('c3', '2026-11-20T10:00:00.000Z', ''),
      ],
      ['c1', 'c3', 'c9'],
      ['\\\\srv-saida\\SAIDA\\QUALQUER'],
    );
    expect(Object.keys(porCard)).toEqual(['c1']);
    expect(porCard.c1).toEqual({
      projeto: { win: '\\\\srv-falso\\ARTE\\FESTA\\01_PROJETOS\\FESTA.aep', mac: '/Volumes/ARTE/FESTA/01_PROJETOS/FESTA.aep' },
      saida: { win: '\\\\srv-saida\\SAIDA\\FESTA', mac: '/Volumes/SAIDA/FESTA' },
    });
  });
});
