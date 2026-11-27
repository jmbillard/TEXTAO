/* Juntar atrações (#117), da correção de grafia: o administrador escolhe, num grupo de atrações parecidas (#116), a
   ficha que fica e o nome final; as outras fichas do grupo saem. É o caminho que as Duplicadas usam para religar o
   acervo (servidor/duplicadas.mjs), na mesma ordem:
     1. guarda uma cópia de cada ficha que sai (os campos dela, lidos do Teable, para recriar);
     2. passa para a que fica as artes do acervo (acervo.religar, pelo vínculo atracao), as keys das claquetes, as
        ligações (os roteiros da produção da arte, pelo vínculo atracao, e os filmes das exibições, pelo vínculo sessao)
        e as regras da atração (no SQLite do PROMeiro, pelo nome);
     3. renomeia a que fica, se o nome final mudou;
     4. apaga a que sai.
   Cada passo feito guarda o seu contrário: se um falhar, o que já foi feito é desfeito, do último para o primeiro.
   Só depois de tudo, a junção entra no registro das correções (servidor/registro-de-correcoes.mjs), com a cópia; a
   ficha que sai só é apagada no fim, então uma junção interrompida nunca perde a ficha. O desfazer recria cada ficha a
   partir da cópia (com outro id), religa a ela o que tinha passado e ainda está na que ficou, devolve o nome da que
   ficou e as regras. A escrita é pela API do Teable, só na base do PROMeiro; a leitura das ligações, pelo Postgres. */
import { vinculos } from './acervo.mjs';
// os campos que não se gravam ao recriar a ficha: os calculados, os vínculos (religados à parte) e os anexos
import { NAO_EDITAVEIS as NAO_GRAVAVEIS } from './cadastros.mjs';

/** O tipo das junções no registro das correções. */
export const TIPO_DAS_ATRACOES = 'atracoes';
const NOME_SQL = /^[A-Za-z0-9_]+$/;
const LOTE = 100;
const limpo = (v) => String(v ?? '').trim();
/** As tabelas em que a junção escreve, e o vínculo de cada uma com a ficha de atração. */
const LIGACOES = [
  { nome: 'KEY_atracoes', campo: 'atracoes', conta: 'keys' },
  { nome: 'ARTE_producao', campo: 'atracao', conta: 'roteiros' },
  { nome: 'exibicoes', campo: 'sessao', conta: 'filmes' },
];
const TABELAS = ['atracoes', 'ARTES_acervo', ...LIGACOES.map((l) => l.nome)];

/** Por que uma junção (ou o desfazer dela) não foi feita, na tela. */
export const TEXTOS = {
  base: 'As tabelas das atrações não estão todas na base do PROMeiro: a junção não grava.',
  teable: 'O Teable não está configurado para gravar (o endereço e o token).',
  sumiu: 'A ficha que ficou não existe mais no Teable.',
  mudou: 'A ficha que ficou mudou de nome desde então no Teable: a junção não foi desfeita.',
};

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
/** "2 artes do acervo, 1 key e 1 regra" (só o que passou). */
function oQuePassou(c) {
  const partes = [
    c.artes && plural(c.artes, 'arte do acervo', 'artes do acervo'),
    c.keys && plural(c.keys, 'key', 'keys'),
    c.regras && plural(c.regras, 'regra', 'regras'),
    c.roteiros && plural(c.roteiros, 'roteiro', 'roteiros'),
    c.filmes && plural(c.filmes, 'filme', 'filmes'),
  ].filter(Boolean);
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}` : (partes[0] ?? '');
}

/** Só o que passou (nada além), para desfazer: cada tabela com a lista dela, vazia quando nada passou. */
const so = (m = {}) => ({ acervo: m.acervo ?? [], keys: m.keys ?? [], roteiros: m.roteiros ?? [], filmes: m.filmes ?? [] });

/** O vínculo trocado: `de` vira `para`, no mesmo formato (lista ou um só), sem repetir. */
function trocado(valor, de, para) {
  if (Array.isArray(valor) || typeof valor === 'string') {
    const ids = vinculos(valor).map((v) => (v.id === de ? para : v.id)).filter(Boolean);
    return [...new Set(ids)].map((id) => ({ id }));
  }
  return { id: para };
}

/**
 * @param env o env dos módulos de agora (o Teable, o Postgres e as tabelas descobertas na base)
 * @param deps.buscar fetch (o Teable de verdade ou um falso); deps.abrir abre o Postgres do Teable
 * @param deps.acervo o acervo de artes (religar, pelo vínculo atracao); deps.regras as regras da atração (passar, voltar)
 */
export function criarJuntarAtracoes(env, { buscar = fetch, abrir, acervo = null, regras }) {
  const tabelas = env.tabelas ?? {};
  const url = limpo(env.TEABLE_URL).replace(/\/+$/, '');
  const token = limpo(env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA);
  const base = limpo(env.TEABLE_PG_ESQUEMA);
  const idDa = (nome) => tabelas[nome]?.id ?? '';
  let banco = null;
  async function consultar(sql, params) {
    banco ??= await abrir(env.TEABLE_PG_URL);
    return (await banco.query(sql, params)).rows;
  }

  /** Pode gravar? Com o Teable configurado e as tabelas que a junção toca (as que existem) na base do PROMeiro. */
  function escrita() {
    if (!idDa('atracoes') || !base || TABELAS.some((n) => tabelas[n] && tabelas[n].esquema !== base)) return { pode: false, aviso: TEXTOS.base };
    if (!url || !token) return { pode: false, aviso: TEXTOS.teable };
    return { pode: true };
  }

  /** Um pedido à API do Teable numa tabela; null é 404 (o registro não existe). */
  async function pedir(metodo, tabela, caminho = '', corpo) {
    const r = await buscar(`${url}/api/table/${encodeURIComponent(idDa(tabela))}/${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? `o token do Teable não tem permissão para gravar em ${tabela}` : `o Teable respondeu ${r.status} em ${tabela}`);
    return r.json().catch(() => ({}));
  }
  const registroDe = (tabela, id) => pedir('GET', tabela, `record/${encodeURIComponent(id)}?fieldKeyType=name`);
  const renomear = (id, nome) => pedir('PATCH', 'atracoes', `record/${encodeURIComponent(id)}`, { fieldKeyType: 'name', typecast: true, record: { fields: { atracao: nome } } });

  /** 1. A cópia da ficha: os campos como o Teable tem, e os que se gravam de volta ao recriar. */
  async function copiaDa(ficha) {
    const lida = await registroDe('atracoes', ficha.id);
    if (!lida) throw new Error(`a ficha ${ficha.nome} não existe mais no Teable`);
    const esquema = await pedir('GET', 'atracoes', 'field');
    if (!Array.isArray(esquema)) throw new Error('não li os campos da tabela de atrações');
    const gravaveis = new Set(esquema.filter((c) => !NAO_GRAVAVEIS.has(c.type) && !c.isComputed).map((c) => c.name));
    const campos = Object.fromEntries(Object.entries(lida.fields ?? {}).filter(([k, v]) => gravaveis.has(k) && v !== null && v !== undefined));
    return { id: ficha.id, nome: ficha.nome, campos, fields: lida.fields ?? {} };
  }
  /** Recria a ficha a partir da cópia. @returns o id novo */
  async function recriar(copia) {
    const r = await pedir('POST', 'atracoes', 'record', { fieldKeyType: 'name', typecast: true, records: [{ fields: copia.campos }] });
    const id = r?.records?.[0]?.id;
    if (!id) throw new Error(`o Teable não devolveu a ficha ${copia.nome} recriada`);
    return id;
  }

  /** Os registros de uma tabela ligados agora à ficha `de` (só os de `ids`, quando vier): [{ id, valor }]. */
  async function ligadosA({ nome, campo }, de, ids) {
    if (nome === 'KEY_atracoes') {
      const lidos = await Promise.all((ids ?? []).map((id) => registroDe(nome, id)));
      return lidos.filter(Boolean).map((l) => ({ id: l.id, valor: l.fields?.[campo] })).filter((l) => vinculos(l.valor).some((v) => v.id === de));
    }
    const pg = tabelas[nome]?.pg;
    if (!env.TEABLE_PG_URL || !NOME_SQL.test(pg ?? '') || !NOME_SQL.test(base)) return [];
    const linhas = await consultar(`SELECT "__id", "${campo}" FROM "${base}"."${pg}" WHERE "${campo}"::text LIKE $1`, [`%${de}%`]);
    const escolhidos = ids ? new Set(ids) : null;
    return linhas.map((l) => ({ id: l.__id, valor: l[campo] })).filter((l) => vinculos(l.valor).some((v) => v.id === de) && (!escolhidos || escolhidos.has(l.id)));
  }

  /**
   * 2. Passa as artes do acervo, as keys e as ligações da ficha `de` para `para`. `apenas` limita aos ids de cada tabela
   * (as keys sempre vêm por ele); `feitas` vai sendo preenchido com o que passou, mesmo quando um lote falha no meio.
   */
  async function passarLigacoes(de, para, apenas, feitas) {
    if (acervo?.ligado) {
      feitas.acervo = [];
      try {
        feitas.acervo = await acervo.religar({ de, para, campo: 'atracao', ids: apenas.acervo ?? null });
      } catch (e) {
        feitas.acervo = e?.religadas ?? [];
        throw e;
      }
    }
    for (const l of LIGACOES) {
      if (!idDa(l.nome)) continue;
      feitas[l.conta] = [];
      const ligados = await ligadosA(l, de, apenas[l.conta]);
      for (let i = 0; i < ligados.length; i += LOTE) {
        const lote = ligados.slice(i, i + LOTE);
        await pedir('PATCH', l.nome, 'record', { fieldKeyType: 'name', typecast: true, records: lote.map((x) => ({ id: x.id, fields: { [l.campo]: trocado(x.valor, de, para) } })) });
        feitas[l.conta].push(...lote.map((x) => x.id));
      }
    }
  }

  /** Roda os passos; se um falhar, desfaz os feitos do último para o primeiro. @returns null ou { erro, naoDesfeito } */
  async function emPassos(passos) {
    const contrarios = [];
    let passo = '';
    try {
      for (const p of passos) {
        passo = p.nome;
        await p.fazer((nome, desfazer) => contrarios.push({ nome, desfazer }));
      }
      return null;
    } catch (e) {
      const erro = `${passo}: ${e instanceof Error ? e.message : e}`;
      const naoDesfeito = [];
      for (const c of contrarios.reverse())
        try {
          await c.desfazer();
        } catch (e2) {
          naoDesfeito.push(`${c.nome} (${e2 instanceof Error ? e2.message : e2})`);
        }
      return { erro, naoDesfeito };
    }
  }

  /**
   * Junta as fichas: `saem` passam para `fica`, que fica com o nome `nome`.
   * @param fica, saem as fichas dos cadastros de agora ({ id, nome, keys: [{ id }] })
   * @param registro o registro das correções (registrar)
   * @returns { ok, registro, resumo, passaram } | { erro, naoDesfeito }
   */
  async function juntar({ fica, saem, nome, por, registro }) {
    const copias = [];
    const regrasDaFica = { movidas: [], apagadas: [] };
    const renomeia = nome !== fica.nome;
    const passos = [
      {
        nome: 'guardar a cópia da ficha que sai',
        fazer: async () => {
          for (const s of saem) copias.push({ ...(await copiaDa(s)), keys: s.keys.map((k) => k.id), movidas: {}, regras: { movidas: [], apagadas: [] } });
        },
      },
      {
        nome: 'passar as artes, as keys, as regras e as ligações',
        fazer: async (contrario) => {
          for (const c of copias) {
            contrario(`o que passou de ${c.nome}`, async () => passarLigacoes(fica.id, c.id, so(c.movidas), {}));
            await passarLigacoes(c.id, fica.id, { keys: c.keys }, c.movidas);
            // as regras da que sai com o nome final já são da que fica (não mudam de nome, mas contam)
            c.jaComONome = c.nome === nome && c.nome !== fica.nome ? regras.lista(nome).length : 0;
            c.regras = regras.passar(c.nome, nome);
            contrario(`as regras de ${c.nome}`, () => regras.voltar(c.regras, c.nome));
          }
        },
      },
      {
        nome: 'renomear a ficha que fica',
        fazer: async (contrario) => {
          if (!renomeia) return;
          if (!(await renomear(fica.id, nome))) throw new Error('a ficha que fica não existe mais no Teable');
          contrario('o nome da ficha que fica', () => renomear(fica.id, fica.nome));
          Object.assign(regrasDaFica, regras.passar(fica.nome, nome));
          contrario('as regras da ficha que fica', () => regras.voltar(regrasDaFica, fica.nome));
        },
      },
      {
        nome: 'apagar a ficha que sai',
        fazer: async (contrario) => {
          for (const c of copias) {
            await pedir('DELETE', 'atracoes', `record/${encodeURIComponent(c.id)}`);
            contrario(`a ficha ${c.nome}`, async () => passarLigacoes(fica.id, await recriar(c), so(c.movidas), {}));
          }
        },
      },
    ];
    const falhou = await emPassos(passos);
    if (falhou) return falhou;
    const passaram = { artes: 0, keys: 0, regras: 0, roteiros: 0, filmes: 0 };
    for (const c of copias) {
      for (const [k, ids] of Object.entries(c.movidas)) passaram[k === 'acervo' ? 'artes' : k] += ids.length;
      passaram.regras += c.regras.movidas.length + c.regras.apagadas.length + c.jaComONome;
    }
    const nomes = [...copias.map((c) => c.nome), ...(renomeia ? [fica.nome] : [])];
    const resumo = `${nomes.join(' + ')} → ${nome}${oQuePassou(passaram) ? `: ${oQuePassou(passaram)}` : ''}`;
    const id = registro.registrar({
      tipo: TIPO_DAS_ATRACOES,
      alvo: fica.id,
      antes: { nome: fica.nome, saem: copias.map(({ id: i, nome: n, campos, fields }) => ({ id: i, nome: n, campos, fields })) },
      depois: { nome },
      detalhes: { resumo, passaram, saem: copias.map((c) => ({ id: c.id, movidas: c.movidas, regras: c.regras })), regrasDaFica },
      por,
    });
    return { ok: true, registro: id, resumo, passaram };
  }

  /**
   * O desfazer de uma junção (o do registro): a ficha que ficou tem de existir e estar com o nome final; então cada
   * ficha que saiu é recriada a partir da cópia, o que tinha passado (e ainda está na que ficou) volta a ela, e a que
   * ficou volta ao nome de antes. As regras voltam por último. @returns null (desfeita) ou { motivo, texto }
   */
  async function desfazer(c) {
    const pode = escrita();
    if (!pode.pode) return { motivo: 'base', texto: pode.aviso };
    const atual = await registroDe('atracoes', c.alvo);
    if (!atual) return { motivo: 'sumiu', texto: TEXTOS.sumiu };
    if (limpo(atual.fields?.atracao) !== c.depois.nome) return { motivo: 'mudou', texto: TEXTOS.mudou };
    const saem = c.antes.saem.map((s) => ({ ...s, ...(c.detalhes.saem.find((d) => d.id === s.id) ?? { movidas: {}, regras: {} }) }));
    const renomeou = c.antes.nome !== c.depois.nome;
    const falhou = await emPassos([
      {
        nome: 'recriar a ficha que saiu',
        fazer: async (contrario) => {
          for (const s of [...saem].reverse()) {
            const novo = await recriar(s);
            contrario(`a ficha ${s.nome} recriada`, () => pedir('DELETE', 'atracoes', `record/${encodeURIComponent(novo)}`));
            const voltaram = {};
            contrario(`o que voltou para ${s.nome}`, () => passarLigacoes(novo, c.alvo, so(voltaram), {}));
            await passarLigacoes(c.alvo, novo, so(s.movidas), voltaram);
          }
        },
      },
      {
        nome: 'devolver o nome da ficha que ficou',
        fazer: async () => {
          if (renomeou && !(await renomear(c.alvo, c.antes.nome))) throw new Error('a ficha que ficou não existe mais no Teable');
        },
      },
    ]);
    if (falhou) return { motivo: 'erro', texto: `Não desfiz: ${falhou.erro}.${falhou.naoDesfeito.length ? ` Não consegui voltar: ${falhou.naoDesfeito.join('; ')}.` : ''}` };
    if (renomeou) regras.voltar(c.detalhes.regrasDaFica, c.antes.nome);
    for (const s of [...saem].reverse()) regras.voltar(s.regras, s.nome);
    return null;
  }

  return {
    escrita,
    juntar,
    desfazer,
    parar: () => {
      const b = banco;
      banco = null;
      return b?.end?.().catch(() => {});
    },
  };
}
