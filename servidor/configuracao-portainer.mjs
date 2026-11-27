/* "Pode apagar do Portainer" (#79), a página ligada pelo rodapé da Configuração: o que o Portainer ainda tem e o que
   fazer com cada variável. Pode apagar: a que já tem o valor salvo na tela (o salvo vale por cima do Portainer) e a
   que o código não lê mais. Ainda não: a que não tem valor salvo (enquanto não tiver, a do Portainer continua valendo).
   Ficam: os segredos, a infraestrutura e a chave-mestra. Só entram as variáveis do PROMeiro que o Portainer tem com
   valor (as vazias não precisam de nada). */
import { TABELAS_DO_TEABLE } from '../src/modelo/tabelasDoTeable.ts';
import { PRACAS_DE_FABRICA, pracasDaConfiguracao } from '../src/modelo/pracas.ts';
import { SALVAVEIS } from './configuracao.mjs';
import { VARIAVEIS_DO_CARD } from './configuracao-card.mjs';
import { VARIAVEIS_DOS_FILMES } from './configuracao-filmes.mjs';

const SEGREDOS = ['TEABLE_TOKEN', 'TEABLE_PG_URL', 'TRELLO_KEY', 'TRELLO_TOKEN', 'TRELLO_SEGREDO', 'SFTP_SENHA', 'STIRLING_CHAVE', 'TUNNEL_TOKEN', 'GITHUB_TOKEN', 'POSTER_PUBLICO_TOKEN', 'TEAMS_PAUTA_URL', 'EDICAO_FOTO_TOKEN'];
const INFRAESTRUTURA = [
  'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'PERFIL_LOCAL', 'ACESSO', 'PROMEIRO_URL', 'PORTA', 'BACKUPS', 'REDE_TEABLE', 'REDE_N8N',
  'REDIS_URL', 'COMPOSE_PROFILES', 'TEABLE_URL', 'SFTP_HOST', 'SFTP_USUARIO', 'STIRLING_URL', 'N8N_FILMES_LER', 'FILMES_PASTA',
  // o Andamento do projeto (#92): o repositório e a branch lidos no GitHub
  'GITHUB_REPO', 'GITHUB_BRANCH',
  // o aviso do Trello (#87), desligado por padrão (ADR 0006: o PROMeiro só escreve no Trello; lê do Teable)
  'TRELLO_AVISO',
  // só no código, com padrão (aparecem se alguém pôs no Portainer)
  'SFTP_PASTA', 'SFTP_PORTA', 'TRELLO_API', 'CONFERIR_ORIGEM', 'FILMES_PRESENCA_MS', 'TEABLE_CAMPO_NOME', 'TEABLE_CAMPO_CATEGORIA',
  'TEABLE_CAMPO_ATRACAO', 'TEABLE_CAMPO_CHAVE', 'TEABLE_CAMPO_REDATOR', 'TEABLE_CAMPO_EDITOR', 'TEABLE_CAMPOS_CAMINHO',
];
const CHAVE_MESTRA = ['CADASTRO_ADMINS'];
const POR_QUE_FICA = Object.fromEntries([...SEGREDOS.map((n) => [n, 'segredo']), ...INFRAESTRUTURA.map((n) => [n, 'infraestrutura']), ...CHAVE_MESTRA.map((n) => [n, 'chave-mestra'])]);

/** As variáveis que ficam no Portainer: segredos, infraestrutura e a chave-mestra. */
export const FICAM_NO_PORTAINER = new Set(Object.keys(POR_QUE_FICA));

/** As que o código não lê mais (e o porquê): os nomes das tabelas no Postgres (vêm do Teable, #76) e as obsoletas. */
function naoLidaMais(nome, portainer) {
  if (/^TEABLE_PG_/.test(nome) && nome !== 'TEABLE_PG_URL' && nome !== 'TEABLE_PG_ESQUEMA') return 'o PROMeiro não lê mais: o nome no Postgres vem do Teable';
  if (nome === 'TEABLE_PAUTA_VISAO') return 'o PROMeiro não lê mais: a pauta é lida dos últimos 45 dias';
  if (nome === 'TEABLE_TOKEN_ESCRITA') return limpo(portainer.TEABLE_TOKEN) ? 'o PROMeiro não lê mais: o TEABLE_TOKEN lê e grava' : null;
  return null;
}
const limpo = (v) => String(v ?? '').trim();

/** As variáveis de cada praça de fábrica (a coleção PRACAS as substitui). */
const DAS_PRACAS = new Set(['TRELLO_PRACAS', 'TRELLO_CAMPO_PRACA', ...PRACAS_DE_FABRICA.flatMap((p) => [`TRELLO_LISTA_${p.sigla}`, `TRELLO_SAIDA_${p.sigla}`])]);
const DO_CARD = new Set(VARIAVEIS_DO_CARD);
const DOS_FILMES = new Set(VARIAVEIS_DOS_FILMES);
const DA_TABELA = new Map(TABELAS_DO_TEABLE.filter((t) => t.variavel).map((t) => [t.variavel, t.nome]));
const secaoDa = (nome) => (DO_CARD.has(nome) ? 'Card' : DOS_FILMES.has(nome) ? 'Filmes' : nome === 'ADMINISTRADORES' ? 'Pessoas' : nome === 'DUPLICADAS_SO_OLHAR' ? 'Duplicadas (Cadastros)' : nome === 'TEAMS_HORARIOS' ? 'Cartão do Teams' : nome === 'TURNOS' ? 'Turnos' : nome === 'PAUTA_NO_TEABLE' ? 'Pauta no Teable' : 'Conexões');
/** Por que a salvável ainda não pode sair (o salvo ainda não existe): o que a guarda na tela. */
const semValor = (nome) =>
  nome === 'TRELLO_QUADRO' || nome === 'TEABLE_PG_ESQUEMA'
    ? 'sem valor salvo: Conexões guarda ao trocar'
    : nome === 'TRELLO_LISTA_ENTREGUES'
      ? 'a tela ainda não guarda esta'
      : `sem valor salvo em ${secaoDa(nome)}`;

/**
 * A lista da página, para uma variável do Portainer com valor: pode apagar ({ porque }), ainda não ({ porque }) ou
 * fica ({ porque: 'segredo' | 'infraestrutura' | 'chave-mestra' }).
 * @param portainer as variáveis de ambiente (só se olham as do PROMeiro, com valor)
 * @param salvos os nomes que têm valor salvo na tela; valores a configuração de agora (o salvo por cima)
 * @param descoberta as tabelas do Teable achadas na base (a última leitura), ou null
 * @returns { podeApagar, aindaNao, ficam }: [{ nome, porque }], cada uma na ordem do nome
 */
export function listaDoPortainer({ portainer, salvos, valores, descoberta }) {
  const r = { podeApagar: [], aindaNao: [], ficam: [] };
  const pracas = salvos.has('PRACAS') ? pracasDaConfiguracao(valores) : null;
  for (const nome of Object.keys(portainer).sort()) {
    if (!limpo(portainer[nome])) continue;
    if (FICAM_NO_PORTAINER.has(nome)) {
      r.ficam.push({ nome, porque: POR_QUE_FICA[nome] });
      continue;
    }
    const obsoleta = naoLidaMais(nome, portainer);
    if (obsoleta) {
      r.podeApagar.push({ nome, porque: obsoleta });
      continue;
    }
    if (nome === 'TEABLE_TOKEN_ESCRITA') {
      r.aindaNao.push({ nome, porque: 'ponha o token no TEABLE_TOKEN antes: hoje é este que vale' });
      continue;
    }
    if (DAS_PRACAS.has(nome) || nome === 'TRELLO_LISTA') {
      if (nome === 'TRELLO_LISTA') {
        // a reserva: a praça sem entrada vai para ela (com as praças salvas, cada uma diz a sua)
        const sem = (pracas ?? pracasDaConfiguracao(valores)).filter((p) => !limpo(p.entrada)).map((p) => p.sigla);
        if (salvos.has(nome) || (pracas && !sem.length)) r.podeApagar.push({ nome, porque: 'toda praça tem a sua entrada, salva em Praças' });
        else r.aindaNao.push({ nome, porque: sem.length ? `é a reserva de quem não tem entrada: ${sem.join(', ')}` : 'sem valor salvo em Praças' });
      } else if (pracas || salvos.has(nome)) r.podeApagar.push({ nome, porque: 'salva em Praças' });
      else r.aindaNao.push({ nome, porque: 'sem valor salvo em Praças' });
      continue;
    }
    if (DA_TABELA.has(nome)) {
      const tabela = DA_TABELA.get(nome);
      const achada = descoberta?.tabelas?.find((t) => t.nome === tabela && t.id);
      if (salvos.has(nome) || achada) r.podeApagar.push({ nome, porque: salvos.has(nome) ? 'salva em Conexões' : `a tabela ${tabela} é achada pelo nome na base` });
      else r.aindaNao.push({ nome, porque: `a tabela ${tabela} não está na base: o id daqui ainda é o que vale` });
      continue;
    }
    if (nome === 'TEABLE_FILMES_POSTER') {
      const pelaBase = !!descoberta?.posterPeloNome && descoberta.posterPeloNome === descoberta.poster;
      if (salvos.has(nome) || pelaBase) r.podeApagar.push({ nome, porque: salvos.has(nome) ? 'salva em Conexões' : 'o campo poster é achado pelo nome na tabela filmes' });
      else r.aindaNao.push({ nome, porque: 'o campo do pôster não se chama poster: o id daqui ainda é o que vale' });
      continue;
    }
    if (!SALVAVEIS.has(nome)) continue;
    if (salvos.has(nome)) r.podeApagar.push({ nome, porque: `salva em ${secaoDa(nome)}` });
    else r.aindaNao.push({ nome, porque: semValor(nome) });
  }
  return r;
}
