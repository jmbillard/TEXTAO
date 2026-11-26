/*
 * O Trello avisa o PROMeiro direto (#87, ADR 0006), sem o n8n: o webhook do quadro configurado, a rota pública que
 * recebe o aviso e a conferência da assinatura. A tradução do aviso em eventos é pura (src/modelo/avisoDoTrello.ts);
 * o que ela dá é anotado nas Produções (servidor/producoes.mjs, anotar).
 *
 * A rota é a ÚNICA exceção ao Cloudflare Access: o Trello não tem login. Por isso só vale o aviso assinado: o Trello
 * manda no cabeçalho X-Trello-Webhook o base64 do HMAC-SHA1 do corpo + o endereço do webhook (callbackURL), com o
 * segredo da aplicação (o "OAuth secret" da chave do Trello, TRELLO_SEGREDO no Portainer). O corpo tem tamanho máximo
 * e nunca vai inteiro para o log.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { configDoTrello } from './trello.mjs';
import { TIPOS_DE_ACAO } from '../src/modelo/avisoDoTrello.ts';

/** O caminho da rota do aviso: o único a liberar no Cloudflare Access (Bypass só para ele). */
export const ROTA_DO_AVISO = '/api/trello/aviso';

/** O aviso do Trello é pequeno (a ação e o quadro): o que passa disto é recusado sem ler o resto. */
export const LIMITE_DO_AVISO = 256 * 1024;

/** A descrição do webhook no Trello (para reconhecer quem registrou). */
const DESCRICAO = 'PROMeiro: o aviso das mudanças do quadro';

/** O endereço do webhook: PROMEIRO_URL + a rota (vazio sem PROMEIRO_URL). É também parte do que o Trello assina. */
export const enderecoDoAviso = (env) => {
  const base = String(env.PROMEIRO_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}${ROTA_DO_AVISO}` : '';
};

/** O segredo da aplicação do Trello (colado com espaço ou quebra de linha: vale só o valor). */
export const segredoDoAviso = (env) => String(env.TRELLO_SEGREDO ?? '').trim();

/** O que falta para o aviso do Trello funcionar (as variáveis vazias). */
export function faltasDoAviso(env) {
  const c = configDoTrello(env);
  return [
    !c.chave && 'TRELLO_KEY',
    !c.token && 'TRELLO_TOKEN',
    !segredoDoAviso(env) && 'TRELLO_SEGREDO',
    !enderecoDoAviso(env) && 'PROMEIRO_URL',
    !c.quadro && 'o quadro do Trello (Configuração › Conexões)',
  ].filter(Boolean);
}

/**
 * A assinatura do aviso confere? Compara em tempo constante. O Trello assina o corpo como texto; com acento, há quem
 * calcule sobre os bytes UTF-8 e quem calcule sobre cada caractere como um byte (latin1): as duas formas pedem o
 * segredo, e as duas valem.
 * @param corpo o corpo cru (Buffer), como chegou
 * @param assinatura o cabeçalho X-Trello-Webhook
 */
export function assinaturaConfere(corpo, assinatura, segredo, callbackURL) {
  if (!segredo || !callbackURL || typeof assinatura !== 'string' || !assinatura) return false;
  const recebida = Buffer.from(assinatura, 'base64');
  const formas = [Buffer.concat([corpo, Buffer.from(callbackURL, 'utf8')]), Buffer.from(corpo.toString('utf8') + callbackURL, 'latin1')];
  let confere = false;
  for (const conteudo of formas) {
    const esperada = createHmac('sha1', segredo).update(conteudo).digest();
    // o tamanho errado já é recusa (timingSafeEqual pede o mesmo tamanho); o resto, sem atalho
    if (recebida.length === esperada.length && timingSafeEqual(recebida, esperada)) confere = true;
  }
  return confere;
}

/** As listas do quadro que dizem a etapa (src/modelo/avisoDoTrello.ts): entradas (as das praças, a reserva, a do VT,
    a dos filmes) e saídas (as das praças e a dos entregues). */
export function listasDoQuadro(env) {
  const c = configDoTrello(env);
  const limpas = (ids) => [...new Set(ids.map((x) => String(x ?? '').trim()).filter(Boolean))];
  return {
    quadro: c.quadro,
    entradas: limpas([...c.pracas.map((p) => p.entrada), c.listas.padrao, c.listas.VT, c.filmes.lista]),
    saidas: limpas([...c.pracas.map((p) => p.saida), c.entregues]),
  };
}

/** Os nomes das opções de fábrica, quando o quadro não foi lido: as da prioridade (ALTA, MÉDIA) e as da complexidade
    (na ordem BAIXA, MÉDIA, ALTA, como TRELLO_COMPLEXIDADE_OPCOES). */
const NIVEIS = ['BAIXA', 'MÉDIA', 'ALTA'];

/**
 * O que a tradução do aviso lê do quadro configurado (src/modelo/avisoDoTrello.ts): as listas, os campos ligados na
 * Configuração (TRELLO_CAMPO_PRIORIDADE, _COMPLEXIDADE, _PRACA) com o nome de cada opção, e os designers.
 * O nome da opção é o do quadro lido (os campos do quadro); sem ele, o que a configuração diz (ALTA e MÉDIA da
 * prioridade, os níveis da complexidade). Na praça, a opção é a sigla da praça que a tem.
 * @param o.camposDoQuadro os campos personalizados do quadro, como o Trello lista ([{ id, options: [{ id, value: { text } }] }])
 * @param o.designers a tabela designers da última verificação das Pessoas ([{ nome, idNoTrello }])
 */
export function quadroDoAviso(env, { camposDoQuadro = [], designers = [] } = {}) {
  const c = configDoTrello(env);
  const doQuadro = (id) => {
    const campo = (Array.isArray(camposDoQuadro) ? camposDoQuadro : []).find((x) => x?.id === id);
    return Object.fromEntries((campo?.options ?? []).map((o) => [String(o?.id ?? ''), String(o?.value?.text ?? '').trim()]).filter(([k, v]) => k && v));
  };
  const so = (pares) => Object.fromEntries(pares.filter(([k]) => k));
  /** O campo ligado com os nomes das opções: `antes` perde para o nome no quadro, `depois` vence. */
  const ligado = (id, { antes = {}, depois = {} } = {}) => {
    const limpo = String(id ?? '').trim();
    return limpo ? { id: limpo, opcoes: { ...antes, ...doQuadro(limpo), ...depois } } : undefined;
  };
  return {
    ...listasDoQuadro(env),
    campos: {
      prioridade: ligado(c.campos.prioridade, { antes: so([[c.prioridadeAlta, 'ALTA'], [c.filmes.prioridadeMedia, 'MÉDIA']]) }),
      complexidade: ligado(c.campos.complexidade, { antes: so(c.complexidades.map((id, i) => [id, NIVEIS[i] ?? ''])) }),
      // a sigla da praça vale por cima do nome no quadro (a Produção guarda a sigla)
      praca: ligado(c.campos.praca, { depois: so(c.pracas.map((p) => [p.opcao, p.sigla])) }),
    },
    designers: (Array.isArray(designers) ? designers : []).map((d) => ({ nome: String(d?.nome ?? ''), idNoTrello: String(d?.idNoTrello ?? '') })),
  };
}

/** A recuperação de fábrica: até 1000 ações por página (o máximo do Trello), até 10 páginas, nunca antes de 30 dias. */
export const RECUPERACAO = Object.freeze({ porPagina: 1000, paginas: 10, dias: 30 });

/**
 * As ações do quadro desde `desde` (só os tipos que a tradução lê), da mais velha à mais nova. O Trello devolve da
 * mais nova à mais velha: a próxima página é a de antes da mais velha desta (before = o id dela), até vir uma página
 * incompleta ou acabar o limite de páginas (`noLimite`: as mais velhas ficaram de fora).
 * @param trello o módulo do Trello (ler)
 * @returns { acoes, paginas, noLimite }
 */
export async function acoesDesde(trello, { quadro, desde, porPagina = RECUPERACAO.porPagina, paginas = RECUPERACAO.paginas }) {
  const todas = [];
  let antes = null;
  for (let i = 0; i < paginas; i++) {
    const pagina = await trello.ler(`/boards/${encodeURIComponent(quadro)}/actions`, {
      filter: TIPOS_DE_ACAO.join(','),
      since: desde,
      limit: String(porPagina),
      ...(antes ? { before: antes } : {}),
    });
    const lidas = Array.isArray(pagina) ? pagina : [];
    todas.push(...lidas);
    if (lidas.length < porPagina) return { acoes: todas.reverse(), paginas: i + 1, noLimite: false };
    antes = String(lidas[lidas.length - 1]?.id ?? '');
    if (!antes) break;
  }
  return { acoes: todas.reverse(), paginas, noLimite: true };
}

/**
 * Garante o webhook do PROMeiro no quadro: o deste endereço no quadro configurado existe e está ativo. Sem ele,
 * registra; desligado pelo Trello, liga de novo; o deste endereço em outro quadro (o quadro trocou) sai. Os webhooks
 * de outros endereços (outras aplicações com o mesmo token) ficam como estão.
 * @param webhooks o trecho do módulo do Trello (servidor/trello.mjs: listar, criar, ligar, apagar)
 * @returns { feito: 'existe' | 'religado' | 'criado', id }
 */
export async function garantirWebhook(webhooks, { callbackURL, quadro }) {
  const todos = (await webhooks.listar()) ?? [];
  const meus = (Array.isArray(todos) ? todos : []).filter((w) => w?.callbackURL === callbackURL);
  for (const w of meus.filter((x) => x.idModel !== quadro)) await webhooks.apagar(w.id);
  const deste = meus.filter((x) => x.idModel === quadro);
  const ativo = deste.find((w) => w.active !== false);
  if (ativo) return { feito: 'existe', id: ativo.id };
  if (deste.length) {
    await webhooks.ligar(deste[0].id);
    return { feito: 'religado', id: deste[0].id };
  }
  const novo = await webhooks.criar({ callbackURL, idModel: quadro, description: DESCRICAO });
  return { feito: 'criado', id: novo?.id ?? null };
}

/**
 * O corpo cru do aviso, até `limite` bytes. Grande demais: o resto é lido e descartado (sem derrubar a conexão) e a
 * promessa falha com status 413.
 */
export const lerCorpoDoAviso = (req, limite = LIMITE_DO_AVISO) =>
  new Promise((ok, erro) => {
    const grandeDemais = () => Object.assign(new Error('Aviso grande demais.'), { status: 413 });
    if (Number(req.headers['content-length']) > limite) {
      req.resume();
      return erro(grandeDemais());
    }
    const partes = [];
    let total = 0;
    req.on('data', (p) => {
      total += p.length;
      if (total <= limite) partes.push(p);
    });
    req.on('end', () => (total > limite ? erro(grandeDemais()) : ok(Buffer.concat(partes))));
    req.on('error', erro);
  });
