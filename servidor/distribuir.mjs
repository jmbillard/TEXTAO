/* Montar a pauta, a coluna lateral (#126): o que a coordenação faz arrastando (ou pelo "Escalar na…" e o "Mover
   para…", no celular), no SQLite do PROMeiro. Nada vai ao Teable.
   - "Para distribuir": a lista escrita ou colada vira uma claquete por linha (no padrão), no fim da lista do dia
     (escala_para_distribuir, a mesma tabela das demandas tiradas de quem saiu do dia, em ausencias.mjs); levar uma
     para uma posição a tira da lista e a põe nas demandas da posição;
   - mover uma demanda de uma posição para outra, ou devolvê-la para "Para distribuir" (com de quem era);
   - escalar quem está sem escala numa vaga (ou no lugar de quem está na posição) ou numa posição nova de um turno.
   Cada ação lê o rascunho do dia, aplica a regra pura (src/modelo/distribuir.ts, a mesma do navegador) e grava o dia
   inteiro, numa transação só com a lista "Para distribuir". O SQL é portável (vale também no Postgres). */
import { randomUUID } from 'node:crypto';
import { demandaNoPadrao } from '../src/modelo/escala.ts';
import { acrescentarDemanda, escalarNa, linhasParaDistribuir, moverDemanda, tirarDemanda } from '../src/modelo/distribuir.ts';

const ID = /^[\w-]{1,40}$/;
/** Os limites: bem acima de uma lista de verdade, para um pedido errado não encher o banco. */
const LIMITES = { linhas: 60, texto: 200, lista: 200, editor: 80 };

const erro = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });
const minusculo = (email) => String(email ?? '').trim().toLowerCase();
const umId = (v, oQue) => {
  if (typeof v !== 'string' || !ID.test(v)) throw erro(`Falta ${oQue}.`);
  return v;
};

/**
 * @param db o SQLite do PROMeiro, com as tabelas da escala e das ausências já criadas
 * @param escala o rascunho do dia (criarEscala): lerDia e gravarDia
 */
export function criarDistribuicao(db, escala) {
  const q = {
    lista: db.prepare('SELECT id, texto, de_quem FROM escala_para_distribuir WHERE dia = ? ORDER BY ordem'),
    item: db.prepare('SELECT id, texto, de_quem FROM escala_para_distribuir WHERE dia = ? AND id = ?'),
    ultimaOrdem: db.prepare('SELECT MAX(ordem) AS n FROM escala_para_distribuir WHERE dia = ?'),
    usado: db.prepare('SELECT 1 AS sim FROM escala_para_distribuir WHERE id = ?'),
    inserir: db.prepare('INSERT INTO escala_para_distribuir (id, dia, ordem, texto, de_quem, por, em) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    tirar: db.prepare('DELETE FROM escala_para_distribuir WHERE dia = ? AND id = ?'),
  };
  const posicoesDe = (dia) => escala.lerDia(dia).posicoes;
  /** Põe os textos no fim da lista do dia (com de quem eram, '' quando vêm da lista escrita). */
  const porNaLista = (dia, itens, por) => {
    let ordem = (q.ultimaOrdem.get(dia)?.n ?? -1) + 1;
    const agora = new Date().toISOString();
    for (const { id, texto, deQuem } of itens) q.inserir.run(id && !q.usado.get(id) ? id : randomUUID(), dia, ordem++, texto, deQuem, minusculo(por), agora);
  };

  return {
    /** A lista "Para distribuir" do dia, na ordem. */
    paraDistribuir: (dia) => q.lista.all(dia).map((l) => ({ id: l.id, texto: l.texto, deQuem: l.de_quem })),

    /** Escreve ou cola a lista: uma claquete por linha, no padrão, no fim da lista. Lança (400) a vazia ou longa demais. */
    acrescentar(dia, texto, por) {
      if (typeof texto !== 'string') throw erro('Falta a lista das claquetes.');
      const linhas = linhasParaDistribuir(texto);
      if (!linhas.length) throw erro('Falta a lista das claquetes.');
      if (linhas.length > LIMITES.linhas) throw erro(`Linhas demais de uma vez (até ${LIMITES.linhas}).`);
      if (linhas.some((l) => l.length > LIMITES.texto)) throw erro(`Uma linha longa demais (até ${LIMITES.texto} letras).`);
      if (q.lista.all(dia).length + linhas.length > LIMITES.lista) throw erro(`A lista "Para distribuir" está cheia (até ${LIMITES.lista}).`);
      porNaLista(dia, linhas.map((l) => ({ texto: demandaNoPadrao(l, dia), deQuem: '' })), por);
    },

    /** Leva uma claquete de "Para distribuir" para as demandas de uma posição (antes de `antesDe`, ou no fim). */
    levar(dia, id, posicao, antesDe, por) {
      const item = q.item.get(dia, umId(id, 'a claquete'));
      if (!item) throw erro('Essa claquete não está mais em "Para distribuir".');
      const novas = acrescentarDemanda(posicoesDe(dia), umId(posicao, 'a posição'), { id: item.id, texto: item.texto }, antesDe ?? null);
      if (!novas) throw erro('Essa posição não existe mais.');
      escala.gravarDia(dia, novas, por, undefined, () => q.tirar.run(dia, item.id));
    },

    /** Move a demanda para outra posição (ou para outro lugar da mesma), antes de `antesDe` ou no fim. */
    mover(dia, demanda, posicao, antesDe, por) {
      const novas = moverDemanda(posicoesDe(dia), umId(demanda, 'a demanda'), umId(posicao, 'a posição'), antesDe ?? null);
      if (!novas) throw erro('Essa demanda ou essa posição não existe mais.');
      escala.gravarDia(dia, novas, por);
    },

    /** Devolve a demanda para "Para distribuir", com de quem era. */
    devolver(dia, demanda, por) {
      const tirada = tirarDemanda(posicoesDe(dia), umId(demanda, 'a demanda'));
      if (!tirada) throw erro('Essa demanda não existe mais.');
      escala.gravarDia(dia, tirada.posicoes, por, undefined, () => porNaLista(dia, [{ id: tirada.demanda.id, texto: tirada.demanda.texto, deQuem: tirada.de }], por));
    },

    /**
     * Escala a pessoa numa posição (a vaga, ou no lugar de quem está nela) ou numa posição nova do turno, com o
     * horário padrão dele. `fora(editor)` diz o motivo de quem está fora no dia (e aí recusa); `turnos` os que valem.
     * A posição nova fica com o `id` que a tela já mostra (o que ela criou antes da resposta), se ele ainda não existe
     * no dia; sem ele, ganha um novo.
     */
    escalar(dia, { editor, posicao, turno, id }, { turnos, fora }, por) {
      const nome = String(typeof editor === 'string' ? editor : '').trim().replace(/\s+/g, ' ');
      if (!nome || nome.length > LIMITES.editor) throw erro('Falta quem escalar.');
      const motivo = fora(nome);
      if (motivo) throw erro(`${nome} está fora no dia (${motivo}).`);
      let alvo;
      if (posicao !== undefined && posicao !== null) alvo = { posicao: umId(posicao, 'a posição') };
      else {
        const t = turnos.find((x) => x.id === turno);
        if (!t) throw erro('Turno desconhecido.');
        // a posição nova fica com o id que a tela já mostrou (#131), se ele vale e ainda não está no dia
        const usados = new Set(posicoesDe(dia).flatMap((p) => [p.id, ...p.demandas.map((d) => d.id), ...(p.avisos ?? []).map((a) => a.id)]));
        const novoId = typeof id === 'string' && ID.test(id) && !usados.has(id) ? id : `p-${randomUUID().slice(0, 24)}`;
        alvo = { turno: t.id, nova: { id: novoId, turno: t.id, editor: '', ilha: '', horario: t.horario, demandas: [], avisos: [] } };
      }
      const novas = escalarNa(posicoesDe(dia), nome, alvo);
      if (!novas) throw erro('Essa posição não existe mais.');
      escala.gravarDia(dia, novas, por);
    },
  };
}
