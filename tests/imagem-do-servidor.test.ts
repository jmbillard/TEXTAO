import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/* A imagem final do Docker só copia `servidor/` e `src/modelo/` (veja o Dockerfile). Um import do servidor que saia
   dessas pastas passa nos testes daqui e derruba o servidor em produção com ERR_MODULE_NOT_FOUND (foi o que aconteceu
   com `src/filmes/agenda.ts`, do #169). Este teste lê os imports relativos e confere que todos ficam dentro delas. */

const RAIZ = resolve(__dirname, '..');
const SERVIDOR = join(RAIZ, 'servidor');
const MODELO = join(RAIZ, 'src', 'modelo');

function arquivos(pasta: string, extensoes: RegExp): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    const caminho = join(pasta, e.name);
    if (e.isDirectory()) return arquivos(caminho, extensoes);
    return extensoes.test(e.name) ? [caminho] : [];
  });
}

/** Os especificadores relativos de um arquivo: `from '...'`, `import '...'` e `import('...')`. */
function importsRelativos(fonte: string): string[] {
  const achados: string[] = [];
  const padrao = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;
  for (const m of fonte.matchAll(padrao)) achados.push(m[2]);
  return achados;
}

const dentro = (alvo: string, pasta: string) => alvo === pasta || alvo.startsWith(pasta + sep);

function foraDaImagem(arquivosLidos: string[], permitidas: string[]): string[] {
  return arquivosLidos.flatMap((arquivo) =>
    importsRelativos(readFileSync(arquivo, 'utf8'))
      .filter((espec) => !permitidas.some((p) => dentro(resolve(dirname(arquivo), espec), p)))
      .map((espec) => `${relative(RAIZ, arquivo)} importa '${espec}'`),
  );
}

describe('imagem do servidor', () => {
  it('o servidor só importa de servidor/ ou de src/modelo/', () => {
    const lidos = arquivos(SERVIDOR, /\.mjs$/);
    expect(lidos.length).toBeGreaterThan(0);
    const fora = foraDaImagem(lidos, [SERVIDOR, MODELO]);
    expect(fora, `O Dockerfile só copia servidor/ e src/modelo/ para a imagem final; estes imports quebram o servidor em produção (ERR_MODULE_NOT_FOUND). Mova o arquivo para src/modelo/:\n${fora.join('\n')}`).toEqual([]);
  });

  it('src/modelo/ não importa de fora dela (o servidor carrega esses arquivos na imagem)', () => {
    const fora = foraDaImagem(arquivos(MODELO, /\.tsx?$/), [MODELO]);
    expect(fora, `O Dockerfile só copia servidor/ e src/modelo/ para a imagem final; um arquivo de src/modelo/ que importa de fora quebra o servidor em produção:\n${fora.join('\n')}`).toEqual([]);
  });
});
