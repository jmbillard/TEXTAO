import { ETIQUETAS, SCHEMA_VERSION, SUBTIPOS_ARTE } from './tipos';

/* JSON Schema do arquivo exportado (contrato de saída, versão 1.0). */

const texto = { type: 'string' } as const;
const inteiroOuNulo = { type: ['integer', 'null'] } as const;
const orientacao = {
  type: 'object',
  required: ['id', 'ordem', 'texto'],
  properties: {
    id: texto,
    ordem: { type: 'integer', minimum: 1 },
    texto,
    observacao: texto,
    coluna: { enum: ['ilustracao', 'audio', 'instrucoes', 'texto', null] },
  },
} as const;
const lista = (items: object) => ({ type: 'array', items });

export const JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `roteirista-promo/roteiro-${SCHEMA_VERSION}.schema.json`,
  title: 'Roteiro de chamada (Promo)',
  type: 'object',
  required: ['schemaVersion', 'exportadoEm', 'roteiro', 'artes', 'blocos'],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    exportadoEm: { type: 'string', format: 'date-time' },
    roteiro: {
      type: 'object',
      required: ['id', 'programa', 'layout', 'status'],
      properties: {
        id: texto,
        titulo: texto,
        programa: texto,
        tipoPrograma: { enum: ['novela', 'ao_vivo', 'esporte', 'auditorio', 'outro'] },
        dataExibicao: { type: 'string', description: 'AAAA-MM-DD, ou vazio' },
        capitulo: inteiroOuNulo,
        edicao: { type: 'string', description: 'Ex.: "PGM 23"' },
        praca: texto,
        redator: texto,
        locutor: texto,
        selo: texto,
        duracaoAlvoSeg: inteiroOuNulo,
        duracaoModo: { enum: ['fechar', 'max'] },
        duracaoEstimadaSeg: { type: 'integer' },
        versoes: lista(texto),
        layout: { enum: ['coluna_unica', 'ilustracao_audio', 'instrucoes_texto'] },
        status: { enum: ['rascunho', 'revisao', 'aprovado', 'em_producao', 'finalizado'] },
        revisao: { type: 'integer' },
        atualizadoEm: texto,
      },
    },
    artes: lista({
      type: 'object',
      required: ['id', 'ordem', 'texto', 'subtipo'],
      properties: {
        id: texto,
        ordem: { type: 'integer', minimum: 1 },
        texto,
        subtipo: { enum: SUBTIPOS_ARTE.map((s) => s.id) },
        subtipoNome: texto,
        grupoVersoes: { type: ['string', 'null'], description: 'Artes com o mesmo grupo são versões da mesma arte (AMANHÃ/HOJE).' },
        observacao: texto,
        conferida: { type: 'boolean', description: 'false enquanto o subtipo é só a sugestão do importador.' },
        contexto: {
          type: 'object',
          properties: { coluna: { type: ['string', 'null'] }, trechoAnterior: texto, trechoPosterior: texto },
        },
        status: { enum: ['pendente', 'em_producao', 'entregue'] },
      },
    }),
    orientacoes: {
      type: 'object',
      properties: Object.fromEntries(
        ETIQUETAS.filter((e) => !['cortavel', 'comentario'].includes(e.id)).map((e) => [e.id, lista(orientacao)]),
      ),
    },
    comentarios: lista(orientacao),
    trechosCortaveis: lista({ ...orientacao, properties: { ...orientacao.properties, duracaoEstimadaSeg: { type: 'integer' } } }),
    sonoras: lista({
      type: 'object',
      required: ['ordem', 'timecodeEntrada'],
      properties: {
        ordem: { type: 'integer' },
        origem: { enum: ['MC', 'FRAME_IO', 'PGM', 'outro'] },
        origemOriginal: texto,
        bloco: inteiroOuNulo,
        timecodeEntrada: { type: 'string', pattern: '^\\d{2}:\\d{2}:\\d{2}$' },
        timecodeOriginal: texto,
        personagem: texto,
        descricaoImagem: texto,
        fala: texto,
      },
    }),
    texto: { type: 'object', properties: { completo: texto, locucao: texto, markdown: texto } },
    blocos: { type: 'object', description: 'Documento completo do editor; usado para reabrir o roteiro.' },
  },
} as const;
