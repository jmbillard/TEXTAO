/*
 * O projeto do Padeiro (#144): o envio que o Padeiro mandava ao fluxo "PROMO - PROJETO" do n8n (o contrato fica no
 * docs/webhook-projeto.md do Padeiro) passa a vir ao PROMeiro, pela chave do Padeiro. O PROMeiro faz o mesmo que o
 * fluxo fazia, com a escrita só na base do PROMeiro (o Teable) e no card do Trello:
 *
 * 0. o registro do projeto: todo envio que se entende grava uma linha na tabela `projetos` (o `.aep`, a atração, o
 *    tipo, as pastas, o ano do filme, o login e a sigla do designer, o momento, o card, a versão e a hora em que chegou);
 * 1. a atração nova (só no `criado`, com `atracao.nova`): a mesma pelo nome (sem acentos, símbolos nem caixa) ou pela
 *    pasta já cadastrada não é criada de novo (`atracaoJaExistia`); senão entra no cadastro das atrações, com a key do
 *    nome (`atracaoCadastrada`);
 * 2. o card da atração nova: o link `atracao` da linha do card na produção da arte (ARTE_producao) fica com ela em
 *    primeiro, e as que ele já tinha depois (`cardLigado`);
 * 3. o designer no card: o da chave do Padeiro (não o login nem a sigla do envio) entra no card, só se ainda não está
 *    (`designerEntrouNoCard` ou `designerJaEstavaNoCard`); sem o membro do Trello no cadastro, `designerNaoEncontrado`.
 *    Só escrita no Trello: nada é lido dele (ADR 0006);
 * - o designer da chave que está inativo na tabela designers volta para os ativos, e o texto de um item avisa.
 *
 * A resposta é a mesma do fluxo: sempre 200 { itens: [{ codigo, texto }] }, um item por passo, e o que falhou vira o
 * item `erro`, com o motivo. Nada aqui lança por causa do Teable ou do Trello.
 */

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const txt = (v) => (v === undefined || v === null || typeof v === 'object' ? '' : String(v)).replace(/\s+/g, ' ').trim();
const MOMENTOS = ['criado', 'aberto', 'alterado'];
const motivo = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 120);

/** O nome sem acentos, símbolos nem caixa: "Lá na Minha Terra" = "LA NA MINHA TERRA". */
export const chaveDoNome = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, '');

/** A pasta sem o servidor (//servidor/), sem /Volumes/, sem o -1 a -5 do volume e sem a pasta de projetos no fim,
    com a barra normal e sem caixa: o mesmo caminho do Windows e do Mac dá a mesma chave. */
export function chaveDaPasta(s) {
  let p = semAcento(s).replace(/\\/g, '/').trim().replace(/\/+$/, '');
  p = p.replace(/^\/\/[^/]+\//, '').replace(/^\/Volumes\//i, '').replace(/^([^/]+)-[1-5](\/|$)/, '$1$2');
  p = p.replace(/\/+/g, '/').replace(/\s+\//g, '/').toLowerCase();
  return p.replace(/\/(0?1[ _-]?)?projetos?$/, '');
}

/** O caminho como o cadastro guarda: o de rede com a barra invertida; o do Mac como veio. */
const comoOCadastroGuarda = (s) => (/^\/\//.test(s) ? s.replace(/\//g, '\\') : s);

/**
 * O envio do Padeiro, só com os campos conhecidos e já limpos. Um envio fora do formato vem com `invalido` (o motivo).
 * @returns { invalido, momento, nova, atracao: { nome, tipo, quadro, pasta, output, aep, filme }, card, designer, versao }
 */
export function lerEnvio(corpo) {
  let b = corpo;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      b = null;
    }
  }
  if (Array.isArray(b)) b = b[0];
  b = b && typeof b === 'object' ? b : {};
  const a = b.atracao && typeof b.atracao === 'object' ? b.atracao : {};
  const c = b.card && typeof b.card === 'object' ? b.card : null;
  const d = b.designer && typeof b.designer === 'object' ? b.designer : {};
  const momento = txt(b.momento).toLowerCase();
  const nome = txt(a.nome).slice(0, 80);
  const cardId = c ? txt(c.id).slice(0, 100) : '';
  return {
    invalido: !b.atracao && !c ? 'o envio veio sem a atração e sem o card' : '',
    momento: MOMENTOS.includes(momento) ? momento : '',
    // só o criar cadastra (abrir e alterar nunca cadastram)
    nova: a.nova === true && momento === 'criado' && !!nome,
    atracao: {
      nome,
      tipo: txt(a.tipo).slice(0, 40),
      quadro: txt(a.quadro).slice(0, 300),
      pasta: txt(a.pasta).slice(0, 500),
      output: txt(a.output).slice(0, 500),
      aep: txt(a.aep).slice(0, 600),
      // só no filme: { ano } (o ano de produção; '' sem ano)
      filme: a.filme && typeof a.filme === 'object' ? { ano: txt(a.filme.ano).slice(0, 10) } : null,
    },
    card: cardId ? { id: cardId, claquete: txt(c.claquete).slice(0, 200) } : null,
    designer: { login: txt(d.login).slice(0, 100), sigla: txt(d.sigla).slice(0, 40) },
    versao: txt(b.versao).slice(0, 40),
  };
}

/** A pasta da atração, sem o quadro no fim (o quadro é do projeto, não da atração). */
export function pastaDaAtracao({ pasta, quadro }) {
  if (!quadro) return pasta;
  const q = quadro.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const p = pasta.replace(/\\/g, '/').replace(/\/+$/, '');
  return q && p.toLowerCase().endsWith(`/${q.toLowerCase()}`) ? p.slice(0, p.length - q.length - 1) : pasta;
}

/** A linha da tabela `projetos`: os campos vazios ficam de fora. */
export function linhaDoProjeto(envio, agora = new Date()) {
  const a = envio.atracao;
  const f = {
    aep: a.aep,
    atracao: a.nome,
    tipo: a.tipo,
    pasta: a.pasta,
    output: a.output,
    designer_login: envio.designer.login,
    designer_sigla: envio.designer.sigla,
    card_ID: envio.card?.id ?? '',
    versao: envio.versao,
    momento: envio.momento,
    data: agora.toISOString(),
  };
  if (a.filme) f.filme_ano = a.filme.ano;
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
}

/**
 * @param buscar o fetch do Teable (o de verdade ou um falso)
 * @returns receber(corpo, { env, cadastros, trello, designer, reativar }) → { itens }; e ligarAAtracao(env, trello,
 *   cardId, { nova, tira }), o link `atracao` da linha do card (também do card aberto, #173)
 */
export function criarProjetoDoPadeiro({ buscar = fetch } = {}) {
  async function teable(env, metodo, caminho, corpo) {
    const url = String(env.TEABLE_URL ?? '').trim().replace(/\/+$/, '');
    const token = String(env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA || '').trim();
    if (!url || !token) throw new Error('o Teable não está configurado');
    const r = await buscar(`${url}/api${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 401 || r.status === 403 ? ': o token do Teable não tem permissão' : ''}`);
    return r.json().catch(() => ({}));
  }
  const idDaTabela = (env, nome) => String(env.tabelas?.[nome]?.id ?? '');

  /** 0. A linha na tabela `projetos`. @returns '' gravou, ou o motivo */
  async function registrar(env, envio) {
    const tabela = idDaTabela(env, 'projetos');
    if (!tabela) return 'a tabela projetos não está na base';
    try {
      const r = await teable(env, 'POST', `/table/${encodeURIComponent(tabela)}/record`, { fieldKeyType: 'name', typecast: true, records: [{ fields: linhaDoProjeto(envio) }] });
      return r?.records?.[0]?.id ? '' : 'o Teable não devolveu a linha';
    } catch (e) {
      return motivo(e);
    }
  }

  /**
   * O link `atracao` da linha do card na produção da arte (ARTE_producao), só na base do PROMeiro: a atração `nova` em
   * primeiro e, depois, as que a linha já tinha, menos as que `tira` tira. É a escrita do card ligado (o passo 2) e a
   * do card aberto da tela de produções (#173: trocar, ligar e desligar a atração).
   * @param nova o id da atração no cadastro, ou '' (nenhuma: desligar)
   * @param tira ({ id, title }) => true para o link antigo que sai
   * @returns '' gravou; 'fora' o card não tem linha na produção da arte; ou o motivo de não poder gravar. Lança quando
   *   o Teable recusa
   */
  async function ligarAAtracao(env, trello, cardId, { nova = '', tira = () => false } = {}) {
    const tabela = idDaTabela(env, 'ARTE_producao');
    if (!tabela || !trello?.producaoDosCards) return 'a produção da arte não está configurada';
    const base = String(env.TEABLE_PG_ESQUEMA ?? '').trim();
    if (!base || env.tabelas?.ARTE_producao?.esquema !== base) return 'a produção da arte não está na base do PROMeiro';
    if (!String(env.TEABLE_URL ?? '').trim() || !String(env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA || '').trim()) return 'o Teable não está configurado';
    const linha = ((await trello.producaoDosCards([cardId])) ?? []).find((l) => l.card === cardId);
    if (!linha) return 'fora';
    const antes = Array.isArray(linha.inteira?.atracao) ? linha.inteira.atracao : typeof linha.inteira?.atracao === 'string' ? JSON.parse(linha.inteira.atracao || '[]') : [];
    const links = [...(nova ? [{ id: nova }] : []), ...antes.filter((x) => x?.id && x.id !== nova && !tira(x)).map((x) => ({ id: x.id }))];
    await teable(env, 'PATCH', `/table/${encodeURIComponent(tabela)}/record/${encodeURIComponent(linha.registro)}`, { fieldKeyType: 'name', typecast: true, record: { fields: { atracao: links } } });
    return '';
  }

  /** O designer inativo volta para os ativos. @returns true se voltou */
  async function reativarODesigner(env, registro) {
    const tabela = idDaTabela(env, 'designers');
    if (!tabela || !registro) return false;
    try {
      await teable(env, 'PATCH', `/table/${encodeURIComponent(tabela)}/record/${encodeURIComponent(registro)}`, { fieldKeyType: 'name', typecast: true, record: { fields: { status: 'ativo' } } });
      return true;
    } catch (e) {
      console.warn(`[padeiro] não consegui pôr o designer de volta nos ativos: ${motivo(e)}`);
      return false;
    }
  }

  /**
   * @param corpo o envio do Padeiro (o contrato do webhook do projeto)
   * @param env a configuração de agora (com as tabelas descobertas)
   * @param cadastros o módulo dos cadastros (a atração nova)
   * @param trello o módulo do Trello (a linha do card na produção da arte, e o designer no card)
   * @param designer { nome, membro, registro, inativo } o designer da chave do Padeiro
   */
  async function receber(corpo, { env, cadastros, trello, designer }) {
    const itens = [];
    const item = (codigo, texto) => itens.push({ codigo, texto });
    const envio = lerEnvio(corpo);
    if (envio.invalido) return { itens: [{ codigo: 'erro', texto: `${envio.invalido}: nada foi feito` }] };
    const a = envio.atracao;
    const card = envio.card;
    const claq = card ? ` ${card.claquete || card.id}` : '';
    const falhaDoRegistro = await registrar(env, envio);

    // 1. a atração nova
    let atracao = null;
    if (envio.nova) {
      try {
        const r = await cadastros.atracaoDoProjeto({ nome: a.nome, tipo: a.tipo, pasta: comoOCadastroGuarda(pastaDaAtracao(a)), output: comoOCadastroGuarda(a.output) });
        atracao = r.atracao;
        if (r.existia) item('atracaoJaExistia', `${r.atracao.nome} já estava no banco das atrações`);
        else item('atracaoCadastrada', `${a.nome} cadastrada no banco das atrações`);
      } catch (e) {
        item('erro', `o banco não aceitou o cadastro (${motivo(e)}): ${a.nome} não foi cadastrada`);
      }
    }
    // 2. o card ligado à atração nova
    if (envio.nova && card && atracao) {
      try {
        const falta = await ligarAAtracao(env, trello, card.id, { nova: atracao.id });
        if (falta === 'fora') item('erro', `o card${claq} não está no banco: não deu para ligá-lo à atração`);
        else if (falta) item('erro', `não deu para ligar o card${claq} à atração no banco (${falta})`);
        else item('cardLigado', `card${claq} ligado à atração`);
      } catch (e) {
        item('erro', `não deu para ligar o card${claq} à atração no banco (${motivo(e)})`);
      }
    }
    // 3. o designer da chave no card
    if (card) {
      if (!designer?.membro) item('designerNaoEncontrado', 'o seu cadastro de designer no PROMeiro não tem o usuário do Trello: peça para completarem (Configuração · Pessoas)');
      else if (!trello?.config?.chave || !trello?.config?.token || !trello?.entrarNoCard) item('erro', `o Trello não está configurado no PROMeiro: você não entrou no card${claq}; entre à mão`);
      else {
        try {
          if (await trello.entrarNoCard(card.id, designer.membro)) item('designerEntrouNoCard', `você entrou no card${claq}`);
          else item('designerJaEstavaNoCard', `você já estava no card${claq}`);
        } catch (e) {
          const m = motivo(e);
          if (/^Trello respondeu (404|400) /.test(m) && /not.*found|invalid id/i.test(m)) item('erro', `o Trello não achou o card${claq}: você não entrou nele; entre à mão`);
          else item('erro', `o Trello não aceitou: você não entrou no card${claq}; entre à mão`);
        }
      }
    }
    // 0. o registro do projeto, em todo envio
    if (falhaDoRegistro) item('erro', `o projeto não foi registrado no banco (${falhaDoRegistro}): avise a equipe`);
    else if (!itens.length) item('projetoRegistrado', 'projeto registrado');
    // o designer inativo que voltou para os ativos: o aviso vai no item do designer (ou no último, sem ele)
    if (designer?.inativo && (await reativarODesigner(env, designer.registro))) {
      const doDesigner = itens.find((x) => /^designer/.test(x.codigo));
      const alvo = doDesigner ?? itens[itens.length - 1];
      alvo.texto += doDesigner ? ' (e voltou para a lista de designers ativos)' : ' (e você voltou para a lista de designers ativos)';
    }
    return { itens, envio };
  }

  return { receber, ligarAAtracao };
}
