import { exportar } from './exportar';
import { metaVazia, type NoJSON, type Roteiro } from './tipos';
import { semAcento } from './vocabularios';

/* Versão nova de um roteiro que já estava na fila: o texto vem do arquivo novo, mas o trabalho já feito
   na versão anterior (o tipo e a observação de cada arte) passa para as artes que continuam iguais. */

const comoRoteiro = (doc: NoJSON): Roteiro => ({ id: 'v', meta: metaVazia(), doc, revisao: 1, criadoEm: '', atualizadoEm: '' });
const chave = (texto: string) => semAcento(texto).replace(/[^a-z0-9]+/g, ' ').trim();

export function herdarTipos(novo: NoJSON, anterior: NoJSON): { doc: NoJSON; herdadas: number } {
  const daAnterior = new Map<string, { subtipo: string; obs: string }>();
  for (const a of exportar(comoRoteiro(anterior)).artes) if (a.subtipo || a.observacao) daAnterior.set(chave(a.texto), { subtipo: a.subtipo, obs: a.observacao });
  const textoDaNova = new Map(exportar(comoRoteiro(novo)).artes.map((a) => [a.id, a.texto]));

  let herdadas = 0;
  const vistas = new Set<string>();
  const copiar = (no: NoJSON): NoJSON => ({
    ...no,
    ...(no.content ? { content: no.content.map(copiar) } : {}),
    ...(no.marks
      ? {
          marks: no.marks.map((m) => {
            const id = String(m.attrs?.id ?? '');
            if (m.type !== 'arte' || m.attrs?.subtipo) return m;
            const veio = daAnterior.get(chave(textoDaNova.get(id) ?? ''));
            if (!veio) return m;
            if (!vistas.has(id)) {
              vistas.add(id);
              herdadas++;
            }
            return { ...m, attrs: { ...m.attrs, subtipo: veio.subtipo, obs: m.attrs?.obs || veio.obs } };
          }),
        }
      : {}),
  });
  return { doc: copiar(novo), herdadas };
}
