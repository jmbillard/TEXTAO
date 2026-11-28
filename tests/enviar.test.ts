import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { andamentoDaArte, avisosDoEnvio, docParaAFila, ehEnvio, letraEVersaoDoEnvio, motivoDoEnvio, propostaDaClaquete, roteiroDoEnvio, textoDoMotivo } from '../src/modelo/enviar';
import { artesDoTexto } from '../src/modelo/trecho';
import { artesDoEnvio, artesUnicas, exportar } from '../src/modelo/exportar';
import { registrarVocabulario } from '../src/modelo/vocabularios';
import { metaVazia, type NoJSON } from '../src/modelo/tipos';

/* O Enviar (#194): a claquete proposta, os avisos de "não bate", o roteiro que vai para a fila (com os trechos inteiros
   do tipo arte chegando à fila e ao Trello), a foto do envio e o andamento da arte. Dados inventados. */

const arte = (texto: string, id: string): NoJSON => ({ type: 'text', text: texto, marks: [{ type: 'arte', attrs: { id, subtipo: '' } }] });
const txt = (texto: string): NoJSON => ({ type: 'text', text: texto });
const par = (content: NoJSON[], attrs?: Record<string, unknown>): NoJSON => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content });
const HOJE = new Date(2026, 10, 20, 12);

beforeAll(() => registrarVocabulario({ programas: [{ nome: 'Brasa na Panela', chaves: ['BRASA'] }, { nome: 'Dança Livre', chaves: ['DANCA LIVRE'] }], redatores: [] }));
afterAll(() => registrarVocabulario(null));

describe('o documento que vai para a fila', () => {
  const doc: NoJSON = {
    type: 'doc',
    content: [
      par([txt('NESTE SÁBADO, '), arte('OITO CHURRASQUEIROS', 'a1'), txt(' NA BRASA.')], { tipo: 'locucao', confirmado: true }),
      // o trecho do tipo arte que a folha já cobriu, e um gravado sem a marca (antes dela)
      par([arte('Cartela: SÁBADO, 22H', 'a2')], { tipo: 'arte', confirmado: true }),
      par([txt('AMANHÃ, NA BRASA')], { tipo: 'arte', confirmado: false }),
    ],
  };

  it('o trecho inteiro do tipo arte chega à fila e ao Trello, com a mesma lista do texto', () => {
    const fila = docParaAFila(doc);
    const r = { id: 'x', meta: metaVazia(), doc: fila, revisao: 1, criadoEm: '', atualizadoEm: '' };
    const saida = exportar(r);
    expect(artesUnicas(saida.artes).map((a) => a.texto)).toEqual(artesDoTexto(doc).map((a) => a.texto));
    expect(artesDoEnvio(saida, r.meta).map((a) => a.texto)).toEqual(['OITO CHURRASQUEIROS', 'Cartela: SÁBADO, 22H', 'AMANHÃ, NA BRASA']);
    // a marca que já estava fica (o tipo da arte escolhido na folha vai junto)
    expect(fila.content![1]).toEqual(doc.content![1]);
  });

  it('o recado vai para a fila como a etiqueta dos roteiros de fora: para a edição, a produção e a arte', () => {
    const comRecados: NoJSON = {
      type: 'doc',
      content: [
        par([txt('NESTE SÁBADO, NA BRASA.')], { tipo: 'locucao', confirmado: true }),
        par([txt('Abrir no plano da grelha')], { tipo: 'edicao', confirmado: true }),
        par([txt('Providenciar a grelha de 2 metros')], { tipo: 'producao', confirmado: true }),
        par([txt('A cartela entra com o logo novo')], { tipo: 'comentario', confirmado: true }),
        // o palpite não é recado: só o que a pessoa escolheu
        par([txt('Texto solto')], { tipo: 'texto', confirmado: false }),
      ],
    };
    const fila = docParaAFila(comRecados);
    const saida = exportar({ id: 'x', meta: metaVazia(), doc: fila, revisao: 1, criadoEm: '', atualizadoEm: '' });
    expect(saida.orientacoes.edicao.map((o) => o.texto)).toEqual(['Abrir no plano da grelha']);
    expect(saida.orientacoes.producao.map((o) => o.texto)).toEqual(['Providenciar a grelha de 2 metros']);
    // o recado para a arte é o "comentário" de sempre da revisão
    expect(saida.comentarios.map((o) => o.texto)).toEqual(['A cartela entra com o logo novo']);
    // e não é lido: fica fora da locução
    expect(saida.texto.locucao).not.toMatch(/cartela|grelha/i);
    // o tipo guardado continua no trecho, e a etiqueta que já estava não dobra
    expect(fila.content![3].attrs).toMatchObject({ tipo: 'comentario' });
    expect(docParaAFila(fila)).toEqual(fila);
  });

  it('sem a garantia, o trecho sem a marca não chegaria à fila', () => {
    const r = { id: 'x', meta: metaVazia(), doc, revisao: 1, criadoEm: '', atualizadoEm: '' };
    expect(artesUnicas(exportar(r).artes).map((a) => a.texto)).not.toContain('AMANHÃ, NA BRASA');
  });

  it('o roteiro da fila: a claquete conferida, em revisão, escrito no PROMeiro, com as pendências', () => {
    const r = roteiroDoEnvio({ meta: { ...metaVazia(), titulo: 'A final da brasa', redator: 'Marina Teles', letra: 'B', substitui: 'velho' }, doc }, { claquete: ' BRASA 21/11 ', programa: 'Brasa na Panela', dataExibicao: '2026-11-21' }, 'novo-1');
    expect(r).toMatchObject({ id: 'novo-1', origem: 'escrito no PROMeiro' });
    expect(r.meta).toMatchObject({ claquete: 'BRASA 21/11', programa: 'Brasa na Panela', titulo: 'A final da brasa', redator: 'Marina Teles', status: 'revisao', layout: 'coluna_unica' });
    expect(r.meta.substitui).toBeUndefined();
    expect(r.meta.letra).toBeUndefined();
    expect(r.meta.revisar).toEqual(['Sem editor']);
  });
});

describe('a claquete proposta', () => {
  const comArtes = (...artes: string[]): NoJSON => ({ type: 'doc', content: artes.map((a, i) => par([arte(a, `a${i}`)])) });

  it('a atração da lista pelo título, a data do título e as versões lidas nas artes', () => {
    const p = propostaDaClaquete({ meta: { titulo: 'Brasa na Panela 21/11, a final' }, doc: comArtes('AMANHÃ, 22H', 'HOJE NA BRASA'), hoje: HOJE });
    expect(p).toMatchObject({ programa: 'Brasa na Panela', dataExibicao: '2026-11-21' });
    expect(p.versoes.map((v) => v.codigo)).toEqual(['A', 'H']);
    expect(p.claquete).toBe('BRASA 21/11 (AH)');
    expect(avisosDoEnvio({ ...p, hoje: HOJE })).toEqual([]);
  });

  it('sem a atração na lista, vale a que o servidor achou; sem versões, a claquete fica sem código', () => {
    const p = propostaDaClaquete({ meta: { titulo: 'Final do campeonato 22/11' }, doc: comArtes('A FINAL'), hoje: HOJE, atracaoDoServidor: 'Dança Livre' });
    expect(p).toMatchObject({ programa: 'Dança Livre', claquete: 'DANCA LIVRE 22/11', versoes: [] });
  });

  it('o reenvio propõe a claquete do envio anterior', () => {
    const p = propostaDaClaquete({ meta: { titulo: 'x', claquete: 'BRASA(FINAL)21/11', programa: 'Brasa na Panela', dataExibicao: '2026-11-21' }, doc: comArtes('NADA'), hoje: HOJE });
    expect(p.claquete).toBe('BRASA(FINAL)21/11');
    // a atração trocada no painel refaz a proposta
    expect(propostaDaClaquete({ meta: { titulo: 'x', claquete: 'BRASA(FINAL)21/11', programa: 'Brasa na Panela', dataExibicao: '2026-11-21' }, doc: comArtes('NADA'), hoje: HOJE, programa: 'Dança Livre' }).claquete).toBe('DANCA LIVRE 21/11');
  });

  it('os avisos de "não bate": a atração, a data e as versões; só a falta da claquete trava', () => {
    const versoes = [{ codigo: 'A', rotulo: 'amanhã', conhecida: true }];
    const avisos = avisosDoEnvio({ claquete: 'DANCA LIVRE 22/11 (H)', programa: 'Brasa na Panela', dataExibicao: '2026-11-21', versoes, hoje: HOJE });
    expect(avisos.map((a) => a.id)).toEqual(['atracao', 'data', 'versoes']);
    expect(avisos.map((a) => a.texto)).toEqual(['A claquete é de Dança Livre, não de Brasa na Panela', 'A claquete diz 22/11, e a exibição é 21/11', 'As artes dizem (A), e a claquete (H)']);
    expect(avisos.some((a) => a.trava)).toBe(false);
    expect(avisosDoEnvio({ claquete: '  ', programa: '', dataExibicao: '', versoes: [] })).toEqual([{ id: 'sem-claquete', texto: 'Falta a claquete', trava: true }]);
    expect(avisosDoEnvio({ claquete: 'CHAMADA SOLTA', programa: '', dataExibicao: '', versoes: [] }).map((a) => a.id)).toEqual(['sem-atracao', 'sem-data']);
  });
});

describe('a foto, a letra e a versão, e o andamento', () => {
  it('o motivo do envio', () => {
    expect(motivoDoEnvio('')).toBe('enviado');
    expect(motivoDoEnvio('  troca   da cartela ')).toBe('enviado: troca da cartela');
    expect(ehEnvio('enviado: x') && ehEnvio('enviado') && !ehEnvio('edição') && !ehEnvio('enviados')).toBe(true);
    expect(textoDoMotivo('enviado: troca da cartela')).toBe('troca da cartela');
  });

  it('o primeiro envio é a A V1; o seguinte, a V2 (não liberada) ou a letra B (liberada)', () => {
    expect(letraEVersaoDoEnvio(null, false)).toEqual({ letra: 'A', versao: 1 });
    expect(letraEVersaoDoEnvio({}, false)).toEqual({ letra: 'A', versao: 2 });
    expect(letraEVersaoDoEnvio({ versao: 2 }, true)).toEqual({ letra: 'B', versao: 1 });
  });

  it('o andamento da arte pela Produção', () => {
    const sit = (p: Parameters<typeof andamentoDaArte>[0]) => andamentoDaArte(p).map((x) => x.situacao);
    expect(sit(null)).toEqual(['depois', 'depois', 'depois']);
    expect(sit({ etapa: 'entrada', entradaEm: '2026-11-20T10:00:00Z' })).toEqual(['agora', 'depois', 'depois']);
    expect(sit({ etapa: 'produzindo' })).toEqual(['feito', 'agora', 'depois']);
    expect(andamentoDaArte({ etapa: 'arquivada', entregaEm: '2026-11-21T18:00:00Z' })[2]).toMatchObject({ situacao: 'agora', quando: '2026-11-21T18:00:00Z' });
  });
});
