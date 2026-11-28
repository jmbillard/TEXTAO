import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { yUndoPluginKey } from 'y-prosemirror';
import { armazenamento, roteiroDa } from '../dados/armazenamento';
import { corDe, presentes as listarPresentes, salaVazia, type Presente, type Sala } from '../dados/colaboracao';
import type { Meta, Pessoa, Roteiro } from '../modelo/tipos';

/* A sala ao vivo de um roteiro (Yjs por WebSocket, src/dados/colaboracao.ts), com o texto no fragmento "doc" e o
   cabeçalho no mapa "meta". É a mesma regra no editor de revisão e na folha de escrita (#191, spec #186): as duas telas
   chamam este hook, e o que muda entre elas vem nas opções.

   O preenchimento: a sala vazia (sem texto e sem metadados, `salaVazia`) é preenchida uma vez só, pela aba que o
   servidor escolheu (`semear`, a vez é da aba); as outras esperam o texto chegar e, se a aba da vez desistiu, perguntam
   de novo. Até lá a folha fica travada (`liberado` falso), para nada ser escrito nem salvo por cima de uma folha vazia
   (recarregar no meio não duplica o texto). Preencher e liberar não são edições: não passam pelo `onUpdate` do editor
   nem entram no desfazer. */

/** O que a sala diz da gravação: tudo gravado, gravando o que esta aba mudou, ou sem conexão com o que falta gravar. */
export type GravacaoDaSala = 'salvo' | 'salvando' | 'sem-conexao';

interface Opcoes {
  inicial: Roteiro;
  pessoa?: Pessoa;
  /** quem abriu pode escrever no roteiro: pergunta logo se a vez de preencher passou para ele */
  escreve: boolean;
  /** a folha fica editável ao liberar (padrão: `escreve`). Lido no momento de liberar; depois, quem muda o modo é a tela */
  editavel?: boolean;
  /** ao liberar uma folha editável, põe o cursor no fim do texto, pronta para digitar */
  focarAoLiberar?: boolean;
  /** os metadados da sala (os que chegaram de outra pessoa, ou os que já estavam nela ao abrir) */
  aoMudarMeta: (meta: Partial<Meta>) => void;
}

export function useSalaAoVivo(sala: Sala | null, editor: Editor | null, { inicial, pessoa, escreve, editavel = escreve, focarAoLiberar = false, aoMudarMeta }: Opcoes) {
  // sem sala, não há o que esperar: o texto é o do roteiro
  const [sincronizado, setSincronizado] = useState(!sala);
  const [liberado, setLiberado] = useState(!sala);
  const [presentes, setPresentes] = useState<Presente[]>([]);
  const [gravacao, setGravacao] = useState<GravacaoDaSala>('salvo');
  const meta = useRef(aoMudarMeta);
  meta.current = aoMudarMeta;
  const editavelRef = useRef(editavel);
  editavelRef.current = editavel;
  const email = pessoa?.email ?? '';
  const nome = pessoa?.nome ?? '';

  // a conexão: quem está aqui, os metadados que chegam e a marca de salvo
  useEffect(() => {
    if (!sala) return;
    let conectado = false;
    const aoSincronizar = (ok: boolean) => ok && setSincronizado(true);
    // a presença muda a cada tecla e a cada movimento de mouse dos colegas: só redesenha quando muda quem está aqui
    const aoMudarPresenca = () => {
      const novo = listarPresentes(sala, email);
      setPresentes((antes) => (JSON.stringify(antes) === JSON.stringify(novo) ? antes : novo));
    };
    const aoMudarMeta = (e: { transaction: { local: boolean } }) => {
      if (!e.transaction.local) meta.current(sala.meta.toJSON() as Partial<Meta>);
    };
    const conferir = () => setGravacao(!sala.pendente() ? 'salvo' : conectado ? 'salvando' : 'sem-conexao');
    const aoMudar = (_u: Uint8Array, origem: unknown) => origem !== sala.provedor && conferir();
    const aoMudarConexao = ({ status }: { status: string }) => {
      conectado = status === 'connected';
      conferir();
    };
    sala.provedor.on('sync', aoSincronizar);
    sala.provedor.on('status', aoMudarConexao);
    sala.provedor.awareness.on('change', aoMudarPresenca);
    sala.meta.observe(aoMudarMeta);
    sala.doc.on('update', aoMudar);
    const pararDeOuvir = sala.aoGravar(conferir);
    sala.provedor.awareness.setLocalStateField('user', { name: nome || 'Alguém', email, color: corDe(email) });
    sala.provedor.connect();
    return () => {
      sala.provedor.off('sync', aoSincronizar);
      sala.provedor.off('status', aoMudarConexao);
      sala.provedor.awareness.off('change', aoMudarPresenca);
      sala.meta.unobserve(aoMudarMeta);
      sala.doc.off('update', aoMudar);
      pararDeOuvir();
      sala.provedor.disconnect();
    };
  }, [sala, email, nome]);

  // depois de sincronizar: preenche a sala vazia, se a vez for desta aba, e libera a folha
  useEffect(() => {
    if (!sala || !editor || !sincronizado) return;
    const preencher = (r: Roteiro) => {
      editor.commands.setContent(r.doc, false);
      sala.doc.transact(() => Object.entries(r.meta).forEach(([k, v]) => v !== undefined && sala.meta.set(k, v)));
      // preencher não é uma edição: o desfazer começa depois disso
      (yUndoPluginKey.getState(editor.state) as { undoManager?: { clear: () => void } } | undefined)?.undoManager?.clear();
    };
    const liberar = () => {
      if (sala.meta.size) meta.current(sala.meta.toJSON() as Partial<Meta>);
      // mudar o modo não é uma edição: não avisa o onUpdate
      editor.setEditable(editavelRef.current, false);
      if (focarAoLiberar && editavelRef.current) editor.commands.focus('end');
      setLiberado(true);
    };
    if (!salaVazia(sala)) return liberar();
    if (inicial.semear) {
      preencher(inicial);
      return liberar();
    }
    // vazia, mas a vez de preencher é de outra aba: espera o texto chegar; se ela desistiu, o servidor passa a vez
    let ativo = true;
    let prazo: ReturnType<typeof setTimeout>;
    const tentar = async () => {
      if (!ativo) return;
      if (!salaVazia(sala)) return liberar();
      const r = roteiroDa(await armazenamento.ler(inicial.id));
      if (!ativo) return;
      if (!salaVazia(sala)) return liberar();
      if (r?.semear) {
        preencher(r);
        return liberar();
      }
      prazo = setTimeout(tentar, 2000);
    };
    prazo = setTimeout(tentar, escreve ? 600 : 2000);
    return () => {
      ativo = false;
      clearTimeout(prazo);
    };
  }, [sala, editor, sincronizado]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sincronizado, liberado, presentes, gravacao };
}
