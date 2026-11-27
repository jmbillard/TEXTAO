/* Cadastros que o PROMeiro usa para reconhecer os roteiros: atrações (com as keys das claquetes),
   redatores e editores (com as keys da pauta). Lê e grava no Teable pela API; redator e editor novos
   também viram opção no campo personalizado do Trello. Remover tira do Teable e deixa a opção no
   Trello, para os cards antigos continuarem com o nome.

   Tabelas (IDs tbl… da API):
     TEABLE_CADASTRO      atrações (atracao, categoria, campos dos caminhos)
     TEABLE_ATRACOES      KEY_atracoes (key, atracoes → link para a atração)
     TEABLE_REDATORES     redatores (redator, redator_ID, customField_ID, email: o do login, que liga a pessoa ao cadastro)
     TEABLE_KEY_REDATORES KEY_redatores (key, redator → link para o redator): o autor do Word ou o login
     TEABLE_EDITORES      editores (editor, editor_ID, customField_ID, email)
     TEABLE_KEY_EDITORES  KEY_editores (key, editor → link para o editor) */

import { ehAdministrador } from '../src/modelo/pessoas.ts';

const POR_PAGINA = 1000;
const texto = (v) => (Array.isArray(v) ? v.map(texto).filter(Boolean).join(', ') : v == null ? '' : String(typeof v === 'object' ? (v.title ?? v.name ?? '') : v)).trim();
/** O e-mail do login guardado no cadastro de redator ou de editor (#106), minúsculo; '' sem nenhum. */
const emailDe = (f) => texto(f.email).toLowerCase();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const links = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (typeof x === 'object' ? x?.id : null)).filter(Boolean);
/** Key como o n8n e a pauta escrevem: maiúsculas, sem acento, espaços simples. */
export const normalizarKey = (k) =>
  String(k || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'E')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* ---------- o acervo da atração ---------- */
/** O acervo de uma atração, por dentro: próprio (as artes são dela), do filme (sessão de filme: as artes são do filme
    do dia) ou sem acervo (genérica). */
export const ACERVOS = ['proprio', 'filme', 'sem'];
// as opções do campo acervo no Teable
const OPCOES_DO_ACERVO = { proprio: 'próprio', filme: 'do filme', sem: 'sem acervo' };
const semAcentoMinusculo = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// singleSelect: texto, ou lista (ou lista em JSON) com uma opção
export const opcaoDe = (v) => {
  if (Array.isArray(v)) return opcaoDe(v[0]);
  if (typeof v === 'string' && v.startsWith('[')) {
    try {
      return opcaoDe(JSON.parse(v));
    } catch {
      return v;
    }
  }
  return v == null ? '' : String(typeof v === 'object' ? (v.name ?? v.title ?? '') : v);
};
/** O acervo de uma linha da tabela de atrações (a opção do campo acervo, por dentro); vazio (ou desconhecido) vale
    próprio. */
export function acervoDaAtracao(linha) {
  const s = semAcentoMinusculo(opcaoDe(linha?.acervo));
  if (s === 'do filme') return 'filme';
  if (s === 'sem acervo') return 'sem';
  return 'proprio';
}

/** Campos que nunca entram no formulário dos caminhos. */
const NAO_EDITAVEIS = new Set(['formula', 'link', 'lookup', 'rollup', 'createdTime', 'lastModifiedTime', 'createdBy', 'lastModifiedBy', 'autoNumber', 'button', 'attachment']);

export function criarCadastros(env, { buscar = fetch, vocabulario = null } = {}) {
  const base = (env.TEABLE_URL || '').replace(/\/+$/, '');
  // um token só, que lê e grava (TEABLE_TOKEN_ESCRITA é o nome antigo, ainda aceito)
  const leitura = env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA || '';
  const escrita = leitura;
  const t = {
    atracoes: env.TEABLE_CADASTRO || '',
    keysAtracoes: env.TEABLE_ATRACOES || '',
    redatores: env.TEABLE_REDATORES || '',
    editores: env.TEABLE_EDITORES || '',
    keysEditores: env.TEABLE_KEY_EDITORES || '',
    keysRedatores: env.TEABLE_KEY_REDATORES || '',
  };
  const campoAtracao = env.TEABLE_CAMPO_NOME || 'atracao';
  const campoCategoria = env.TEABLE_CAMPO_CATEGORIA || 'categoria';
  const campoKeyLink = env.TEABLE_CAMPO_ATRACAO || 'atracoes';
  const caminhos = (env.TEABLE_CAMPOS_CAMINHO || 'projeto_win,output_win').split(',').map((s) => s.trim()).filter(Boolean);
  const trello = { chave: env.TRELLO_KEY || '', token: env.TRELLO_TOKEN || '', api: (env.TRELLO_API || 'https://api.trello.com/1').replace(/\/+$/, '') };
  const ligado = !!(base && leitura && (t.atracoes || t.redatores || t.editores));

  /* ---------- Teable ---------- */
  async function teable(metodo, caminho, corpo, token = escrita) {
    const r = await buscar(`${base}/api${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      const msg = (await r.text().catch(() => '')).slice(0, 200);
      throw Object.assign(new Error(r.status === 403 || r.status === 401 ? 'O token do Teable não tem permissão para gravar nesta tabela.' : `O Teable respondeu ${r.status}: ${msg}`), { status: 422 });
    }
    return r.status === 204 ? {} : r.json().catch(() => ({}));
  }
  async function registros(tabela) {
    const todos = [];
    for (let pular = 0; pular < 20 * POR_PAGINA; pular += POR_PAGINA) {
      const r = await teable('GET', `/table/${encodeURIComponent(tabela)}/record?fieldKeyType=name&take=${POR_PAGINA}&skip=${pular}`, null, leitura);
      const pagina = r.records ?? [];
      todos.push(...pagina.map((x) => ({ id: x.id, f: x.fields ?? {} })));
      if (pagina.length < POR_PAGINA) break;
    }
    return todos;
  }
  const campos = (tabela) => teable('GET', `/table/${encodeURIComponent(tabela)}/field`, null, leitura).then((r) => (Array.isArray(r) ? r : []));
  async function criar(tabela, fields) {
    const r = await teable('POST', `/table/${encodeURIComponent(tabela)}/record`, { fieldKeyType: 'name', typecast: true, records: [{ fields }] });
    const rec = r.records?.[0];
    if (!rec?.id) throw Object.assign(new Error('O Teable não devolveu o registro criado.'), { status: 422 });
    return rec;
  }
  const apagarRegistro = (tabela, id) => teable('DELETE', `/table/${encodeURIComponent(tabela)}/record/${encodeURIComponent(id)}`);

  /* ---------- Trello: opção nova no campo personalizado ---------- */
  async function opcaoNoTrello(campo, nome) {
    if (!trello.chave || !trello.token || !campo) return null;
    const url = `${trello.api}/customField/${encodeURIComponent(campo)}/options?key=${encodeURIComponent(trello.chave)}&token=${encodeURIComponent(trello.token)}`;
    const r = await buscar(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pos: 'bottom', value: { text: nome } }), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw Object.assign(new Error(`O Trello respondeu ${r.status} ao criar a opção.`), { status: 422 });
    return (await r.json())?.id ?? null;
  }
  /** O campo do Trello (REDATOR/EDITOR): do ambiente ou de quem já está cadastrado. */
  const campoDoTrello = (lista, padrao) => padrao || lista.map((x) => x.campoTrello).find(Boolean) || '';

  /* ---------- leitura ---------- */
  let lido = null;
  // se a tabela de atrações do Teable tem o campo acervo (lido junto com o esquema): sem ele, a gravação não o escreve
  let temAcervo = false;
  let lidoEm = 0;

  /** As categorias (opções do campo, ou o que já aparece) e os campos que as fórmulas dos caminhos usam. */
  async function esquemaDasAtracoes(linhas) {
    const lista = await campos(t.atracoes).catch(() => []);
    const porId = new Map(lista.map((c) => [c.id, c]));
    const cat = lista.find((c) => c.name === campoCategoria);
    const escolhas = cat?.options?.choices?.map((c) => c.name).filter(Boolean) ?? [];
    const categorias = escolhas.length ? escolhas : [...new Set(linhas.map((l) => texto(l.f[campoCategoria])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    // cada fórmula de caminho cita os campos por {fldXXX}: são eles que o formulário pede
    const usados = [];
    const formulas = {};
    for (const nome of caminhos) {
      // o nome pode vir com espaço ("projeto win") ou como o nome interno ("projeto_win")
      const igual = (x) => String(x ?? '').trim().toLowerCase().replace(/[\s_]+/g, '_') === nome.trim().toLowerCase().replace(/[\s_]+/g, '_');
      const f = lista.find((c) => igual(c.name) || igual(c.dbFieldName));
      const expr = f?.options?.expression ?? '';
      formulas[nome] = expr.replace(/\{(fld\w+)\}/g, (_, id) => `{${porId.get(id)?.name ?? id}}`);
      for (const [, id] of expr.matchAll(/\{(fld\w+)\}/g)) {
        const c = porId.get(id);
        if (!c || NAO_EDITAVEIS.has(c.type) || c.isComputed || c.name === campoAtracao || c.name === campoCategoria || usados.some((u) => u.nome === c.name)) continue;
        usados.push({ nome: c.name, tipo: c.type, opcoes: c.options?.choices?.map((x) => x.name) ?? null });
      }
    }
    temAcervo = lista.some((c) => c.name === 'acervo');
    return { categorias, camposCaminho: usados, formulas };
  }

  async function ler(forcar = false) {
    if (!ligado) return { ligado: false, atracoes: [], redatores: [], editores: [], categorias: [], camposCaminho: [], formulas: {} };
    if (lido && !forcar && Date.now() - lidoEm < 60_000) return lido;
    const [atr, kAtr, red, kRed, edi, kEdi] = await Promise.all([
      t.atracoes ? registros(t.atracoes) : [],
      t.keysAtracoes ? registros(t.keysAtracoes) : [],
      t.redatores ? registros(t.redatores) : [],
      t.keysRedatores ? registros(t.keysRedatores) : [],
      t.editores ? registros(t.editores) : [],
      t.keysEditores ? registros(t.keysEditores) : [],
    ]);
    const keysPor = (lista, campoLink) => {
      const m = new Map();
      for (const k of lista) for (const alvo of links(k.f[campoLink])) (m.get(alvo) ?? m.set(alvo, []).get(alvo)).push({ id: k.id, key: texto(k.f.key) });
      return m;
    };
    const kA = keysPor(kAtr, campoKeyLink);
    const kE = keysPor(kEdi, 'editor');
    const kR = keysPor(kRed, 'redator');
    const esquema = t.atracoes ? await esquemaDasAtracoes(atr) : { categorias: [], camposCaminho: [], formulas: {} };
    const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
    lido = {
      ligado: true,
      atracoes: atr
        .map((l) => ({
          id: l.id,
          nome: texto(l.f[campoAtracao]),
          categoria: texto(l.f[campoCategoria]),
          acervo: acervoDaAtracao(l.f),
          keys: (kA.get(l.id) ?? []).filter((k) => k.key),
          caminhos: Object.fromEntries(caminhos.map((c) => [c, texto(l.f[c])])),
          campos: Object.fromEntries(esquema.camposCaminho.map((c) => [c.nome, texto(l.f[c.nome])])),
        }))
        .filter((a) => a.nome)
        .sort(porNome),
      redatores: red
        .map((l) => ({ id: l.id, nome: texto(l.f.redator), email: emailDe(l.f), keys: (kR.get(l.id) ?? []).filter((k) => k.key), trello: !!texto(l.f.redator_ID), campoTrello: texto(l.f.customField_ID) }))
        .filter((r) => r.nome)
        .sort(porNome),
      editores: edi
        .map((l) => ({ id: l.id, nome: texto(l.f.editor), email: emailDe(l.f), keys: (kE.get(l.id) ?? []).filter((k) => k.key), trello: !!texto(l.f.editor_ID), campoTrello: texto(l.f.customField_ID) }))
        .filter((e) => e.nome)
        .sort(porNome),
      ...esquema,
    };
    lidoEm = Date.now();
    return lido;
  }

  /** Depois de gravar: a lista daqui e o vocabulário de reconhecimento passam a valer na hora. `entrou`: as keys de
      atração que acabaram de ser gravadas ([{ nome, chaves }]), para o reconhecimento não esperar o Teable; `null`
      depois de uma remoção, para o que esperava o Teable não voltar. */
  async function depois(entrou = []) {
    lidoEm = 0;
    await vocabulario?.renovar?.(entrou).catch(() => {});
  }

  const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
  const exigir = (cond, msg) => {
    if (!cond) throw erro(msg);
  };
  const nomeLimpo = (s, max = 80) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  async function keyLivre(tabelaKeys, key) {
    const atual = await ler();
    const lista = tabelaKeys === t.keysAtracoes ? atual.atracoes : tabelaKeys === t.keysRedatores ? atual.redatores : atual.editores;
    const dono = lista.find((x) => x.keys.some((k) => k.key === key));
    if (dono) throw erro(`A key ${key} já é de ${dono.nome}.`, 409);
  }

  return {
    ligado,
    /** A regra de administrador do PROMeiro inteiro (#77): a chave-mestra CADASTRO_ADMINS ou o salvo na tela. */
    podeApagar: (email) => ehAdministrador(email, env),
    ler,

    async novaAtracao({ nome, categoria, acervo: qual = 'proprio', keys = [], campos: extra = {} }) {
      exigir(t.atracoes && t.keysAtracoes, 'Faltam as tabelas de atrações no servidor (TEABLE_CADASTRO e TEABLE_ATRACOES).');
      nome = nomeLimpo(nome);
      exigir(nome, 'Dê um nome para a atração.');
      const lista = [...new Set(keys.map(normalizarKey).filter(Boolean))].slice(0, 20);
      exigir(lista.length, 'A atração precisa de pelo menos uma key.');
      exigir(ACERVOS.includes(qual), 'Escolha o acervo: próprio, do filme ou sem acervo.');
      const atual = await ler();
      exigir(!atual.atracoes.some((a) => a.nome.toLowerCase() === nome.toLowerCase()), `${nome} já está cadastrada.`);
      for (const k of lista) await keyLivre(t.keysAtracoes, k);
      const fields = { [campoAtracao]: nome };
      if (categoria) fields[campoCategoria] = nomeLimpo(categoria, 40);
      if (temAcervo) fields.acervo = OPCOES_DO_ACERVO[qual];
      for (const c of atual.camposCaminho) if (extra[c.nome] != null && String(extra[c.nome]).trim()) fields[c.nome] = nomeLimpo(extra[c.nome], 200);
      const rec = await criar(t.atracoes, fields);
      for (const k of lista) await criar(t.keysAtracoes, { key: k, [campoKeyLink]: [{ id: rec.id }] });
      await depois([{ nome, chaves: lista }]);
      return { id: rec.id, nome, keys: lista };
    },

    /** Troca o acervo de uma atração que já existe. */
    async mudarAcervo(id, qual) {
      exigir(t.atracoes, 'Falta a tabela de atrações no servidor (TEABLE_CADASTRO).');
      exigir(ACERVOS.includes(qual), 'Escolha o acervo: próprio, do filme ou sem acervo.');
      const atual = await ler();
      const a = atual.atracoes.find((x) => x.id === id);
      exigir(a, 'Esta atração não está mais nos cadastros.');
      exigir(temAcervo, 'A tabela de atrações do Teable não tem a coluna do acervo.');
      await teable('PATCH', `/table/${encodeURIComponent(t.atracoes)}/record/${encodeURIComponent(id)}`, { fieldKeyType: 'name', typecast: true, record: { fields: { acervo: OPCOES_DO_ACERVO[qual] } } });
      await depois();
      return { id, nome: a.nome, acervo: qual };
    },

    async novaKey(tipo, alvoId, key) {
      const tabela = { atracao: t.keysAtracoes, redator: t.keysRedatores, editor: t.keysEditores }[tipo];
      exigir(tabela, 'Falta a tabela de keys no servidor.');
      key = normalizarKey(key);
      exigir(key, 'Escreva a key.');
      await keyLivre(tabela, key);
      const link = { atracao: campoKeyLink, redator: 'redator', editor: 'editor' }[tipo];
      const rec = await criar(tabela, { key, [link]: [{ id: alvoId }] });
      // a key nova de uma atração vale já para o reconhecimento (o nome vem da leitura que conferiu a key livre)
      const dona = tipo === 'atracao' ? (await ler()).atracoes.find((a) => a.id === alvoId)?.nome : '';
      await depois(dona ? [{ nome: dona, chaves: [key] }] : []);
      return { id: rec.id, key };
    },

    async novoRedator({ nome, keys = [], user = '' }) {
      exigir(t.redatores, 'Falta a tabela de redatores no servidor (TEABLE_REDATORES).');
      nome = nomeLimpo(nome);
      exigir(nome, 'Escreva o nome do redator.');
      // sem key, o próprio nome; "user" é o nome antigo do campo, ainda aceito
      const lista = [...new Set([...keys, user].map(normalizarKey).filter(Boolean))].slice(0, 20);
      if (!lista.length) lista.push(normalizarKey(nome));
      const atual = await ler();
      exigir(!atual.redatores.some((r) => r.nome.toLowerCase() === nome.toLowerCase()), `${nome} já está cadastrado.`);
      exigir(t.keysRedatores, 'Falta a tabela de keys dos redatores no servidor (TEABLE_KEY_REDATORES).');
      for (const k of lista) await keyLivre(t.keysRedatores, k);
      const campo = campoDoTrello(atual.redatores, env.TRELLO_CAMPO_REDATOR);
      const opcao = await opcaoNoTrello(campo, nome);
      const rec = await criar(t.redatores, { redator: nome, ...(opcao ? { redator_ID: opcao, customField_ID: campo } : {}) });
      for (const k of lista) await criar(t.keysRedatores, { key: k, redator: [{ id: rec.id }] });
      await depois();
      return { id: rec.id, nome, keys: lista, trello: !!opcao };
    },

    async novoEditor({ nome, keys = [] }) {
      exigir(t.editores, 'Falta a tabela de editores no servidor (TEABLE_EDITORES).');
      nome = nomeLimpo(nome);
      exigir(nome, 'Escreva o nome do editor.');
      const lista = [...new Set(keys.map(normalizarKey).filter(Boolean))].slice(0, 20);
      const atual = await ler();
      exigir(!atual.editores.some((e) => e.nome.toLowerCase() === nome.toLowerCase()), `${nome} já está cadastrado.`);
      if (lista.length) exigir(t.keysEditores, 'Falta a tabela de keys dos editores no servidor (TEABLE_KEY_EDITORES).');
      for (const k of lista) await keyLivre(t.keysEditores, k);
      const campo = campoDoTrello(atual.editores, env.TRELLO_CAMPO_EDITOR);
      const opcao = await opcaoNoTrello(campo, nome);
      const rec = await criar(t.editores, { editor: nome, ...(opcao ? { editor_ID: opcao, customField_ID: campo } : {}) });
      for (const k of lista) await criar(t.keysEditores, { key: k, editor: [{ id: rec.id }] });
      await depois();
      return { id: rec.id, nome, keys: lista, trello: !!opcao };
    },

    /** Grava (ou apaga, com '') o e-mail do login no cadastro de redator ou de editor (#106): é ele que liga a pessoa
        que entra no PROMeiro ao cadastro. O mesmo e-mail não fica em dois cadastros do mesmo tipo. Devolve o de antes,
        para o desfazer. */
    async mudarEmail(tipo, id, email) {
      const tabela = { redator: t.redatores, editor: t.editores }[tipo];
      exigir(tabela, 'Só redatores e editores têm e-mail.');
      email = String(email ?? '').trim().toLowerCase();
      exigir(!email || EMAIL.test(email), 'Escreva um e-mail.');
      const lista = (await ler())[tipo === 'redator' ? 'redatores' : 'editores'];
      const item = lista.find((x) => x.id === id);
      exigir(item, 'Este cadastro não está mais no Teable.');
      const dono = email && lista.find((x) => x.id !== id && x.email === email);
      if (dono) throw erro(`${email} já é de ${dono.nome}.`, 409);
      await teable('PATCH', `/table/${encodeURIComponent(tabela)}/record/${encodeURIComponent(id)}`, { fieldKeyType: 'name', typecast: true, record: { fields: { email: email || null } } });
      await depois();
      return { id, nome: item.nome, email, antes: item.email };
    },

    /** Remove do Teable (só administradores). A opção no Trello fica, para os cards antigos. */
    async remover(tipo, id) {
      const tabela = { atracao: t.atracoes, redator: t.redatores, editor: t.editores, keyAtracao: t.keysAtracoes, keyRedator: t.keysRedatores, keyEditor: t.keysEditores }[tipo];
      exigir(tabela, 'Tipo de cadastro desconhecido.');
      // atração, redator e editor levam as keys junto, para não sobrar key apontando para ninguém
      const keysDe = { atracao: ['atracoes', t.keysAtracoes], redator: ['redatores', t.keysRedatores], editor: ['editores', t.keysEditores] }[tipo];
      if (keysDe) {
        const atual = await ler();
        const item = atual[keysDe[0]].find((x) => x.id === id);
        for (const k of item?.keys ?? []) await apagarRegistro(keysDe[1], k.id);
      }
      await apagarRegistro(tabela, id);
      await depois(null);
      return { ok: true };
    },
  };
}
