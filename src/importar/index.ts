import type { DocBruto } from './bruto';
import { lerDocx } from './docx';
import { lerRtf, lerTxt } from './rtf';

/** `aoProgredir` recebe o andamento do que demora (o OCR de PDF digitalizado). */
export async function lerArquivo(dados: ArrayBuffer | Uint8Array, nome: string, aoProgredir?: (texto: string) => void): Promise<DocBruto> {
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : '';
  if (ext === 'docx') return lerDocx(dados, nome);
  if (ext === 'rtf') return lerRtf(dados, nome);
  if (ext === 'txt') return lerTxt(dados, nome);
  if (ext === 'pdf') {
    const [{ lerPdf }, pdfjs] = await Promise.all([import('./pdf'), import('./pdfjs')]);
    return lerPdf(dados, nome, pdfjs.default, async (pagina, n, total) => {
      const { lerPaginaPorOcr } = await import('./ocr');
      const pagTxt = total > 1 ? `página ${n} de ${total}` : 'a página';
      aoProgredir?.(`Lendo a imagem: ${pagTxt}`);
      return lerPaginaPorOcr(pagina, (p) => aoProgredir?.(`Lendo a imagem: ${pagTxt} · ${Math.round(p * 100)}%`));
    });
  }
  if (ext === 'doc') throw new Error('Arquivos .doc antigos não são lidos. No Word, use "Salvar como" e escolha .docx.');
  throw new Error(`Ainda não leio arquivos .${ext || '?'}. Use .docx, .rtf, .pdf, .txt ou um .json exportado daqui.`);
}

export { interpretar, montarDoc } from './interpretar';
export type { Importacao, Pergunta, Resposta } from './interpretar';
