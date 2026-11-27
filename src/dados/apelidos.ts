import { useSyncExternalStore } from 'react';
import { chaveDoApelido, nomeComApelido } from '../modelo/versoesDoRoteiro';
import { gravarApelido, lerApelidos, type AlvoDoApelido, type ApelidoGuardado } from './armazenamento';

/* Os apelidos das claquetes (#120), um por claquete (#154), no navegador: lidos do servidor quando uma tela que os mostra
   abre (e de novo depois de um tempo) e quando alguém muda um (o aviso da fila). O apelido é da claquete no padrão (a
   chave da pauta e das Produções), com ou sem roteiro no PROMeiro: vale para os roteiros com ela, para as Produções dela,
   de todas as praças, e para os cards do envio. Só para mostrar: o envio ao Trello e a gravação no Teable continuam com
   a claquete original, e nenhum cruzamento passa por aqui. O apelido traz também as versões feitas à mão (#152), que
   valem sobre o código do nome e sobre o roteiro; o apelido só com elas tem o nome vazio. */

interface Apelidos {
  doRoteiro: ReadonlyMap<string, string>;
  daProducao: ReadonlyMap<string, string>;
  doCard: ReadonlyMap<string, string>;
  /** pela chave da claquete, para a tela que não sabe o roteiro (a pauta, as Duplicadas) */
  daClaquete: ReadonlyMap<string, string>;
  /** as versões à mão (#152), pelo roteiro, pela Produção e pela chave da claquete: o código no padrão */
  versoesDoRoteiro: ReadonlyMap<string, string>;
  versoesDaProducao: ReadonlyMap<string, string>;
  versoesDaClaquete: ReadonlyMap<string, string>;
}
let apelidos: Apelidos = { doRoteiro: new Map(), daProducao: new Map(), doCard: new Map(), daClaquete: new Map(), versoesDoRoteiro: new Map(), versoesDaProducao: new Map(), versoesDaClaquete: new Map() };
let lidosEm = 0;
const ouvintes = new Set<() => void>();
/** Uma tela que abre relê os apelidos se a última leitura passou disto. */
const RELER_MS = 30_000;

function registrar(lista: readonly ApelidoGuardado[]) {
  const por = (de: (a: ApelidoGuardado) => readonly string[], valor: (a: ApelidoGuardado) => string) => new Map(lista.flatMap((a) => (valor(a) ? de(a).map((k) => [k, valor(a)] as const) : [])));
  apelidos = {
    doRoteiro: por((a) => a.roteiros, (a) => a.apelido),
    daProducao: por((a) => a.producoes, (a) => a.apelido),
    doCard: por((a) => a.cards, (a) => a.apelido),
    daClaquete: por((a) => [a.chave], (a) => a.apelido),
    versoesDoRoteiro: por((a) => a.roteiros, (a) => a.versoes),
    versoesDaProducao: por((a) => a.producoes, (a) => a.versoes),
    versoesDaClaquete: por((a) => [a.chave], (a) => a.versoes),
  };
  lidosEm = Date.now();
  for (const f of ouvintes) f();
}

/** Relê os apelidos do servidor. Sem resposta, ficam os de antes. */
export const relerApelidos = () => lerApelidos().then(registrar, () => {});

/** O apelido da claquete do roteiro, ou '' sem apelido. */
export const apelidoDoRoteiro = (id: string | undefined) => (id && apelidos.doRoteiro.get(id)) || '';
/** O apelido da Produção: o da claquete dela (a do roteiro, quando ele está no PROMeiro), ou '' sem apelido. */
export const apelidoDaProducao = (id: string | undefined) => (id && apelidos.daProducao.get(id)) || '';
/** O apelido do card do Trello: o da claquete do roteiro que foi para ele, ou '' sem apelido. */
export const apelidoDoCard = (id: string | undefined) => (id && apelidos.doCard.get(id)) || '';
/** Pela claquete, quando a tela não sabe o roteiro: o apelido da claquete (em qualquer grafia); senão, a claquete. */
export const comApelido = (claquete: string) => nomeComApelido(claquete, apelidos.daClaquete);
/** O apelido da claquete (#154), com ou sem roteiro, ou '' sem apelido. */
export const apelidoDaClaquete = (claquete: string | undefined) => (claquete && apelidos.daClaquete.get(chaveDoApelido(claquete))) || '';

/** As versões feitas à mão no apelido da claquete do roteiro (#152), no padrão ("AH"); '' sem elas. */
export const versoesAMaoDoRoteiro = (id: string | undefined) => (id && apelidos.versoesDoRoteiro.get(id)) || '';
/** As versões feitas à mão no apelido da claquete da Produção (#152); '' sem elas. */
export const versoesAMaoDaProducao = (id: string | undefined) => (id && apelidos.versoesDaProducao.get(id)) || '';
/** As versões feitas à mão no apelido da claquete (#154), com ou sem roteiro; '' sem elas. */
export const versoesAMaoDaClaquete = (claquete: string | undefined) => (claquete && apelidos.versoesDaClaquete.get(chaveDoApelido(claquete))) || '';

/** O apelido e as versões à mão do alvo: o roteiro, a Produção ou a claquete. */
export function doAlvo(alvo: AlvoDoApelido): { apelido: string; mao: string } {
  if ('roteiro' in alvo) return { apelido: apelidoDoRoteiro(alvo.roteiro), mao: versoesAMaoDoRoteiro(alvo.roteiro) };
  if ('producao' in alvo) return { apelido: apelidoDaProducao(alvo.producao), mao: versoesAMaoDaProducao(alvo.producao) };
  return { apelido: apelidoDaClaquete(alvo.claquete), mao: versoesAMaoDaClaquete(alvo.claquete) };
}

/** Dá, troca ou tira ('' é "voltar ao original") o apelido da claquete do alvo; vale na hora para quem mudou. */
export const mudarApelido = async (alvo: AlvoDoApelido, apelido: string) => registrar(await gravarApelido(alvo, { apelido }));
/** Faz à mão (ou, com '', volta ao valor inicial) as versões do apelido da claquete do alvo (#152); vale na hora para
    quem mudou. */
export const mudarVersoes = async (alvo: AlvoDoApelido, versoes: string) => registrar(await gravarApelido(alvo, { versoes }));

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
