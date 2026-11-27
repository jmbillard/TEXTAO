/* A correção de grafia (#108): as propostas "de → para" das grafias antigas, conferidas por um administrador antes de
   aplicar. Regras puras, as mesmas no servidor e no navegador (só sintaxe que o Node apaga).

   Na pauta da edição (#114), só o código de versão no fim da claquete muda: vai para o padrão, uma letra por versão,
   maiúscula, entre parênteses, no fim e na ordem escrita. DIA vira (D), MES e MÊS viram (M), MNT continua (MNT). O
   código é achado pela mesma leitura da pauta (lerVersoes): o que ela não reconhece não é corrigido, só apontado. */
import { lerVersoes } from './pauta.ts';

/** A correção de uma claquete: a claquete no padrão, ou o código que a pauta não reconhece (só apontado). */
export type PropostaDaClaquete = { tipo: 'corrigir'; de: string; para: string } | { tipo: 'nao-reconhecido'; de: string; codigo: string };

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
/** Os códigos inteiros que viram uma letra só. */
const UMA_LETRA: Record<string, string> = { DIA: 'D', MES: 'M' };

/**
 * A claquete com o código de versão no padrão. null é "sem correção": sem código, já no padrão ou com um código que a
 * pauta não reconhece (aí, `nao-reconhecido`, para a tela apontar). Só o código muda: o resto da claquete, e o espaço
 * antes do código, ficam como estão.
 */
export function propostaDaClaquete(claquete: string): PropostaDaClaquete | null {
  const de = claquete.trim();
  // o dia da linha só muda o rótulo das versões, não o código
  const { versoes, semVersao } = lerVersoes(de, '');
  if (!versoes.length) return null;
  if (versoes.some((v) => !v.conhecida)) return { tipo: 'nao-reconhecido', de, codigo: versoes.map((v) => v.codigo).join('') };
  const lido = semAcento(versoes.map((v) => v.codigo).join(''));
  const codigo = UMA_LETRA[lido] ?? lido;
  const espaco = /^\s*/.exec(de.slice(semVersao.length))![0];
  const para = `${semVersao}${espaco}(${codigo})`;
  return para === de ? null : { tipo: 'corrigir', de, para };
}

/** Os dois grupos da pauta na tela: as claquetes a corrigir e os códigos que a pauta não reconhece. */
export type GrupoDaPauta = 'corrigir' | 'nao-reconhecido';

/** Uma proposta da pauta como a rota devolve: a linha (o dia e o editor), "de" e "para" ou o código não reconhecido. */
export interface PropostaDaPauta {
  /** o id da linha no Teable */
  id: string;
  /** o dia da pauta (AAAA-MM-DD) */
  dia: string;
  /** o editor; '' sem editor */
  editor: string;
  de: string;
  /** só no grupo corrigir */
  para?: string;
  /** só no grupo nao-reconhecido */
  codigo?: string;
}

/** Uma página das propostas da pauta: a rota GET /api/correcoes/pauta. */
export interface PaginaDaCorrecao {
  grupo: GrupoDaPauta;
  /** a partir de 1 */
  pagina: number;
  porPagina: number;
  /** quantas há em cada grupo, na pauta inteira */
  resumo: { corrigir: number; naoReconhecido: number };
  propostas: PropostaDaPauta[];
}
