/* Vocabulário vindo do Teable: atrações (com as chaves usadas nas claquetes) e redatores.
   Só leitura. Sem configuração, ou se o Teable não responder, devolve o último resultado bom
   (ou listas vazias) e o app segue com o vocabulário embutido. */

import { tabelaNoPg } from './tabelas-do-teable.mjs';
import { abrirPg, nomesDoPg } from './pauta.mjs';

const VALIDADE_MS = 10 * 60 * 1000;
const POR_PAGINA = 1000;
const DIAS_PAUTA = 45; // o mesmo prazo da consulta no Postgres (pauta.mjs)

/** Os títulos de um vínculo do Teable (lista de { id, title }, às vezes em JSON). */
const titulos = (v) => {
  let lista = v;
  if (typeof v === 'string') {
    try {
      lista = JSON.parse(v || '[]');
    } catch {
      lista = [v];
    }
  }
  return [...new Set((Array.isArray(lista) ? lista : lista ? [lista] : []).map((x) => texto(x)).filter(Boolean))];
};
/** O campo "ativo" dos redatores: a lista ativo/inativo (como o status dos designers) ou um checkbox. Sem o campo,
    ou vazio, conta como ativo. */
const ehAtivo = (v) => {
  const t = Array.isArray(v) ? texto(v[0]) : typeof v === 'boolean' ? (v ? 'ativo' : 'inativo') : texto(v);
  return !/^(inativ|false|0$|nao|não)/i.test(t);
};
/** Os redatores, um por nome, com as keys e o "ativo", em ordem alfabética. */
const listaDeRedatores = (linhas) => {
  const porNome = new Map();
  for (const l of linhas) {
    const nome = texto(l.redator);
    if (nome && !porNome.has(nome)) porNome.set(nome, { nome, keys: titulos(l.key), ativo: ehAtivo(l.ativo) });
  }
  return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

const texto = (v) => (Array.isArray(v) ? v.map(texto).filter(Boolean).join(', ') : v == null ? '' : String(typeof v === 'object' ? (v.title ?? v.name ?? '') : v)).trim();

/** `cache` (opcional) divide o resultado entre instâncias; `copia` (opcional) guarda a última leitura boa
    no banco do app, para quando o Teable estiver fora do ar, inclusive logo depois de um reinício. */
export function criarVocabulario(env, buscar = fetch, cache = null, copia = null, consultar = null, abrir = abrirPg) {
  const base = (env.TEABLE_URL || '').replace(/\/+$/, '');
  const ligado = !!((base && env.TEABLE_TOKEN && (env.TEABLE_ATRACOES || env.TEABLE_REDATORES || env.TEABLE_EDITORES || env.TEABLE_PAUTA)) || (env.TEABLE_PG_URL && tabelaNoPg(env, 'atracoes')));
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

  // pelo Postgres do Teable (só leitura), quando há: não depende do token da API nem da paginação
  const esquema = nomesDoPg(env, '').esquema;
  const tabelaPg = (nome) => (esquema && tabelaNoPg(env, nome) ? `"${esquema}"."${tabelaNoPg(env, nome)}"` : null);
  const pg = { atracoes: tabelaPg('atracoes'), redatores: tabelaPg('redatores'), editores: tabelaPg('editores') };
  let banco = null;
  async function sql(texto) {
    if (consultar) return consultar(texto);
    banco ??= await abrir(env.TEABLE_PG_URL);
    return (await banco.query(texto)).rows;
  }
  /** As atrações com as keys (o vínculo pattern → KEY_atracoes) e a categoria, numa consulta. */
  async function atracoesDoPg() {
    const linhas = await sql(`SELECT "atracao", "categoria", "pattern" FROM ${pg.atracoes}`);
    return linhas
      .map((l) => ({
        nome: texto(l.atracao),
        chaves: [...new Set((Array.isArray(l.pattern) ? l.pattern : typeof l.pattern === 'string' ? JSON.parse(l.pattern || '[]') : l.pattern ? [l.pattern] : []).map((k) => texto(k)).filter(Boolean))],
        ...(texto(l.categoria) ? { categoria: texto(l.categoria) } : {}),
      }))
      .filter((a) => a.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /* O que acabou de ser cadastrado. O Teable grava a key (com o link para a atração) na hora, mas a coluna de keys
     da própria atração (o outro lado do link, que o Postgres devolve) só se ajeita um pouco depois: a leitura logo
     depois do cadastro via a atração nova sem nenhuma key, e a lista do Sem cadastro guardava isso por 10 minutos.
     Até uma leitura trazer as keys por conta própria (ou passar RECENTES_MS), elas entram junto. */
  const RECENTES_MS = 30 * 60 * 1000;
  let recentes = [];
  const comoKey = (k) => String(k ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  function comRecentes(lido) {
    const agora = Date.now();
    const temTudo = (r) => {
      const p = lido.programas?.find((x) => x.nome === r.nome);
      return !!p && r.chaves.every((c) => p.chaves.some((k) => comoKey(k) === comoKey(c)));
    };
    recentes = recentes.filter((r) => r.ate > agora && !temTudo(r));
    if (!recentes.length) return lido;
    const programas = (lido.programas ?? []).map((p) => ({ ...p, chaves: [...(p.chaves ?? [])] }));
    for (const r of recentes) {
      let p = programas.find((x) => x.nome === r.nome);
      if (!p) programas.push((p = { nome: r.nome, chaves: [] }));
      for (const c of r.chaves) if (!p.chaves.some((k) => comoKey(k) === comoKey(c))) p.chaves.push(c);
    }
    return { ...lido, programas: programas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) };
  }

  // para o diagnóstico: de onde veio a última leitura e o que deu errado
  const estado = { origem: '', erroPg: '', erroApi: '', em: '' };

  async function carregar() {
    const novo = { ...guardado };
    let peloPg = false;
    if (env.TEABLE_PG_URL && pg.atracoes) {
      try {
        novo.programas = await atracoesDoPg();
        // to_jsonb: sem o campo "ativo" (ou "key") na tabela, a consulta não quebra e todos contam como ativos
        if (pg.redatores) novo.redatores = listaDeRedatores(await sql(`SELECT r."redator", to_jsonb(r)->'key' AS key, to_jsonb(r)->'ativo' AS ativo FROM ${pg.redatores} r`));
        if (pg.editores) novo.editores = [...new Set((await sql(`SELECT "editor" FROM ${pg.editores}`)).map((l) => texto(l.editor)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        peloPg = true;
        estado.origem = 'postgres';
        estado.erroPg = '';
      } catch (e) {
        estado.erroPg = e instanceof Error ? e.message : String(e);
        console.warn(`[vocabulário] não li as atrações pelo Postgres, vou pela API: ${estado.erroPg}`);
      }
    }
    if (env.TEABLE_ATRACOES && !peloPg) {
      estado.origem = 'api';
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
    if (env.TEABLE_REDATORES && !(peloPg && pg.redatores)) {
      const campo = env.TEABLE_CAMPO_REDATOR || 'redator';
      novo.redatores = listaDeRedatores((await registros(env.TEABLE_REDATORES)).map((f) => ({ redator: f[campo], key: f.key, ativo: f.ativo })));
    }
    if (env.TEABLE_EDITORES && !(peloPg && pg.editores)) {
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
    parar: () => banco?.end?.().catch(() => {}),
    /** Para o diagnóstico: de onde veio a lista, quantas atrações, e os erros. */
    estado: () => ({ ...estado, atracoes: guardado.programas?.length ?? 0, comKeys: (guardado.programas ?? []).filter((p) => p.chaves?.length).length }),
    /** Depois de um cadastro: a próxima leitura vai ao Teable, sem esperar a validade. `entrou` são as keys que
        acabaram de ser gravadas ([{ nome, chaves }]): valem já, mesmo que o Teable ainda não as mostre na atração.
        Com `entrou` null (uma remoção), o que estava esperando o Teable deixa de valer. */
    async renovar(entrou = []) {
      const ate = Date.now() + RECENTES_MS;
      if (entrou) recentes.push(...entrou.filter((r) => r?.nome && r.chaves?.length).map((r) => ({ nome: r.nome, chaves: [...r.chaves], ate })));
      else recentes = [];
      // uma leitura que já estava em curso começou antes do cadastro: espera ela acabar e lê de novo
      if (emCurso) await emCurso.catch(() => {});
      lidoEm = 0;
      await cache?.guardar('vocabulario', null, 1);
      return this.ler();
    },
    async ler() {
      if (!ligado) return guardado;
      if (Date.now() - lidoEm < VALIDADE_MS) return guardado;
      emCurso ??= (async () => {
        const doCache = await cache?.ler('vocabulario');
        if (doCache) return void (guardado = doCache);
        guardado = comRecentes(await carregar());
        estado.em = new Date().toISOString();
        estado.erroApi = '';
        console.log(`[vocabulário] ${guardado.programas?.length ?? 0} atrações, pelo ${estado.origem || '—'}`);
        await cache?.guardar('vocabulario', guardado, VALIDADE_MS / 1000);
        copia?.guardar('vocabulario', guardado);
        avisouCopia = false;
      })()
        .catch((e) => {
          estado.erroApi = `${e.message} ${e.cause?.code ?? e.cause?.message ?? ''}`.trim();
          estado.origem = copia?.ler('vocabulario') ? 'cópia local antiga' : 'nenhuma';
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
