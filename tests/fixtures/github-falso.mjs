/* Um GitHub de mentira para o Andamento (#92): a API REST das issues (uma issue, as sub-issues de uma spec, a lista
   por rótulo) e dos commits de uma branch, só leitura. Repositório, números e títulos inventados. Serve aos testes do
   Vitest e aos e2e (import dinâmico). */

/** O repositório e o token falsos (vão no env do teste). */
export const GITHUB_FALSO = { GITHUB_REPO: 'exemplo/pomar', GITHUB_TOKEN: 'token-falso-do-github' };

const resposta = (status, dados) => ({ ok: status < 400, status, json: async () => dados, text: async () => JSON.stringify(dados) });

const issue = (repo, number, title, state = 'open', extra = {}) => ({ number, title, state, html_url: `https://github.com/${repo}/issues/${number}`, closed_at: state === 'closed' ? '2026-11-01T12:00:00Z' : null, labels: [], ...extra });

/**
 * As issues do pomar: as specs da lista do código (src/modelo/andamento.ts) com tickets fictícios, uma spec nova
 * (pronto-para-agente, mais nova que as da lista) e o avulso.
 * @returns { issues: Map<numero, issue>, subIssues: Map<spec, numero[]>, commits: string[] }
 */
export function pomar(repo = GITHUB_FALSO.GITHUB_REPO) {
  const pronto = [{ name: 'pronto-para-agente' }];
  const lista = [
    [56, 'Pomar: colher e guardar', 'closed', [[57, 'Pomar: a colheita', 'closed'], [58, 'Pomar: o celeiro', 'closed']]],
    [64, 'Horta: canteiros e sementes', 'open', [[65, 'Horta: o canteiro', 'closed'], [66, 'Horta: as sementes', 'open'], [67, 'Horta: a rega', 'open']]],
    [69, 'Estufa: a lona, a porta e o calor', 'open', [[70, 'Estufa: a lona', 'open'], [71, 'Estufa: a porta', 'open']]],
    [55, 'Spec: o pomar no celular', 'open', [[80, 'Celular: a colheita no bolso', 'open']]],
    [85, 'Cerca: o portão e os mourões', 'open', [[86, 'Cerca: o portão', 'open'], [87, 'Cerca: os mourões', 'open']]],
    [93, 'Pomar novo: as mudas e o adubo', 'open', [[94, 'Pomar novo: as mudas', 'open']]],
  ];
  const issues = new Map();
  const subIssues = new Map();
  for (const [n, t, s, filhas] of lista) {
    issues.set(n, issue(repo, n, t, s, { labels: pronto, sub_issues_summary: { total: filhas.length } }));
    subIssues.set(n, filhas.map(([f]) => f));
    for (const [f, tf, sf] of filhas) issues.set(f, issue(repo, f, tf, sf, { labels: pronto }));
  }
  // o avulso (o próprio Andamento) e uma spec antiga com o rótulo, que não entra sozinha
  issues.set(92, issue(repo, 92, 'Andamento do pomar ao vivo', 'open', { labels: pronto, sub_issues_summary: { total: 0 } }));
  issues.set(33, issue(repo, 33, 'Velha: a spec de antes', 'open', { labels: pronto, sub_issues_summary: { total: 1 } }));
  subIssues.set(33, []);
  const commits = ['Horta: as sementes (#66)', 'Estufa: a lona (#70)', 'Estufa: o que a revisão apontou na lona (#70)', 'Andamento do pomar ao vivo (#92)', 'mudança sem ticket'];
  return { issues, subIssues, commits };
}

/**
 * @param dados o que o GitHub tem (de `pomar()`); opcoes.repo; opcoes.token o token que ele aceita
 * @returns fetch, com `.estado` (`fora = true` derruba o GitHub; `pedidos` guarda os endereços pedidos)
 */
export function githubFalso(dados = pomar(), opcoes = {}) {
  const repo = opcoes.repo ?? GITHUB_FALSO.GITHUB_REPO;
  const token = opcoes.token ?? GITHUB_FALSO.GITHUB_TOKEN;
  const estado = { fora: false, pedidos: [] };
  const buscar = async (endereco, init = {}) => {
    const url = new URL(endereco);
    if (url.origin !== 'https://api.github.com') throw new Error(`pedido inesperado: ${url.href}`);
    if ((init.method ?? 'GET') !== 'GET') throw new Error(`o Andamento só lê do GitHub: ${init.method} ${url.href}`);
    estado.pedidos.push(url.pathname + url.search);
    if (estado.fora) return resposta(503, { message: 'Service Unavailable' });
    const cabecalhos = new Headers(init.headers ?? {});
    if (cabecalhos.get('authorization') !== `Bearer ${token}`) return resposta(401, { message: 'Bad credentials' });
    const base = `/repos/${repo}`;
    if (!url.pathname.startsWith(base)) return resposta(404, { message: 'Not Found' });
    const rota = url.pathname.slice(base.length);
    const pagina = Number(url.searchParams.get('page') ?? 1);
    let m;
    if (rota === '/commits') return resposta(200, pagina === 1 ? dados.commits.map((message, i) => ({ sha: `c${i}`, commit: { message } })) : []);
    if (rota === '/issues') {
      const rotulo = url.searchParams.get('labels');
      const todas = [...dados.issues.values()].filter((i) => !rotulo || i.labels.some((l) => l.name === rotulo)).sort((a, b) => b.number - a.number);
      return resposta(200, pagina === 1 ? todas : []);
    }
    if ((m = /^\/issues\/(\d+)\/sub_issues$/.exec(rota))) {
      const filhas = dados.subIssues.get(Number(m[1]));
      return filhas ? resposta(200, pagina === 1 ? filhas.map((n) => dados.issues.get(n)) : []) : resposta(404, { message: 'Not Found' });
    }
    if ((m = /^\/issues\/(\d+)$/.exec(rota))) {
      const i = dados.issues.get(Number(m[1]));
      return i ? resposta(200, i) : resposta(404, { message: 'Not Found' });
    }
    return resposta(404, { message: 'Not Found' });
  };
  buscar.estado = estado;
  return buscar;
}
