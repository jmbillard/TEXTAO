import type { TipoPrograma } from './tipos';

/* Vocabulários padrão. Servem de sugestão nos campos do cabeçalho e de
   dicionário para o importador reconhecer o programa pelo texto ou pelo nome do arquivo. */

export interface ProgramaVocab {
  nome: string;
  tipo: TipoPrograma;
  /** Trechos (sem acento, minúsculos) que identificam o programa. */
  pistas: string[];
}

export const PROGRAMAS: ProgramaVocab[] = [
  { nome: 'Quem Ama Cuida', tipo: 'novela', pistas: ['quem ama cuida', 'quem ama', 'quem_ama'] },
  { nome: 'Nobreza do Amor', tipo: 'novela', pistas: ['nobreza do amor', 'nobreza'] },
  { nome: 'Por Você', tipo: 'novela', pistas: ['por voce'] },
  { nome: 'Encontro', tipo: 'ao_vivo', pistas: ['encontro'] },
  { nome: 'Mais Você', tipo: 'ao_vivo', pistas: ['mais voce'] },
  { nome: 'Eliana', tipo: 'auditorio', pistas: ['eliana'] },
  { nome: 'Futebol Brasileirão', tipo: 'esporte', pistas: ['brasileirao', 'futbrasileira', 'futebol'] },
  { nome: 'Futebol Libertadores', tipo: 'esporte', pistas: ['libertadores', 'fut liberta', 'fut_liberta', 'futliberta'] },
  { nome: 'Estrelas da Casa', tipo: 'auditorio', pistas: ['estrelas da casa', 'estrelas'] },
  { nome: 'Viver Sertanejo', tipo: 'auditorio', pistas: ['viver sertanejo', 'sertanejo 2', 'sertanejo_2'] },
  { nome: 'Circuito Sertanejo', tipo: 'auditorio', pistas: ['circuito sertanejo', 'circuito'] },
  { nome: 'Caldeirão', tipo: 'auditorio', pistas: ['caldeirao com mion', 'caldeirao'] },
  { nome: 'Globo Repórter', tipo: 'outro', pistas: ['globo reporter'] },
  { nome: 'Fantástico', tipo: 'outro', pistas: ['fantastico', 'fant'] },
  { nome: 'Globo Repórter', tipo: 'outro', pistas: ['g.reporter', 'g reporter'] },
  { nome: 'Altas Horas', tipo: 'auditorio', pistas: ['altas horas', 'altas'] },
  { nome: 'Esporte Espetacular', tipo: 'esporte', pistas: ['esporte espetacular', 'esporte'] },
  { nome: 'Jornal Hoje', tipo: 'outro', pistas: ['jornal hoje', 'jh'] },
  { nome: 'Dança dos Famosos', tipo: 'auditorio', pistas: ['danca dos famosos', 'danca'] },
  { nome: 'Sessão da Tarde', tipo: 'outro', pistas: ['sessao da tarde', 's.tarde', 's tarde'] },
  { nome: 'Temperatura Máxima', tipo: 'outro', pistas: ['temperatura maxima', 'temperatura'] },
  { nome: 'Globo Sessions', tipo: 'outro', pistas: ['globo sessions', 'sessions'] },
  { nome: 'Justiça', tipo: 'outro', pistas: ['justica'] },
];

export const LOCUTORES = ['DIRCEU', 'DIRCEU VIRTUAL', 'WALMIR', 'MCK', 'TATI', 'GIL'];
export const SELOS = ['Verifique a classificação indicativa', 'Sem selo', 'Livre', 'A10', 'A12', 'A14', 'A16', 'A18'];
export const PRACAS = ['REDE', 'SP', 'RJ', 'MG', 'DF', 'PE'];

export const NOMES_TIPO_PROGRAMA: Record<TipoPrograma, string> = {
  novela: 'Novela',
  ao_vivo: 'Ao vivo',
  esporte: 'Esporte',
  auditorio: 'Auditório',
  outro: 'Outro',
};

export const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/* ---------- vocabulário da casa (vem do servidor, quando ele está ligado ao Teable) ---------- */

export interface VocabularioExterno {
  programas: { nome: string; chaves: string[] }[];
  redatores: string[];
}

interface Externo {
  p: ProgramaVocab;
  /** Chaves de claquete, normalizadas. Só valem no começo do texto. */
  chaves: string[];
  /** Nome normalizado; vale em qualquer ponto do texto quando é longo o bastante. */
  nome: string;
}

let externos: Externo[] = [];
let redatores: string[] = [];

const normal = (s: string) =>
  semAcento(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function registrarVocabulario(v: VocabularioExterno | null) {
  externos = (v?.programas ?? []).map(({ nome, chaves }) => {
    const n = normal(nome);
    // o tipo (novela, esporte…) não vem do Teable: aproveita o do programa embutido parecido
    const embutido = PROGRAMAS.find((p) => p.pistas.some((pista) => ` ${n} `.includes(` ${pista} `)));
    const ch = chaves.map(normal).filter(Boolean);
    return { p: { nome, tipo: embutido?.tipo ?? 'outro', pistas: [...new Set([n, ...ch])] }, chaves: ch, nome: n };
  });
  redatores = v?.redatores ?? [];
}

/** Programas para sugerir no cabeçalho: os da casa, quando existem; senão, os embutidos. */
export const programasConhecidos = (): ProgramaVocab[] => (externos.length ? externos.map((e) => e.p) : PROGRAMAS);
export const redatoresConhecidos = (): string[] => redatores;

export function acharPrograma(texto: string): ProgramaVocab | null {
  // A claquete começa pela chave ("QUEM AMA 12/3 REDE"); chaves curtas ("CASA", "VT") não valem no meio de uma frase.
  const n = normal(texto.replace(/^\s*PGM\s*:/i, ''));
  let melhor: { p: ProgramaVocab; tam: number } | null = null;
  for (const e of externos) {
    for (const c of e.chaves)
      if ((n === c || n.startsWith(c + ' ')) && (!melhor || c.length > melhor.tam)) melhor = { p: e.p, tam: c.length };
    if (e.nome.length >= 8 && ` ${n} `.includes(` ${e.nome} `) && (!melhor || e.nome.length > melhor.tam))
      melhor = { p: e.p, tam: e.nome.length };
  }
  const t = semAcento(texto);
  for (const p of PROGRAMAS)
    for (const pista of p.pistas)
      if (t.includes(pista) && (!melhor || pista.length > melhor.tam)) melhor = { p, tam: pista.length };
  return melhor?.p ?? null;
}
