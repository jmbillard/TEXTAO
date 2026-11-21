import { it, expect } from 'vitest';
import fs from 'fs';
import { join } from 'path';
import { lerDocx } from '../src/importar/docx';
import { interpretar, montarDoc } from '../src/importar/interpretar';
it('imagem do docx chega ao documento', async () => {
  const b = await lerDocx(new Uint8Array(fs.readFileSync(join(__dirname, 'fixtures', 'imagem.docx'))), 'Teste_Imagem_C.docx');
  expect(b.imagens).toHaveLength(1);
  const imp = interpretar(b);
  const doc = montarDoc(imp);
  const s = JSON.stringify(doc);
  expect(imp.meta.programa).toBe(''); // a linha só com a imagem não vira nome de atração
  expect(/[\ue000-\uf8ff]/.test(s)).toBe(false); // nenhum marcador sobra
  expect(s).toContain('"type":"imagem"');
});
