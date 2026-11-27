import { useSyncExternalStore } from 'react';
import { chaveDoApelido, nomeComApelido } from '../modelo/versoesDoRoteiro';
import { gravarApelido, lerApelidos, type ApelidoGuardado } from './armazenamento';

/* Os apelidos das claquetes (#120), um por roteiro, no navegador: lidos do servidor quando uma tela que os mostra abre
   (e de novo depois de um tempo) e quando alguém muda um (o aviso da fila). O apelido do roteiro vale também para as
   Produções dele, de todas as praças, e para os cards do envio. Só para mostrar: o envio ao Trello e a gravação no
   Teable continuam com a claquete original, e nenhum cruzamento passa por aqui. O apelido traz também as versões feitas
   à mão (#152), que valem sobre o código do nome e sobre o roteiro; o apelido só com elas tem o nome vazio. */

interface Apelidos {
  doRoteiro: ReadonlyMap<string, string>;
  daProducao: ReadonlyMap<string, string>;
  doCard: ReadonlyMap<string, string>;
  /** pela claquete original, para a tela que não sabe o roteiro (a lista das Duplicadas) */
  daClaquete: ReadonlyMap<string, string>;
  /** as versões à mão (#152), pelo roteiro e pela Produção: o código no padrão */
  versoesDoRoteiro: ReadonlyMap<string, string>;
  versoesDaProducao: ReadonlyMap<string, string>;
}
let apelidos: Apelidos = { doRoteiro: new Map(), daProducao: new Map(), doCard: new Map(), daClaquete: new Map(), versoesDoRoteiro: new Map(), versoesDaProducao: new Map() };
let lidosEm = 0;
const ouvintes = new Set<() => void>();
/** Uma tela que abre relê os apelidos se a última leitura passou disto. */
const RELER_MS = 30_000;

function registrar(lista: readonly ApelidoGuardado[]) {
  apelidos = {
    doRoteiro: new Map(lista.map((a) => [a.roteiro, a.apelido])),
    daProducao: new Map(lista.flatMap((a) => a.producoes.map((p) => [p, a.apelido] as const))),
    doCard: new Map(lista.flatMap((a) => a.cards.map((c) => [c, a.apelido] as const))),
    daClaquete: new Map(lista.filter((a) => a.original.trim()).map((a) => [chaveDoApelido(a.original), a.apelido])),
    versoesDoRoteiro: new Map(lista.filter((a) => a.versoes).map((a) => [a.roteiro, a.versoes])),
    versoesDaProducao: new Map(lista.filter((a) => a.versoes).flatMap((a) => a.producoes.map((p) => [p, a.versoes] as const))),
  };
  lidosEm = Date.now();
  for (const f of ouvintes) f();
}

/** Relê os apelidos do servidor. Sem resposta, ficam os de antes. */
export const relerApelidos = () => lerApelidos().then(registrar, () => {});

/** O apelido do roteiro, ou '' sem apelido. */
export const apelidoDoRoteiro = (id: string | undefined) => (id && apelidos.doRoteiro.get(id)) || '';
/** O apelido da Produção: o do roteiro dela, ou '' sem apelido. */
export const apelidoDaProducao = (id: string | undefined) => (id && apelidos.daProducao.get(id)) || '';
/** O apelido do card do Trello: o do roteiro que foi para ele, ou '' sem apelido. */
export const apelidoDoCard = (id: string | undefined) => (id && apelidos.doCard.get(id)) || '';
/** Pela claquete, quando a tela não sabe o roteiro: o apelido do roteiro com esta claquete; senão, a claquete. */
export const comApelido = (claquete: string) => nomeComApelido(claquete, apelidos.daClaquete);

/** As versões feitas à mão no apelido do roteiro (#152), no padrão ("AH"); '' sem elas. */
export const versoesAMaoDoRoteiro = (id: string | undefined) => (id && apelidos.versoesDoRoteiro.get(id)) || '';
/** As versões feitas à mão no apelido do roteiro da Produção (#152); '' sem elas. */
export const versoesAMaoDaProducao = (id: string | undefined) => (id && apelidos.versoesDaProducao.get(id)) || '';

/** Dá, troca ou tira ('' é "voltar ao original") o apelido do roteiro; vale na hora para quem mudou. */
export const mudarApelido = async (roteiro: string, apelido: string) => registrar(await gravarApelido(roteiro, { apelido }));
/** Faz à mão (ou, com '', volta ao valor inicial) as versões do apelido do roteiro (#152); vale na hora para quem mudou. */
export const mudarVersoes = async (roteiro: string, versoes: string) => registrar(await gravarApelido(roteiro, { versoes }));

function assinar(f: () => void) {
  ouvintes.add(f);
  if (Date.now() - lidosEm > RELER_MS) void relerApelidos();
  return () => void ouvintes.delete(f);
}
const atuais = () => apelidos;

/** Redesenha a tela quando os apelidos mudam. */
export function useApelidos(): void {
  useSyncExternalStore(assinar, atuais, atuais);
}
