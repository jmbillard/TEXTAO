import type { Meta } from '../modelo/tipos';
import { semAcento } from '../modelo/vocabularios';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-10-27" → "terça, 27 de outubro" */
export function dataPorExtenso(iso: string, comAno = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${DIAS[d.getDay()]}, ${+m[3]} de ${MESES[+m[2] - 1]}${comAno ? ` de ${m[1]}` : ''}`;
}

export const dataCurta = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : '';
};

/** "sáb, 11/07": o dia da semana ajuda a bater o olho na exibição. */
export const dataCurtaComDia = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const dia = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
  return `${dia}, ${m[3]}/${m[2]}`;
};

export function haQuantoTempo(iso: string, agora = Date.now()): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'agora há pouco';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  const dias = Math.round(s / 86400);
  return dias === 1 ? 'ontem' : dias < 30 ? `há ${dias} dias` : new Date(iso).toLocaleDateString('pt-BR');
}

export const nomeDoArquivo = (meta: Meta) =>
  // a claquete já é o nome da chamada; a barra da data não cabe em nome de arquivo
  (meta.claquete ? [meta.claquete.replace(/\//g, ' ')] : [meta.programa, meta.titulo, meta.titulo.includes(dataCurta(meta.dataExibicao)) ? '' : dataCurta(meta.dataExibicao).replace('/', '-')])
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'roteiro';

export function baixar(conteudo: Blob | string, nome: string, tipo = 'application/octet-stream') {
  const blob = typeof conteudo === 'string' ? new Blob([conteudo], { type: tipo }) : conteudo;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copia texto. Em http:// (rede local, sem HTTPS) a área de transferência moderna não existe; usa o método antigo. */
export async function copiarTexto(texto: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('cópia bloqueada');
}

/** O texto do jeito de buscar uma arte: sem acento, sem caixa, sem pontuação (como a chave da arte do servidor). */
export const chaveDeBusca = (s: string) =>
  semAcento(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
export const ehMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
/** "Mod-Shift-1" → "⌘⇧1" no Mac, "Ctrl+Shift+1" nos outros. */
export const atalho = (s: string) =>
  ehMac
    ? s.replace('Mod-', '⌘').replace('Shift-', '⇧').replace(/(.)$/, (c) => c.toUpperCase()).replace('Enter', '↩')
    : s.replace('Mod-', 'Ctrl+').replace('Shift-', 'Shift+').replace(/\+(.)$/, (_, c: string) => '+' + c.toUpperCase());

/** A pessoa pediu ao sistema para reduzir o movimento: as animações viram só a troca. */
export const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A versão de celular: até 600px de largura (o mesmo corte das regras de tela em estilos.css). */
export const TELA_DE_CELULAR = '(max-width: 600px)';
/** A tela é de celular agora? O tour e o "Fazer o tour" leem uma vez, na entrada: girar o aparelho ou estreitar a
    janela depois não muda o que já foi decidido. A agenda acompanha a largura (useTelaDeCelular, em faixa.ts). */
export const ehCelular = () => typeof window !== 'undefined' && !!window.matchMedia?.(TELA_DE_CELULAR).matches;
