import { describe, expect, it } from 'vitest';
import { montarAndamento, nomeDaFrente, prontosNoCodigo, specsNovas, tituloCurto, type IssueDoGitHub } from '../src/modelo/andamento';

/* O Andamento do projeto (#92), as regras sem rede: das issues, sub-issues e títulos de commits saem as frentes (uma
   por spec), o progresso (feitos / total) e a situação de cada ticket. Feito = issue fechada OU um commit da branch de
   desenvolvimento cita o ticket no título, "(#N)". Issues e commits fictícios. */

const issue = (number: number, title: string, state: 'open' | 'closed' = 'open', extra: Partial<IssueDoGitHub> = {}): IssueDoGitHub => ({
  number,
  title,
  state,
  html_url: `https://github.com/exemplo/projeto/issues/${number}`,
  ...extra,
});

describe('prontosNoCodigo', () => {
  it('pega só o "(#N)" do título de cada commit, não o corpo nem o "#N" solto', () => {
    const titulos = ['Pomar: a colheita (#12)', 'Pomar: o que a revisão apontou na colheita (#12)', 'Pomar: a poda, ver #13', 'Pomar: rega e adubo (#14) (#15)\n\nCorpo cita (#16)'];
    expect([...prontosNoCodigo(titulos)].sort((a, b) => a - b)).toEqual([12, 14, 15]);
  });
});

describe('montarAndamento', () => {
  it('a frente conta feito o fechado e o pronto no código, e diz a situação de cada ticket', () => {
    const a = montarAndamento({
      specs: [{ issue: issue(10, 'Pomar: colher, podar e regar'), subIssues: [issue(13, 'Pomar: a poda'), issue(11, 'Pomar: a colheita', 'closed'), issue(12, 'Pomar: a rega')], nome: 'Pomar' }],
      titulosDeCommits: ['Pomar: a rega (#12)'],
    });
    expect(a.frentes).toHaveLength(1);
    const f = a.frentes[0];
    expect(f).toMatchObject({ spec: 10, nome: 'Pomar', feitos: 2, total: 3, situacao: 'em andamento', url: 'https://github.com/exemplo/projeto/issues/10' });
    // na ordem do número, com a situação
    expect(f.tickets.map((t) => [t.numero, t.situacao])).toEqual([
      [11, 'fechada'],
      [12, 'pronta no código'],
      [13, 'aberta'],
    ]);
    // o que vem agora: o primeiro aberto
    expect(f.proximo?.numero).toBe(13);
    expect(a.resumo).toEqual({ feitos: 2, total: 3 });
  });

  it('nenhum feito é planejada (começa pelo primeiro aberto); todos feitos é concluída, sem próximo', () => {
    const a = montarAndamento({
      specs: [
        { issue: issue(20, 'Horta: plantar'), subIssues: [issue(22, 'Horta: canteiro'), issue(21, 'Horta: sementes')] },
        { issue: issue(30, 'Estufa: montar', 'closed'), subIssues: [issue(31, 'Estufa: lona', 'closed'), issue(32, 'Estufa: porta')] },
      ],
      titulosDeCommits: ['Estufa: a porta (#32)'],
    });
    expect(a.frentes.map((f) => [f.spec, f.situacao, f.proximo?.numero ?? null, f.specFechada])).toEqual([
      [20, 'planejada', 21, false],
      [30, 'concluída', null, true],
    ]);
    expect(a.resumo).toEqual({ feitos: 2, total: 4 });
  });

  it('a spec sem sub-issues é uma frente vazia (planejada, 0 de 0); o nome sai do título quando não vem', () => {
    const a = montarAndamento({ specs: [{ issue: issue(40, 'Spec: o pomar no celular'), subIssues: [] }], titulosDeCommits: [] });
    expect(a.frentes[0]).toMatchObject({ nome: 'O pomar no celular', feitos: 0, total: 0, situacao: 'planejada', proximo: null });
  });

  it('os avulsos (tickets fora das specs) entram com a situação, sem contar no resumo', () => {
    const a = montarAndamento({ specs: [], avulsos: [issue(50, 'Andamento do pomar'), issue(51, 'Cerca nova', 'closed')], titulosDeCommits: ['Andamento do pomar (#50)'] });
    expect(a.avulsos.map((t) => [t.numero, t.situacao])).toEqual([
      [50, 'pronta no código'],
      [51, 'fechada'],
    ]);
    expect(a.resumo).toEqual({ feitos: 0, total: 0 });
  });

  it('um pull request listado como sub-issue não conta', () => {
    const a = montarAndamento({ specs: [{ issue: issue(60, 'Pomar: x'), subIssues: [issue(61, 'Pomar: y'), issue(62, 'PR', 'open', { pull_request: {} })] }], titulosDeCommits: [] });
    expect(a.frentes[0].total).toBe(1);
  });
});

describe('nomeDaFrente e tituloCurto', () => {
  it('a frente se chama pelo começo do título da spec, sem o "Spec:"', () => {
    expect(nomeDaFrente('Fundação do pomar: colher, podar e regar')).toBe('Fundação do pomar');
    expect(nomeDaFrente('Spec: revisão do pomar no celular')).toBe('Revisão do pomar no celular');
    expect(nomeDaFrente('Pomar sem dois-pontos')).toBe('Pomar sem dois-pontos');
  });
  it('o ticket aparece sem o prefixo da frente', () => {
    expect(tituloCurto('Pomar: a colheita')).toBe('a colheita');
    expect(tituloCurto('Andamento do pomar')).toBe('Andamento do pomar');
  });
});

describe('specsNovas', () => {
  it('entram as specs mais novas que a última da lista: com sub-issues e o rótulo pronto-para-agente', () => {
    const rotulo = [{ name: 'pronto-para-agente' }];
    const candidatas = [
      issue(93, 'Colheita: nova spec', 'open', { labels: rotulo, sub_issues_summary: { total: 3 } }),
      issue(94, 'Ticket solto', 'open', { labels: rotulo, sub_issues_summary: { total: 0 } }),
      issue(95, 'Sem rótulo', 'open', { labels: [{ name: 'precisa-triagem' }], sub_issues_summary: { total: 2 } }),
      // antiga: anterior à lista, fica de fora (a lista fixa é quem escolhe as de antes)
      issue(42, 'Velha: spec antiga', 'open', { labels: rotulo, sub_issues_summary: { total: 3 } }),
      issue(96, 'PR', 'open', { labels: rotulo, sub_issues_summary: { total: 1 }, pull_request: {} }),
    ];
    expect(specsNovas(candidatas, [56, 85, 64]).map((i) => i.number)).toEqual([93]);
  });
});
