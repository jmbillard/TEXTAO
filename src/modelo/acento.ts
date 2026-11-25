import { semAcento } from './vocabularios';

/* Acento no nome sugerido da atração nova. A key e a claquete que vem do nome do arquivo chegam em maiúsculas e
   sem acento ("FESTA NA PRACA"); o nome que a atração ganha precisa da grafia certa ("Festa na Praça").
   Ordem: 1) a grafia acentuada que já existe (nas claquetes da linha e nos nomes das atrações cadastradas);
   2) um dicionário curto e regras de terminação seguras; 3) sem certeza, a palavra fica como está: errar o acento
   é pior do que deixar sem. */

/** Palavras comuns em nome de programa, pela forma sem acento. Só as que não têm outra leitura sem acento
    ("pais" fica de fora: pode ser "país" ou "pais", como no Dia dos Pais). */
const DICIONARIO: Record<string, string> = Object.fromEntries(
  [
    'praça', 'praças', 'são', 'não', 'coração', 'música', 'músicas', 'história', 'histórias', 'notícia',
    'notícias', 'mágica', 'mágicas', 'mágico', 'mágicos', 'fé', 'já', 'você', 'vocês', 'câmera', 'câmeras', 'família',
    'famílias', 'código', 'códigos', 'último', 'última', 'últimos', 'últimas', 'série', 'séries', 'ciência',
    'ciências', 'mãe', 'mães', 'irmã', 'irmãs', 'irmão', 'irmãos', 'sábado', 'sábados', 'terça', 'número', 'números',
    'gênero', 'gêneros', 'olímpico', 'olímpica', 'olímpicos', 'olímpicas', 'olimpíada', 'olimpíadas', 'verão',
    'campeão', 'campeões', 'também', 'então', 'café', 'saúde', 'água', 'próximo', 'próxima', 'único', 'única',
    'clássico', 'clássicos', 'clássica', 'clássicas', 'público', 'pública', 'férias', 'domingão', 'telão',
  ].map((p) => [semAcento(p), p]),
);

/** Terminações que só se escrevem de um jeito. A palavra precisa de ao menos uma letra antes da terminação, e "l"
    antes de -cao/-coes fica de fora (falcão, calção: não dá para saber). */
const TERMINACOES: [string, string][] = [
  ['coes', 'ções'],
  ['soes', 'sões'],
  ['cao', 'ção'],
  ['sao', 'são'],
  ['encia', 'ência'],
  ['ancia', 'ância'],
];

const temAcento = (p: string) => semAcento(p) !== p.toLowerCase();

/** Leva a caixa da palavra original (letra a letra) para a grafia acentuada: "PRACA" → "PRAÇA", "Praca" → "Praça". */
const naMesmaCaixa = (original: string, grafia: string) =>
  [...grafia.normalize('NFC')].map((c, i) => (original[i] && original[i] === original[i].toUpperCase() ? c.toUpperCase() : c.toLowerCase())).join('');

/** As grafias acentuadas que os textos de referência trazem, pela forma sem acento. Duas grafias diferentes para a
    mesma palavra: sem certeza, nenhuma vale. */
function grafiasDe(referencias: string[]) {
  const grafias = new Map<string, string | null>();
  for (const texto of referencias)
    for (const p of texto.normalize('NFC').match(/\p{L}+/gu) ?? []) {
      if (p.length < 2 || !temAcento(p)) continue;
      const chave = semAcento(p);
      const ja = grafias.get(chave);
      grafias.set(chave, ja === undefined || ja === p.toLowerCase() ? p.toLowerCase() : null);
    }
  return grafias;
}

/** O nome com os acentos que dá para pôr com segurança. Referências: as claquetes da linha e os nomes das atrações
    cadastradas. Palavra que já tem acento e sigla (toda em maiúsculas) ficam como estão. */
export function acentuar(nome: string, referencias: string[] = []) {
  const grafias = grafiasDe(referencias);
  return nome.normalize('NFC').replace(/\p{L}+/gu, (p) => {
    if (temAcento(p)) return p;
    if (p.length > 1 && p === p.toUpperCase()) return p;
    const chave = semAcento(p);
    const daReferencia = grafias.get(chave);
    if (daReferencia) return naMesmaCaixa(p, daReferencia);
    if (DICIONARIO[chave]) return naMesmaCaixa(p, DICIONARIO[chave]);
    for (const [fim, acentuado] of TERMINACOES)
      if (chave.length > fim.length && chave.endsWith(fim) && !(fim[0] === 'c' && chave.charAt(chave.length - fim.length - 1) === 'l')) return naMesmaCaixa(p, chave.slice(0, -fim.length) + acentuado);
    return p;
  });
}
