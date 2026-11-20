import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco, criarApp, fazerBackup } from './app.mjs';
import { configDoTrello, faltasDoTrello } from './trello.mjs';
import { criarVocabulario } from './vocabulario.mjs';
import { criarPauta } from './pauta.mjs';
import { criarCache } from './cache.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const dados = process.env.DADOS ?? join(aqui, '..', 'dados');
const porta = Number(process.env.PORT ?? 80);
mkdirSync(dados, { recursive: true });

const db = abrirBanco(join(dados, 'roteirista.db'));
const backup = () => {
  try {
    const feito = fazerBackup(db, join(dados, 'backup'), Number(process.env.BACKUPS ?? 14));
    if (feito) console.log('backup:', feito);
  } catch (e) {
    console.error('backup falhou:', e.message);
  }
};
backup();
setInterval(backup, 60 * 60 * 1000).unref();

const cache = criarCache(process.env);
const app = criarApp({ db, cache, estaticos: process.env.ESTATICOS ?? join(aqui, '..', 'dist') });
const servidor = createServer(app);
servidor.on('upgrade', app.upgrade);
servidor.listen(porta, () =>
  console.log(`PROMeiro em http://localhost:${porta} · dados em ${dados}`),
);
// diz no log, logo na partida, se a ligação com o Teable está de pé
{
  const faltam = ['TEABLE_URL', 'TEABLE_TOKEN', 'TEABLE_ATRACOES'].filter((n) => !process.env[n]);
  if (faltam.length) console.log(`[vocabulário] Teable desligado: falta ${faltam.join(', ')}. Vale a lista embutida.`);
  else
    criarVocabulario(process.env, fetch, cache)
      .ler()
      .then((v) => console.log(`[vocabulário] Teable em ${process.env.TEABLE_URL}: ${v.programas.length} atrações, ${v.redatores.length} redatores, ${v.editores.length} editores, ${v.pauta.length} claquetes na pauta`));
}
// variáveis que não são mais usadas: o log diz o que fazer com elas
for (const [antiga, aviso] of [
  ['TEABLE_TOKEN_ESCRITA', 'agora o TEABLE_TOKEN lê e grava; ponha o token com escrita nele e apague esta'],
  ['TEABLE_PAUTA_VISAO', 'a pauta é lida do mais novo para o mais antigo, até 45 dias; pode apagar'],
])
  if (process.env[antiga]) console.log(`[config] ${antiga} não é mais usada: ${aviso}.`);
if (!process.env.REDIS_URL) console.log('[cache] sem REDIS_URL: cache e avisos da fila em memória (serve para uma instância só)');
{
  const c = configDoTrello(process.env);
  const faltam = faltasDoTrello(c);
  if (faltam === null) console.log('[trello] envio desligado (sem TRELLO_KEY e TRELLO_TOKEN)');
  else if (faltam.length) console.log(`[trello] envio desligado: falta ${faltam.join(', ')}`);
  else {
    const sem = [
      !c.pg.producao && 'TEABLE_PG_ARTE (sem conferir duplicados)',
      !c.teable.producao && 'TEABLE_ARTE_PRODUCAO (sem registrar a entrada)',
      !c.sftp.host && 'SFTP_HOST (sem cópia no OneDrive)',
      c.pgInvalidos.length && `nomes inválidos no Postgres (${c.pgInvalidos.join(', ')}): use só letras, números e _`,
    ].filter(Boolean);
    console.log(`[trello] envio ligado${sem.length ? `; sem ${sem.join(', ')}` : ''}`);
    // a API key do Trello tem 32 caracteres; o token, 64 ou mais (começa com ATTA). Fora disso, quase sempre foi colado o campo errado
    if (!/^[0-9a-f]{32}$/i.test(c.chave)) console.log(`[trello] TRELLO_KEY tem ${c.chave.length} caracteres: a API key do Trello tem 32 (letras e números). Confira se não foi o "Secret" ou o token no lugar dela.`);
    if (c.token.length < 64) console.log(`[trello] TRELLO_TOKEN tem ${c.token.length} caracteres: o token do Trello tem 64 ou mais. Confira se foi o token, e não a key ou o Secret.`);
  }
}
// como sai o PDF do card, e se o acervo de artes está ligado
{
  const e = process.env;
  console.log(
    e.STIRLING_URL
      ? `[pdf] Word e RTF convertidos pelo Stirling em ${e.STIRLING_URL}${e.STIRLING_CHAVE ? ' (com chave)' : ' (sem STIRLING_CHAVE: se o Stirling pedir chave, a conversão falha e vai o PDF do texto do original)'}`
      : '[pdf] sem STIRLING_URL: o PDF do card sai do texto do original, com o sublinhado do redator',
  );
  if (e.TEABLE_PG_ACERVO || e.TEABLE_ACERVO)
    console.log(`[acervo] ${e.TEABLE_PG_ACERVO && e.TEABLE_ACERVO ? 'ligado' : `falta ${e.TEABLE_PG_ACERVO ? 'TEABLE_ACERVO (para gravar)' : 'TEABLE_PG_ACERVO (para ler)'}`}`);
}
void criarPauta(process.env, criarVocabulario(process.env))
  .testar()
  .then((m) => m && console.log(`[pauta] ${m}`));

for (const sinal of ['SIGINT', 'SIGTERM'])
  process.on(sinal, () => {
    void app.fechar().finally(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  });
