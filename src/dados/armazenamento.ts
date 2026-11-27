import type { Ausencia, EscaladaNoDia, PainelDasAusencias } from '../modelo/ausencias';
import { chaveDaClaquete, naPauta, redatoresDoCadastro, registrarVocabulario, type VocabularioExterno } from '../modelo/vocabularios';
import { registrarPracas } from '../modelo/pracas';
import { areaDeEntrada, chaveDaExibicao, ehArea, exibicaoDaArea, type Area, type AreaDosRoteiros, type Exibicao } from '../modelo/areas';
import type { CicloDoRoteiro } from '../modelo/cicloDoRoteiro';
import type { ArtesDoRoteiro } from '../modelo/artesDoRoteiro';
import { redatorNoTexto, sugestoesDoRedator, type RedatorDoHistorico } from '../modelo/redator';
import { artesDoEnvio, artesUnicas, exportar, quantasAProduzir } from '../modelo/exportar';
import { manterAsDuas, substituirVersao } from '../modelo/versoes';
import type { EventoDaLinha, ProducaoDaLinha } from '../modelo/linhaDoTempo';
import type { Versao as VersaoDaChamada } from '../modelo/pauta';
import { CHAVE_DO_CODIGO_DAS_VERSOES, mostraOCodigoDasVersoes, type VersoesDaChamada } from '../modelo/versoesDoRoteiro';
import { registrarCores } from './colaboracao';
import { comExemplo, ehDoTour } from '../tour/exemplo';
import type { AvisosDaImportacao, Escolhas, LinhaDaImportacao, LinhaDoAcervo, PlacarDaImportacao, RegraLembrada } from '../../servidor/importacao-do-acervo.mjs';
import type { ArteDoAcervo, Meta, NaProducao, NoJSON, Pessoa, ProducaoCompleta, Roteiro, SugestaoRedator } from '../modelo/tipos';

/* Camada de persistência. Duas implementações com a mesma interface:
   - servidor (SQLite, com dono, público/privado e histórico), quando a API responde;
   - navegador (IndexedDB), quando o app roda como site estático. */

export interface Resumo {
  id: string;
  meta: Meta;
  /** As artes a produzir (`quantasAProduzir`): sem as que já existem e as que não vão ser produzidas, como o checklist. */
  nArtes: number;
  /** As versões da chamada lidas nas artes do roteiro guardado (#120), na ordem do padrão; ausente fora do servidor. */
  versoesLidas?: VersaoDaChamada[];
  /** As versões da chamada do card da agenda (#121), prontas: as do roteiro, ou o código do apelido ou da claquete. */
  versoesDaChamada?: VersoesDaChamada;
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
  /** o card do Trello (o id): a linha do tempo da Produção é lida por ele */
  card?: string;
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

/** O roteiro apagado, como o servidor lembra dele: a claquete, quem apagou, quando e, se houver, a versão nova. */
export interface Lapide {
  claquete: string;
  por: string;
  /** ISO */
  em: string;
  /** o id da versão nova (um roteiro vivo com a mesma chave da claquete) */
  substituto?: string;
}
/** O que veio ao abrir um roteiro pelo id: ele, ou por que não deu (a tela de link quebrado diz qual). */
export type Leitura =
  | { estado: 'ok'; roteiro: Roteiro }
  | { estado: 'apagado'; lapide?: Lapide }
  | { estado: 'sem-permissao' }
  | { estado: 'nao-existe' }
  | { estado: 'erro'; mensagem: string };
/** O roteiro da leitura, quando ela deu certo. */
export const roteiroDa = (l: Leitura): Roteiro | undefined => (l.estado === 'ok' ? l.roteiro : undefined);

export interface Armazenamento {
  /** "servidor" guarda por conta, com histórico; "navegador" guarda só neste computador. */
  tipo: 'servidor' | 'navegador';
  listar(): Promise<Resumo[]>;
  /** Nunca falha: a rede caída também é uma leitura (estado "erro"). */
  ler(id: string): Promise<Leitura>;
  /** `marco` registra uma versão no histórico (ex.: "exportou"). */
  /** automatico: o app preencheu sozinho (não conta como revisão de quem está usando). */
  salvar(roteiro: Roteiro, marco?: string, automatico?: boolean): Promise<void>;
  apagar(id: string): Promise<void>;
  versoes(id: string): Promise<Versao[]>;
  lerVersao(id: string, n: number): Promise<ConteudoVersao>;
  /** As outras pessoas que já usaram a plataforma. */
  usuarios(): Promise<Pessoa[]>;
  /** Como anda na produção da arte o que já está no Trello, por roteiro (lido do Teable), e quais roteiros (enviados
      ou na fila de revisão) estão na lista de prioridade. */
  andamento(): Promise<Record<string, Andamento>>;
}

export interface Andamento {
  /** FINALIZADO, EM APROVAÇÃO, PRODUZINDO, AGUARDANDO MATERIAL, PEDIDO DE ALTERAÇÃO, CAIU, FILME */
  status: string[];
  designers: string[];
  entregue: boolean;
  entrega: string | null;
  /** Quando o card entrou na produção da arte (a data_entrada da ARTE_producao, ISO). */
  entrada?: string | null;
  /** A claquete como está hoje na produção da arte (o nome do card no Trello): é a que a tela mostra. Só para mostrar;
      o nome guardado no PROMeiro não muda. Ausente quando a produção não tem o nome. */
  claquete?: string;
  /** Quantas artes foram para a produção da arte, cada uma uma vez (a coluna "artes" do Teable). Ausente quando a
      coluna está vazia: vale a contagem do PROMeiro (`Resumo.nArtes`). */
  artes?: number;
  /** A claquete está na lista de prioridade (a mesma que dá a prioridade ALTA no envio). Vem também para os roteiros
      da fila de revisão, com o andamento vazio. */
  prioridade?: true;
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
      .map((r) => ({ id: r.id, meta: r.meta, nArtes: quantasAProduzir(exportar(r)), atualizadoEm: r.atualizadoEm, dono: r.criadoPor ?? null, publico: false, meu: true }));
  },
  ler: (id) =>
    operar<Roteiro | undefined>('readonly', (l) => l.get(id)).then(
      (roteiro): Leitura => (roteiro ? { estado: 'ok', roteiro } : { estado: 'nao-existe' }),
      (e): Leitura => ({ estado: 'erro', mensagem: e instanceof Error ? e.message : String(e) }),
    ),
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

const ehLapide = (x: unknown): x is Lapide => {
  const l = x as Partial<Lapide> | null;
  return typeof l?.claquete === 'string' && typeof l.por === 'string' && typeof l.em === 'string';
};

/** Abre o roteiro no servidor: 410 é apagado (com a lápide, quando o servidor sabe), 403 sem permissão, 404 (e o id
    malformado, 400) não existe; a rede caída e o servidor com erro são "erro", para a tela oferecer tentar de novo. */
export async function lerDoServidor(id: string): Promise<Leitura> {
  let r: Response;
  try {
    r = await fetch(`/api/roteiros/${encodeURIComponent(id)}`, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...cabecalhos } });
  } catch (e) {
    return { estado: 'erro', mensagem: e instanceof Error ? e.message : String(e) };
  }
  const corpo: unknown = await r.json().catch(() => null);
  if (r.ok && corpo) return { estado: 'ok', roteiro: corpo as Roteiro };
  if (r.status === 410) {
    if (!ehLapide(corpo)) return { estado: 'apagado' };
    const { claquete, por, em, substituto } = corpo;
    return { estado: 'apagado', lapide: { claquete, por, em, ...(typeof substituto === 'string' ? { substituto } : {}) } };
  }
  if (r.status === 403) return { estado: 'sem-permissao' };
  if (r.status === 404 || r.status === 400) return { estado: 'nao-existe' };
  return { estado: 'erro', mensagem: (corpo as { erro?: string } | null)?.erro ?? `O servidor não respondeu (${r.status}).` };
}

const noServidor: Armazenamento = {
  tipo: 'servidor',
  listar: () => pedir<Resumo[]>('/api/roteiros'),
  andamento: () => pedir<Record<string, Andamento>>('/api/andamento').catch(() => ({})),
  ler: lerDoServidor,
  async salvar(roteiro, marco, automatico) {
    await pedir(`/api/roteiros/${encodeURIComponent(roteiro.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ roteiro, nArtes: quantasAProduzir(exportar(roteiro)), marco, ...(automatico ? { automatico: true } : {}) }),
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

/** O apelido de uma claquete guardado no servidor (#120, #154), pela chave da claquete no padrão, com a claquete
    original, os roteiros com ela, as Produções dela (de todas as praças) e os cards do envio: só dentro do PROMeiro, o
    envio leva a original. */
export interface ApelidoGuardado {
  /** a chave da claquete (chaveDoApelido) */
  chave: string;
  original: string;
  /** o nome novo; '' no apelido só com as versões à mão (a tela mostra a claquete original) */
  apelido: string;
  /** as versões feitas à mão (#152), no padrão ("AH", "MNT"); '' sem elas */
  versoes: string;
  /** as versões que valem, com a origem (à mão, do nome ou do roteiro) */
  versoesDaChamada?: VersoesDaChamada;
  por: string;
  em: string;
  /** os roteiros com a claquete que a pessoa lê; vazia na claquete sem roteiro no PROMeiro */
  roteiros: string[];
  producoes: string[];
  cards: string[];
}
/** De quem é o apelido: do roteiro, da Produção (a chave da claquete deles) ou da claquete (a da pauta, sem roteiro). */
export type AlvoDoApelido = { roteiro: string } | { producao: string } | { claquete: string };
/** Os apelidos das claquetes; fora do servidor, nenhum. */
export const lerApelidos = async (): Promise<ApelidoGuardado[]> => (armazenamento.tipo === 'servidor' ? pedir<ApelidoGuardado[]>('/api/apelidos') : []);
/** Dá, troca ou tira o nome do apelido da claquete (o vazio: "voltar ao original") ou as versões à mão (#152; as vazias
    voltam ao valor inicial); o que não vem fica como está. Devolve os apelidos de agora. */
export const gravarApelido = (alvo: AlvoDoApelido, mudanca: { apelido?: string; versoes?: string }) => pedir<ApelidoGuardado[]>('/api/apelidos', { method: 'PUT', body: JSON.stringify({ ...alvo, ...mudanca }) });

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
let souAdmin = false;
let souDaCoordenacao = false;
let novidades = 0;
/** Quem está usando é administrador (a chave-mestra CADASTRO_ADMINS ou o salvo na Configuração): o menu do perfil
    mostra a Configuração. */
export const souAdministrador = () => armazenamento.tipo === 'servidor' && souAdmin;
/** Quem está usando é da coordenação (#123): vê e usa o "Montar a pauta". */
export const souCoordenacao = () => armazenamento.tipo === 'servidor' && souDaCoordenacao;
/** Quantas novidades há no quadro (quem entrou, quem saiu), da última verificação: o pontinho no menu do perfil. */
export const novidadesNoQuadro = () => (souAdministrador() ? novidades : 0);
/** O servidor sabe mandar para o Trello (TRELLO_KEY, TRELLO_TOKEN e TRELLO_LISTA configurados). */
export const temTrello = () => armazenamento.tipo === 'servidor' && trelloLigado;

/** Guarda o arquivo como veio: é ele que vira o PDF anexado ao card. */
/** O texto do original, parágrafo a parágrafo, com o sublinhado (e negrito, itálico) exatamente como veio. */
export type TextoOriginal = { t: string; u?: 1; b?: 1; i?: 1 }[][];

export async function guardarOriginal(id: string, arquivo: File, texto?: TextoOriginal) {
  if (armazenamento.tipo !== 'servidor' || ehDoTour(id)) return;
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
  /** a pessoa subiu o filme da Sessão da Tarde para a vaga dele na fileira de cima (e ele pede a sessão) */
  subiu?: boolean;
  /** o título que a leitura trouxe, quando a pessoa o corrigiu (a correção sobrevive a ler a página de novo) */
  tituloLido?: string;
  /** a leitura nova da página não achou este filme, que tinha correção ou já foi enviado: ele espera a pessoa
      decidir se fica ou sai */
  naoAchado?: boolean;
  /** o que a pessoa escolheu no ! (um candidato, "novo" ou um dos anos) */
  escolha?: { filme?: string; ano?: number };
  /** a conferência com o banco; sem o banco configurado, não vem */
  conferencia?: Conferencia;
  /** o resultado do Enviar: o card criado (com o link), quem mandou e quando, ou o erro */
  envio?: EnvioDoFilme;
}
export interface EnvioDoFilme {
  estado: 'enviando' | 'enviado' | 'erro';
  card?: string;
  link?: string;
  por?: string;
  em?: string;
  erro?: string;
  avisos?: string[];
}
export interface FilmeDoBanco {
  id: string;
  titulo: string;
  ano: number | null;
}
/** A conferência de um filme lido com o banco: ✓ (ok), ! (atencao, com a pergunta) ou o Trello (já tem card). */
export interface Conferencia {
  marca: 'ok' | 'atencao' | 'trello';
  pergunta?: 'qual-filme' | 'ano-diferente' | 'sem-titulo' | 'sessao' | 'nao-achado';
  /** o filme do banco; null é filme novo (ou ainda sem resposta para "qual filme?") */
  filme: FilmeDoBanco | null;
  novo: boolean;
  ano: number | null;
  candidatos?: FilmeDoBanco[];
  /** "sessão: ???": as sessões para escolher, a da coluna do filme na página primeiro (com a data do alto da coluna) */
  sessoes?: { sessao: string; data?: string; coluna?: boolean }[];
  /** "ano diferente": [o da prévia, o do banco] */
  anos?: [number, number];
  link?: string;
  /** as artes do card: as novas e as que o filme já tem no acervo */
  artes: { novas: string[]; existentes: string[] };
}
export type MudancaNoFilme = { titulo: string } | { filme: string } | { ano: number } | { subir: true } | { sessao: string } | { fica: true } | { sai: true };
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
  /** os pôsteres da fileira de cima da página (identidade própria) */
  fileiraDeCima?: number[];
}
/** Um card da prévia: o filme i da página (o número da página no PDF). */
export interface CardDaPrevia {
  numero: number;
  i: number;
}
/** Outra pessoa com a prévia aberta, e o card em que está mexendo (o título sendo corrigido, o balão aberto ou o arrasto). */
export interface PessoaNaPrevia {
  nome: string;
  email: string;
  card?: CardDaPrevia | null;
}
export interface Previa {
  id: string;
  nome: string;
  por: string;
  criada: string;
  /** muda quando muda qualquer coisa da prévia no servidor */
  versao?: string;
  paginas: PaginaDaPrevia[];
  erroDaConferencia?: string;
  /** o envio ao Trello está configurado? (sem a lista dos filmes, por exemplo, não está) */
  envio?: { ligado: boolean; faltando: string[] };
  /** de onde veio (#157): a subida à mão ou o e-mail (o n8n mandou o PDF inteiro) */
  origem?: OrigemDaPrevia;
  /** chegou por e-mail e ainda não foi preparada (sem páginas, ou com página que não chegou): o navegador prepara */
  porPreparar?: boolean;
  /** a prévia que esta corrige (o mesmo nome, outro PDF, chegado por e-mail); null quando não corrige nenhuma */
  corrige?: string | null;
}
export type OrigemDaPrevia = 'navegador' | 'email';
export interface PreviaNaLista {
  id: string;
  nome: string;
  por: string;
  criada: string;
  paginas: number;
  /** a prévia toda enviada: em quantos dias ela é apagada (null enquanto não está toda enviada) */
  diasParaApagar?: number | null;
  /** quem está com ela aberta agora (sem a própria pessoa) */
  pessoas?: PessoaNaPrevia[];
  origem?: OrigemDaPrevia;
  porPreparar?: boolean;
  corrige?: string | null;
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
/** O PDF inteiro da prévia que chegou por e-mail (#157), como um arquivo, para preparar como na subida à mão. */
export async function baixarPdfDaPrevia(id: string, nome: string) {
  const r = await fetch(`/api/filmes/previas/${encodeURIComponent(id)}/pdf`, { credentials: 'same-origin', headers: cabecalhos });
  if (!r.ok) throw new Error(`Não consegui baixar o PDF da prévia (${r.status}).`);
  return new File([await r.blob()], nome, { type: 'application/pdf' });
}
export const criarPrevia = (nome: string, hash: string, paginas: number[]) =>
  pedir<{ id: string; existente: boolean }>('/api/filmes/previas', { method: 'POST', body: JSON.stringify({ nome, hash, paginas }) });
export const abrirPrevia = (id: string) => pedir<Previa>(`/api/filmes/previas/${encodeURIComponent(id)}`);
export const mandarPagina = (id: string, numero: number, pagina: PaginaPreparada) =>
  pedir<{ ok: true }>(`/api/filmes/previas/${encodeURIComponent(id)}/paginas/${numero}`, { method: 'PUT', body: JSON.stringify(pagina) });
export const relerPagina = (id: string, numero: number) => pedir<{ ok: true }>(`/api/filmes/previas/${encodeURIComponent(id)}/paginas/${numero}/reler`, { method: 'POST' });
/** Grava na hora uma mudança num filme lido (título, candidato, ano, subir da Sessão da Tarde, a sessão, ou ficar ou sair
    o que a leitura nova não achou) e devolve o filme conferido de novo; o que sai da página volta só { saiu: true }. */
export const mudarFilme = (id: string, numero: number, i: number, mudanca: MudancaNoFilme) =>
  pedir<{ filme: FilmeLido; saiu?: undefined; erroDaConferencia?: string } | { saiu: true; filme?: undefined; erroDaConferencia?: undefined }>(`/api/filmes/previas/${encodeURIComponent(id)}/paginas/${numero}/filmes/${i}`, {
    method: 'PATCH',
    body: JSON.stringify(mudanca),
  });
/** O Enviar: os filmes prontos de toda a prévia vão para o Trello (o servidor continua sozinho). */
export const enviarPrevia = (id: string) => pedir<{ enviando: number }>(`/api/filmes/previas/${encodeURIComponent(id)}/enviar`, { method: 'POST' });
/** Avisa que a prévia está aberta (e o card em que mexe); volta quem mais está nela e a versão da prévia no servidor. */
export const avisarNaPrevia = (id: string, card: CardDaPrevia | null) =>
  pedir<{ versao: string; pessoas: PessoaNaPrevia[] }>(`/api/filmes/previas/${encodeURIComponent(id)}/presenca`, { method: 'POST', body: JSON.stringify({ card }) });
/** Sai da prévia, mesmo com a página fechando (o pedido sobrevive à saída). */
export function sairDaPrevia(id: string) {
  void fetch(`/api/filmes/previas/${encodeURIComponent(id)}/presenca`, {
    method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...cabecalhos }, body: JSON.stringify({ saiu: true }),
  }).catch(() => {});
}
export const posterDoFilme = (id: string) => `/api/filmes/poster/${encodeURIComponent(id)}`;
export const imagemDaPagina = (id: string, numero: number, poster = 0) =>
  `/api/filmes/previas/${encodeURIComponent(id)}/paginas/${numero}/${poster ? `poster/${poster}` : 'imagem'}`;

/* ---------- cadastros (atrações, redatores, editores) ---------- */

export interface KeyCadastro {
  id: string;
  key: string;
}
/** O acervo da atração: próprio (as artes são dela), do filme (sessão de filme) ou sem acervo. */
export type AcervoDaAtracao = 'proprio' | 'filme' | 'sem';
export interface AtracaoCadastro {
  id: string;
  nome: string;
  categoria: string;
  acervo: AcervoDaAtracao;
  keys: KeyCadastro[];
  caminhos: Record<string, string>;
  campos: Record<string, string>;
}
export interface RedatorCadastro {
  id: string;
  nome: string;
  /** o e-mail do login (#106): liga quem entra no PROMeiro a este cadastro; '' sem nenhum */
  email: string;
  /** como aparece nos roteiros: o autor do Word, o login */
  keys: KeyCadastro[];
  trello: boolean;
}
export interface EditorCadastro {
  id: string;
  nome: string;
  email: string;
  keys: KeyCadastro[];
  trello: boolean;
}
/** "É Fulana, dos redatores?" (#106): quem já entrou no PROMeiro e parece, pelo nome, ser este cadastro sem e-mail. */
export interface SugestaoDeEmail {
  tipo: 'redatores' | 'editores';
  /** o cadastro */
  id: string;
  nome: string;
  /** o e-mail e o nome de quem entrou */
  email: string;
  usuario: string;
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
  /** só para administradores (vazio para os outros) */
  sugestoes: SugestaoDeEmail[];
  /** os e-mails de quem é da coordenação (#123), que monta a pauta */
  coordenacao?: string[];
  /** os nomes novos da pauta, pendentes (#132): só para administradores */
  nomesNovos?: NomeNovoDaPauta[];
}
/** Um editor que a coordenação escreveu na pauta e não está nos Cadastros (#132), pendente de um administrador. */
export interface NomeNovoDaPauta {
  /** como foi escrito */
  nome: string;
  /** os dias em que está na escala; publicado: na publicação que vale */
  dias: { dia: string; publicado: boolean }[];
  /** "é a mesma pessoa?": o editor que tem o nome como key, ou o que parece pelo nome */
  sugestao: { id: string; nome: string; por: 'key' | 'parecido' } | null;
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
export const mudarAcervo = (id: string, acervo: AcervoDaAtracao) =>
  pedir<{ id: string; nome: string; acervo: AcervoDaAtracao }>(`/api/cadastros/atracoes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ acervo }) });
/** Grava o e-mail do login no redator ou editor ('' apaga); devolve o de antes, para o desfazer (só administradores). */
export const mudarEmailDoCadastro = (tipo: SugestaoDeEmail['tipo'], id: string, email: string) =>
  pedir<{ id: string; nome: string; email: string; antes: string }>(`/api/cadastros/${tipo}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ email }) });
/** "Não é": a sugestão não volta (guardado no servidor); `desfazer` traz de volta. */
export const responderNaoE = (s: Pick<SugestaoDeEmail, 'tipo' | 'id' | 'email'>, desfazer = false) =>
  desfazer
    ? pedir<{ ok: true }>(`/api/cadastros/nao-e?${new URLSearchParams({ tipo: s.tipo, id: s.id, email: s.email })}`, { method: 'DELETE' })
    : pedir<{ ok: true }>('/api/cadastros/nao-e', { method: 'POST', body: JSON.stringify({ tipo: s.tipo, id: s.id, email: s.email }) });
/** Marca (ou tira) a pessoa do e-mail na coordenação (#123, só administradores); devolve quem é da coordenação. */
export const marcarCoordenacao = (email: string, marcar: boolean) =>
  marcar
    ? pedir<{ ok: true; coordenacao: string[] }>('/api/cadastros/coordenacao', { method: 'POST', body: JSON.stringify({ email }) })
    : pedir<{ ok: true; coordenacao: string[] }>(`/api/cadastros/coordenacao?${new URLSearchParams({ email })}`, { method: 'DELETE' });
/** Liga o nome novo da pauta ao editor que já existe (#132): o nome vira key dele e a pauta passa a mostrar o dele. */
export const ligarNomeNovo = (nome: string, editor: string) =>
  pedir<{ ok: true; nome: string; trocas: number }>('/api/cadastros/nomes-novos/ligar', { method: 'POST', body: JSON.stringify({ nome, editor }) });
/** Ignora o nome novo (não volta para a lista); `desfazer` o traz de volta. */
export const ignorarNomeNovo = (nome: string, desfazer = false) =>
  desfazer
    ? pedir<{ ok: true }>(`/api/cadastros/nomes-novos/ignorar?${new URLSearchParams({ nome })}`, { method: 'DELETE' })
    : pedir<{ ok: true }>('/api/cadastros/nomes-novos/ignorar', { method: 'POST', body: JSON.stringify({ nome }) });
export const removerCadastro = (tipo: TipoCadastro, id: string, keyId?: string) =>
  pedir<{ ok: true }>(`/api/cadastros/${tipo}/${encodeURIComponent(id)}${keyId ? `/keys/${encodeURIComponent(keyId)}` : ''}`, { method: 'DELETE' });

/* ---------- a aba Padeiros (#137): a chave do Padeiro, só para administradores ---------- */
export type EstadoDaChave = 'pendente' | 'ligada' | 'revogada';
export interface DesignerDoPadeiro {
  registro: string;
  nome: string;
}
/** Um Padeiro cadastrado: um usuário num computador, com a chave (que nunca vem ao navegador) e o estado dela. */
export interface Padeiro {
  id: string;
  usuario: string;
  computador: string;
  sistema: string;
  sigla: string;
  estado: EstadoDaChave;
  designer: DesignerDoPadeiro | null;
  /** O pedido novo do mesmo computador: a chave que, aprovada, troca a ligada (`substitui`, o id dela). */
  pedidoNovo: boolean;
  substitui: string | null;
  /** O designer sugerido (só nos pendentes): o da chave que o pedido novo troca ou, senão, o que a sigla indica. */
  sugestao: DesignerDoPadeiro | null;
  mudadoPor: string | null;
  mudadoEm: string | null;
  criadoEm: string;
  ultimoAviso: string | null;
}
export const lerPadeiros = () => pedir<{ padeiros: Padeiro[]; designers: DesignerDoPadeiro[] }>('/api/cadastros/padeiros');
export const ligarPadeiro = (id: string, designer: string) =>
  pedir<{ padeiro: Padeiro }>(`/api/cadastros/padeiros/${encodeURIComponent(id)}/ligar`, { method: 'POST', body: JSON.stringify({ designer }) });
export const revogarPadeiro = (id: string) => pedir<{ padeiro: Padeiro }>(`/api/cadastros/padeiros/${encodeURIComponent(id)}/revogar`, { method: 'POST' });

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
/** As claquetes dos últimos 90 dias que têm atração: quantas (distintas) e as ~20 mais recentes. */
export interface ReconhecidasDoSem {
  total: number;
  amostra: string[];
}
/** O Sem cadastro: as keys sem atração e as claquetes reconhecidas (a comemoração do Sem cadastro zerado). */
export const lerSemCadastro = () => pedir<{ keys: KeySemCadastro[]; reconhecidas: ReconhecidasDoSem }>('/api/cadastros/sem-cadastro?com=reconhecidas');
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

/** Quem escreveu as últimas claquetes da atração, na mesma praça (a sugestão do histórico). Sem servidor, sem atração
    ou sem o Postgres do Teable: null. */
export async function consultarRedatorProvavel(atracao: string, praca: string): Promise<RedatorDoHistorico | null> {
  if (armazenamento.tipo !== 'servidor' || !atracao.trim()) return null;
  const r = await pedir<{ redator: RedatorDoHistorico | null }>(`/api/redator-provavel?atracao=${encodeURIComponent(atracao)}&praca=${encodeURIComponent(praca)}`).catch(() => null);
  return r?.redator ?? null;
}

/** Os palpites de redator do roteiro que chegou sem redator: o do texto (os parágrafos do roteiro) e o das últimas
    claquetes da atração. Só redatores ativos; os que quem revisa já recusou ficam de fora. */
export async function palpitesDoRedator(meta: Pick<Meta, 'programa' | 'praca' | 'redatorRecusado'>, paragrafos: string[]): Promise<SugestaoRedator[]> {
  const redatores = redatoresDoCadastro();
  const historico = await consultarRedatorProvavel(meta.programa, meta.praca);
  return sugestoesDoRedator({ texto: redatorNoTexto(paragrafos, redatores), historico, atracao: meta.programa, redatores, recusados: meta.redatorRecusado });
}

/** Uma linha do acervo da atração, como a ficha mostra (a mesma arte em dois tipos são duas linhas). */
export interface ArteDaFicha {
  id: string;
  arte: string;
  /** a sigla do tipo ('' sem tipo) */
  tipo: string;
}
/** O acervo na ficha da atração (Cadastros): as linhas, o total e quantas de cada tipo ('' é "sem tipo", no fim). */
export interface AcervoDaFicha {
  ligado: boolean;
  acervo: AcervoDaAtracao;
  podeZerar: boolean;
  total: number;
  porTipo: { tipo: string; n: number }[];
  artes: ArteDaFicha[];
}
export const lerAcervoDaFicha = (atracao: string) => pedir<AcervoDaFicha>(`/api/acervo/atracao?atracao=${encodeURIComponent(atracao)}`);
/** Quantas artes cada atração tem no acervo, pelo nome (a lista de atrações dos Cadastros). */
export const lerTotaisDoAcervo = () => pedir<{ ligado: boolean; totais: Record<string, number> }>('/api/acervo/totais');

/* A conferência da importação roda igual no servidor e aqui: os tipos e as funções puras são os do módulo do servidor
   (servidor/importacao-do-acervo.mjs, tipado em .d.mts), sem nada do servidor junto. */
export type {
  AvisoDaPasta,
  AvisoDeJaImportado,
  AvisosDaImportacao,
  EstadoDaImportacao,
  Escolha,
  Escolhas,
  LinhaDaImportacao,
  LinhaDoAcervo,
  MudancaDaImportacao,
  PerguntaDaImportacao,
  PlacarDaImportacao,
  RegraLembrada,
} from '../../servidor/importacao-do-acervo.mjs';

/** A prévia da importação: o que o CSV faria no acervo da atração, antes de gravar. */
export interface PreviaDaImportacao {
  atracao: string;
  arquivo: string;
  /** o CSV lido, que volta ao servidor no gravar */
  csv: string;
  /** quantas linhas o acervo da atração tem agora */
  antes: number;
  /** as opções do campo tipo do acervo */
  tipos: string[];
  /** o acervo da atração, para conferir de novo a cada escolha */
  acervo: LinhaDoAcervo[];
  linhas: LinhaDaImportacao[];
  placar: PlacarDaImportacao;
  faltam: number;
  /** a pasta de output (o CSV de outra atração pede confirmação para gravar) e o já importado (#62) */
  avisos: AvisosDaImportacao;
}
/** O que a importação gravou: o total do acervo antes e depois, e os nomes do acervo corrigidos no lugar. */
export interface ResultadoDaImportacao {
  antes: number;
  depois: number;
  novas: number;
  ganharamTipo: number;
  /** as linhas do acervo renomeadas (o mesmo id), com o nome antigo */
  renomeadas: { id: string; antes: string; depois: string }[];
  semMudanca: number;
  /** o id da importação no histórico (null quando nada mudou: não entra no histórico) */
  importacao: string | null;
  /** quantas regras desta atração as decisões viraram (com "lembrar as decisões"; 0 sem) */
  lembradas?: number;
}
/** Uma linha que o desfazer não devolveu: alguém mexeu nela no Teable depois da importação. */
export interface LinhaQueNaoVoltou {
  id: string;
  arte: string;
  tipo: string;
  /** o que ficou: "continua no acervo", "não voltou a “X”", "o tipo não voltou" */
  motivo: string;
}
/** Uma importação no histórico da ficha: quando, o arquivo, quem e o que fez; desfaz e retoma por 7 dias. */
export interface ImportacaoNoHistorico {
  id: string;
  em: string;
  arquivo: string;
  por: string;
  /** gravada inteira, interrompida num lote (dá para retomar) ou desfeita */
  estado: 'gravada' | 'interrompida' | 'desfeita';
  antes: number;
  novas: number;
  /** das novas, quantas chegaram a ser criadas (na interrompida, menos que as novas) */
  criadas: number;
  ganharamTipo: number;
  renomeadas: number;
  semMudanca: number;
  /** até quando dá para desfazer */
  ate: string;
  podeDesfazer: boolean;
  podeRetomar: boolean;
  desfeita?: { em: string; por: string; naoVoltaram: LinhaQueNaoVoltou[] };
}
/** O que o desfazer fez: o total antes da importação e agora, e as linhas que não voltaram. */
export interface ImportacaoDesfeita {
  antes: number;
  depois: number;
  apagadas: number;
  devolvidas: number;
  naoVoltaram: LinhaQueNaoVoltou[];
}
export const lerImportacoes = (atracao: string) => pedir<{ importacoes: ImportacaoNoHistorico[] }>(`/api/acervo/importacoes?atracao=${encodeURIComponent(atracao)}`);
/** Desfaz a importação (só administradores, por 7 dias): apaga as criadas e devolve o tipo e o nome antigos. */
export const desfazerImportacao = (id: string) => pedir<ImportacaoDesfeita>('/api/acervo/importacoes/desfazer', { method: 'POST', body: JSON.stringify({ id }) });
/** Retoma a gravação interrompida no meio: os lotes que faltaram, sem duplicar. */
export const retomarImportacao = (id: string) => pedir<ResultadoDaImportacao>('/api/acervo/importacoes/retomar', { method: 'POST', body: JSON.stringify({ id }) });
/** A importação do acervo por CSV (só administradores, só acervo próprio): a prévia não grava nada. */
export const preverImportacao = async (atracao: string, arquivo: string, csv: string): Promise<PreviaDaImportacao> => ({
  ...(await pedir<Omit<PreviaDaImportacao, 'csv'>>('/api/acervo/importar/previa', { method: 'POST', body: JSON.stringify({ atracao, arquivo, csv }) })),
  csv,
});
/** Grava o CSV com as escolhas da conferência; o servidor classifica de novo contra o acervo relido, não duplica e
    recusa com decisão pendente. O CSV de fora da pasta de output da atração só grava com confirmouAtracao (#62). */
export const gravarImportacao = (previa: Pick<PreviaDaImportacao, 'atracao' | 'arquivo' | 'csv'>, escolhas: Escolhas, lembrar = false, confirmouAtracao = false) =>
  pedir<ResultadoDaImportacao>('/api/acervo/importar', { method: 'POST', body: JSON.stringify({ atracao: previa.atracao, arquivo: previa.arquivo, csv: previa.csv, escolhas, lembrar, ...(confirmouAtracao ? { confirmouAtracao } : {}) }) });

/** Uma regra desta atração (#63): a decisão lembrada de uma importação, com quem a lembrou e quando. */
export interface RegraDaAtracao extends RegraLembrada {
  id: number;
  quem: string;
  em: string;
}
/** As regras desta atração (só administradores): a ficha mostra, para apagar a lembrada errada. */
export const lerRegrasDaAtracao = (atracao: string) => pedir<{ regras: RegraDaAtracao[] }>(`/api/acervo/regras?atracao=${encodeURIComponent(atracao)}`);
export const apagarRegraDaAtracao = (id: number) => pedir<{ apagada: number }>('/api/acervo/regras/apagar', { method: 'POST', body: JSON.stringify({ id }) });

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
  const artes = artesUnicas(exportar(roteiro).artes).map((a) => ({ texto: a.texto, tipo: a.subtipo ? a.subtipoNome : '' }));
  const r = await fetch(`/api/roteiros/${encodeURIComponent(roteiro.id)}/pdf`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...cabecalhos }, body: JSON.stringify({ artes }),
  });
  if (!r.ok) throw new Error('Não consegui montar o PDF do roteiro.');
  return r.arrayBuffer();
}

/** Versão nova que substitui outra: herda o card do Trello que a anterior já tinha. */
async function herdarEnvio(novo: string, anterior: string) {
  if (armazenamento.tipo !== 'servidor') return;
  await pedir(`/api/roteiros/${encodeURIComponent(novo)}/trello`, { method: 'POST', body: JSON.stringify({ herdarDe: anterior }) });
}

/** A anterior já foi para o Trello (ou já estava lá)? Sem servidor, nunca. */
async function anteriorNoTrello(id: string) {
  if (armazenamento.tipo !== 'servidor') return false;
  const e = await pedir<{ estado: EnvioTrello['estado'] } | null>(`/api/roteiros/${encodeURIComponent(id)}/trello`).catch(() => null);
  return e?.estado === 'enviado' || e?.estado === 'duplicado';
}

/** As duas saídas da versão nova de um roteiro que já estava na fila (o aviso da ficha no celular e a comparação). */
export const versaoNova = {
  /** Fica a nova, com o trabalho da anterior (modelo/versoes); o card que a anterior já tinha passa para ela, e a anterior sai da fila.
   *  @param liberada a resposta de "Essa chamada já foi liberada para exibição?" (#166): sim, a letra seguinte; não, a versão seguinte */
  async substituir(novaId: string, liberada: boolean): Promise<{ roteiro: Roteiro; herdadas: number; cardHerdado: boolean } | undefined> {
    const rn = roteiroDa(await armazenamento.ler(novaId));
    if (!rn) return undefined;
    const ra = rn.meta.substitui ? roteiroDa(await armazenamento.ler(rn.meta.substitui)) : undefined;
    // a anterior já saiu da fila: só a pergunta sai
    if (!ra) {
      const roteiro = manterAsDuas(rn);
      await armazenamento.salvar(roteiro);
      return { roteiro, herdadas: 0, cardHerdado: false };
    }
    const { roteiro, herdadas } = substituirVersao(rn, ra, { liberada });
    await armazenamento.salvar(roteiro, 'substituiu a versão anterior');
    // o card que a anterior já tinha fica com a nova, antes que ela saia
    const cardHerdado = await anteriorNoTrello(ra.id);
    if (cardHerdado) await herdarEnvio(rn.id, ra.id).catch(() => {});
    await armazenamento.apagar(ra.id);
    return { roteiro, herdadas, cardHerdado };
  },
  /** As duas ficam na fila; a nova só deixa de perguntar. */
  async manter(novaId: string): Promise<Roteiro | undefined> {
    const rn = roteiroDa(await armazenamento.ler(novaId));
    if (!rn) return undefined;
    const roteiro = manterAsDuas(rn);
    await armazenamento.salvar(roteiro);
    return roteiro;
  },
};

/** Cria o card no Trello. As artes e o texto saem daqui, do mesmo jeito que o app mostra. */
export async function mandarParaTrello(roteiro: Roteiro, deNovo = false) {
  // o exemplo do tour nunca vai ao Trello (o envio dele é simulado pelo próprio tour)
  if (ehDoTour(roteiro.id)) throw new Error('O roteiro de exemplo do tour não vai ao Trello.');
  const saida = exportar(roteiro);
  // cada arte uma vez (a repetida no texto é a mesma produção). A que já existe (✓, ou do acervo, que já vem riscada)
  // vai no PDF (sublinhada, como no roteiro), fora do checklist; o servidor guarda no acervo da atração as confirmadas
  // (da próxima vez, ela já vem riscada). A que não vai ser produzida nem vai para o card (o PDF é o original, ela
  // continua lá). Cada arte leva a sua complexidade; o servidor calcula a maior das que vão ser produzidas para o card
  return pedir<{ estado: EnvioTrello['estado']; url?: string; avisos?: string[]; erro?: string }>(`/api/roteiros/${encodeURIComponent(roteiro.id)}/trello`, {
    method: 'POST',
    body: JSON.stringify({ artes: artesDoEnvio(saida, roteiro.meta), texto: saida.texto.completo, deNovo }),
  });
}

/** Apaga mesmo com a página fechando ou recarregando (o pedido sobrevive à saída). */
export function apagarAoSair(id: string) {
  if (armazenamento.tipo !== 'servidor' || ehDoTour(id)) return void armazenamento.apagar(id).catch(() => {});
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

/** O armazenamento em uso. Começa no navegador e passa para o servidor quando `conectar` o encontra. Os dois levam o
    roteiro de exemplo do tour da revisão, que vive só na memória. */
const doNavegador = comExemplo(noNavegador);
const doServidor = comExemplo(noServidor);
export let armazenamento: Armazenamento = doNavegador;

/** Quem está com cada roteiro aberto agora (id → pessoas), como o servidor conta nas salas de edição simultânea. */
export type PresencaNosRoteiros = Record<string, Pessoa[]>;

/** Pergunta ao servidor, na hora, quem está em cada roteiro: o editor não ouve a fila ao vivo, então consulta antes de
    escolher o próximo. Sem servidor (ou sem resposta), ninguém. */
export async function quemNosRoteiros(): Promise<PresencaNosRoteiros> {
  if (armazenamento.tipo !== 'servidor') return {};
  return pedir<PresencaNosRoteiros>('/api/no-roteiro').catch(() => ({}));
}

/* ---------- áreas de trabalho (#101) ---------- */

let minhasAreas: Area[] = ['designer'];
/** As áreas de trabalho da pessoa (#101), para o menu do perfil (#105). Sem servidor, só a Designer. */
export const minhasAreasDeTrabalho = (): readonly Area[] => minhasAreas;
let areaLembrada: Area = 'designer';
/** As preferências da pessoa como o servidor devolveu (e o que ela gravou desde então): a exibição de cada área (#103). */
let minhasPreferencias: Record<string, unknown> = {};

/** A pessoa entrou numa área: o servidor guarda, e o PROMeiro abre nela da próxima vez, em qualquer aparelho. A área
    que ela não tem não é guardada (o endereço abre, mas não conta como a dela). */
export async function lembrarArea(area: Area) {
  if (armazenamento.tipo !== 'servidor' || area === areaLembrada || !minhasAreas.includes(area)) return;
  areaLembrada = area;
  await pedir('/api/eu/preferencias', { method: 'PUT', body: JSON.stringify({ area }) });
}

/** A exibição de "meus roteiros" que a pessoa escolheu na área (#103); sem escolha, por dia. */
export const exibicaoLembrada = (area: AreaDosRoteiros): Exibicao => exibicaoDaArea(minhasPreferencias, area);

/** A pessoa escolheu a exibição da área: o servidor guarda, por pessoa e por área, e ela vale em qualquer aparelho.
    Como a área, a exibição da área que a pessoa não tem não é guardada (a lista troca, mas só nesta visita). Devolve se
    ficou guardada. */
export async function lembrarExibicao(area: AreaDosRoteiros, exibicao: Exibicao): Promise<boolean> {
  if (armazenamento.tipo !== 'servidor' || !minhasAreas.includes(area)) return false;
  const chave = chaveDaExibicao(area);
  const antes = minhasPreferencias[chave];
  minhasPreferencias = { ...minhasPreferencias, [chave]: exibicao };
  try {
    await pedir('/api/eu/preferencias', { method: 'PUT', body: JSON.stringify({ [chave]: exibicao }) });
    return true;
  } catch (e) {
    // não guardou: a próxima visita volta à de antes (se nenhuma escolha mais nova passou na frente)
    if (minhasPreferencias[chave] === exibicao) minhasPreferencias = { ...minhasPreferencias, [chave]: antes };
    throw e;
  }
}

/** A escolha da Pauta da edição (#98): a visão em que ela abre e o arranjo de cada visão; sem escolha, a Semana editor ×
    dia e o Dia empilhado. */
export const escolhaLembradaDaPauta = (): EscolhaDaPauta => escolhaDaPauta(minhasPreferencias);

/** A pessoa escolheu a visão ou o arranjo da pauta: vale na hora (também fora do servidor, até recarregar) e o servidor
    guarda, por pessoa, para qualquer aparelho. Devolve se ficou guardada; o que não ficou volta ao de antes na próxima
    visita (se nenhuma escolha mais nova passou na frente). */
export async function lembrarNaPauta<K extends keyof EscolhaDaPauta>(parte: K, valor: EscolhaDaPauta[K]): Promise<boolean> {
  const chave = CHAVE_DA_ESCOLHA[parte];
  if (minhasPreferencias[chave] === valor) return true;
  return guardarPreferencia(chave, valor);
}

/** As praças dos blocos que a pessoa recolheu na tela de produções (#113); sem escolha, nenhuma. */
export const blocosRecolhidos = (): string[] => recolhidosDe(minhasPreferencias);

/** A pessoa recolheu ou abriu um bloco da tela de produções: como a escolha da pauta, vale na hora e o servidor guarda,
    por pessoa, para qualquer aparelho. Devolve se ficou guardada. */
export const lembrarRecolhidos = (pracas: readonly string[]): Promise<boolean> => guardarPreferencia(CHAVE_DOS_RECOLHIDOS, [...pracas]);

/** A ordem em que a pessoa arrumou as praças da tela de produções, arrastando (#159); sem escolha, a da Configuração. */
export const ordemDasPracas = (): string[] => ordemDe(minhasPreferencias);

/** A pessoa arrumou as praças: como os recolhidos, vale na hora e o servidor guarda, por pessoa, para qualquer aparelho. */
export const lembrarOrdemDasPracas = (pracas: readonly string[]): Promise<boolean> => guardarPreferencia(CHAVE_DA_ORDEM, [...pracas]);

/** A forma de ver a agenda de filmes da aba Filmes (#169): por data de exibição (sem escolha) ou por sessão. */
export const formaDaAgendaDeFilmes = (): FormaDaAgenda => formaDaAgenda(minhasPreferencias);

/** A pessoa trocou a forma de ver a agenda de filmes: vale na hora e o servidor guarda, por pessoa, para qualquer
    aparelho. Devolve se ficou guardada. */
export const lembrarFormaDaAgendaDeFilmes = (forma: FormaDaAgenda): Promise<boolean> => guardarPreferencia(CHAVE_DA_AGENDA_DE_FILMES, forma);

/** A agenda de filmes (#169): os filmes com exibição perto de hoje, com todas as exibições, o pôster e a Produção. */
export const lerAgendaDeFilmes = () => pedir<AgendaDeFilmes>('/api/filmes/agenda');

/** Guarda uma preferência da pessoa: vale na hora (também fora do servidor, até recarregar) e o servidor grava. Devolve
    se ficou guardada; a que não ficou volta à de antes na próxima visita (se nenhuma escolha mais nova passou na frente). */
async function guardarPreferencia(chave: string, valor: unknown): Promise<boolean> {
  const antes = minhasPreferencias[chave];
  minhasPreferencias = { ...minhasPreferencias, [chave]: valor };
  if (armazenamento.tipo !== 'servidor') return false;
  try {
    await pedir('/api/eu/preferencias', { method: 'PUT', body: JSON.stringify({ [chave]: valor }) });
    return true;
  } catch {
    if (minhasPreferencias[chave] === valor) minhasPreferencias = { ...minhasPreferencias, [chave]: antes };
    return false;
  }
}

/** Quem redesenha quando uma preferência que vale no PROMeiro todo muda (o código das versões, #152). */
const ouvintesDasPreferencias = new Set<() => void>();
const avisarDasPreferencias = () => {
  for (const f of ouvintesDasPreferencias) f();
};
/** Assina as mudanças das preferências (para o useSyncExternalStore); devolve como desassinar. */
export function assinarPreferencias(f: () => void): () => void {
  ouvintesDasPreferencias.add(f);
  return () => void ouvintesDasPreferencias.delete(f);
}

/** "Mostrar o código das versões" (#152): a opção da pessoa, para o PROMeiro todo; sem escolha, ligada. */
export const codigoDasVersoesLigado = (): boolean => mostraOCodigoDasVersoes(minhasPreferencias);

/** A pessoa ligou ou desligou o código das versões no menu do perfil: vale na hora, em todas as telas, e o servidor
    guarda, por pessoa, para qualquer aparelho. Devolve se ficou guardada. */
export async function lembrarCodigoDasVersoes(ligado: boolean): Promise<boolean> {
  if (codigoDasVersoesLigado() === ligado) return true;
  const guardou = guardarPreferencia(CHAVE_DO_CODIGO_DAS_VERSOES, ligado);
  avisarDasPreferencias();
  const ok = await guardou;
  // a que não ficou guardada pode ter voltado à de antes
  avisarDasPreferencias();
  return ok;
}

/** "Meus roteiros" do Redator ou do Editor: os roteiros em que a pessoa é o redator (ou o editor), pelo nome do
    cadastro ligado ao e-mail dela; `nome` vazio quando o e-mail não está em nenhum cadastro da área. */
export interface MeusRoteiros {
  area: AreaDosRoteiros;
  nome: string | null;
  roteiros: MeuRoteiro[];
  /** só no pedido do administrador (#105): "todos" ou o nome escolhido no filtro "de quem" */
  de?: string;
  /** só no pedido do administrador: quem aparece nos roteiros da área, com quantos roteiros, para o filtro "de quem" */
  pessoas?: { nome: string; roteiros: number }[];
}
/** O roteiro de "meus roteiros", com o ciclo (#102), quem da arte está com ele (os designers da Produção) e as artes com
    o estado e a origem (#104). */
export interface MeuRoteiro extends Resumo {
  ciclo: CicloDoRoteiro;
  daArte: string[];
  artes: ArtesDoRoteiro;
}
/** Com `de` (só administradores, #105), os roteiros de todos ("todos") ou os de uma pessoa, pelo nome. */
export async function lerMeusRoteiros(area: AreaDosRoteiros, de?: string): Promise<MeusRoteiros> {
  if (armazenamento.tipo !== 'servidor') return { area, nome: null, roteiros: [] };
  return pedir<MeusRoteiros>(`/api/meus-roteiros?area=${area}${de === undefined ? '' : `&de=${encodeURIComponent(de)}`}`);
}

/** A pessoa viu o tour da revisão (terminou, pulou ou disse "Agora não"): o servidor guarda e o convite não volta. */
export async function marcarTourVisto() {
  if (armazenamento.tipo !== 'servidor') return;
  await pedir('/api/eu/tour', { method: 'POST', body: JSON.stringify({ tour: 'revisao' }) });
}

export interface Conexao {
  /** Quem o servidor reconheceu, se houver servidor e login. */
  eu: (Pessoa & { origem: 'acesso' | 'local' }) | null;
  /** Há servidor, mas ele espera que a pessoa se apresente com o perfil local. */
  pedePerfil: boolean;
  /** Há servidor, mas ele não reconheceu o login (Cloudflare Access): os roteiros ficam só neste navegador. */
  semLogin?: boolean;
  /** Quando a pessoa viu o tour da revisão (null = ainda não viu). Só com servidor e login. */
  tourRevisao?: string | null;
  /** As áreas de trabalho da pessoa (#101) e a de entrada (a última usada). Sem servidor, só a Designer. */
  areas?: Area[];
  area?: Area;
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
    const d = (await r.json()) as { email: string | null; nome?: string; origem?: 'acesso' | 'local'; perfilLocal?: boolean; trello?: boolean; filmes?: boolean; tour?: { revisao: string | null }; pracas?: unknown[]; admin?: boolean; coordenacao?: boolean; novidades?: number; areas?: unknown[]; area?: unknown; preferencias?: Record<string, unknown> };
    if (d.email) {
      armazenamento = doServidor;
      // as praças da Configuração, antes de qualquer roteiro ser lido (até aqui, e sem servidor, valem as de fábrica)
      registrarPracas(d.pracas);
      trelloLigado = !!d.trello;
      filmesLigado = !!d.filmes;
      souAdmin = !!d.admin;
      souDaCoordenacao = !!d.coordenacao;
      novidades = Number(d.novidades ?? 0) || 0;
      // as cores que cada um escolheu, para a orelha, o grifo e os cursores saírem certos
      await pedir<{ email: string; cor: string }[]>('/api/cores').then(registrarCores, () => {});
      // nomes da casa (atrações e redatores), quando o servidor está ligado ao Teable
      await atualizarVocabulario();
      minhasAreas = (d.areas ?? []).filter(ehArea);
      if (!minhasAreas.includes('designer')) minhasAreas.unshift('designer');
      areaLembrada = areaDeEntrada(d.area, minhasAreas);
      minhasPreferencias = d.preferencias && typeof d.preferencias === 'object' ? d.preferencias : {};
      avisarDasPreferencias();
      return { eu: { email: d.email, nome: d.nome ?? d.email, origem: d.origem ?? 'acesso' }, pedePerfil: false, tourRevisao: d.tour?.revisao ?? null, areas: minhasAreas, area: areaLembrada };
    }
    armazenamento = doNavegador;
    return { eu: null, pedePerfil: !!d.perfilLocal, semLogin: !d.perfilLocal };
  } catch {
    armazenamento = doNavegador;
    return { eu: null, pedePerfil: false };
  }
}

/* ---------- aba Duplicadas dos Cadastros (só administradores) ---------- */

import type { SecaoDaDuplicada } from '../modelo/duplicadas';
import type { Andamento as FrentesDoAndamento, Etapa } from '../modelo/andamento';
import { CHAVE_DA_ESCOLHA, escolhaDaPauta, type DiaDaPauta, type EscolhaDaPauta, type FiltroDaPauta, type LeituraDaPauta, type SemanaDaPauta } from '../modelo/pauta';
import type { DiaDaEscala, PosicaoDaEscala, TurnoDaEscala } from '../modelo/escala';
import type { FotoDoDia } from '../modelo/fotoDaPlanilha';
import type { DeOndeRepetir } from '../modelo/repetir';
import type { HorarioDoCartao } from '../modelo/horariosDoCartao';
import type { Ilha } from '../modelo/ilhas';
import type { AplicacaoDaCorrecao, Desfeitas, GrupoDaPauta, JuncaoDeAtracoes, PaginaDaCorrecao, PaginaDasAtracoes, PaginaDoRegistro } from '../modelo/correcaoDeGrafia';
import { CHAVE_DA_ORDEM, CHAVE_DOS_RECOLHIDOS, ordemDe, recolhidosDe, type CardDaProducao, type TelaDeProducoes } from '../modelo/producoesPorPraca';
import { CHAVE_DA_AGENDA_DE_FILMES, formaDaAgenda, type AgendaDeFilmes, type FormaDaAgenda } from '../modelo/agendaDeFilmes';
export type { SecaoDaDuplicada };
/** Um caso na lista: as linhas da produção da arte (cada uma de um card) com a mesma claquete, praça e versão. */
export interface ResumoDaDuplicada {
  id: string;
  /** a claquete (na produção) do card que a sugestão deixa ficar */
  claquete: string;
  praca: string;
  versao: string;
  secao: SecaoDaDuplicada;
  cards: number;
  /** pela coluna arquivado da produção */
  abertos: number;
  arquivados: number;
  artesNoAcervo: number;
  /** há quantos dias a linha mais nova do caso entrou na produção */
  dias: number;
}
export interface ListaDasDuplicadas {
  /** sem a produção da arte configurada (TEABLE_PG_URL e a ARTE_producao na base do Teable), false */
  ligado: boolean;
  /** o modo só olhar (#67): a aba não apaga, para comparar com o relatório do n8n nos primeiros dias */
  soOlhar: boolean;
  dias: number;
  /** quando a produção da arte foi lida (a lista não lê o Trello) */
  lidoEm: string | null;
  /** as linhas da produção que contaram: com card, sem filme, no período */
  linhasLidas: number;
  /** todos os casos pendentes do período, sem a busca (os ignorados não contam) */
  pendentes: number;
  casos: ResumoDaDuplicada[];
  /** os casos ignorados do período (com a busca), o mais recente primeiro */
  resolvidas: ResolvidaDaDuplicada[];
  /** todos os ignorados do período, sem a busca */
  totalResolvidas: number;
}
/** Um caso ignorado ("não é duplicada"): sai da lista até alguém reabrir ou entrar card novo no grupo. */
export interface ResolvidaDaDuplicada {
  id: string;
  claquete: string;
  praca: string;
  versao: string;
  cards: number;
  /** quem ignorou e quando */
  por: string;
  em: string;
  motivo: string;
}
/** Uma ação do Registro: quem ignorou, reabriu, apagou ou recriou o quê e quando. */
export interface AcaoDoRegistro {
  id: number;
  acao: 'ignorar' | 'reabrir' | 'apagar' | 'recriar';
  caso: string;
  claquete: string;
  praca: string;
  cards: string[];
  /** apagar e recriar: o card que saiu e o que ficou */
  card: string | null;
  fica: string | null;
  por: string;
  em: string;
  motivo: string;
  /** a ignorada que vale agora: dá para reabrir */
  podeReabrir: boolean;
  /** apagar (#67): em curso, feito (o card saiu do Trello), falhou (nada foi apagado) ou recriado depois (#68);
      recriar: em curso, feito ou falhou (nada ficou no Trello) */
  estado?: 'em-curso' | 'feito' | 'falhou' | 'recriado';
  apagado?: { codigo: string; religadas: number; roteiros: number; erro: string; naoDesfeito: string[]; pdfs: number } | null;
  /** recriar (#68): o código do card apagado e o do card novo, o link dele e o que voltou para ele */
  recriado?: { codigo: string; novo: string; url: string; religadas: number; roteiros: number; pdfs: number; erro: string; naoDesfeito: string[] } | null;
}
/** Um card do caso aberto, como o detalhe compara: só o que a produção da arte do Teable tem (nada é lido do Trello). */
export interface CardDaDuplicada {
  /** o card_ID */
  id: string;
  /** a claquete na produção da arte */
  claquete: string;
  /** a coluna arquivado */
  arquivado: boolean;
  /** quando o card foi criado (do próprio card_ID) */
  criado: string | null;
  entrada: string | null;
  entrega: string | null;
  status: string[];
  designers: string[];
  /** artes_quantidade (null sem a coluna preenchida) */
  artes: number | null;
  acervo: number;
  roteiro: { id: string; claquete: string; por: string } | null;
  /** o link do card no Trello, feito do card_ID */
  url: string;
  /** o motivo da sugestão para este card */
  motivo: string;
  /** o código que a confirmação de apagar pede: os 4 últimos caracteres do card_ID (o fim do link) */
  codigo: string;
  /** a última mudança da linha no Teable: apagar confere que não mudou desde que a tela abriu */
  modificadoEm: string | null;
}
export interface CasoDaDuplicada {
  id: string;
  claquete: string;
  praca: string;
  versao: string;
  secao: SecaoDaDuplicada;
  lidoEm: string;
  sugestao: { fica: string; saem: string[] };
  cards: CardDaDuplicada[];
}
export const lerDuplicadas = (dias: number, busca = '', renovar = false) =>
  pedir<ListaDasDuplicadas>(`/api/duplicadas?dias=${dias}${busca.trim() ? `&busca=${encodeURIComponent(busca.trim())}` : ''}${renovar ? '&renovar=1' : ''}`);
export const lerCasoDeDuplicada = (id: string, dias: number) => pedir<CasoDaDuplicada>(`/api/duplicadas/caso?id=${encodeURIComponent(id)}&dias=${dias}`);
export const lerRegistroDasDuplicadas = () => pedir<{ registro: AcaoDoRegistro[] }>('/api/duplicadas/registro').then((r) => r.registro);
/** Ignora o caso: só o registro do PROMeiro muda (nada no Trello nem no Teable). */
export const ignorarDuplicada = (id: string, dias: number, motivo: string) =>
  pedir<{ ok: true }>('/api/duplicadas/ignorar', { method: 'POST', body: JSON.stringify({ id, dias, motivo }) });
/** O que mudou num card desde que o caso abriu (apagar para e devolve isto). */
export interface MudancaNaDuplicada {
  card: string;
  codigo: string;
  campo: string;
  antes: string;
  depois: string;
}
/** O card apagado: quantas artes do acervo e roteiros passaram para o card que fica. */
export interface ApagadoDaDuplicada {
  registro: number;
  card: string;
  codigo: string;
  fica: string;
  religadas: number;
  roteiros: number;
  comentou: boolean;
}
export type ApagarDuplicada = { ok: true; apagado: ApagadoDaDuplicada } | { ok: false; erro: string; mudou?: MudancaNaDuplicada[]; bloqueado?: boolean };
/**
 * Apaga um card do caso (#67): o servidor confere o código digitado e relê os cards na produção da arte; se algo mudou
 * desde que a tela abriu, para e devolve o que mudou (nada é apagado).
 */
export async function apagarDuplicada(caso: CasoDaDuplicada, dias: number, sai: string, fica: string, codigo: string): Promise<ApagarDuplicada> {
  const vistos = Object.fromEntries(caso.cards.map((c) => [c.id, c]));
  const r = await fetch('/api/duplicadas/apagar', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...cabecalhos },
    body: JSON.stringify({ caso: caso.id, dias, sai, fica, codigo, vistos }),
  });
  const corpo = (await r.json().catch(() => null)) as (ApagadoDaDuplicada & { erro?: string; mudou?: MudancaNaDuplicada[]; bloqueado?: boolean }) | null;
  if (r.ok && corpo) return { ok: true, apagado: corpo };
  return { ok: false, erro: corpo?.erro ?? `O servidor não respondeu (${r.status}).`, mudou: corpo?.mudou, bloqueado: corpo?.bloqueado };
}
/** O card recriado da cópia (#68): o card novo e o que voltou para ele. */
export interface RecriadoDaDuplicada {
  registro: number;
  card: string;
  codigo: string;
  url: string;
  fica: string;
  /** a linha da produção do card novo existe (sem ela, as artes do acervo não voltam: artesSemLinha) */
  linha: boolean;
  religadas: number;
  artesSemLinha: number;
  roteiros: number;
  pdfs: number;
  comentou: boolean;
  /** o que não entrou no card (a checklist, um campo, o anexo) */
  avisos: string[];
}
export type RecriarDuplicada = { ok: true; recriado: RecriadoDaDuplicada } | { ok: false; erro: string };
/** Recria o card apagado pelo apagar `id` do Registro (#68): um card novo, feito só da cópia (nada é lido do Trello). */
export async function recriarDuplicada(id: number): Promise<RecriarDuplicada> {
  const r = await fetch('/api/duplicadas/recriar', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...cabecalhos },
    body: JSON.stringify({ id }),
  });
  const corpo = (await r.json().catch(() => null)) as (RecriadoDaDuplicada & { erro?: string }) | null;
  if (r.ok && corpo) return { ok: true, recriado: corpo };
  return { ok: false, erro: corpo?.erro ?? `O servidor não respondeu (${r.status}).` };
}
/** Liga ou desliga o modo só olhar das Duplicadas (a chave DUPLICADAS_SO_OLHAR da configuração). */
export const mudarModoDasDuplicadas = (soOlhar: boolean) => pedir<{ soOlhar: boolean }>('/api/duplicadas/modo', { method: 'POST', body: JSON.stringify({ soOlhar }) });
/** A Linha do tempo (#89) da Produção de um card: o estado de agora e os eventos. Sem Produção, producao é null. */
export interface LinhaDoTempo {
  producao: (ProducaoDaLinha & { id: string; claquete: string }) | null;
  eventos: EventoDaLinha[];
}
export const lerLinhaDoTempo = (card: string) => pedir<LinhaDoTempo>(`/api/linha-do-tempo?card=${encodeURIComponent(card)}`);
export const reabrirDuplicada = (id: string) => pedir<{ ok: true }>('/api/duplicadas/reabrir', { method: 'POST', body: JSON.stringify({ id }) });

/* ---------- a tela de Configuração (só administradores) ---------- */

import type { ConferenciaDasPracas, EstadoDasPracas, LigacoesDasPracas, QuadroLido } from '../modelo/ligarPeloNome';
import type { EstadoDoCard, LigacoesDoCard } from '../modelo/ligarOCard';
import type { EstadoDosFilmes, LigacoesDosFilmes } from '../modelo/ligarOsFilmes';
/** O Trello ou o Teable fora do ar (#79): desde quando não responde e de quando são os nomes que valem ('' = nenhuma
    leitura guardada). A parte que depende dele fica travada. */
export interface ForaDoAr {
  servico: string;
  desde: string;
  lidoEm: string;
}
/** A seção Praças como o servidor manda: o salvo, a proposta (o salvo com o que o nome acha um só), o estado e o
    quadro lido do Trello (as listas e os campos). Sem quadro, `erro` diz o que falta. */
export interface SecaoPracas {
  primeiraVez: boolean;
  salvo: LigacoesDasPracas;
  proposta: LigacoesDasPracas;
  estado: EstadoDasPracas | null;
  quadro: (QuadroLido & { id: string; de: 'variavel' | 'lista' }) | null;
  erro?: string;
  /** o Trello fora do ar (#79): o salvo com os nomes da última leitura, e a edição travada */
  foraDoAr?: ForaDoAr;
}
/** A seção Card (#74) como o servidor manda: o salvo, a proposta e o estado (o quadro é o mesmo das praças). */
export interface SecaoCard {
  primeiraVez: boolean;
  salvo: LigacoesDoCard;
  proposta: LigacoesDoCard;
  estado: EstadoDoCard | null;
  erro?: string;
  foraDoAr?: ForaDoAr;
}
/** A seção Filmes (#75) como o servidor manda: o salvo, a proposta e o estado (o quadro é o mesmo das praças). Sem o
    cadastro de atrações, `avisoDasSessoes` diz que as sessões são só as já salvas. */
export interface SecaoFilmes {
  primeiraVez: boolean;
  salvo: LigacoesDosFilmes;
  proposta: LigacoesDosFilmes;
  estado: EstadoDosFilmes | null;
  avisoDasSessoes?: string;
  erro?: string;
  foraDoAr?: ForaDoAr;
}
/** As Conexões (#76): o quadro do Trello e a base do Teable de agora, as tabelas achadas pelo nome na base e o aviso
    do topo (a tabela ou a coluna que falta). Com o Teable fora, `foraDoAr` e as tabelas da última leitura. */
export interface ConexoesDaConfiguracao {
  quadro: { id: string; nome: string; de: 'variavel' | 'lista' } | null;
  erroDoQuadro?: string;
  base: { id: string; nome: string } | null;
  tabelas: { nome: string; id: string; pg: string; nomeLido: string; como: 'variavel' | 'lembrado' | 'nome' | ''; problema: '' | 'nenhum' | 'dobro' }[];
  avisos: { tabela: string; texto: string }[];
  lidasEm?: string;
  foraDoAr?: string;
  semTeable?: string;
  /** #79: o Trello (trocar o quadro trava) e o Teable (trocar a base trava) fora do ar, desde quando */
  trelloForaDoAr?: ForaDoAr;
  teableForaDoAr?: ForaDoAr;
}
export interface SecoesDaConfiguracao {
  pracas: SecaoPracas;
  card: SecaoCard;
  filmes: SecaoFilmes;
  conexoes: ConexoesDaConfiguracao;
  /** os turnos da edição (#124), os da montagem da pauta: os salvos, ou os de fábrica */
  turnos: { salvo: TurnoDaEscala[]; deFabrica: boolean };
  /** os turnos da arte (#175): os salvos, ou os de fábrica (manhã e noite); nenhuma tela usa ainda */
  turnosDaArte: { salvo: TurnoDaEscala[]; deFabrica: boolean };
  /** o cartão da pauta no Teams (#135): os horários, o segredo que falta no Portainer e o último envio */
  teams: CartaoDoTeamsDaConfiguracao;
  /** a chave da virada (#134): publicar grava a pauta no Teable; `tabela`: a tabela da pauta foi achada na base */
  virada?: ViradaDaPauta;
}
export interface ViradaDaPauta {
  ligada: boolean;
  tabela: boolean;
}
/** Liga ou desliga a chave da virada (#134): vale na hora e entra no histórico. */
export const mudarAVirada = (ligada: boolean) => pedir<{ virada: ViradaDaPauta }>('/api/configuracao/virada', { method: 'POST', body: JSON.stringify({ ligada }) }).then((r) => r.virada);
export interface CartaoDoTeamsDaConfiguracao {
  horarios: HorarioDoCartao[];
  deFabrica: boolean;
  /** os segredos que faltam no Portainer (sem eles, nada é mandado) */
  falta: string[];
  ultimo: { dia: string; tipo: 'pauta' | 'alterada'; em: string; ok: boolean; erro?: string } | null;
}
/** O que vai para conferir e salvar: só as seções que mudaram. */
export interface MudancasDaConfiguracao {
  pracas?: LigacoesDasPracas;
  card?: LigacoesDoCard;
  filmes?: LigacoesDosFilmes;
  turnos?: TurnoDaEscala[];
  turnosDaArte?: TurnoDaEscala[];
  teams?: HorarioDoCartao[];
}
export const lerConfiguracao = () => pedir<SecoesDaConfiguracao>('/api/configuracao');
/** Os quadros do Trello e as bases do Teable que os tokens enxergam (para trocar, em Conexões). */
export const lerQuadrosDoTrello = () => pedir<{ quadros: { id: string; nome: string }[] }>('/api/configuracao/quadros').then((r) => r.quadros);
export const lerBasesDoTeable = () => pedir<{ bases: { id: string; nome: string }[] }>('/api/configuracao/bases').then((r) => r.bases);
/** Troca o quadro ou a base: o nome digitado confirma. Devolve as seções ligadas de novo pelo nome. */
export async function trocarConexao(m: { quadro: string; confirmacao: string } | { base: string; confirmacao: string }): Promise<SecoesDaConfiguracao> {
  const s = await pedir<SecoesDaConfiguracao>('/api/configuracao/trocar', { method: 'POST', body: JSON.stringify(m) });
  registrarPracas(s.pracas.salvo.pracas);
  return s;
}
/** Uma novidade do quadro (#77): quem entrou e não é designer, ou o designer ativo que saiu. */
export interface NovidadeDoQuadro {
  chave: string;
  tipo: 'entrou' | 'saiu';
  nome: string;
  /** o e-mail da tabela designers ou do Trello */
  email: string;
  /** em quantas linhas da produção apareceu (só em quem entrou, #176) */
  vezes?: number;
  /** o e-mail para tornar administrador: o do Trello ou o de quem já entrou no PROMeiro com o mesmo nome */
  emailSugerido: string;
  /** é administrador (pela chave-mestra ou pelo salvo) */
  administrador: boolean;
  /** está nos administradores salvos na tela (dá para tirar) */
  salvo: boolean;
  por?: string;
  em?: string;
}
/** A seção Pessoas (#77): os administradores, quem já entrou no PROMeiro, as novidades do quadro e as ignoradas. */
export interface PessoasDaConfiguracao {
  eu: string;
  administradores: { email: string; nome: string; mestra: boolean }[];
  quemJaEntrou: { email: string; nome: string }[];
  novidades: NovidadeDoQuadro[];
  ignoradas: NovidadeDoQuadro[];
  verificadoEm: string;
  erro?: string;
  /** #79: o Trello, o Teable (ou os dois) fora do ar, desde quando: cadastrar e marcar inativo ficam travados */
  foraDoAr?: { servico: string; desde: string };
}
export type AcaoNasPessoas =
  | { acao: 'administrador'; email: string; chave?: string }
  | { acao: 'tirar'; email: string }
  | { acao: 'cadastrar' | 'inativar' | 'ignorar' | 'desfazer'; chave: string };
const comNovidades = (p: PessoasDaConfiguracao) => ((novidades = p.novidades.length), p);
/** Verifica de novo o quadro e lê a seção Pessoas. */
export const lerPessoas = () => pedir<PessoasDaConfiguracao>('/api/configuracao/pessoas').then(comNovidades);
/** Uma ação na seção Pessoas (vale na hora); devolve a seção de novo. */
export const mudarPessoas = (a: AcaoNasPessoas) => pedir<PessoasDaConfiguracao>('/api/configuracao/pessoas', { method: 'POST', body: JSON.stringify(a) }).then(comNovidades);
/** Uma linha do histórico da Configuração (#78): quem, quando, o antigo → o novo legível, e se dá para voltar. */
export interface EntradaDoHistorico {
  id: number;
  em: string;
  por: string;
  /** o nome de quem mudou ('sistema' quando não foi pela tela) */
  quem: string;
  linhas: { oque: string; antes: string; depois: string }[];
  /** a linha de que esta voltou */
  voltouDe: number | null;
  /** jaVale: os valores de antes dela já são os de agora */
  voltar: { pode: boolean; jaVale?: boolean; motivo?: string };
}
export const lerHistoricoDaConfiguracao = () => pedir<{ entradas: EntradaDoHistorico[] }>('/api/configuracao/historico').then((r) => r.entradas);
/** Volta a uma linha do histórico (vale na hora); devolve o histórico de novo. */
export async function voltarNoHistorico(id: number): Promise<EntradaDoHistorico[]> {
  const r = await pedir<{ entradas: EntradaDoHistorico[]; pracas?: unknown[] }>('/api/configuracao/voltar', { method: 'POST', body: JSON.stringify({ id }) });
  // as praças de antes valem na hora também neste navegador
  if (r.pracas) registrarPracas(r.pracas);
  return r.entradas;
}
/** Uma variável na página "Pode apagar do Portainer" (#79), com o porquê. */
export interface VariavelDoPortainer {
  nome: string;
  porque: string;
}
/** O que pode sair do Portainer (o valor já está salvo na tela, ou não é mais lido), o que ainda não e o que fica. */
export interface ListaDoPortainer {
  podeApagar: VariavelDoPortainer[];
  aindaNao: VariavelDoPortainer[];
  ficam: VariavelDoPortainer[];
}
export const lerListaDoPortainer = () => pedir<ListaDoPortainer>('/api/configuracao/portainer');

/** O Andamento do projeto (#92), só administradores: a trilha, as frentes (a leitura do GitHub) e de quando é. */
export interface AndamentoDoProjeto {
  etapas: Etapa[];
  /** a leitura de agora ou a última guardada; null quando nunca houve uma */
  andamento: FrentesDoAndamento | null;
  lidoEm: string | null;
  /** as variáveis que faltam no Portainer (GITHUB_TOKEN, GITHUB_REPO) */
  falta: string[];
  /** o GitHub não respondeu: o motivo e desde quando */
  foraDoAr: { motivo: string; desde: string } | null;
  repo: string;
}
/** A Semana da pauta da edição (#94): qualquer dia da semana (sem ele, a de hoje). Sem o Postgres do Teable, o erro diz. */
/** A tela de produções (#109): as Produções abertas num bloco por praça (nada do Trello). */
export const lerProducoesPorPraca = () => pedir<TelaDeProducoes>('/api/producoes/por-praca');
/** A busca da tela de produções (#161): no histórico todo (também os entregues antigos), pela claquete, pela atração e
    pelas pessoas, uma página por vez (de 0), das mais recentes para as mais antigas. */
export const buscarProducoes = (termo: string, pagina = 0, sinal?: AbortSignal) =>
  pedir<{ cards: CardDaProducao[]; total: number; pagina: number; mais: boolean }>(`/api/producoes/busca?q=${encodeURIComponent(termo)}&pagina=${pagina}`, sinal ? { signal: sinal } : undefined);
/** Pegar, voltar para a Entrada (#110) ou entregar (#111): o que foi feito e a Produção como a tela mostra agora. A
    entrega com arte do checklist faltando, sem `assimMesmo`, não muda nada e volta com as que faltam (sem `feito`). O
    erro traz o motivo. */
export const mudarEtapaDaProducao = (producao: string, etapa: 'produzindo' | 'entrada' | 'entregue', assimMesmo = false) =>
  pedir<{ feito?: { antes: string; depois: string; semCard: boolean }; faltam?: string[]; producao: CardDaProducao | null }>('/api/producoes/etapa', {
    method: 'POST',
    body: JSON.stringify({ producao, etapa, ...(assimMesmo ? { assimMesmo: true } : {}) }),
  });
/** Desfazer (#112) a última mudança da etapa da pessoa naquele card: o que foi feito e a Produção como a tela mostra
    agora. Se a etapa mudou depois (outra pessoa, o Trello) ou já foi desfeita, o erro diz. */
export const desfazerEtapaDaProducao = (producao: string) =>
  pedir<{ feito?: { antes: string; depois: string; semCard: boolean }; producao: CardDaProducao | null }>('/api/producoes/desfazer', {
    method: 'POST',
    body: JSON.stringify({ producao }),
  });
/** A Produção aberta na tela de produções (#113): a linha do tempo, as artes do checklist (marcadas ou não) e o link
    do card no Trello (null sem card). */
export interface ProducaoAberta extends LinhaDoTempo {
  artes: { nome: string; marcada: boolean }[];
  trello: string | null;
  /** #160: as artes como a janela do After mostra (a de vários tipos é uma só), com o fogo (o do Roteiro ou, sem ele, o da Produção, #174) */
  artesDoCard?: ArteDoCard[];
  /** #160: a versão do Roteiro ligado (V1 sem versão nova) e quando ele chegou; null sem Roteiro */
  roteiro?: { versao: number; em: string } | null;
  /** #160: para escolher no card aberto: os designers ativos e as atrações do cadastro */
  designersAtivos?: string[];
  atracoes?: string[];
}
/** Uma arte no card aberto (#160): o nome, os itens do checklist dela, se está feita e o fogo (1 a 3, com ou sem Roteiro, #174). */
export interface ArteDoCard {
  nome: string;
  itens: string[];
  feita: boolean;
  fogo: 1 | 2 | 3;
}
export const lerProducaoAberta = (producao: string) => pedir<ProducaoAberta>(`/api/producoes/aberta?producao=${encodeURIComponent(producao)}`);
/** O que as ações do card aberto (#160) respondem: o que foi feito, o card como a tela mostra e a Produção aberta. */
export interface RespostaDoCardAberto {
  feito: { eventos: string[]; trello: string[] };
  producao: CardDaProducao | null;
  aberta: ProducaoAberta | null;
}
const noCardAberto = (o: string, corpo: object) => pedir<RespostaDoCardAberto>(`/api/producoes/${o}`, { method: 'POST', body: JSON.stringify(corpo) });
/** O prazo (#160): o dia (AAAA-MM-DD); vai ao prazo do card no Trello. */
export const mudarPrazoDaProducao = (producao: string, prazo: string) => noCardAberto('prazo', { producao, prazo });
/** A atração (#160): o nome no cadastro, ou '' para desligar. */
export const mudarAtracaoDaProducao = (producao: string, atracao: string) => noCardAberto('atracao', { producao, atracao });
/** Atribuir (entra) ou tirar um designer (#160): o membro dele entra ou sai do card no Trello. */
export const mudarDesignerDaProducao = (producao: string, designer: string, entra: boolean) => noCardAberto('designer', { producao, designer, entra });
/** Marcar, desmarcar, apagar, voltar (o desfazer do apagar) ou incluir uma arte (#160): o checklist do card espelha. */
export const mudarArteDaProducao = (producao: string, arte: string, acao: 'marcar' | 'desmarcar' | 'apagar' | 'voltar' | 'incluir') => noCardAberto('arte', { producao, arte, acao });
/** Subir o fogo de uma arte (#160): no Roteiro ligado ou, sem ele, na Produção (#174). */
export const subirFogoDaProducao = (producao: string, arte: string) => noCardAberto('fogo', { producao, arte });
/** O pedido da pauta com o filtro pessoal (#99), quando há. */
const comFiltro = (busca: Record<string, string>, filtro: FiltroDaPauta | null) => {
  const q = new URLSearchParams(Object.entries({ ...busca, ...(filtro ? { filtro } : {}) }).filter(([, v]) => v)).toString();
  return q ? `?${q}` : '';
};
export const lerSemanaDaPauta = (dia = '', filtro: FiltroDaPauta | null = null) => pedir<SemanaDaPauta & LeituraDaPauta>(`/api/pauta/semana${comFiltro({ inicio: dia }, filtro)}`);
/** O Dia da pauta da edição (#97): um dia (AAAA-MM-DD; sem ele, hoje), com cada editor numa coluna. */
export const lerDiaDaPauta = (dia = '', filtro: FiltroDaPauta | null = null) => pedir<DiaDaPauta & LeituraDaPauta>(`/api/pauta/dia${comFiltro({ dia }, filtro)}`);
/** O rascunho do dia que a coordenação monta (#123; sem o dia, amanhã), com as abas da semana e a lista dos editores. */
export const lerRascunhoDoDia = (dia = '') => pedir<DiaDaEscala>(`/api/montar-pauta${dia ? `?dia=${dia}` : ''}`);
/**
 * Grava o rascunho do dia com as posições e o recado do dia (#125); o servidor grava o horário e a claquete no padrão e
 * devolve o dia gravado. Com a `base` (o dia como a tela o leu, #131), o servidor junta o que mudou desde ela com o que
 * outra pessoa gravou nesse meio-tempo; sem ela, troca o dia inteiro.
 */
export const gravarRascunhoDoDia = (dia: string, posicoes: PosicaoDaEscala[], recado: string, base?: { posicoes: PosicaoDaEscala[]; recado: string }) =>
  pedir<DiaDaEscala>(`/api/montar-pauta?dia=${dia}`, { method: 'PUT', body: JSON.stringify({ posicoes, recado, ...(base ? { base } : {}) }) });
/** Diz que uma pendência da conferência está certa (ou a reabre), pela chave (#127); devolve o dia. */
export const marcarPendencia = (dia: string, chave: string, certo: boolean) => pedir<DiaDaEscala>(`/api/montar-pauta/conferida?dia=${dia}`, { method: 'POST', body: JSON.stringify({ chave, certo }) });
/** Publica o rascunho gravado do dia, mesmo com pendências (#127); devolve o dia, com a publicação. */
export const publicarODia = (dia: string) => pedir<DiaDaEscala>(`/api/montar-pauta/publicar?dia=${dia}`, { method: 'POST' });
/** A foto mais nova da planilha da edição para o dia, o que o PROMeiro leu dela e as diferenças com o rascunho gravado (#133). */
export const lerAFotoDoDia = (dia: string) => pedir<FotoDoDia>(`/api/montar-pauta/foto?dia=${dia}`);
/** Desfaz a última publicação do dia (vale a anterior, ou nenhuma) (#127); devolve o dia. */
export const desfazerAPublicacao = (dia: string) => pedir<DiaDaEscala>(`/api/montar-pauta/desfazer?dia=${dia}`, { method: 'POST' });
/* A coluna lateral (#126): cada ação devolve o dia, como o GET. */
const naColuna = (dia: string, acao: string, corpo: unknown) => pedir<DiaDaEscala>(`/api/montar-pauta/${acao}?dia=${dia}`, { method: 'POST', body: JSON.stringify(corpo) });
/** Junta a lista escrita ou colada em "Para distribuir" (uma claquete por linha, no padrão). */
export const juntarParaDistribuir = (dia: string, texto: string) => naColuna(dia, 'para-distribuir', { texto });
/** Leva uma claquete de "Para distribuir" para a posição (antes de `antesDe`, ou no fim). */
export const levarParaAPosicao = (dia: string, id: string, posicao: string, antesDe: string | null = null) => naColuna(dia, 'levar', { id, posicao, antesDe });
/** Move a demanda para a posição (antes de `antesDe`, ou no fim). */
export const moverADemanda = (dia: string, demanda: string, posicao: string, antesDe: string | null = null) => naColuna(dia, 'mover', { demanda, posicao, antesDe });
/** Devolve a demanda para "Para distribuir", com de quem era. */
export const devolverADemanda = (dia: string, demanda: string) => naColuna(dia, 'devolver', { demanda });
/** Escala quem está sem escala numa posição, ou numa posição nova do turno. */
export const escalarNoDia = (dia: string, editor: string, alvo: { posicao: string } | { turno: string; id?: string }) => naColuna(dia, 'escalar', { editor, ...alvo });
/** Distribuir (#151): põe a lista "Para distribuir" inteira nos editores escalados; o dia volta com as `distribuidas`. */
export const distribuirNoDia = (dia: string) => naColuna(dia, 'distribuir', {});
/** Desfaz o Distribuir (#151): as claquetes voltam de uma vez para "Para distribuir", com de quem eram. */
export const desfazerADistribuicao = (dia: string, itens: readonly { id: string; deQuem: string }[]) => naColuna(dia, 'desfazer-distribuicao', { itens: itens.map(({ id, deQuem }) => ({ id, deQuem })) });
/** Repetir (#129): copia para o dia vazio a escala de outro dia (ou, na semana inteira, para cada dia vazio). */
export const repetirAEscala = (dia: string, de: DeOndeRepetir) => pedir<DiaDaEscala>(`/api/montar-pauta/repetir?dia=${dia}`, { method: 'POST', body: JSON.stringify({ de }) });
/** O painel das ausências do dia (#128): as que valem a partir da semana, as do dia, a oferta de tirar e o para distribuir. */
export const lerAusencias = (dia: string) => pedir<PainelDasAusencias>(`/api/montar-pauta/ausencias?dia=${dia}`);
/** Onde a pessoa está escalada no período, antes de marcar a ausência. */
export const ondeEstaEscalada = (editor: string, de: string, ate: string) => pedir<{ escalada: EscaladaNoDia[] }>(`/api/montar-pauta/ausencias/onde?${new URLSearchParams({ editor, de, ate })}`);
/** Marca a ausência; nos rascunhos do período, a posição da pessoa vira vaga. Devolve o painel e onde ela estava. */
export const marcarAusencia = (dia: string, a: Omit<Ausencia, 'id'>) => pedir<PainelDasAusencias & { marcada: Ausencia; escalada: EscaladaNoDia[] }>(`/api/montar-pauta/ausencias?dia=${dia}`, { method: 'POST', body: JSON.stringify(a) });
export const apagarAusencia = (dia: string, id: string) => pedir<PainelDasAusencias>(`/api/montar-pauta/ausencias/apagar?dia=${dia}`, { method: 'POST', body: JSON.stringify({ id }) });
/** Tira a pessoa do dia (publicado): as posições dela ficam vagas e as demandas vão para "para distribuir". */
export const tirarDoDia = (dia: string, editor: string) => pedir<PainelDasAusencias>(`/api/montar-pauta/tirar?dia=${dia}`, { method: 'POST', body: JSON.stringify({ editor }) });
/** "Já distribuí": tira a demanda da lista "para distribuir" do dia. */
export const jaDistribuida = (dia: string, id: string) => pedir<PainelDasAusencias>(`/api/montar-pauta/para-distribuir/tirar?dia=${dia}`, { method: 'POST', body: JSON.stringify({ id }) });
/** Lê o Andamento (guardado alguns minutos no servidor); `deNovo` vai ao GitHub. */
export const lerAndamentoDoProjeto = (deNovo = false) => pedir<AndamentoDoProjeto>(`/api/andamento-do-projeto${deNovo ? '?deNovo=1' : ''}`);
/** A correção de grafia (#114, só administradores): uma página das propostas da pauta de um grupo, e o resumo. */
export const lerCorrecoesDaPauta = (grupo: GrupoDaPauta, pagina = 1) => pedir<PaginaDaCorrecao>(`/api/correcoes/pauta?grupo=${grupo}&pagina=${pagina}`);
/** As atrações parecidas (#116, só administradores): uma página dos grupos de fichas que parecem a mesma atração. */
export const lerAtracoesParecidas = (pagina = 1) => pedir<PaginaDasAtracoes>(`/api/correcoes/atracoes?pagina=${pagina}`);
/** "Não são a mesma": o grupo destas fichas não aparece de novo. */
export const naoSaoAMesma = (ids: string[]) => pedir<{ ok: true }>('/api/correcoes/atracoes/nao-sao-a-mesma', { method: 'POST', body: JSON.stringify({ ids }) });
/** Juntar atrações (#117): as fichas do grupo, a que fica e o nome final. */
export const juntarAtracoes = (ids: string[], fica: string, nome: string) => pedir<JuncaoDeAtracoes>('/api/correcoes/atracoes/juntar', { method: 'POST', body: JSON.stringify({ ids, fica, nome }) });
/** Aplica as propostas marcadas da pauta (#115): o servidor confere cada linha e grava no Teable. */
export const aplicarCorrecoes = (propostas: { id: string; de: string; mudouEm: string | null }[]) => pedir<AplicacaoDaCorrecao>('/api/correcoes/pauta/aplicar', { method: 'POST', body: JSON.stringify({ propostas }) });
/** Uma página do registro das correções aplicadas (#115). */
export const lerRegistroDeCorrecoes = (pagina = 1) => pedir<PaginaDoRegistro>(`/api/correcoes/registro?pagina=${pagina}`);
/** Desfaz as correções do registro (#115), com a conferência de "mudou desde então". */
export const desfazerCorrecoes = (ids: string[]) => pedir<Desfeitas>('/api/correcoes/desfazer', { method: 'POST', body: JSON.stringify({ ids }) });
/** Confere sem salvar nada. */
export const conferirConfiguracao = (m: MudancasDaConfiguracao) => pedir<ConferenciaDasPracas>('/api/configuracao/conferir', { method: 'POST', body: JSON.stringify(m) });
/** Confere de novo e salva (vale na hora). Com erro na conferência, nada é salvo: volta a conferência. */
export async function salvarConfiguracao(m: MudancasDaConfiguracao): Promise<{ secoes: SecoesDaConfiguracao } | { conferencia: ConferenciaDasPracas }> {
  const r = await fetch('/api/configuracao/salvar', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...cabecalhos }, body: JSON.stringify(m) });
  const corpo = (await r.json().catch(() => null)) as (Partial<SecoesDaConfiguracao> & { conferencia?: ConferenciaDasPracas; erro?: string }) | null;
  if (r.ok && corpo?.pracas && corpo.card && corpo.filmes && corpo.conexoes && corpo.turnos && corpo.turnosDaArte && corpo.teams) {
    // as regras novas valem na hora também neste navegador
    registrarPracas(corpo.pracas.salvo.pracas);
    return { secoes: { pracas: corpo.pracas, card: corpo.card, filmes: corpo.filmes, conexoes: corpo.conexoes, turnos: corpo.turnos, turnosDaArte: corpo.turnosDaArte, teams: corpo.teams, virada: corpo.virada } };
  }
  if (corpo?.conferencia) return { conferencia: corpo.conferencia };
  throw new Error(corpo?.erro ?? `O servidor não respondeu (${r.status}).`);
}

/* ---------- as ilhas (#124), no SQLite do PROMeiro ---------- */

/** O cadastro das ilhas, com o que quem está logado pode fazer nele. */
export interface CadastroDasIlhas {
  ilhas: Ilha[];
  podeCadastrar: boolean;
  podeRemover: boolean;
  /** quantas posições (de todos os dias) estão em cada ilha, pelo id (#165) */
  usos?: Record<string, number>;
}
export type IlhaNova = Pick<Ilha, 'tipo' | 'numero' | 'nome'>;
export const lerIlhas = () => pedir<CadastroDasIlhas>('/api/cadastros/ilhas');
export const cadastrarIlha = (i: IlhaNova) => pedir<{ ilha: Ilha }>('/api/cadastros/ilhas', { method: 'POST', body: JSON.stringify(i) }).then((r) => r.ilha);
export const mudarIlha = (id: string, i: IlhaNova) => pedir<{ ilha: Ilha }>(`/api/cadastros/ilhas/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(i) }).then((r) => r.ilha);
export const removerIlha = (id: string) => pedir<{ ok: true }>(`/api/cadastros/ilhas/${encodeURIComponent(id)}`, { method: 'DELETE' });
/** Junta a repetida na que fica (#165), só administradores: as posições passam, a que sai sai do cadastro. */
export const juntarIlhas = (fica: string, sai: string) => pedir<{ posicoes: number }>('/api/cadastros/ilhas/juntar', { method: 'POST', body: JSON.stringify({ fica, sai }) });
