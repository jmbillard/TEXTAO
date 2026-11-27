/*
 * Mudar a etapa pela tela de produções (#110): "Peguei" (Entrada → Produzindo), "Voltar para a Entrada" e, no #111,
 * "Entreguei" (→ Entregue). Quem clica
 * precisa estar ligado a um designer (o e-mail no cadastro de designers, servidor/configuracao-pessoas.mjs); qualquer
 * designer move qualquer card.
 *
 * O Trello primeiro, só com escrita (nada é lido dele, ADR 0006): pegar põe quem clicou como membro do card (o card
 * fica na lista em que está); voltar tira quem clicou do card e, se a Produção estava Entregue (o card na saída),
 * devolve o card à entrada da praça (a da Configuração). Se um passo falha depois de outro ter ido, o que já foi é
 * desfeito, como nas Duplicadas (#67). Com o Trello recusando, a Produção não muda.
 *
 * Entregar (#111) move o card para a saída da praça (a da Configuração). Antes, se alguma arte do checklist não está
 * marcada (os itens da coluna de artes que não estão nas artes marcadas da Produção, o que o PROMeiro já guarda),
 * nada muda e a resposta traz as que faltam; com `assimMesmo`, entrega mesmo assim. Quem entrega não entra no card nem
 * nos designers.
 *
 * Depois, a Produção do PROMeiro muda na hora, com os eventos (a etapa, o designer que entrou ou saiu), quem, quando
 * e a origem PROMeiro. Nada vai ao Teable: a produção da arte continua com o n8n, que sincroniza a partir do Trello.
 * A Produção sem card muda só no PROMeiro.
 *
 * Desfazer (#112) é a ação contrária, gravada como eventos novos (marcados com o que desfazem): só a última mudança da
 * etapa daquele card, e só se ela é de quem pede, foi feita na tela e ainda não foi desfeita. Se alguém (aqui, no Trello
 * ou no Teable) mudou a etapa depois, não desfaz. No Trello, o contrário do que a mudança fez: o card volta para a lista
 * de onde saiu e quem entrou sai (ou quem saiu entra de novo).
 *
 * O aviso do Padeiro (#139) é o Peguei feito pelo Padeiro, quando o designer abre ou cria o projeto: o designer da chave
 * entra no card (só escrita) e na Produção (somado, se ela já tem outro), e a Produção na Entrada vai para Produzindo.
 * Os eventos levam a origem Padeiro e a hora da abertura, e seguem a regra do conflito (o atrasado fica só no
 * histórico; nada vai ao Trello por ele). A Produção Entregue não muda: fica só o evento "abriu-o-projeto". Abrir de novo
 * o que já é do designer não grava nada.
 */
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { ORIGEM_PROMEIRO, artesDoChecklist } from './producoes.mjs';

/** As etapas para onde a tela leva, e de onde cada uma sai. */
const DE_ONDE = { produzindo: ['entrada'], entrada: ['produzindo', 'entregue'], entregue: ['entrada', 'produzindo'] };
const ROTULO = { entrada: 'na Entrada', produzindo: 'em Produzindo', entregue: 'em Entregue', arquivada: 'arquivada' };

/** O que a tela diz a quem não está ligado a um designer. */
export const SEM_LIGACAO = 'Para pegar um card, o seu e-mail precisa estar no seu cadastro de designer. Peça a um administrador do PROMeiro para ligar (Configuração · Pessoas).';
const SEM_MEMBRO = 'O seu cadastro de designer não tem o id do seu membro no Trello, e esta Produção tem card. Peça a um administrador do PROMeiro para completar o cadastro (Configuração · Pessoas).';

const motivo = (e) => (e instanceof Error ? e.message : String(e));

/** As artes do checklist ainda não marcadas (#111), na ordem. */
export const artesQueFaltam = (p) => artesDoChecklist(p).filter((a) => !a.marcada).map((a) => a.nome);

/**
 * @param producoes o módulo das Produções (servidor/producoes.mjs)
 * @returns mudar({ producao, etapa, assimMesmo }, { trello, pracas, email, designer }) → { status, corpo }; a entrega
 *   com arte faltando (sem `assimMesmo`) volta com { faltam, producao } e nada muda
 */
export function criarEtapaDaProducao({ producoes }) {
  /**
   * @param designer { nome, membro } de quem clicou (null sem a ligação)
   * @param aTela (id) => o card como a tela mostra
   */
  async function mudar({ producao: id, etapa, assimMesmo = false }, { trello, pracas, email, designer, aTela }) {
    if (!designer) return { status: 403, corpo: { erro: SEM_LIGACAO } };
    if (!Object.hasOwn(DE_ONDE, etapa)) return { status: 400, corpo: { erro: 'A etapa precisa ser produzindo, entrada ou entregue.' } };
    const p = typeof id === 'string' && id ? producoes.uma(id) : null;
    if (!p || p.arquivada) return { status: 404, corpo: { erro: 'Essa Produção não está mais na tela.' } };
    if (!DE_ONDE[etapa].includes(p.etapa)) return { status: 409, corpo: { erro: `Essa Produção já está ${ROTULO[p.etapa] ?? p.etapa}. A tela foi lida de novo.`, producao: aTela(p.id) } };

    if (etapa === 'entregue' && assimMesmo !== true) {
      const faltam = artesQueFaltam(p);
      if (faltam.length) return { status: 200, corpo: { faltam, producao: aTela(p.id) } };
    }

    const ehDesigner = p.designers.some((d) => nomeComparavel(d) === nomeComparavel(designer.nome));
    const feito = { antes: p.etapa, depois: etapa, semCard: !p.cardId, trello: [] };
    if (p.cardId) {
      // entregar só move o card: não precisa do membro de quem clicou
      if (!designer.membro && etapa !== 'entregue') return { status: 403, corpo: { erro: SEM_MEMBRO } };
      if (!trello?.config?.chave || !trello?.config?.token) return { status: 503, corpo: { erro: 'O Trello não está configurado: nada mudou.' } };
      const r = await executar(p, passosDaMudanca(p, etapa, { trello, pracas, membro: designer.membro }));
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
   * Desfaz a última mudança de quem pede naquele card (#112): a ação contrária, no Trello e na Produção.
   * @returns { status, corpo }: { feito, producao }, como `mudar`
   */
  async function desfazer({ producao: id }, { trello, pracas, email, designer, aTela }) {
    if (!designer) return { status: 403, corpo: { erro: SEM_LIGACAO } };
    const p = typeof id === 'string' && id ? producoes.uma(id) : null;
    if (!p || p.arquivada) return { status: 404, corpo: { erro: 'Essa Produção não está mais na tela.' } };
    const u = producoes.ultimaMudanca(p.id);
    const sua = u && u.origem === ORIGEM_PROMEIRO && u.quem === email && u.tipo === 'etapa' && u.depois === p.etapa;
    if (!sua) {
      const erro = u ? 'A Produção mudou depois da sua mudança: não dá mais para desfazer. A tela foi lida de novo.' : 'Não há mudança sua para desfazer nesta Produção.';
      return { status: 409, corpo: { erro, producao: aTela(p.id) } };
    }
    if (u.desfaz) return { status: 409, corpo: { erro: 'Essa mudança já foi desfeita.', producao: aTela(p.id) } };

    // o contrário de cada mudança feita junto: a etapa volta; quem entrou sai, quem saiu entra de novo
    const entrou = u.junto.find((m) => m.tipo === 'designer-entrou');
    const saiu = u.junto.find((m) => m.tipo === 'designer-saiu');
    const mudancas = [{ tipo: 'etapa', antes: u.depois, depois: u.antes }];
    const ehDesigner = (nome) => p.designers.some((d) => nomeComparavel(d) === nomeComparavel(nome));
    if (entrou && ehDesigner(entrou.depois)) mudancas.push({ tipo: 'designer-saiu', antes: entrou.depois, depois: null });
    if (saiu && !ehDesigner(saiu.antes)) mudancas.push({ tipo: 'designer-entrou', antes: null, depois: saiu.antes });

    const feito = { antes: p.etapa, depois: u.antes, semCard: !p.cardId, trello: [] };
    if (p.cardId) {
      const comMembro = mudancas.length > 1;
      if (comMembro && !designer.membro) return { status: 403, corpo: { erro: SEM_MEMBRO } };
      if (!trello?.config?.chave || !trello?.config?.token) return { status: 503, corpo: { erro: 'O Trello não está configurado: nada mudou.' } };
      const praca = pracas.find((x) => x.sigla === p.praca);
      const passos = [];
      // o card volta para a lista de onde saiu: a entrega o levou à saída; a volta de Entregue, à entrada
      if (u.depois === 'entregue') passos.push(passoDeMover(p, 'entrada', 'saida', praca, trello));
      else if (u.antes === 'entregue') passos.push(passoDeMover(p, 'saida', 'entrada', praca, trello));
      for (const m of mudancas.slice(1)) passos.push(passoDoMembro(p, m.tipo === 'designer-entrou', designer.membro, trello));
      const r = await executar(p, passos);
      if (r.erro) return { status: 502, corpo: { erro: r.erro } };
      feito.trello = r.feito;
    }
    producoes.doPROMeiro(p.id, mudancas, { email, nome: designer.nome }, { desfaz: u.id });
    const designerMudou = mudancas[1];
    if (designerMudou) feito.designer = designerMudou.tipo === 'designer-entrou' ? { entrou: designerMudou.depois } : { saiu: designerMudou.antes };
    return { status: 200, corpo: { feito, producao: aTela(p.id) } };
  }

  /**
   * O aviso do Padeiro (#139): o Peguei pelo Padeiro, com a hora da abertura.
   * @param p a Produção (producoes.doAviso)
   * @param designer { nome, membro } do designer ligado à chave
   * @param quem { id, nome } de quem os eventos dizem
   * @returns { status, corpo }: { producao, etapa, designers, eventos (os tipos gravados), trello (os passos) }
   */
  async function peloPadeiro({ producao: p, quando }, { trello, designer, quem }) {
    if (!p || p.arquivada) return { status: 404, corpo: { erro: 'Essa Produção não está mais aberta no PROMeiro.' } };
    const ehDesigner = p.designers.some((d) => nomeComparavel(d) === nomeComparavel(designer.nome));
    const mudancas = [];
    if (p.etapa === 'entregue') mudancas.push({ tipo: 'abriu-o-projeto', antes: null, depois: designer.nome });
    else {
      if (p.etapa === 'entrada') mudancas.push({ tipo: 'etapa', antes: 'entrada', depois: 'produzindo' });
      if (!ehDesigner) mudancas.push({ tipo: 'designer-entrou', antes: null, depois: designer.nome });
    }
    const feito = { eventos: mudancas.map((m) => m.tipo), trello: [] };
    // no Trello, só o membro que entra de fato (o atrasado fica só no histórico)
    const entra = mudancas.some((m) => m.tipo === 'designer-entrou' && !producoes.atrasado(p.id, { ...m, quando }));
    if (entra && p.cardId) {
      if (!designer.membro) return { status: 403, corpo: { erro: SEM_MEMBRO } };
      if (!trello?.config?.chave || !trello?.config?.token) return { status: 503, corpo: { erro: 'O Trello não está configurado: nada mudou.' } };
      const r = await executar(p, [passoDoMembro(p, true, designer.membro, trello)]);
      if (r.erro) return { status: 502, corpo: { erro: r.erro } };
      feito.trello = r.feito;
    }
    if (mudancas.length) producoes.doPadeiro(p.id, mudancas, quem, quando);
    const agora = producoes.uma(p.id);
    return { status: 200, corpo: { producao: p.id, etapa: agora.etapa, designers: agora.designers, ...feito } };
  }

  /** O passo que move o card para a lista `para` da praça (entrada ou saída) e, ao desfazer, de volta para `de`. Sem a
      lista, o passo é o erro. */
  function passoDeMover(p, para, de, praca, trello) {
    const lista = (k) => (k === 'entrada' ? praca?.entrada || trello.config.listas?.padrao || '' : praca?.saida || '');
    const destino = lista(para);
    if (!destino) return { erro: `A praça ${p.praca || '(sem praça)'} não tem a lista de ${para === 'entrada' ? 'entrada' : 'saída'} na Configuração: nada mudou.` };
    const volta = lista(de);
    return { nome: 'card-movido', fazer: () => trello.moverCard(p.cardId, destino), desfazer: volta ? () => trello.moverCard(p.cardId, volta) : null };
  }

  /** O passo que põe o membro no card (`entra`) ou o tira, e o contrário ao desfazer. */
  function passoDoMembro(p, entra, membro, trello) {
    const por = () => trello.entrarNoCard(p.cardId, membro);
    const tirar = () => trello.sairDoCard(p.cardId, membro);
    return entra ? { nome: 'membro-entrou', fazer: por, desfazer: tirar } : { nome: 'membro-saiu', fazer: tirar, desfazer: por };
  }

  /** Os passos no Trello para levar a Produção à etapa, em ordem. */
  function passosDaMudanca(p, etapa, { trello, pracas, membro }) {
    const praca = pracas.find((x) => x.sigla === p.praca);
    if (etapa === 'entregue') return [passoDeMover(p, 'saida', 'entrada', praca, trello)];
    if (etapa === 'produzindo') return [passoDoMembro(p, true, membro, trello)];
    return [...(p.etapa === 'entregue' ? [passoDeMover(p, 'entrada', 'saida', praca, trello)] : []), passoDoMembro(p, false, membro, trello)];
  }

  /**
   * Os passos no Trello, em ordem; o que falha depois de outro ter ido desfaz o que foi. Um passo que já é o erro (a
   * lista que falta) não deixa nenhum ir.
   * @returns { feito: ['membro-entrou' | 'membro-saiu' | 'card-movido'] } ou { erro }
   */
  async function executar(p, passos) {
    const semLista = passos.find((x) => x.erro);
    if (semLista) return { erro: semLista.erro };
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

  return { mudar, desfazer, peloPadeiro };
}
