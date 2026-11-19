/* Vocabulário vindo do Teable: atrações (com as chaves usadas nas claquetes) e redatores.
   Só leitura. Sem configuração, ou se o Teable não responder, devolve o último resultado bom
   (ou listas vazias) e o app segue com o vocabulário embutido. */

const VALIDADE_MS = 10 * 60 * 1000;
const POR_PAGINA = 1000;
const DIAS_PAUTA = 45; // o mesmo prazo da consulta no Postgres (pauta.mjs)

const texto = (v) => (Array.isArray(v) ? v.map(texto).filter(Boolean).join(', ') : v == null ? '' : String(typeof v === 'object' ? (v.title ?? v.name ?? '') : v)).trim();

/** `cache` (opcional) divide o resultado entre instâncias; `copia` (opcional) guarda a última leitura boa
    no banco do app, para quando o Teable estiver fora do ar, inclusive logo depois de um reinício. */
export function criarVocabulario(env, buscar = fetch, cache = null, copia = null) {
  const base = (env.TEABLE_URL || '').replace(/\/+$/, '');
  const ligado = !!(base && env.TEABLE_TOKEN && (env.TEABLE_ATRACOES || env.TEABLE_REDATORES || env.TEABLE_EDITORES || env.TEABLE_PAUTA));
  const vazio = { programas: [], redatores: [], editores: [], pauta: [] };
  const daCopia = copia?.ler('vocabulario') ?? null;
  let guardado = daCopia ? { ...vazio, ...daCopia.dados } : vazio;
  let avisouCopia = false;
  let lidoEm = 0;
  let emCurso = null;

  const cabecalho = () => ({ authorization: `Bearer ${env.TEABLE_TOKEN}` });

  /** O ID de um campo pelo nome, para ordenar (a ordenação da API pede o ID). */
  async function idDoCampo(tabela, nome) {
    const r = await buscar(`${base}/api/table/${encodeURIComponent(tabela)}/field`, { headers: cabecalho(), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return (await r.json()).find?.((c) => c.name === nome)?.id ?? null;
  }

  /** Lê a tabela em páginas. Com `ordem`, vem do mais novo para o mais antigo e para quando `bastou` disser. */
  async function registros(tabela, visao = '', ordem = null, bastou = null) {
    const todos = [];
    let ordenar = ordem ? `&orderBy=${encodeURIComponent(JSON.stringify([{ fieldId: ordem, order: 'desc' }]))}` : '';
    for (let pular = 0; pular < 20 * POR_PAGINA; pular += POR_PAGINA) {
      const url = (o) => `${base}/api/table/${encodeURIComponent(tabela)}/record?fieldKeyType=name&take=${POR_PAGINA}&skip=${pular}${visao ? `&viewId=${encodeURIComponent(visao)}` : ''}${o}`;
      let r = await buscar(url(ordenar), { headers: cabecalho(), signal: AbortSignal.timeout(8000) });
      if (!r.ok && ordenar && pular === 0) {
        // versão do Teable que não aceita a ordenação: lê na ordem da tabela
        ordenar = '';
        r = await buscar(url(''), { headers: cabecalho(), signal: AbortSignal.timeout(8000) });
      }
      if (!r.ok) throw new Error(`Teable respondeu ${r.status} para a tabela ${tabela}`);
      const pagina = (await r.json()).records ?? [];
      todos.push(...pagina.map((x) => x.fields ?? {}));
      if (pagina.length < POR_PAGINA) break;
      if (ordenar && bastou?.(pagina)) break;
      if (pular + POR_PAGINA >= 20 * POR_PAGINA)
        console.warn(`[vocabulário] a tabela ${tabela} tem mais de ${20 * POR_PAGINA} linhas; li só as primeiras${ordenar ? ' (as mais recentes)' : ''}. Para a pauta, prefira TEABLE_PG_URL ou TEABLE_PAUTA_VISAO.`);
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
      // do mais novo para o mais antigo, até passar de 45 dias: a mesma chave volta no ano seguinte
      const limite = new Date(Date.now() - DIAS_PAUTA * 86400000).toISOString().slice(0, 10);
      const campoData = env.TEABLE_PAUTA_VISAO ? null : await idDoCampo(env.TEABLE_PAUTA, 'data').catch(() => null);
      const antiga = (pagina) => texto(pagina.at(-1)?.data).slice(0, 10) < limite;
      for (const f of await registros(env.TEABLE_PAUTA, env.TEABLE_PAUTA_VISAO, campoData, antiga)) {
        const dia = texto(f.data).slice(0, 10);
        if (campoData && dia && dia < limite) continue;
        const chave = texto(f.key);
        const editor = texto(f.editor);
        const quando = texto(f.expediente_inicio) || texto(f.data);
        if (!chave || !editor) continue;
        const atual = porChave.get(chave);
        if (!atual || quando >= atual.quando) porChave.set(chave, { editor, quando, claquete: texto(f.claquete) });
      }
      novo.pauta = [...porChave].map(([chave, v]) => ({ chave, editor: v.editor, claquete: v.claquete }));
    }
    return novo;
  }

  return {
    ligado,
    async ler() {
      if (!ligado) return guardado;
      if (Date.now() - lidoEm < VALIDADE_MS) return guardado;
      emCurso ??= (async () => {
        const doCache = await cache?.ler('vocabulario');
        if (doCache) return void (guardado = doCache);
        guardado = await carregar();
        await cache?.guardar('vocabulario', guardado, VALIDADE_MS / 1000);
        copia?.guardar('vocabulario', guardado);
        avisouCopia = false;
      })()
        .catch((e) => {
          console.error('[vocabulário] não consegui ler o Teable:', e.message, e.cause?.code ?? e.cause?.message ?? '');
          const c = copia?.ler('vocabulario');
          if (c && !avisouCopia) {
            avisouCopia = true;
            console.log(`[vocabulário] usando a cópia local de ${c.em.slice(0, 16).replace('T', ' ')} (UTC)`);
          }
        })
        .finally(() => {
          lidoEm = Date.now();
          emCurso = null;
        });
      await emCurso;
      return guardado;
    },
  };
}
