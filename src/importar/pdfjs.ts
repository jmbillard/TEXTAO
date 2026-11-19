// Carregamento do pdf.js no navegador: só é baixado quando alguém importa um PDF.
import * as pdfjs from 'pdfjs-dist';
import leitor from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfJs } from './pdf';

pdfjs.GlobalWorkerOptions.workerSrc = leitor;
export default pdfjs as unknown as PdfJs;
