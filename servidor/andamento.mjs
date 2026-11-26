/* O Andamento do projeto (#92): o servidor lê a API REST do GitHub (só leitura) com o GITHUB_TOKEN, no repositório do
   GITHUB_REPO (e os commits da GITHUB_BRANCH, ou da branch padrão), e monta as frentes com src/modelo/andamento.ts.
   A resposta fica guardada alguns minutos na memória ("ler de novo" vai ao GitHub) e a última leitura que deu certo
   fica no SQLite (a cópia do #76/#79): sem token ou com o GitHub fora, a página mostra essa, com desde quando ele não
   responde. O token nunca sai daqui. */
import { AVULSOS, ETAPAS, ROTULO_DAS_SPECS, SPECS, montarAndamento, specsNovas } from '../src/modelo/andamento.ts';

const API = 'https://api.github.com';
const GUARDADA = 'andamento-do-github';
const FORA = 'github-fora-do-ar';
/** Quanto tempo a leitura vale na memória antes de ir ao GitHub de novo. */
export const VALE_POR_MS = 5 * 60_000;
/** Com o GitHub fora, quanto tempo a página aberta de novo não espera por ele outra vez ("ler de novo" tenta). */
const FALHA_VALE_POR_MS = 60_000;
/** Até quantas páginas de 100 commits se leem (os mais novos primeiro). */
const PAGINAS_DE_COMMITS = 5;
const limpo = (v) => String(v ?? '').trim();

/** O que falta no Portainer para ler o GitHub. */
export function faltaParaOAndamento(env) {
  return [!limpo(env.GITHUB_TOKEN) && 'GITHUB_TOKEN', !/^[\w.-]+\/[\w.-]+$/.test(limpo(env.GITHUB_REPO)) && 'GITHUB_REPO'].filter(Boolean);
}

/**
 * @param copia { ler(chave), guardar(chave, dados) }: a cópia local no SQLite
 * @param buscar o fetch (os testes trocam por um GitHub de mentira)
 * @returns ler(env, { deNovo }) → { etapas, andamento, lidoEm, falta, foraDoAr, repo } (nunca lança por o GitHub
 *   não responder)
 */
export function criarAndamento({ copia, buscar = fetch }) {
  // a última resposta desta partida: { repo, em (quando foi pedida ao GitHub), vale (ms), r }
  let naMemoria = null;
  let lendo = null;

  async function doGitHub(env) {
    const repo = limpo(env.GITHUB_REPO);
    const cabecalhos = { accept: 'application/vnd.github+json', authorization: `Bearer ${limpo(env.GITHUB_TOKEN)}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'PROMeiro' };
    const pedir = async (caminho, { ausente = false } = {}) => {
      const r = await buscar(`${API}/repos/${repo}${caminho}`, { headers: cabecalhos, signal: AbortSignal.timeout(15_000) });
      if (ausente && r.status === 404) return null;
      if (r.status === 401) throw new Error('o GitHub recusou o token (401): confira o GITHUB_TOKEN');
      if (!r.ok) throw new Error(`o GitHub respondeu ${r.status} em ${caminho.split('?')[0]}`);
      return r.json();
    };
    const branch = limpo(env.GITHUB_BRANCH);
    async function titulosDosCommits() {
      const titulos = [];
      for (let pagina = 1; pagina <= PAGINAS_DE_COMMITS; pagina++) {
        const lote = await pedir(`/commits?per_page=100&page=${pagina}${branch ? `&sha=${encodeURIComponent(branch)}` : ''}`);
        titulos.push(...lote.map((c) => String(c?.commit?.message ?? '').split('\n')[0]));
        if (lote.length < 100) break;
      }
      return titulos;
    }
    const daLista = SPECS.map((s) => s.numero);
    const [candidatas, titulosDeCommits, avulsos] = await Promise.all([
      pedir(`/issues?labels=${encodeURIComponent(ROTULO_DAS_SPECS)}&state=all&sort=created&direction=desc&per_page=100`),
      titulosDosCommits(),
      Promise.all(AVULSOS.map((n) => pedir(`/issues/${n}`, { ausente: true }))),
    ]);
    const novas = specsNovas(candidatas, daLista);
    const lidas = await Promise.all([
      ...SPECS.map(async (s) => {
        const issue = await pedir(`/issues/${s.numero}`, { ausente: true });
        return issue && { issue, nome: s.nome, subIssues: (await pedir(`/issues/${s.numero}/sub_issues?per_page=100`, { ausente: true })) ?? [] };
      }),
      ...novas.map(async (issue) => ({ issue, subIssues: (await pedir(`/issues/${issue.number}/sub_issues?per_page=100`, { ausente: true })) ?? [] })),
    ]);
    return montarAndamento({ specs: lidas.filter(Boolean), avulsos: avulsos.filter(Boolean), titulosDeCommits });
  }

  /** A última leitura guardada deste repositório (de outro não vale). */
  const guardada = (repo) => {
    const g = copia.ler(GUARDADA);
    return g?.dados?.repo === repo ? { andamento: g.dados.andamento, lidoEm: g.em } : null;
  };

  async function ler(env, { deNovo = false } = {}) {
    const repo = limpo(env.GITHUB_REPO);
    const base = { etapas: ETAPAS, repo, falta: faltaParaOAndamento(env), foraDoAr: null };
    if (base.falta.length) {
      const g = repo ? guardada(repo) : null;
      return { ...base, andamento: g?.andamento ?? null, lidoEm: g?.lidoEm ?? null };
    }
    if (!deNovo && naMemoria?.repo === repo && Date.now() - naMemoria.em < naMemoria.vale) return { ...base, ...naMemoria.r };
    lendo ??= (async () => {
      const em = Date.now();
      try {
        const andamento = await doGitHub(env);
        copia.guardar(GUARDADA, { repo, andamento });
        if (copia.ler(FORA)?.dados) copia.guardar(FORA, null);
        const lidoEm = copia.ler(GUARDADA).em;
        naMemoria = { repo, em, vale: VALE_POR_MS, r: { andamento, lidoEm } };
        return naMemoria.r;
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        const antes = copia.ler(FORA)?.dados;
        const desde = antes?.desde ?? new Date().toISOString();
        if (!antes) copia.guardar(FORA, { desde });
        console.warn(`[andamento] o GitHub não respondeu: ${motivo}`);
        const g = guardada(repo);
        naMemoria = { repo, em, vale: FALHA_VALE_POR_MS, r: { andamento: g?.andamento ?? null, lidoEm: g?.lidoEm ?? null, foraDoAr: { motivo, desde } } };
        return naMemoria.r;
      }
    })().finally(() => (lendo = null));
    return { ...base, ...(await lendo) };
  }

  return { ler };
}
