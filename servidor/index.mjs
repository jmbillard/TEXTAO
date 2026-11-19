import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco, criarApp, fazerBackup } from './app.mjs';
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
if (!process.env.REDIS_URL) console.log('[cache] sem REDIS_URL: cache e avisos da fila em memória (serve para uma instância só)');
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
