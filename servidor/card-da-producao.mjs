/*
 * O card aberto da tela de produções (#160): o que se muda na Produção sem sair dela. Quem muda precisa estar ligado a
 * um designer (como no Peguei, servidor/etapa-da-producao.mjs), e qualquer designer muda qualquer card.
 *
 * - o prazo: o dia (AAAA-MM-DD), que vale sobre a exibição. No Trello, o prazo (due) do card, às 18h de São Paulo;
 * - a atração: uma do cadastro das atrações (o nome como o cadastro escreve) ou nenhuma (desligada). Vale sobre a do
 *   Roteiro, a do filme e a da claquete. O card do Trello não tem o campo da atração: ela fica só no PROMeiro;
 * - o designer: atribuir ou tirar qualquer designer ativo do cadastro. No Trello, o membro dele entra no card ou sai.
 *   A etapa não muda (o Peguei e o "Voltar para a Entrada" continuam sendo os botões da etapa);
 * - as artes: marcar e desmarcar (como a janela do After), apagar (todos os itens da arte saem do checklist) e o
 *   desfazer do apagar (os itens voltam, com as marcas de antes), e incluir uma arte nova. No Trello, o checklist do card
 *   espelha: o item marcado ou desmarcado, apagado ou posto de novo. O item que o checklist não tem fica de fora, sem
 *   erro (o card pode ter sido mexido à mão).
 *
 * Como no Peguei: o Trello primeiro, só escrevendo (a única leitura é a dos itens do checklist do card que vai mudar, a
 * que o ADR 0006 deixa); o passo que falha depois de outro ter ido desfaz o que foi, e com o Trello recusando a
 * Produção não muda. Depois, os eventos, com quem, agora e a origem PROMeiro, mudam a Produção na hora. Nada vai ao
 * Teable. A Produção sem card muda só no PROMeiro.
 */
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { chaveDeArte } from '../src/modelo/diferencas.ts';
import { diaDoPrazo } from '../src/modelo/producoesPorPraca.ts';
import { SEM_LIGACAO, SEM_MEMBRO, executar, passoDoMembro } from './etapa-da-producao.mjs';

const NAO_ESTA = { status: 404, corpo: { erro: 'Essa Produção não está mais na tela.' } };
const SEM_TRELLO = { status: 503, corpo: { erro: 'O Trello não está configurado: nada mudou.' } };
/** As ações das artes no card aberto. */
export const ACOES_DA_ARTE = ['marcar', 'desmarcar', 'apagar', 'voltar', 'incluir'];
/** O tamanho máximo do nome da arte incluída. */
const NOME_DA_ARTE = 120;

/** Um dia de verdade (AAAA-MM-DD)? */
const ehDia = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * @param producoes o módulo das Produções (servidor/producoes.mjs)
 * @returns { prazo, atracao, designer, arte }: cada um (pedido, ctx) → { status, corpo: { feito: { eventos, trello },
 *   producao } } ou a recusa ({ erro })
 *   ctx: { trello, email, designer: { nome, membro } de quem pede (null sem a ligação), aTela: (id) => o card da tela }
 */
export function criarCardDaProducao({ producoes }) {
  /** A Produção que se muda, ou a recusa. */
  function daTela(id, designer) {
    if (!designer) return { recusa: { status: 403, corpo: { erro: SEM_LIGACAO } } };
    const p = typeof id === 'string' && id ? producoes.uma(id.trim().slice(0, 100)) : null;
    if (!p || p.arquivada) return { recusa: NAO_ESTA };
    return { p };
  }

  /** Os passos no Trello (só com card) e depois os eventos. */
  async function gravar(p, mudancas, passos, { trello, email, designer, aTela }, { desfaz = null } = {}) {
    const feito = { eventos: mudancas.map((m) => m.tipo), trello: [] };
    if (!mudancas.length) return { status: 200, corpo: { feito, producao: aTela(p.id) } };
    if (p.cardId && passos.length) {
      if (!trello?.config?.chave || !trello?.config?.token) return SEM_TRELLO;
      const r = await executar(p, passos);
      if (r.erro) return { status: 502, corpo: { erro: r.erro } };
      feito.trello = r.feito;
    }
    producoes.doPROMeiro(p.id, mudancas, { email, nome: designer.nome }, { desfaz });
    return { status: 200, corpo: { feito, producao: aTela(p.id) } };
  }

  /** O prazo (#160): o dia, que vale sobre a exibição; no Trello, o due do card. */
  async function prazo({ producao, prazo: dia }, ctx) {
    const { p, recusa } = daTela(producao, ctx.designer);
    if (recusa) return recusa;
    if (!ehDia(dia)) return { status: 400, corpo: { erro: 'O prazo precisa ser um dia (AAAA-MM-DD).' } };
    const naTela = ctx.aTela(p.id)?.prazo;
    const antes = naTela ? diaDoPrazo(naTela) : null;
    const mudancas = p.prazoEm === dia ? [] : [{ tipo: 'campo', campo: 'prazo', antes, depois: dia }];
    const passos = [{ nome: 'prazo-mudou', fazer: () => ctx.trello.mudarPrazoDoCard(p.cardId, dia), desfazer: antes ? () => ctx.trello.mudarPrazoDoCard(p.cardId, antes) : null }];
    return gravar(p, mudancas, passos, ctx);
  }

  /**
   * A atração (#160): uma do cadastro (o nome como ele escreve) ou '' (desligada). Fica só no PROMeiro.
   * @param ctx.atracoes os nomes das atrações do cadastro
   */
  async function atracao({ producao, atracao: nome }, ctx) {
    const { p, recusa } = daTela(producao, ctx.designer);
    if (recusa) return recusa;
    if (typeof nome !== 'string') return { status: 400, corpo: { erro: 'Falta a atração (ou "" para desligar).' } };
    const pedida = nome.trim();
    const doCadastro = pedida ? (ctx.atracoes ?? []).find((a) => nomeComparavel(a) === nomeComparavel(pedida)) : '';
    if (doCadastro === undefined) return { status: 404, corpo: { erro: `A atração ${pedida} não está no cadastro das atrações.` } };
    const antes = ctx.aTela(p.id)?.atracao || null;
    const mudancas = p.atracao === doCadastro ? [] : [{ tipo: 'campo', campo: 'atracao', antes, depois: doCadastro || null }];
    return gravar(p, mudancas, [], ctx);
  }

  /**
   * Atribuir (`entra`) ou tirar um designer (#160): o membro dele no card do Trello e os designers da Produção. A etapa
   * não muda.
   * @param ctx.designers os designers ativos do cadastro: [{ nome, membro }]
   */
  async function designer({ producao, designer: nome, entra }, ctx) {
    const { p, recusa } = daTela(producao, ctx.designer);
    if (recusa) return recusa;
    if (typeof nome !== 'string' || !nome.trim() || typeof entra !== 'boolean') return { status: 400, corpo: { erro: 'Falta o designer e se ele entra (true) ou sai (false).' } };
    const naProducao = p.designers.find((d) => nomeComparavel(d) === nomeComparavel(nome));
    const doCadastro = (ctx.designers ?? []).find((d) => nomeComparavel(d.nome) === nomeComparavel(nome));
    // quem sai pode já não estar no cadastro (o designer inativo); quem entra precisa estar
    if (entra && !doCadastro) return { status: 404, corpo: { erro: `${nome.trim()} não está entre os designers ativos do cadastro.` } };
    const quem = doCadastro?.nome ?? naProducao ?? nome.trim();
    const mudancas = entra === !!naProducao ? [] : [entra ? { tipo: 'designer-entrou', antes: null, depois: quem } : { tipo: 'designer-saiu', antes: naProducao, depois: null }];
    if (mudancas.length && p.cardId && !doCadastro?.membro) {
      const erro = ctx.designer.nome && nomeComparavel(ctx.designer.nome) === nomeComparavel(quem) ? SEM_MEMBRO : `O cadastro de ${quem} não tem o id do membro no Trello, e esta Produção tem card. Peça a um administrador do PROMeiro para completar o cadastro (Configuração · Pessoas).`;
      return { status: 403, corpo: { erro } };
    }
    return gravar(p, mudancas, [passoDoMembro(p, entra, doCadastro?.membro, ctx.trello)], ctx);
  }

  /**
   * As artes (#160): marcar, desmarcar, apagar, voltar (o desfazer do apagar) e incluir. No Trello, o checklist do card
   * espelha.
   */
  async function arte({ producao, arte: nome, acao }, ctx) {
    const { p, recusa } = daTela(producao, ctx.designer);
    if (recusa) return recusa;
    if (!ACOES_DA_ARTE.includes(acao)) return { status: 400, corpo: { erro: `A ação da arte é ${ACOES_DA_ARTE.join(', ')}.` } };
    if (typeof nome !== 'string' || !chaveDeArte(nome)) return { status: 400, corpo: { erro: 'Falta a arte.' } };
    if (acao === 'incluir' && nome.trim().length > NOME_DA_ARTE) return { status: 400, corpo: { erro: `O nome da arte tem no máximo ${NOME_DA_ARTE} letras.` } };
    const m = producoes.mudancasDaArte(p.id, nome, acao);
    if (!m) return acao === 'incluir' ? { status: 409, corpo: { erro: 'Essa arte já está na Produção.' } } : { status: 404, corpo: { erro: acao === 'voltar' ? 'Essa arte não está apagada.' : 'Essa arte não está na Produção.' } };
    let passos = [];
    if (p.cardId && m.mudancas.length) {
      if (!ctx.trello?.config?.chave || !ctx.trello?.config?.token) return SEM_TRELLO;
      let itens;
      try {
        itens = await ctx.trello.itensDoCard(p.cardId);
      } catch (e) {
        return { status: 502, corpo: { erro: `O Trello não deixou ler o checklist do card: ${e instanceof Error ? e.message : e}. Nada mudou no PROMeiro.` } };
      }
      passos = passosDoChecklist(p, m.mudancas, itens, ctx.trello);
    }
    // a volta marca o apagar que ela desfaz
    const desfaz = acao === 'voltar' ? producoes.ultimaApagada(p.id, m.mudancas[0]?.depois) : null;
    return gravar(p, m.mudancas, passos, ctx, { desfaz });
  }

  /** Os passos no checklist do card para os eventos das artes; o item que o checklist não tem fica de fora. */
  function passosDoChecklist(p, mudancas, itens, trello) {
    const usados = new Set();
    const achar = (nome) => {
      const i = itens.find((x) => !usados.has(x.id) && chaveDeArte(x.nome) === chaveDeArte(nome));
      if (i) usados.add(i.id);
      return i;
    };
    const marcadas = new Set(p.artesMarcadas.map(chaveDeArte));
    // o checklist das artes: o primeiro que tem item (ou o primeiro do card); sem nenhum, o incluir cria
    const lista = itens[0]?.lista ?? null;
    return mudancas.flatMap((m) => {
      if (m.tipo === 'arte-marcada' || m.tipo === 'arte-desmarcada') {
        const feito = m.tipo === 'arte-marcada';
        const i = achar(m.depois ?? m.antes);
        if (!i || i.feito === feito) return [];
        return [{ nome: feito ? 'item-marcado' : 'item-desmarcado', fazer: () => trello.marcarItemDoCard(p.cardId, i.id, feito), desfazer: () => trello.marcarItemDoCard(p.cardId, i.id, !feito) }];
      }
      if (m.tipo === 'arte-apagada') {
        const i = achar(m.antes);
        if (!i) return [];
        return [{ nome: 'item-apagado', fazer: () => trello.apagarItemDoCard(i.lista, i.id), desfazer: () => trello.incluirItemNoCard(p.cardId, i.lista, i.nome, i.feito) }];
      }
      // arte-incluida: o item que já está no checklist não entra de novo
      if (achar(m.depois)) return [];
      let posto = null;
      return [
        {
          nome: 'item-incluido',
          fazer: async () => (posto = await trello.incluirItemNoCard(p.cardId, lista, m.depois, marcadas.has(chaveDeArte(m.depois)))),
          desfazer: () => (posto?.id ? trello.apagarItemDoCard(posto.lista, posto.id) : Promise.reject(new Error('o item não voltou'))),
        },
      ];
    });
  }

  return { prazo, atracao, designer, arte };
}
