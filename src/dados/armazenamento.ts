import { chaveDeArte } from '../modelo/diferencas';
import { siglaDoTipo } from '../modelo/tipos';
import { chaveDaClaquete, naPauta, registrarVocabulario, type VocabularioExterno } from '../modelo/vocabularios';
import { chavesQueExistem, exportar } from '../modelo/exportar';
import { registrarCores } from './colaboracao';
import type { ArteDoAcervo, Meta, NaProducao, NoJSON, Pessoa, ProducaoCompleta, Roteiro } from '../modelo/tipos';

/* Camada de persistência. Duas implementações com a mesma interface:
   - servidor (SQLite, com dono, público/privado e histórico), quando a API responde;
   - navegador (IndexedDB), quando o app roda como site estático. */

export interface Resumo {
  id: string;
  meta: Meta;
  nArtes: number;
  atualizadoEm: string;
  dono: Pessoa | null;
  publico: boolean;
  podeEditar?: boolean;
  /** Servidor em modo aberto: todos veem e editam tudo. */
  aberto?: boolean;
  /** Quem mexeu por último depois que o roteiro chegou. */
  revisadoPor?: Pessoa | null;
  /** Compartilhado com pessoas específicas. */
  compartilhado?: boolean;
  meu: boolean;
  /** O que aconteceu ao mandar para o Trello. */
  trello?: EnvioTrello;
  /** O arquivo que subiu está guardado no servidor (vira o PDF do card). */
  temOriginal?: boolean;
}
export interface EnvioTrello {
  /** "duplicado": a claquete já tinha entrado hoje na produção da arte (pelo upload antigo). */
  estado: 'enviando' | 'enviado' | 'duplicado' | 'erro';
  url?: string;
  erro?: string;
  em: string;
  por?: string;
}
export interface Versao {
  n: number;
  criadoEm: string;
  por: Pessoa | null;
  motivo: string;
}
export interface ConteudoVersao {
  n: number;
  criadoEm: string;
  meta: Meta;
  doc: NoJSON;
}

export interface Armazenamento {
  /** "servidor" guarda por conta, com histórico; "navegador" guarda só neste computador. */
  tipo: 'servidor' | 'navegador';
  listar(): Promise<Resumo[]>;
  ler(id: string): Promise<Roteiro | undefined>;
  /** `marco` registra uma versão no histórico (ex.: "exportou"). */
  /** automatico: o app preencheu sozinho (não conta como revisão de quem está usando). */
  salvar(roteiro: Roteiro, marco?: string, automatico?: boolean): Promise<void>;
  apagar(id: string): Promise<void>;
  versoes(id: string): Promise<Versao[]>;
  lerVersao(id: string, n: number): Promise<ConteudoVersao>;
  /** As outras pessoas que já usaram a plataforma. */
  usuarios(): Promise<Pessoa[]>;
  /** Como anda na produção da arte o que já está no Trello, por roteiro (lido do Teable). */
  andamento(): Promise<Record<string, Andamento>>;
}

export interface Andamento {
  /** FINALIZADO, EM APROVAÇÃO, PRODUZINDO, AGUARDANDO MATERIAL, PEDIDO DE ALTERAÇÃO, CAIU, FILME */
  status: string[];
  designers: string[];
  entregue: boolean;
  entrega: string | null;
}

/* ---------- navegador ---------- */

const BANCO = 'roteirista';
const LOJA = 'roteiros';

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA, { keyPath: 'id' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}
async function operar<T>(modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, erro) => {
      const req = acao(db.transaction(LOJA, modo).objectStore(LOJA));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    });
  } finally {
    db.close();
  }
}

const noNavegador: Armazenamento = {
  tipo: 'navegador',
  async listar() {
    const todos = await operar<Roteiro[]>('readonly', (l) => l.getAll());
    return todos
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
      .map((r) => ({ id: r.id, meta: r.meta, nArtes: exportar(r).artes.length, atualizadoEm: r.atualizadoEm, dono: r.criadoPor ?? null, publico: false, meu: true }));
  },
  ler: (id) => operar<Roteiro | undefined>('readonly', (l) => l.get(id)),
  async salvar(roteiro) {
    await operar('readwrite', (l) => l.put(roteiro));
  },
  async apagar(id) {
    await operar('readwrite', (l) => l.delete(id));
  },
  versoes: async () => [],
  usuarios: async () => [],
  andamento: async () => ({}),
  lerVersao: async () => {
    throw new Error('Sem histórico neste modo.');
  },
};

/* ---------- servidor ---------- */

let cabecalhos: Record<string, string> = {};
let perfilLocal: Pessoa | null = null;

/** O WebSocket do navegador não envia cabeçalhos; no modo de demonstração o perfil vai na URL. */
export const parametrosDoPerfil = (): Record<string, string> => (perfilLocal?.email ? { email: perfilLocal.email, nome: perfilLocal.nome } : {});

async function pedir<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(caminho, { ...init, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...cabecalhos, ...init.headers } });
  if (!r.ok) {
    const erro = (await r.json().catch(() => null)) as { erro?: string } | null;
    throw Object.assign(new Error(erro?.erro ?? `O servidor não respondeu (${r.status}${r.status === 524 ? ', demorou demais' : ''}).`), { status: r.status });
  }
  return (await r.json()) as T;
}

const noServidor: Armazenamento = {
  tipo: 'servidor',
  listar: () => pedir<Resumo[]>('/api/roteiros'),
  andamento: () => pedir<Record<string, Andamento>>('/api/andamento').catch(() => ({})),
  ler: (id) => pedir<Roteiro>(`/api/roteiros/${encodeURIComponent(id)}`).catch((e: { status?: number }) => (e.status === 404 ? undefined : Promise.reject(e))),
  async salvar(roteiro, marco, automatico) {
    await pedir(`/api/roteiros/${encodeURIComponent(roteiro.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ roteiro, nArtes: exportar(roteiro).artes.length, marco, ...(automatico ? { automatico: true } : {}) }),
    });
  },
  async apagar(id) {
    await pedir(`/api/roteiros/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  versoes: (id) => pedir<Versao[]>(`/api/roteiros/${encodeURIComponent(id)}/versoes`),
  lerVersao: (id, n) => pedir<ConteudoVersao>(`/api/roteiros/${encodeURIComponent(id)}/versoes/${n}`),
  usuarios: () => pedir<Pessoa[]>('/api/usuarios'),
};

/** Nomes da casa e pauta da edição, quando o servidor está ligado ao Teable. A pauta muda ao longo do dia. */
export async function atualizarVocabulario() {
  if (armazenamento.tipo !== 'servidor') return;
  const v = await pedir<VocabularioExterno>('/api/vocabulario').catch((e) => void (ultimoErroVocabulario = e instanceof Error ? e.message : String(e)));
  if (v) registrarVocabulario(v);
}

/** Quem está com a claquete na pauta da edição. Pergunta ao servidor; sem resposta, usa a pauta que já veio no vocabulário. */
export async function consultarPauta(claquete: string): Promise<{ editor: string; claquete: string }> {
  if (armazenamento.tipo === 'servidor') {
    const r = await pedir<{ editor: string; claquete: string }>(`/api/pauta?chave=${encodeURIComponent(chaveDaClaquete(claquete))}`).catch(() => null);
    if (r) return r;
  }
  return naPauta(claquete);
}

/* ---------- Trello ---------- */

let trelloLigado = false;
let filmesLigado = false;
/** O servidor sabe mandar para o Trello (TRELLO_KEY, TRELLO_TOKEN e TRELLO_LISTA configurados). */
export const temTrello = () => armazenamento.tipo === 'servidor' && trelloLigado;

/** Guarda o arquivo como veio: é ele que vira o PDF anexado ao card. */
/** O texto do original, parágrafo a parágrafo, com o sublinhado (e negrito, itálico) exatamente como veio. */
export type TextoOriginal = { t: string; u?: 1; b?: 1; i?: 1 }[][];

export async function guardarOriginal(id: string, arquivo: File, texto?: TextoOriginal) {
  if (armazenamento.tipo !== 'servidor') return;
  const r = await fetch(`/api/roteiros/${encodeURIComponent(id)}/original`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { ...cabecalhos, 'content-type': arquivo.type || 'application/octet-stream', 'x-arquivo': encodeURIComponent(arquivo.name) },
    body: arquivo,
  });
  if (!r.ok) throw new Error('Não consegui guardar o arquivo original.');
  // é dele que sai o PDF do card quando não há conversão fiel (Stirling): o sublinhado do redator, nem mais nem menos
  if (texto?.length) await pedir(`/api/roteiros/${encodeURIComponent(id)}/original-texto`, { method: 'PUT', body: JSON.stringify({ pars: texto }) }).catch(() => {});
}

/* ---------- aba Filmes: as prévias de filmes ---------- */

/** O servidor lê as prévias de filmes (N8N_FILMES_LER configurado). */
export const temFilmes = () => armazenamento.tipo === 'servidor' && filmesLigado;

export interface CaixaDaPagina {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FilmeLido {
  titulo: string;
  ano: number | null;
  sessao: string;
  data: string;
  inedito: boolean;
  /** o pôster da página (a posição na ordem de leitura), ou null */
  poster: number | null;
  /** o que a pessoa escolheu no ! (um candidato, "novo" ou um dos anos) */
  escolha?: { filme?: string; ano?: number };
  /** a conferência com o banco; sem o banco configurado, não vem */
  conferencia?: Conferencia;
}
export interface FilmeDoBanco {
  id: string;
  titulo: string;
  ano: number | null;
}
/** A conferência de um filme lido com o banco: ✓ (ok), ! (atencao, com a pergunta) ou o Trello (já tem card). */
export interface Conferencia {
  marca: 'ok' | 'atencao' | 'trello';
  pergunta?: 'qual-filme' | 'ano-diferente';
  /** o filme do banco; null é filme novo (ou ainda sem resposta para "qual filme?") */
  filme: FilmeDoBanco | null;
  novo: boolean;
  ano: number | null;
  candidatos?: FilmeDoBanco[];
  /** "ano diferente": [o da prévia, o do banco] */
  anos?: [number, number];
  link?: string;
  /** as artes do card: as novas e as que o filme já tem no acervo */
  artes: { novas: string[]; existentes: string[] };
}
export type MudancaNoFilme = { titulo: string } | { filme: string } | { ano: number };
export interface PaginaDaPrevia {
  numero: number;
  util: number;
  estado: 'esperando' | 'fila' | 'lendo' | 'lida' | 'erro';
  erro: string;
  filmes: FilmeLido[];
  sessoes: string[];
  posteres: { caixa: CaixaDaPagina }[];
  vagas: { caixa: CaixaDaPagina; texto: string }[];
  tamanho: { width: number; height: number } | null;
}
export interface Previa {
  id: string;
  nome: string;
  por: string;
  criada: string;
  paginas: PaginaDaPrevia[];
  erroDaConferencia?: string;
}
export interface PreviaNaLista {
  id: string;
  nome: string;
  por: string;
  criada: string;
  paginas: number;
}
export interface PaginaPreparada {
  pdf: string;
  imagem: string;
  tamanho: { width: number; height: number };
  posteres: { dados: string; caixa: CaixaDaPagina }[];
  textos: { str: string; x: number; top: number; width: number; height: number }[];
  vagas: { caixa: CaixaDaPagina; texto: string }[];
}

export const listarPrevias = () => pedir<PreviaNaLista[]>('/api/filmes/previas');
export const criarPrevia = (nome: string, hash: string, paginas: number[]) =>
  pedir<{ id: string; existente: boolean }>('/api/filmes/previas', { method: 'POST', body: JSON.stringify({ nome, hash, paginas }) });
export const abrirPrevia = (id: string) => pedir<Previa>(`/api/filmes/previas/${encodeURIComponent(id)}`);
export const mandarPagina = (id: string, numero: number, pagina: PaginaPreparada) =>
  pedir<{ ok: true }>(`/api/filmes/previas/${encodeURIComponent(id)}/paginas/${numero}`, { method: 'PUT', body: JSON.stringify(pagina) });
export const relerPagina = (id: string, numero: number) => pedir<{ ok: true }>(`/api/filmes/previas/${encodeURIComponent(id)}/paginas/${numero}/reler`, { method: 'POST' });
/** Grava na hora uma mudança num filme lido (título, candidato ou ano) e devolve o filme conferido de novo. */
export const mudarFilme = (id: string, numero: number, i: number, mudanca: MudancaNoFilme) =>
  pedir<{ filme: FilmeLido; erroDaConferencia?: string }>(`/api/filmes/previas/${encodeURIComponent(id)}/paginas/${numero}/filmes/${i}`, {
    method: 'PATCH',
    body: JSON.stringify(mudanca),
  });
export const posterDoFilme = (id: string) => `/api/filmes/poster/${encodeURIComponent(id)}`;
export const imagemDaPagina = (id: string, numero: number, poster = 0) =>
  `/api/filmes/previas/${encodeURIComponent(id)}/paginas/${numero}/${poster ? `poster/${poster}` : 'imagem'}`;

/* ---------- cadastros (atrações, redatores, editores) ---------- */

export interface KeyCadastro {
  id: string;
  key: string;
}
export interface AtracaoCadastro {
  id: string;
  nome: string;
  categoria: string;
  keys: KeyCadastro[];
  caminhos: Record<string, string>;
  campos: Record<string, string>;
}
export interface RedatorCadastro {
  id: string;
  nome: string;
  /** como aparece nos roteiros: o autor do Word, o login */
  keys: KeyCadastro[];
  trello: boolean;
}
export interface EditorCadastro {
  id: string;
  nome: string;
  keys: KeyCadastro[];
  trello: boolean;
}
export interface CampoCaminho {
  nome: string;
  tipo: string;
  opcoes: string[] | null;
}
export interface Cadastros {
  ligado: boolean;
  atracoes: AtracaoCadastro[];
  redatores: RedatorCadastro[];
  editores: EditorCadastro[];
  categorias: string[];
  camposCaminho: CampoCaminho[];
  formulas: Record<string, string>;
  podeApagar: boolean;
}
export type TipoCadastro = 'atracoes' | 'redatores' | 'editores';

/** Minha cor de destaque, para os colegas ('' volta para a sorteada). */
export async function escolherMinhaCor(email: string, cor: string) {
  registrarCores([{ email, cor }]);
  if (armazenamento.tipo === 'servidor') await pedir('/api/eu/cor', { method: 'PUT', body: JSON.stringify({ cor }) });
}

/** Há servidor para guardar os cadastros (o Teable em si é conferido na tela). */
export const temCadastros = () => armazenamento.tipo === 'servidor';

export const lerCadastros = (renovar = false) => pedir<Cadastros>(`/api/cadastros${renovar ? '?renovar=1' : ''}`);
export const cadastrar = <T = { id: string; nome: string }>(tipo: TipoCadastro, dados: object) =>
  pedir<T>(`/api/cadastros/${tipo}`, { method: 'POST', body: JSON.stringify(dados) });
export const darKey = (tipo: TipoCadastro, id: string, key: string) =>
  pedir<KeyCadastro>(`/api/cadastros/${tipo}/${encodeURIComponent(id)}/keys`, { method: 'POST', body: JSON.stringify({ key }) });
export const removerCadastro = (tipo: TipoCadastro, id: string, keyId?: string) =>
  pedir<{ ok: true }>(`/api/cadastros/${tipo}/${encodeURIComponent(id)}${keyId ? `/keys/${encodeURIComponent(keyId)}` : ''}`, { method: 'DELETE' });

/** Uma key que aparece nas claquetes e nenhuma atração reconhece. */
export interface KeySemCadastro {
  key: string;
  roteiros: number;
  exemplos: string[];
  /** Uma atração cadastrada parecida (o nome), ou ''. */
  sugestao: string;
}
/** A key de uma claquete e a atração parecida (para ligar sem sair da revisão). */
export const sugerirLigacao = (claquete: string) => pedir<{ key: string; sugestao: string }>(`/api/cadastros/sugerir?claquete=${encodeURIComponent(claquete)}`);
export const lerSemCadastro = () => pedir<KeySemCadastro[]>('/api/cadastros/sem-cadastro');
export const ignorarKey = (key: string) => pedir<{ ok: true }>('/api/cadastros/ignorar', { method: 'POST', body: JSON.stringify({ key }) });
export const designorarKey = (key: string) => pedir<{ ok: true }>(`/api/cadastros/ignorar/${encodeURIComponent(key)}`, { method: 'DELETE' });

/** O arquivo como subiu, para baixar de novo. */
export async function baixarOriginal(id: string): Promise<Blob> {
  const r = await fetch(`/api/roteiros/${encodeURIComponent(id)}/original`, { credentials: 'same-origin', headers: cabecalhos });
  if (!r.ok) throw new Error(r.status === 404 ? 'O arquivo original deste roteiro não foi guardado.' : 'Não consegui baixar o original.');
  return r.blob();
}

/** As artes que a atração já tem prontas (acervo do Teable); numa sessão de filme, as do filme daquele dia.
    Sem servidor ou sem acervo: lista vazia. */
export async function consultarAcervo(atracao: string, dataExibicao = ''): Promise<{ ligado: boolean; podeZerar?: boolean; artes: ArteDoAcervo[] }> {
  if (armazenamento.tipo !== 'servidor' || !atracao.trim()) return { ligado: false, artes: [] };
  return pedir<{ ligado: boolean; podeZerar?: boolean; artes: ArteDoAcervo[] }>(`/api/acervo?atracao=${encodeURIComponent(atracao)}&data=${encodeURIComponent(dataExibicao)}`).catch(() => ({ ligado: false, artes: [] }));
}

/** Pacote gráfico novo: as artes da atração deixam de valer. */
export const zerarAcervo = (atracao: string) => pedir<{ zeradas: number }>('/api/acervo/zerar', { method: 'POST', body: JSON.stringify({ atracao }) });

/** O PDF anexado ao card que já está na produção da arte (null se o card não tiver). */
export async function pdfDaProducao(claquete: string): Promise<ArrayBuffer | null> {
  const r = await fetch(`/api/producao/pdf?claquete=${encodeURIComponent(claquete)}`, { credentials: 'same-origin', headers: cabecalhos });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Não consegui baixar o PDF do card.');
  return r.arrayBuffer();
}

/** O roteiro em PDF, como vai para o card. */
export async function pdfDoRoteiro(roteiro: Roteiro): Promise<ArrayBuffer> {
  const artes = exportar(roteiro).artes.map((a) => ({ texto: a.texto, tipo: a.subtipo ? a.subtipoNome : '' }));
  const r = await fetch(`/api/roteiros/${encodeURIComponent(roteiro.id)}/pdf`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...cabecalhos }, body: JSON.stringify({ artes }),
  });
  if (!r.ok) throw new Error('Não consegui montar o PDF do roteiro.');
  return r.arrayBuffer();
}

/** Versão nova que substitui outra: herda o card do Trello que a anterior já tinha. */
export async function herdarEnvio(novo: string, anterior: string) {
  if (armazenamento.tipo !== 'servidor') return;
  await pedir(`/api/roteiros/${encodeURIComponent(novo)}/trello`, { method: 'POST', body: JSON.stringify({ herdarDe: anterior }) });
}

/** Cria o card no Trello. As artes e o texto saem daqui, do mesmo jeito que o app mostra. */
export async function mandarParaTrello(roteiro: Roteiro, deNovo = false) {
  const saida = exportar(roteiro);
  // a que já existe (✓, ou do acervo, que já vem riscada) vai no PDF (sublinhada, como no roteiro), fora do checklist;
  // o servidor guarda no acervo da atração as confirmadas (da próxima vez, ela já vem riscada)
  const jaExiste = chavesQueExistem(roteiro.meta);
  // a que não vai ser produzida nem vai para o card (o PDF é o original, ela continua lá)
  const fora = new Set(roteiro.meta.naoProduzir ?? []);
  return pedir<{ estado: EnvioTrello['estado']; url?: string; avisos?: string[]; erro?: string }>(`/api/roteiros/${encodeURIComponent(roteiro.id)}/trello`, {
    method: 'POST',
    body: JSON.stringify({ artes: saida.artes.filter((a) => !fora.has(chaveDeArte(a.texto))).map((a) => ({ texto: a.texto, tipo: a.subtipos.map(siglaDoTipo).join(', '), tipos: a.subtipos.map(siglaDoTipo), existe: jaExiste.has(chaveDeArte(a.texto)) })), texto: saida.texto.completo, deNovo }),
  });
}

/** Apaga mesmo com a página fechando ou recarregando (o pedido sobrevive à saída). */
export function apagarAoSair(id: string) {
  if (armazenamento.tipo !== 'servidor') return void armazenamento.apagar(id).catch(() => {});
  void fetch(`/api/roteiros/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive: true, credentials: 'same-origin', headers: cabecalhos }).catch(() => {});
}

/** A atração da claquete pelas keys do Teable, perguntando ao servidor ('' se ele não achar ou não houver servidor). */
export async function atracaoNoServidor(claquete: string): Promise<string> {
  if (armazenamento.tipo !== 'servidor' || !claquete.trim()) return '';
  return (await pedir<{ atracao: string }>(`/api/atracao?claquete=${encodeURIComponent(claquete)}`).catch((e) => ((ultimoErroAtracao = e instanceof Error ? e.message : String(e)), { atracao: '' }))).atracao;
}
let ultimoErroAtracao = '';
let ultimoErroVocabulario = '';

/** Roteiro que chegou sem atração: conta ao servidor o que o navegador tinha (aparece em /api/diagnostico). */
export function relatarSemAtracao(dados: Record<string, unknown>) {
  if (armazenamento.tipo !== 'servidor') return;
  void pedir('/api/diagnostico/navegador', { method: 'POST', body: JSON.stringify({ ...dados, erroAtracao: ultimoErroAtracao, erroVocabulario: ultimoErroVocabulario, pagina: location.pathname + location.hash }) }).catch(() => {});
}

/** A claquete já está na produção da arte (Teable)? Só com servidor; sem resposta, segue como novo. */
export async function consultarProducao(claquete: string): Promise<ProducaoCompleta | null> {
  if (armazenamento.tipo !== 'servidor' || !claquete.trim()) return null;
  return pedir<ProducaoCompleta | null>(`/api/producao?claquete=${encodeURIComponent(claquete)}`).catch(() => null);
}

/** Só o resumo fica no roteiro; o texto e as artes de lá se buscam na hora de comparar. */
export const resumoDaProducao = ({ card, url, registro, claquete, entrada, status, artes }: ProducaoCompleta): NaProducao => ({ card, url, registro, claquete, entrada, status, artes });

/** "É o mesmo roteiro que já está na produção": liga ao card que já existe, sem mandar nada. */
export const ligarAoCardExistente = (id: string, card: string) =>
  pedir<{ estado: EnvioTrello['estado']; url?: string }>(`/api/roteiros/${encodeURIComponent(id)}/trello`, { method: 'POST', body: JSON.stringify({ jaEsta: { card } }) });

/** O armazenamento em uso. Começa no navegador e passa para o servidor quando `conectar` o encontra. */
export let armazenamento: Armazenamento = noNavegador;

export interface Conexao {
  /** Quem o servidor reconheceu, se houver servidor e login. */
  eu: (Pessoa & { origem: 'acesso' | 'local' }) | null;
  /** Há servidor, mas ele espera que a pessoa se apresente com o perfil local. */
  pedePerfil: boolean;
  /** Há servidor, mas ele não reconheceu o login (Cloudflare Access): os roteiros ficam só neste navegador. */
  semLogin?: boolean;
}

/** Procura o servidor. `perfil` é o perfil local, usado só quando o servidor aceita esse modo (demonstração). */
export async function conectar(perfil: Pessoa | null): Promise<Conexao> {
  perfilLocal = perfil;
  cabecalhos = perfil?.email ? { 'x-perfil-email': encodeURIComponent(perfil.email), 'x-perfil-nome': encodeURIComponent(perfil.nome) } : {};
  try {
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 3000);
    const r = await fetch('/api/eu', { credentials: 'same-origin', headers: cabecalhos, signal: controle.signal });
    clearTimeout(prazo);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('sem servidor');
    const d = (await r.json()) as { email: string | null; nome?: string; origem?: 'acesso' | 'local'; perfilLocal?: boolean; trello?: boolean; filmes?: boolean };
    if (d.email) {
      armazenamento = noServidor;
      trelloLigado = !!d.trello;
      filmesLigado = !!d.filmes;
      // as cores que cada um escolheu, para a orelha, o grifo e os cursores saírem certos
      await pedir<{ email: string; cor: string }[]>('/api/cores').then(registrarCores, () => {});
      // nomes da casa (atrações e redatores), quando o servidor está ligado ao Teable
      await atualizarVocabulario();
      return { eu: { email: d.email, nome: d.nome ?? d.email, origem: d.origem ?? 'acesso' }, pedePerfil: false };
    }
    armazenamento = noNavegador;
    return { eu: null, pedePerfil: !!d.perfilLocal, semLogin: !d.perfilLocal };
  } catch {
    armazenamento = noNavegador;
    return { eu: null, pedePerfil: false };
  }
}
