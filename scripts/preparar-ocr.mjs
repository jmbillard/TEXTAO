// Copia o motor de OCR (Tesseract) e o português para public/ocr, para o app servir tudo sozinho,
// sem depender de CDN. Roda antes do build e do modo de desenvolvimento.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pasta = (pacote) => dirname(require.resolve(`${pacote}/package.json`));
const destino = join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'ocr');
mkdirSync(destino, { recursive: true });

const arquivos = [
  [join(pasta('tesseract.js'), 'dist', 'worker.min.js'), 'worker.min.js'],
  // só o motor LSTM: com e sem SIMD (o próprio Tesseract escolhe conforme o navegador)
  [join(pasta('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(pasta('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  // português, modelo compacto (best_int)
  [join(pasta('@tesseract.js-data/por'), '4.0.0_best_int', 'por.traineddata.gz'), 'por.traineddata.gz'],
];
for (const [de, para] of arquivos) copyFileSync(de, join(destino, para));
console.log(`OCR pronto em public/ocr (${arquivos.length} arquivos)`);
