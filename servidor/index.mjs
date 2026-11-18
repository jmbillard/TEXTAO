import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco, criarApp, fazerBackup } from './app.mjs';

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

const app = criarApp({ db, estaticos: process.env.ESTATICOS ?? join(aqui, '..', 'dist') });
const servidor = createServer(app);
servidor.on('upgrade', app.upgrade);
servidor.listen(porta, () =>
  console.log(`Roteirista em http://localhost:${porta} · dados em ${dados}`),
);
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => (db.close(), process.exit(0)));
