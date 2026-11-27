/*
 * Mudar a etapa pela tela de produções (#110): "Peguei" (Entrada → Produzindo) e "Voltar para a Entrada". Quem clica
 * precisa estar ligado a um designer (o e-mail no cadastro de designers, servidor/configuracao-pessoas.mjs); qualquer
 * designer move qualquer card.
 *
 * O Trello primeiro, só com escrita (nada é lido dele, ADR 0006): pegar põe quem clicou como membro do card (o card
 * fica na lista em que está); voltar tira quem clicou do card e, se a Produção estava Entregue (o card na saída),
 * devolve o card à entrada da praça (a da Configuração). Se um passo falha depois de outro ter ido, o que já foi é
 * desfeito, como nas Duplicadas (#67). Com o Trello recusando, a Produção não muda.
 *
 * Depois, a Produção do PROMeiro muda na hora, com os eventos (a etapa, o designer que entrou ou saiu), quem, quando
 * e a origem PROMeiro. Nada vai ao Teable: a produção da arte continua com o n8n, que sincroniza a partir do Trello.
 * A Produção sem card muda só no PROMeiro.
 */
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';

/** As etapas para onde a tela leva por enquanto, e de onde cada uma sai. */
const DE_ONDE = { produzindo: ['entrada'], entrada: ['produzindo', 'entregue'] };
const ROTULO = { entrada: 'na Entrada', produzindo: 'em Produzindo', entregue: 'em Entregue', arquivada: 'arquivada' };

/** O que a tela diz a quem não está ligado a um designer. */
export const SEM_LIGACAO = 'Para pegar um card, o seu e-mail precisa estar no seu cadastro de designer. Peça a um administrador do PROMeiro para ligar (Configuração · Pessoas).';
const SEM_MEMBRO = 'O seu cadastro de designer não tem o id do seu membro no Trello, e esta Produção tem card. Peça a um administrador do PROMeiro para completar o cadastro (Configuração · Pessoas).';

const motivo = (e) => (e instanceof Error ? e.message : String(e));

/**
 * @param producoes o módulo das Produções (servidor/producoes.mjs)
 * @returns mudar({ producao, etapa }, { trello, pracas, email, designer }) → { status, corpo }
 */
export function criarEtapaDaProducao({ producoes }) {
  /**
   * @param designer { nome, membro } de quem clicou (null sem a ligação)
   * @param aTela (id) => o card como a tela mostra
   */
  async function mudar({ producao: id, etapa }, { trello, pracas, email, designer, aTela }) {
    if (!designer) return { status: 403, corpo: { erro: SEM_LIGACAO } };
    if (!Object.hasOwn(DE_ONDE, etapa)) return { status: 400, corpo: { erro: 'A etapa precisa ser produzindo ou entrada.' } };
    const p = typeof id === 'string' && id ? producoes.uma(id) : null;
    if (!p || p.arquivada) return { status: 404, corpo: { erro: 'Essa Produção não está mais na tela.' } };
    if (!DE_ONDE[etapa].includes(p.etapa)) return { status: 409, corpo: { erro: `Essa Produção já está ${ROTULO[p.etapa] ?? p.etapa}. A tela foi lida de novo.`, producao: aTela(p.id) } };

    const ehDesigner = p.designers.some((d) => nomeComparavel(d) === nomeComparavel(designer.nome));
    const feito = { antes: p.etapa, depois: etapa, semCard: !p.cardId, trello: [] };
    if (p.cardId) {
      if (!designer.membro) return { status: 403, corpo: { erro: SEM_MEMBRO } };
      if (!trello?.config?.chave || !trello?.config?.token) return { status: 503, corpo: { erro: 'O Trello não está configurado: nada mudou.' } };
      const r = await noTrello(p, etapa, { trello, pracas, membro: designer.membro });
      if (r.erro) return { status: 502, corpo: { erro: r.erro } };
      feito.trello = r.feito;
    }
    const mudancas = [{ tipo: 'etapa', antes: p.etapa, depois: etapa }];
    if (etapa === 'produzindo' && !ehDesigner) mudancas.push({ tipo: 'designer-entrou', antes: null, depois: designer.nome });
    if (etapa === 'entrada' && ehDesigner) mudancas.push({ tipo: 'designer-saiu', antes: p.designers.find((d) => nomeComparavel(d) === nomeComparavel(designer.nome)), depois: null });
    producoes.doPROMeiro(p.id, mudancas, { email, nome: designer.nome });
    const designerMudou = mudancas[1];
    if (designerMudou) feito.designer = designerMudou.tipo === 'designer-entrou' ? { entrou: designer.nome } : { saiu: designer.nome };
    return { status: 200, corpo: { feito, producao: aTela(p.id) } };
  }

  /**
   * Os passos no Trello, em ordem; o que falha depois de outro ter ido desfaz o que foi.
   * @returns { feito: ['membro-entrou' | 'membro-saiu' | 'card-movido'] } ou { erro }
   */
  async function noTrello(p, etapa, { trello, pracas, membro }) {
    const praca = pracas.find((x) => x.sigla === p.praca);
    const passos = [];
    if (etapa === 'produzindo') passos.push({ nome: 'membro-entrou', fazer: () => trello.entrarNoCard(p.cardId, membro), desfazer: () => trello.sairDoCard(p.cardId, membro) });
    else {
      if (p.etapa === 'entregue') {
        const entrada = praca?.entrada || trello.config.listas?.padrao || '';
        if (!entrada) return { erro: `A praça ${p.praca || '(sem praça)'} não tem a lista de entrada na Configuração: nada mudou.` };
        const saida = praca?.saida || '';
        passos.push({ nome: 'card-movido', fazer: () => trello.moverCard(p.cardId, entrada), desfazer: saida ? () => trello.moverCard(p.cardId, saida) : null });
      }
      passos.push({ nome: 'membro-saiu', fazer: () => trello.sairDoCard(p.cardId, membro), desfazer: () => trello.entrarNoCard(p.cardId, membro) });
    }
    const foram = [];
    for (const passo of passos) {
      try {
        // false: o Trello já estava assim (nada a desfazer)
        if ((await passo.fazer()) !== false) foram.push(passo);
      } catch (e) {
        const naoDesfeito = [];
        for (const f of foram.reverse())
          try {
            if (!f.desfazer) throw new Error('sem como desfazer');
            await f.desfazer();
          } catch (e2) {
            naoDesfeito.push(f.nome);
            console.warn(`[producoes] não desfiz ${f.nome} no card de ${p.claquete}: ${motivo(e2)}`);
          }
        const resto = naoDesfeito.length ? ' Não deu para desfazer tudo no Trello: confira o card.' : '';
        return { erro: `O Trello recusou: ${motivo(e)}. Nada mudou no PROMeiro.${resto}` };
      }
    }
    return { feito: foram.map((f) => f.nome) };
  }

  return { mudar };
}
