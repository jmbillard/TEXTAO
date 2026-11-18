import type { DocBruto } from './bruto';
import { lerDocx } from './docx';
import { lerRtf, lerTxt } from './rtf';

export async function lerArquivo(dados: ArrayBuffer | Uint8Array, nome: string): Promise<DocBruto> {
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : '';
  if (ext === 'docx') return lerDocx(dados, nome);
  if (ext === 'rtf') return lerRtf(dados, nome);
  if (ext === 'txt') return lerTxt(dados, nome);
  if (ext === 'doc') throw new Error('Arquivos .doc antigos não são lidos. No Word, use "Salvar como" e escolha .docx.');
  throw new Error(`Ainda não leio arquivos .${ext || '?'}. Use .docx, .rtf, .txt ou um .json exportado daqui.`);
}

export { interpretar, montarDoc } from './interpretar';
export type { Importacao, Pergunta, Resposta } from './interpretar';
