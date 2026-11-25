// Manutenção (#47): corrige a data de exibição dos roteiros que ainda estão na fila e foram importados antes da
// correção do "D-M-V" ("5-12-2" lido como 12/02). Sem --aplicar, só lista; com --aplicar, grava só os listados.
//   node --experimental-strip-types servidor/corrigir-datas.mjs [--aplicar]
// O banco é o do servidor: $DADOS/roteirista.db (sem DADOS, a pasta dados/ do repositório).
//
// A regra da data é a do navegador: o módulo é o próprio src/modelo/vocabularios.ts, lido pelo Node sem os tipos.
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Y from 'yjs';
import { abrirBanco, copiarMetaParaYdoc } from './app.mjs';
import { criarCache } from './cache.mjs';
import { claqueteDoArquivo, dataDaClaquete, lerDataDaClaquete, registrarVocabulario } from '../src/modelo/vocabularios.ts';

/** Estados de envio que tiram o roteiro da fila (ou o põem a caminho do Trello): esses não se mexem. */
const NO_TRELLO = new Set(['enviado', 'duplicado', 'enviando']);
const MOTIVO = 'data corrigida (manutenção)';

/** A claquete sem separadores, para ver se ela ainda é a que saiu do nome do arquivo (só a barra mudaria). */
const semSeparadores = (s) => s.toUpperCase().replace(/[\s/_.-]+/g, ' ').trim();
const diaMes = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? iso.slice(5) : '');

/**
 * A data gravada saiu dos números da claquete ou do nome do arquivo? É a marca do bug: "5-12-2" virou 12/02 e
 * "FORMULA 1/5-12-2" virou 1/5, sempre dois números vizinhos. A data tirada do texto do roteiro não tem essa marca.
 */
function saiuDosNumeros(iso, textos) {
  const [, mes, dia] = iso.split('-').map(Number);
  return textos.some((t) => {
    const n = (t.match(/\d+/g) ?? []).map(Number);
    return n.some((x, i) => x === dia && n[i + 1] === mes);
  });
}

/**
 * A claquete e a data pelas regras de hoje. Quando a claquete ainda é a do nome do arquivo (os mesmos números e
 * letras, só a barra de fora ou no lugar errado), vale a claquete refeita do nome; senão, a própria claquete, com a
 * data reescrita com a barra.
 */
function pelaRegraAtual(claquete, arquivo, criadoEm) {
  const doArquivo = arquivo ? claqueteDoArquivo(arquivo) : '';
  let nova = doArquivo && semSeparadores(doArquivo) === semSeparadores(claquete) ? doArquivo : claquete;
  const lida = lerDataDaClaquete(nova);
  if (!lida) return null;
  if (!nova.slice(lida.inicio, lida.fim).includes('/')) nova = nova.slice(0, lida.inicio) + lida.comBarra + nova.slice(lida.fim);
  // o ano: o mesmo da claquete digitada, contado do dia em que o roteiro chegou
  return { claquete: nova, data: dataDaClaquete(nova, new Date(criadoEm)) };
}

/**
 * Os roteiros da fila (sem envio ao Trello) com a data de exibição diferente da lida da claquete, e quantos ficaram
 * de fora por motivo. Só lê o banco.
 */
export function listarDatasErradas(db) {
  const vocabulario = db.prepare("SELECT dados FROM teable_copia WHERE chave = 'vocabulario'").get();
  // os nomes de atração dos cadastros (a última leitura boa do Teable): os números deles não entram na data
  registrarVocabulario(vocabulario ? JSON.parse(vocabulario.dados) : null);
  const linhas = db
    .prepare(
      `SELECT r.id, r.meta, r.criado_em, e.estado, o.nome AS arquivo,
              (SELECT v.meta FROM versoes v WHERE v.roteiro_id = r.id ORDER BY v.n ASC LIMIT 1) AS importado
       FROM roteiros r LEFT JOIN envios e ON e.roteiro_id = r.id LEFT JOIN originais o ON o.roteiro_id = r.id
       ORDER BY r.criado_em, r.id`,
    )
    .all();
  const fora = { enviados: 0, semData: 0, certos: 0, mudadaAMao: 0, outraFonte: 0 };
  const lista = [];
  for (const l of linhas) {
    if (NO_TRELLO.has(l.estado)) {
      fora.enviados++;
      continue;
    }
    const meta = JSON.parse(l.meta);
    const claquete = String(meta.claquete ?? '');
    const gravada = String(meta.dataExibicao ?? '');
    const atual = pelaRegraAtual(claquete, l.arquivo, l.criado_em);
    if (!atual) {
      fora.semData++;
      continue;
    }
    if (diaMes(gravada) === diaMes(atual.data)) {
      fora.certos++;
      continue;
    }
    // a primeira versão é o roteiro como chegou: data diferente da de agora é mudança feita depois da importação
    const importado = l.importado ? JSON.parse(l.importado) : null;
    if (importado && String(importado.dataExibicao ?? '') !== gravada) {
      fora.mudadaAMao++;
      continue;
    }
    if (gravada && !saiuDosNumeros(gravada, [claquete, l.arquivo ?? ''])) {
      fora.outraFonte++;
      continue;
    }
    lista.push({
      id: l.id,
      claquete,
      gravada,
      nova: atual.data,
      claqueteNova: atual.claquete !== claquete ? atual.claquete : '',
      aviso: importado ? '' : 'sem histórico da importação: confira se a data não foi mudada à mão',
    });
  }
  return { lista, fora };
}

/** Grava a data (e a claquete com a barra) dos listados, numa transação. Devolve quantos gravou. */
export function aplicarCorrecoes(db, lista) {
  const agora = new Date().toISOString();
  const um = db.prepare('SELECT meta, doc, ydoc FROM roteiros WHERE id = ?');
  const gravar = db.prepare('UPDATE roteiros SET meta = ?, atualizado_em = ? WHERE id = ?');
  const gravarYdoc = db.prepare('UPDATE roteiros SET ydoc = ? WHERE id = ?');
  const ultima = db.prepare('SELECT MAX(n) AS n FROM versoes WHERE roteiro_id = ?');
  const versao = db.prepare('INSERT INTO versoes (roteiro_id, n, criado_em, por_email, por_nome, motivo, meta, doc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const item of lista) {
      const l = um.get(item.id);
      if (!l) continue;
      const meta = { ...JSON.parse(l.meta), dataExibicao: item.nova, ...(item.claqueteNova ? { claquete: item.claqueteNova } : {}) };
      const json = JSON.stringify(meta);
      gravar.run(json, agora, item.id);
      versao.run(item.id, (ultima.get(item.id)?.n ?? 0) + 1, agora, '', 'Manutenção', MOTIVO, json, l.doc);
      // o documento compartilhado do editor guarda os metadados também: sem isso, a próxima abertura traria a data antiga
      if (l.ydoc) {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, l.ydoc);
        if (copiarMetaParaYdoc(doc, meta)) gravarYdoc.run(Y.encodeStateAsUpdate(doc), item.id);
      }
      n++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return n;
}

/** Avisa a fila pelo Redis (o mesmo canal do servidor). Sem Redis, de fora do processo do servidor não há como. */
async function avisarPeloRedis(ids, env) {
  if (!env.REDIS_URL) return 'sem-redis';
  const cache = criarCache(env);
  try {
    await cache.ligando;
    if (cache.tipo !== 'redis') return 'sem-redis';
    for (const id of ids) await cache.publicar('fila', { tipo: 'alterado', id, por: 'manutencao' });
    return 'avisado';
  } finally {
    await cache.fechar();
  }
}

const dataBr = (iso) => (iso ? iso.split('-').reverse().join('/') : '(vazia)');

/** O comando: lista e, com --aplicar, grava. `avisar` e `escrever` são as costuras dos testes. */
export async function corrigirDatas({ db, argv = [], env = process.env, escrever = console.log, avisar = (ids) => avisarPeloRedis(ids, env) }) {
  const aplicar = argv.includes('--aplicar');
  const { lista, fora } = listarDatasErradas(db);
  for (const i of lista)
    escrever(
      [`${i.id}  ${i.claquete || '(sem claquete)'}  ${i.gravada || '(vazia)'} → ${i.nova} (${dataBr(i.nova)})`, i.claqueteNova && `claquete: ${i.claqueteNova}`, i.aviso && `aviso: ${i.aviso}`]
        .filter(Boolean)
        .join('  ·  '),
    );
  escrever(
    `${lista.length} ${lista.length === 1 ? 'roteiro' : 'roteiros'} com a data errada na fila. De fora: ${fora.enviados} no Trello, ` +
      `${fora.semData} sem data na claquete, ${fora.certos} com a data certa, ${fora.mudadaAMao} com a data mudada depois da importação, ` +
      `${fora.outraFonte} com a data de outra fonte (o texto do roteiro).`,
  );
  if (!aplicar) {
    if (lista.length) escrever('Nada foi gravado. Para gravar estes, rode de novo com --aplicar.');
    return { lista, fora, gravados: 0 };
  }
  const gravados = aplicarCorrecoes(db, lista);
  escrever(`Gravei ${gravados} ${gravados === 1 ? 'roteiro' : 'roteiros'}.`);
  if (gravados) {
    const aviso = await avisar(lista.map((i) => i.id)).catch(() => 'sem-redis');
    escrever(aviso === 'avisado' ? 'A fila foi avisada e se atualiza sozinha.' : 'Não deu para avisar a fila daqui: ela mostra as datas novas ao recarregar a página.');
  }
  return { lista, fora, gravados };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dados = process.env.DADOS ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dados');
  const db = abrirBanco(join(dados, 'roteirista.db'));
  // o servidor está rodando no mesmo banco: espera a vez em vez de falhar se ele estiver gravando
  db.exec('PRAGMA busy_timeout = 5000');
  try {
    await corrigirDatas({ db, argv: process.argv.slice(2) });
  } finally {
    db.close();
  }
}
