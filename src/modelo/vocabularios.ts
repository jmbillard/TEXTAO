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

export function acharPrograma(texto: string): ProgramaVocab | null {
  const t = semAcento(texto);
  let melhor: { p: ProgramaVocab; tam: number } | null = null;
  for (const p of PROGRAMAS)
    for (const pista of p.pistas)
      if (t.includes(pista) && (!melhor || pista.length > melhor.tam)) melhor = { p, tam: pista.length };
  return melhor?.p ?? null;
}
