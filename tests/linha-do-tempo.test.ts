import { describe, expect, it } from 'vitest';
import { frasesDaLinhaDoTempo, linhaDoTempoDoCard, type EventoDaLinha, type ProducaoDaLinha } from '../src/modelo/linhaDoTempo';

/* A Linha do tempo (#89): os eventos da Produção em frases curtas do dia a dia, em ordem. As horas são as do relógio
   local (como a agenda mostra), por isso os instantes saem de datas locais. */

const em = (dia: number, h: number, m = 0, mes = 11) => new Date(2026, mes - 1, dia, h, m).toISOString();
const producao = (p: Partial<ProducaoDaLinha> = {}): ProducaoDaLinha => ({ etapa: 'produzindo', entradaEm: null, entregaEm: null, artes: [], artesQuantidade: null, arquivada: false, ...p });
const ev = (tipo: EventoDaLinha['tipo'], quando: string, e: Partial<EventoDaLinha> = {}): EventoDaLinha => ({ tipo, antes: null, depois: null, quem: null, quando, ...e });

describe('a linha do tempo da Produção', () => {
  it('entrou, quem pegou, as artes e a entrega, com o dia só quando muda', () => {
    const eventos = [
      ev('criada', em(26, 9, 40), { depois: 'entrada' }),
      ev('designer-entrou', em(26, 10, 2), { depois: 'Rafael' }),
      ev('etapa', em(26, 10, 3), { antes: 'entrada', depois: 'produzindo' }),
      ev('arte-marcada', em(26, 12, 0), { depois: 'HOJE' }),
      ev('arte-marcada', em(26, 13, 0), { depois: 'AMANHÃ' }),
      ev('arte-marcada', em(26, 14, 0), { depois: 'SÁBADO' }),
      ev('etapa', em(26, 15, 20), { antes: 'produzindo', depois: 'entregue' }),
    ];
    expect(frasesDaLinhaDoTempo(producao({ artesQuantidade: 5 }), eventos)).toEqual(['entrou 26/11 9h40', 'Rafael pegou 10h02', 'em produção 10h03', '3 de 5 artes', 'entregue 15h20']);
  });

  it('a arte desmarcada desconta, e a mesma arte marcada duas vezes conta uma', () => {
    const eventos = [
      ev('arte-marcada', em(26, 12), { depois: 'HOJE' }),
      ev('arte-marcada', em(26, 12, 5), { depois: 'AMANHÃ' }),
      ev('arte-desmarcada', em(26, 12, 6), { antes: 'AMANHÃ' }),
      ev('arte-marcada', em(26, 12, 7), { depois: 'HOJE' }),
    ];
    expect(frasesDaLinhaDoTempo(producao({ artes: ['HOJE', 'AMANHÃ'] }), eventos)).toEqual(['1 de 2 artes']);
  });

  it('as marcações separadas por outro evento viram dois grupos, cada um com a conta até ali; sem o total, só a conta', () => {
    const eventos = [
      ev('arte-marcada', em(26, 12), { depois: 'A' }),
      ev('designer-saiu', em(26, 13), { antes: 'Rafael' }),
      ev('arte-marcada', em(26, 14), { depois: 'B' }),
      ev('arte-marcada', em(26, 14, 5), { depois: 'C' }),
    ];
    expect(frasesDaLinhaDoTempo(producao(), eventos)).toEqual(['1 arte marcada', 'Rafael saiu 26/11 13h00', '3 artes marcadas']);
  });

  it('o dia aparece de novo quando a próxima frase é de outro dia', () => {
    const eventos = [ev('criada', em(25, 18, 30)), ev('designer-entrou', em(26, 9, 5), { depois: 'Bia' }), ev('arquivada', em(30, 8), { antes: 'entregue', depois: 'arquivada' }), ev('desarquivada', em(1, 9, 0, 12), { antes: 'arquivada', depois: 'entregue' })];
    expect(frasesDaLinhaDoTempo(producao(), eventos)).toEqual(['entrou 25/11 18h30', 'Bia pegou 26/11 9h05', 'arquivada 30/11 8h00', 'desarquivada 1/12 9h00']);
  });

  it('as voltas de etapa e os campos mudados, em português do dia a dia', () => {
    const eventos = [
      ev('etapa', em(26, 9), { antes: 'entregue', depois: 'produzindo' }),
      ev('etapa', em(26, 9, 10), { antes: 'produzindo', depois: 'entrada' }),
      ev('campo', em(26, 9, 20), { campo: 'prioridade', antes: null, depois: 'ALTA' }),
      ev('campo', em(26, 9, 30), { campo: 'complexidade', antes: 'Baixa', depois: 'Média' }),
      ev('campo', em(26, 9, 40), { campo: 'praca', antes: 'RJ', depois: 'SP' }),
      ev('campo', em(26, 9, 50), { campo: 'entrega', antes: null, depois: em(27, 18) }),
      ev('campo', em(26, 10), { campo: 'prioridade', antes: 'ALTA', depois: null }),
      ev('campo', em(26, 10, 5), { campo: 'entrega', antes: em(27, 18), depois: null }),
    ];
    expect(frasesDaLinhaDoTempo(producao(), eventos)).toEqual([
      'voltou para a produção 26/11 9h00',
      'voltou para a entrada 9h10',
      'prioridade alta 9h20',
      'complexidade média 9h30',
      'praça SP 9h40',
      'prazo 27/11 18h00',
      'sem prioridade 10h00',
      'sem prazo',
    ]);
  });

  it('em ordem de quando aconteceu, mesmo que o aviso tenha chegado atrasado', () => {
    const eventos = [ev('etapa', em(26, 15, 20), { antes: 'produzindo', depois: 'entregue' }), ev('designer-entrou', em(26, 10, 2), { depois: 'Rafael' })];
    expect(frasesDaLinhaDoTempo(producao(), eventos)).toEqual(['Rafael pegou 26/11 10h02', 'entregue 15h20']);
  });

  it('o aviso do Padeiro numa Produção entregue: quem abriu o projeto (#139)', () => {
    const eventos = [ev('etapa', em(26, 15, 20), { antes: 'produzindo', depois: 'entregue' }), ev('abriu-o-projeto', em(27, 9, 10), { depois: 'Rafael' })];
    expect(frasesDaLinhaDoTempo(producao({ etapa: 'entregue' }), eventos)).toEqual(['entregue 26/11 15h20', 'Rafael abriu o projeto 27/11 9h10']);
  });

  it('a Produção que já estava lá antes dos eventos começa por "na produção desde"', () => {
    const eventos = [ev('designer-entrou', em(26, 10, 2), { depois: 'Rafael' })];
    expect(frasesDaLinhaDoTempo(producao({ entradaEm: em(20, 11) }), eventos)).toEqual(['na produção desde 20/11', 'Rafael pegou 26/11 10h02']);
  });

  it('sem eventos, só o estado atual: desde quando está na produção e, se saiu, a entrega; sem nada, nada', () => {
    expect(frasesDaLinhaDoTempo(producao({ entradaEm: em(20, 11) }), [])).toEqual(['na produção desde 20/11']);
    expect(frasesDaLinhaDoTempo(producao({ etapa: 'entregue', entradaEm: em(20, 11), entregaEm: em(21, 15, 20) }), [])).toEqual(['na produção desde 20/11', 'entregue 21/11 15h20']);
    expect(frasesDaLinhaDoTempo(producao(), [])).toEqual([]);
  });
});

describe('a linha do tempo do card aberto (#160)', () => {
  const ev = (tipo: EventoDaLinha['tipo'], quando: string, extra: Partial<EventoDaLinha> = {}): EventoDaLinha => ({ tipo, antes: null, depois: null, quem: null, quando, ...extra });
  it('um evento por linha, do mais novo para o mais velho, com quem fez na frente', () => {
    const itens = linhaDoTempoDoCard([
      ev('criada', '2026-11-26T12:00:00Z', { depois: 'entrada' }),
      ev('designer-entrou', '2026-11-26T13:00:00Z', { depois: 'Ana Souza', quem: 'Ana Souza', origem: 'PROMeiro' }),
      ev('designer-entrou', '2026-11-26T13:05:00Z', { depois: 'Caio Prates', quem: 'Ana Souza', origem: 'PROMeiro' }),
      ev('campo', '2026-11-26T14:00:00Z', { campo: 'atracao', depois: 'Novela das Nove', quem: 'Ana Souza', origem: 'PROMeiro' }),
      ev('campo', '2026-11-26T14:10:00Z', { campo: 'prazo', antes: '2026-12-01', depois: '2026-12-04', quem: 'Ana Souza', origem: 'PROMeiro' }),
      ev('designer-saiu', '2026-11-26T15:00:00Z', { antes: 'Caio Prates' }),
    ]);
    expect(itens.map((i) => i.texto)).toEqual(['Caio Prates saiu', 'Ana Souza mudou o prazo para sex 4/12', 'Ana Souza ligou a atração Novela das Nove', 'Ana Souza atribuiu Caio Prates', 'Ana Souza pegou', 'entrou na Entrada']);
    expect(itens.map((i) => i.doPROMeiro)).toEqual([false, true, true, true, true, false]);
  });
  it('os itens da mesma arte de uma vez viram uma linha; apagar, devolver, incluir e o fogo', () => {
    const q = '2026-11-26T16:00:00Z';
    const itens = linhaDoTempoDoCard([
      ev('arte-marcada', q, { depois: 'HOJE (RDP)', quem: 'Ana' }),
      ev('arte-marcada', q, { depois: 'HOJE (CRT)', quem: 'Ana' }),
      ev('arte-apagada', '2026-11-26T16:01:00Z', { antes: 'AMANHÃ', quem: 'Ana' }),
      ev('arte-incluida', '2026-11-26T16:02:00Z', { depois: 'AMANHÃ', quem: 'Ana', desfez: true }),
      ev('arte-incluida', '2026-11-26T16:03:00Z', { depois: 'VINHETA', quem: 'Ana' }),
      ev('fogo', '2026-11-26T16:04:00Z', { campo: 'HOJE', antes: '1', depois: '3', quem: 'Ana' }),
    ]);
    expect(itens.map((i) => i.texto).reverse()).toEqual(['Ana marcou HOJE (RDP), HOJE (CRT)', 'Ana apagou AMANHÃ', 'Ana devolveu AMANHÃ ao checklist', 'Ana incluiu VINHETA', 'Ana mudou o fogo de HOJE para alta']);
  });
});
