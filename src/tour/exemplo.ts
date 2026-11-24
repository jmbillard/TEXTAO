/* O roteiro de exemplo do tour da revisão: fixo, fictício, e só na memória deste navegador. Ele entra na fila pela
   mesma interface de armazenamento que a fila e o editor usam, mas nunca é gravado, não aparece para mais ninguém e
   nunca vai ao Trello (o servidor também recusa o prefixo do id, por defesa). */
import { exportar, pendencias } from '../modelo/exportar';
import { metaVazia, type NoJSON, type Roteiro } from '../modelo/tipos';
import type { Armazenamento, Resumo } from '../dados/armazenamento';

/** O prefixo reservado do id do exemplo (o servidor recusa salvar e enviar ao Trello com ele). */
export const PREFIXO_DO_TOUR = 'tour-';
export const ID_DO_EXEMPLO = `${PREFIXO_DO_TOUR}revisao-exemplo`;
export const ehDoTour = (id: string) => id.startsWith(PREFIXO_DO_TOUR);

const par = (...partes: (string | { arte: string; id: string; tipo?: string })[]): NoJSON => ({
  type: 'paragraph',
  content: partes.map((p) =>
    typeof p === 'string' ? { type: 'text', text: p } : { type: 'text', text: p.arte, marks: [{ type: 'arte', attrs: { id: p.id, subtipo: p.tipo ?? '', sugerido: false } }] },
  ),
});

const dois = (n: number) => String(n).padStart(2, '0');

/** O exemplo, com a exibição amanhã: claquete, atração e artes fictícias e uma pendência só (sem editor). */
export function roteiroDeExemplo(hoje = new Date()): Roteiro {
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const dia = `${dois(amanha.getDate())}/${dois(amanha.getMonth() + 1)}`;
  const agora = hoje.toISOString();
  const r: Roteiro = {
    id: ID_DO_EXEMPLO,
    meta: {
      ...metaVazia(),
      claquete: `EXEMPLO_FESTIVAL_${dia}`,
      titulo: 'Festival de exemplo',
      programa: 'Festival de Exemplo',
      dataExibicao: `${amanha.getFullYear()}-${dois(amanha.getMonth() + 1)}-${dois(amanha.getDate())}`,
      praca: 'RJ',
      redator: 'Redator Fictício',
      locutor: 'Locutor Fictício',
      duracaoAlvoSeg: 30,
    },
    doc: {
      type: 'doc',
      content: [
        par('TÉC: abre no palco da orla, o público cantando junto.'),
        par('LOC: AMANHÃ, A PRAIA VIRA PALCO.'),
        par({ arte: 'LOGO DO FESTIVAL DE EXEMPLO', id: 'tour-a1', tipo: 'logo' }),
        par('LOC: SEIS BANDAS, UMA NOITE INTEIRA DE MÚSICA.'),
        par({ arte: 'SEIS BANDAS, UMA NOITE', id: 'tour-a2', tipo: 'lettering' }),
        par('SONORA: cantora fictícia, "A gente vem pela energia de quem está aqui."'),
        par({ arte: 'NOME DA CANTORA / VOCALISTA', id: 'tour-a3', tipo: 'rodape' }),
        par('LOC: OS PALCOS ESPALHADOS PELA ORLA, DO PÔR DO SOL ATÉ DE MADRUGADA.'),
        par({ arte: 'MAPA ANIMADO COM OS PALCOS DA ORLA', id: 'tour-a4', tipo: 'cartao' }),
        par('LOC: FESTIVAL DE EXEMPLO. AMANHÃ, DEPOIS DA NOVELA.'),
        par({ arte: 'AMANHÃ, DEPOIS DA NOVELA', id: 'tour-a5', tipo: 'assinatura' }),
      ],
    },
    revisao: 1,
    criadoEm: agora,
    atualizadoEm: agora,
    meu: true,
  };
  r.meta.revisar = pendencias(exportar(r));
  return r;
}

/* ---------- o adaptador em memória ---------- */

let exemplo: Roteiro | null = null;

/** Põe o exemplo na fila deste navegador (ou tira, com null). Devolve se havia um antes. */
export function colocarExemplo(r: Roteiro | null): boolean {
  const havia = !!exemplo;
  exemplo = r;
  return havia;
}

const copia = (r: Roteiro): Roteiro => JSON.parse(JSON.stringify(r)) as Roteiro;

const resumo = (r: Roteiro): Resumo => ({
  id: r.id,
  meta: r.meta,
  nArtes: exportar(r).artes.length,
  atualizadoEm: r.atualizadoEm,
  dono: null,
  publico: false,
  podeEditar: true,
  meu: true,
});

/** O armazenamento de sempre, com o exemplo do tour somado à listagem. Tudo o que tem o prefixo do tour responde da
    memória, sem rede; o resto passa direto para `base`. */
export function comExemplo(base: Armazenamento): Armazenamento {
  return {
    get tipo() {
      return base.tipo;
    },
    async listar() {
      const lista = await base.listar();
      return exemplo ? [...lista.filter((r) => r.id !== exemplo?.id), resumo(exemplo)] : lista;
    },
    async ler(id) {
      if (!ehDoTour(id)) return base.ler(id);
      return exemplo?.id === id ? copia(exemplo) : undefined;
    },
    async salvar(roteiro, marco, automatico) {
      if (!ehDoTour(roteiro.id)) return base.salvar(roteiro, marco, automatico);
      if (exemplo?.id === roteiro.id) exemplo = { ...copia(roteiro), atualizadoEm: new Date().toISOString() };
    },
    async apagar(id) {
      if (!ehDoTour(id)) return base.apagar(id);
      if (exemplo?.id === id) exemplo = null;
    },
    versoes: (id) => (ehDoTour(id) ? Promise.resolve([]) : base.versoes(id)),
    lerVersao: (id, n) => (ehDoTour(id) ? Promise.reject(new Error('O exemplo do tour não tem histórico.')) : base.lerVersao(id, n)),
    usuarios: () => base.usuarios(),
    andamento: () => base.andamento(),
  };
}
