/* Vocabulário vindo do Teable: atrações (com as chaves usadas nas claquetes) e redatores.
   Só leitura. Sem configuração, ou se o Teable não responder, devolve o último resultado bom
   (ou listas vazias) e o app segue com o vocabulário embutido. */

const VALIDADE_MS = 10 * 60 * 1000;
const POR_PAGINA = 1000;

const texto = (v) => (Array.isArray(v) ? v.map(texto).filter(Boolean).join(', ') : v == null ? '' : String(typeof v === 'object' ? (v.title ?? v.name ?? '') : v)).trim();

export function criarVocabulario(env, buscar = fetch) {
  const base = (env.TEABLE_URL || '').replace(/\/+$/, '');
  const ligado = !!(base && env.TEABLE_TOKEN && (env.TEABLE_ATRACOES || env.TEABLE_REDATORES || env.TEABLE_EDITORES || env.TEABLE_PAUTA));
  let guardado = { programas: [], redatores: [], editores: [], pauta: [] };
  let lidoEm = 0;
  let emCurso = null;

  async function registros(tabela, visao = '') {
    const todos = [];
    for (let pular = 0; pular < 20 * POR_PAGINA; pular += POR_PAGINA) {
      const r = await buscar(`${base}/api/table/${encodeURIComponent(tabela)}/record?fieldKeyType=name&take=${POR_PAGINA}&skip=${pular}${visao ? `&viewId=${encodeURIComponent(visao)}` : ''}`, {
        headers: { authorization: `Bearer ${env.TEABLE_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`Teable respondeu ${r.status} para a tabela ${tabela}`);
      const pagina = (await r.json()).records ?? [];
      todos.push(...pagina.map((x) => x.fields ?? {}));
      if (pagina.length < POR_PAGINA) break;
    }
    return todos;
  }

  async function carregar() {
    const novo = { ...guardado };
    if (env.TEABLE_ATRACOES) {
      const campoChave = env.TEABLE_CAMPO_CHAVE || 'key';
      const campoNome = env.TEABLE_CAMPO_ATRACAO || 'atracoes';
      const porNome = new Map();
      for (const f of await registros(env.TEABLE_ATRACOES)) {
        const nome = texto(f[campoNome]);
        const chave = texto(f[campoChave]);
        if (!nome) continue;
        if (!porNome.has(nome)) porNome.set(nome, []);
        if (chave) porNome.get(nome).push(chave);
      }
      // a categoria (NOVELAS, ESPORTES…) mora no cadastro de atrações, quando ele é informado
      const categorias = new Map();
      if (env.TEABLE_CADASTRO)
        for (const f of await registros(env.TEABLE_CADASTRO)) categorias.set(texto(f[env.TEABLE_CAMPO_NOME || 'atracao']), texto(f[env.TEABLE_CAMPO_CATEGORIA || 'categoria']));
      novo.programas = [...porNome]
        .map(([nome, chaves]) => ({ nome, chaves, ...(categorias.get(nome) ? { categoria: categorias.get(nome) } : {}) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    if (env.TEABLE_REDATORES) {
      const campo = env.TEABLE_CAMPO_REDATOR || 'redator';
      const nomes = (await registros(env.TEABLE_REDATORES)).map((f) => texto(f[campo])).filter(Boolean);
      novo.redatores = [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
    if (env.TEABLE_EDITORES) {
      const nomes = (await registros(env.TEABLE_EDITORES)).map((f) => texto(f[env.TEABLE_CAMPO_EDITOR || 'editor'])).filter(Boolean);
      novo.editores = [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
    if (env.TEABLE_PAUTA) {
      // pauta da edição: quem está com cada claquete. Para a mesma chave, vale o expediente mais recente.
      const porChave = new Map();
      for (const f of await registros(env.TEABLE_PAUTA, env.TEABLE_PAUTA_VISAO)) {
        const chave = texto(f.key);
        const editor = texto(f.editor);
        const quando = texto(f.expediente_inicio) || texto(f.data);
        if (!chave || !editor) continue;
        const atual = porChave.get(chave);
        if (!atual || quando >= atual.quando) porChave.set(chave, { editor, quando });
      }
      novo.pauta = [...porChave].map(([chave, v]) => ({ chave, editor: v.editor }));
    }
    return novo;
  }

  return {
    ligado,
    async ler() {
      if (!ligado) return guardado;
      if (Date.now() - lidoEm < VALIDADE_MS) return guardado;
      emCurso ??= carregar()
        .then((novo) => {
          guardado = novo;
        })
        .catch((e) => console.error('[vocabulário] não consegui ler o Teable:', e.message, e.cause?.code ?? e.cause?.message ?? ''))
        .finally(() => {
          lidoEm = Date.now();
          emCurso = null;
        });
      await emCurso;
      return guardado;
    },
  };
}
