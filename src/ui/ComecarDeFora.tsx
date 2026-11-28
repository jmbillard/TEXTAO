import { useEffect, useRef, useState } from 'react';
import { comecoDoArquivo, comecoDoColado, motivoDaLeitura, temTextoColado, type ComecoDeFora } from '../importar/paraEscrever';
import type { TextoOriginal } from '../dados/armazenamento';
import { textoDoTrecho } from '../modelo/trecho';
import type { NoJSON } from '../modelo/tipos';
import { AvisoDeSoltar, useSeletorDeArquivos } from './pecas';
import { Icone } from './icones';
import { atalho } from './util';

/* Começar o Roteiro de fora (#195, spec #186): abrir um .docx, RTF ou PDF (pelo seletor ou soltando na tela) ou colar
   um texto, na lista de "Roteiros" e na folha vazia. A leitura é a da fila, no navegador (`paraEscrever.ts`); quem usa
   decide o que fazer com o começo lido: a lista cria o roteiro e abre a folha, a folha vazia o recebe. */

/** O que foi lido para começar: o texto com os tipos e, do arquivo, ele e o texto do original (guardados junto). */
export interface ComecoLido {
  comeco: ComecoDeFora;
  arquivo?: File;
  original?: TextoOriginal;
}

/** O arquivo ou o texto colado (o HTML do Word e o texto puro). */
export type FonteDoComeco = { arquivo: File } | { html: string; texto: string };

/** O que está sendo lido agora: o nome e o andamento (o OCR do PDF digitalizado diz a página). */
export interface Lendo {
  nome: string;
  detalhe?: string;
}

const temTexto = (doc: NoJSON) => (doc.content ?? []).some((p) => textoDoTrecho(p).trim());
/** O campo onde a pessoa digita: lá, o Ctrl+V é do campo. */
const emCampo = (alvo: EventTarget | null) => !!(alvo as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

interface Opcoes {
  /** recebe o começo lido; o que ela recusar (lançar) aparece em `falhou` */
  receber: (lido: ComecoLido) => Promise<void> | void;
  falhou: (motivo: string) => void;
  /** a tela aceita o arquivo solto nela (senão, o soltar da janela vai para a fila) */
  soltar: boolean;
  /** o Ctrl+V fora dos campos começa pelo colado (a lista); a folha cola pelo editor */
  colarNaJanela?: boolean;
  /** o arquivo solto quando a tela não o aceita agora (a folha que já tem texto): o porquê */
  recusarSolto?: () => string | null;
}

export function useComecoDeFora({ receber, falhou, soltar, colarNaJanela = false, recusarSolto }: Opcoes) {
  const [lendo, setLendo] = useState<Lendo | null>(null);
  const [soltando, setSoltando] = useState(false);
  const atual = useRef({ receber, falhou, recusarSolto, lendo });
  atual.current = { receber, falhou, recusarSolto, lendo };

  const ler = async (fonte: FonteDoComeco) => {
    if (atual.current.lendo) return;
    const nome = 'arquivo' in fonte ? fonte.arquivo.name : 'o texto colado';
    setLendo({ nome });
    try {
      const lido: ComecoLido =
        'arquivo' in fonte
          ? { ...(await comecoDoArquivo(fonte.arquivo, (detalhe) => setLendo({ nome, detalhe }))), arquivo: fonte.arquivo }
          : { comeco: comecoDoColado(fonte.html, fonte.texto) };
      if (!temTexto(lido.comeco.doc)) throw new Error('Não achei texto para começar o roteiro.');
      await atual.current.receber(lido);
    } catch (e) {
      atual.current.falhou('arquivo' in fonte ? `${fonte.arquivo.name}: ${motivoDaLeitura(e)}` : e instanceof Error && e.message ? e.message : 'Não consegui ler o texto colado.');
    } finally {
      setLendo(null);
    }
  };
  const lerRef = useRef(ler);
  lerRef.current = ler;

  const escolher = (arquivos: File[]) => {
    if (!arquivos.length) return;
    // um roteiro de cada vez: a folha abre com ele
    if (arquivos.length > 1) atual.current.falhou(`Um roteiro de cada vez: comecei pelo ${arquivos[0].name}.`);
    void lerRef.current({ arquivo: arquivos[0] });
  };
  const seletor = useSeletorDeArquivos(escolher, true);
  const escolherRef = useRef(escolher);
  escolherRef.current = escolher;

  // o Ctrl+V fora dos campos
  useEffect(() => {
    if (!colarNaJanela) return;
    const colar = (e: ClipboardEvent) => {
      if (emCampo(e.target) || emCampo(document.activeElement)) return;
      const html = e.clipboardData?.getData('text/html') ?? '';
      const texto = e.clipboardData?.getData('text/plain') ?? '';
      if (!temTextoColado(html, texto)) return;
      e.preventDefault();
      void lerRef.current({ html, texto });
    };
    window.addEventListener('paste', colar);
    return () => window.removeEventListener('paste', colar);
  }, [colarNaJanela]);

  // o arquivo solto em qualquer lugar da tela (a marca `data-soltar-aqui` desliga o soltar da janela, que é da fila)
  useEffect(() => {
    if (!soltar) return;
    let dentro = 0;
    const temArquivo = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const entrar = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      dentro++;
      setSoltando(true);
    };
    const sair = () => {
      dentro = Math.max(0, dentro - 1);
      if (!dentro) setSoltando(false);
    };
    const sobre = (e: DragEvent) => temArquivo(e) && e.preventDefault();
    const largar = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      dentro = 0;
      setSoltando(false);
      const recusa = atual.current.recusarSolto?.();
      if (recusa) return atual.current.falhou(recusa);
      escolherRef.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', entrar);
    window.addEventListener('dragleave', sair);
    window.addEventListener('dragover', sobre);
    window.addEventListener('drop', largar);
    return () => {
      window.removeEventListener('dragenter', entrar);
      window.removeEventListener('dragleave', sair);
      window.removeEventListener('dragover', sobre);
      window.removeEventListener('drop', largar);
      setSoltando(false);
    };
  }, [soltar]);

  const elemento = (
    <>
      {seletor.elemento}
      {soltar && <span hidden data-soltar-aqui="" />}
      {soltando && !atual.current.recusarSolto?.() && <AvisoDeSoltar texto="O roteiro começa sendo escrito, com os tipos e as artes: .docx, .rtf ou .pdf" />}
    </>
  );
  return { lendo, ler, abrir: seletor.abrir, elemento };
}

/** O que está sendo lido, numa linha: "Lendo Brasa.docx…", com a página do OCR. */
export const fraseDoLendo = (l: Lendo) => `Lendo ${l.nome}…${l.detalhe ? ` ${l.detalhe}` : ''}`;

/** Na folha vazia, o colado tem mais de uma linha (um roteiro, não uma palavra): começa pela leitura inteira da fila. */
const ehRoteiroColado = (html: string, texto: string) => {
  const linhas = (t: string) => t.split(/\r?\n/).filter((l) => l.trim()).length;
  if (linhas(texto) > 1) return true;
  if (!html) return false;
  const corpo = new DOMParser().parseFromString(html, 'text/html').body;
  return corpo.querySelectorAll('p, div, li, tr, br').length > 1 && linhas(corpo.innerText ?? corpo.textContent ?? '') > 1;
};

/**
 * O convite da folha vazia (#195): abrir um .docx, RTF ou PDF, soltar o arquivo na folha ou colar o texto do Word.
 * O colado de várias linhas na folha vazia começa pela leitura inteira da fila (o cabeçalho, as etiquetas, as artes);
 * com texto na folha, o colar é o do editor (`ColagemNaEscrita`). `receber` põe o começo lido na folha.
 */
export function ComecarNaFolha({ corpo, vazia, pode, receber, falhou }: { corpo: React.RefObject<HTMLElement | null>; vazia: boolean; pode: boolean; receber: (lido: ComecoLido) => void; falhou: (motivo: string) => void }) {
  const aberta = vazia && pode;
  const abertaRef = useRef(aberta);
  abertaRef.current = aberta;
  const deFora = useComecoDeFora({
    receber,
    falhou,
    soltar: pode,
    recusarSolto: () => (abertaRef.current ? null : 'A folha já tem texto: para começar de um arquivo, solte-o na lista de Roteiros.'),
  });
  const lerRef = useRef(deFora.ler);
  lerRef.current = deFora.ler;
  // o colar chega antes do editor (na captura, pelo corpo da folha): só o do roteiro inteiro na folha vazia é daqui
  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const colar = (e: ClipboardEvent) => {
      if (!abertaRef.current) return;
      const html = e.clipboardData?.getData('text/html') ?? '';
      const texto = e.clipboardData?.getData('text/plain') ?? '';
      if (!ehRoteiroColado(html, texto)) return;
      e.preventDefault();
      e.stopPropagation();
      void lerRef.current({ html, texto });
    };
    el.addEventListener('paste', colar, true);
    return () => el.removeEventListener('paste', colar, true);
  }, [corpo]);
  return (
    <>
      {deFora.elemento}
      {(aberta || deFora.lendo) && (
        <p className="comecar-na-folha" role={deFora.lendo ? 'status' : undefined}>
          {deFora.lendo ? (
            <span className="comecar-na-folha-lendo">{fraseDoLendo(deFora.lendo)}</span>
          ) : (
            <>
              <span>Ou comece de um roteiro pronto:</span>{' '}
              <button type="button" className="botao-texto comecar-abrir" onMouseDown={(e) => e.preventDefault()} onClick={deFora.abrir}>
                <Icone nome="importar" tam={13} traco={2} /> abrir um .docx, RTF ou PDF
              </button>
              <span aria-hidden="true"> · </span>
              <span>
                soltar o arquivo aqui ou colar o texto do Word (<kbd>{atalho('Mod-V')}</kbd>)
              </span>
            </>
          )}
        </p>
      )}
    </>
  );
}
