/* O navegador prepara a prévia para o servidor: a impressão do PDF (para reconhecer o mesmo arquivo), as páginas
   úteis (sem a primeira e a última), e para cada uma o PDF dela, a imagem, os pôsteres recortados, as linhas de
   texto e as vagas canceladas. Quem lê com a IA é o servidor; aqui só se prepara e se sobe. */
import { PDFDocument } from 'pdf-lib';
import { acharPosteres } from './posteres';
import { abrirPrevia, baixarPdfDaPrevia, criarPrevia, mandarPagina, type PaginaPreparada } from '../dados/armazenamento';
import type { PassoNoNavegador } from './andamento';

const ESCALA = 2;
const QUALIDADE = 0.9;

const emBase64 = async (b: Blob) => {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const jpeg = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Não deu para gerar a imagem da página.'))), 'image/jpeg', QUALIDADE));

/** As páginas úteis de uma prévia de n páginas: da segunda à penúltima (com 1 ou 2 páginas, todas). */
export const paginasUteis = (n: number) => (n <= 2 ? Array.from({ length: n }, (_, i) => i + 1) : Array.from({ length: n - 2 }, (_, i) => i + 2));

/** O que a subida conta a cada passo: a prévia criada (ou achada, o mesmo PDF de novo) e cada página que passa pelo navegador. */
export type PassoDaSubida = { tipo: 'criada'; id: string } | { tipo: PassoNoNavegador; numero: number };

export async function subirPrevia(
  arquivo: File,
  aoAndar: (feito: number, total: number) => void = () => {},
  aoPasso: (passo: PassoDaSubida) => void = () => {},
): Promise<string> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const pdfjs = (await import('../importar/pdfjs')).default as unknown as { getDocument(o: object): { promise: Promise<{ numPages: number; getPage(n: number): Promise<unknown> }> } };
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const uteis = paginasUteis(doc.numPages);
  const { id } = await criarPrevia(arquivo.name, hash, uteis);
  aoPasso({ tipo: 'criada', id });
  // a mesma prévia de novo: só sobe o que ainda não chegou ao servidor
  const ja = new Set((await abrirPrevia(id)).paginas.filter((p) => p.estado !== 'esperando').map((p) => p.numero));
  const original = await PDFDocument.load(bytes);
  const faltam = uteis.filter((n) => !ja.has(n));
  aoAndar(0, faltam.length);
  for (const [i, n] of faltam.entries()) {
    aoPasso({ tipo: 'preparando', numero: n });
    const pagina = await prepararPagina(pdfjs, await doc.getPage(n), original, n);
    aoPasso({ tipo: 'subindo', numero: n });
    await mandarPagina(id, n, pagina);
    aoPasso({ tipo: 'subiu', numero: n });
    aoAndar(i + 1, faltam.length);
  }
  return id;
}

/**
 * A prévia que chegou por e-mail (#157): o servidor só guardou o PDF. O navegador baixa e prepara pela mesma subida da
 * mão; a impressão é a mesma, então o servidor acha a prévia (e cria as páginas dela na primeira vez).
 */
export async function prepararPreviaDoEmail(
  previa: { id: string; nome: string },
  aoAndar?: (feito: number, total: number) => void,
  aoPasso?: (passo: PassoDaSubida) => void,
): Promise<string> {
  const arquivo = await baixarPdfDaPrevia(previa.id, previa.nome);
  const id = await subirPrevia(arquivo, aoAndar, aoPasso);
  if (id !== previa.id) throw new Error('O PDF baixado não bateu com a prévia que chegou por e-mail.');
  return id;
}

async function prepararPagina(pdfjs: unknown, pagina: unknown, original: PDFDocument, n: number): Promise<PaginaPreparada> {
  const pg = pagina as { getViewport(o: { scale: number }): { width: number; height: number }; render(o: object): { promise: Promise<void> } };
  const vista = pg.getViewport({ scale: ESCALA });
  const tela = document.createElement('canvas');
  tela.width = Math.floor(vista.width);
  tela.height = Math.floor(vista.height);
  const ctx = tela.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tela.width, tela.height);
  await pg.render({ canvasContext: ctx, viewport: vista }).promise;
  const achado = await acharPosteres(pdfjs, pagina, ESCALA);

  const posteres = [];
  for (const caixa of achado.posteres) {
    const recorte = document.createElement('canvas');
    recorte.width = caixa.width;
    recorte.height = caixa.height;
    recorte.getContext('2d')!.drawImage(tela, caixa.x, caixa.y, caixa.width, caixa.height, 0, 0, caixa.width, caixa.height);
    posteres.push({ dados: await emBase64(await jpeg(recorte)), caixa });
  }
  // a página sozinha num PDF, como a leitura por IA recebia do FilmeBOT
  const so = await PDFDocument.create();
  const [copia] = await so.copyPages(original, [n - 1]);
  so.addPage(copia);
  const pdf = await emBase64(new Blob([(await so.save()) as BlobPart], { type: 'application/pdf' }));
  const imagem = await emBase64(await jpeg(tela));
  tela.width = tela.height = 0;
  return {
    pdf,
    imagem,
    tamanho: achado.tamanho,
    posteres,
    textos: achado.textos.map(({ str, x, top, width, height }) => ({ str, x, top, width, height })),
    vagas: achado.vagas,
  };
}
