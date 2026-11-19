/* Cache e avisos entre pessoas.
   Com REDIS_URL, guarda no Redis (compartilhado entre instâncias e entre reinícios) e usa o pub/sub dele
   para avisar todo mundo quando a fila muda. Sem Redis, ou se ele cair, tudo continua funcionando em memória:
   o Redis acelera e permite mais de uma instância, mas nunca é condição para o app funcionar. */

const PREFIXO = 'promeiro:';
const TENTAR_DE_NOVO_MS = 30_000;

async function abrirRedis(url) {
  const { createClient } = await import('redis');
  const opcoes = {
    url,
    // comando com o Redis fora do ar falha na hora, em vez de ficar na fila esperando: aí vale a memória
    disableOfflineQueue: true,
    socket: { connectTimeout: 3000, reconnectStrategy: (n) => Math.min(500 * (n + 1), 5000) },
  };
  const cliente = createClient(opcoes);
  const assinante = createClient(opcoes);
  let avisou = false;
  const erro = (e) => {
    if (avisou) return;
    avisou = true;
    console.error('[cache] Redis com problema, usando memória enquanto isso:', e.message);
  };
  cliente.on('error', erro);
  assinante.on('error', erro);
  cliente.on('ready', () => {
    if (avisou) console.log('[cache] Redis de volta');
    avisou = false;
  });
  const prazo = (p) => Promise.race([p, new Promise((_, nao) => setTimeout(() => nao(new Error('o Redis não respondeu em 4 s')), 4000))]);
  try {
    await prazo(Promise.all([cliente.connect(), assinante.connect()]));
  } catch (e) {
    await Promise.allSettled([cliente.disconnect(), assinante.disconnect()]);
    throw e;
  }
  return {
    get: (k) => cliente.get(k),
    set: (k, v, seg) => cliente.set(k, v, { EX: seg }),
    publicar: (canal, msg) => cliente.publish(canal, msg),
    assinar: (canal, fn) => assinante.subscribe(canal, fn),
    pronto: () => cliente.isReady && assinante.isReady,
    fechar: () => Promise.allSettled([cliente.quit(), assinante.quit()]),
  };
}

export function criarCache(env = {}, abrir = abrirRedis) {
  const memoria = new Map(); // chave → { valor, ate }
  const ouvintes = new Map(); // canal → Set<fn>
  let redis = null;
  let fechado = false;
  let espera = null;

  const entregar = (canal, msg) => {
    for (const fn of ouvintes.get(canal) ?? []) {
      try {
        fn(JSON.parse(msg));
      } catch (e) {
        console.error('[cache] aviso com problema:', e.message);
      }
    }
  };
  const usaRedis = () => !!redis && redis.pronto();

  async function ligar() {
    if (!env.REDIS_URL || fechado) return;
    try {
      const r = await abrir(env.REDIS_URL);
      if (fechado) return void r.fechar();
      for (const canal of ouvintes.keys()) await r.assinar(PREFIXO + canal, (m) => entregar(canal, m));
      redis = r;
      console.log('[cache] Redis ligado');
    } catch (e) {
      console.error(`[cache] Redis indisponível (${e.message}); usando memória e tentando de novo em 30 s`);
      espera = setTimeout(() => void ligar(), TENTAR_DE_NOVO_MS);
      espera.unref?.();
    }
  }
  const ligando = ligar();

  return {
    /** "redis" ou "memória", para o log e para a tela de diagnóstico. */
    get tipo() {
      return usaRedis() ? 'redis' : 'memória';
    },
    ligando,

    async ler(chave) {
      if (usaRedis()) {
        try {
          const v = await redis.get(PREFIXO + chave);
          return v === null ? undefined : JSON.parse(v);
        } catch {
          /* Redis caiu no meio: segue com a memória */
        }
      }
      const m = memoria.get(chave);
      if (!m) return undefined;
      if (m.ate < Date.now()) {
        memoria.delete(chave);
        return undefined;
      }
      return m.valor;
    },

    async guardar(chave, valor, segundos) {
      memoria.set(chave, { valor, ate: Date.now() + segundos * 1000 });
      if (memoria.size > 5000) memoria.delete(memoria.keys().next().value);
      if (usaRedis()) await redis.set(PREFIXO + chave, JSON.stringify(valor), segundos).catch(() => {});
    },

    /** Avisa todas as instâncias (e esta mesma) pelo canal. */
    async publicar(canal, dado) {
      const msg = JSON.stringify(dado);
      if (usaRedis()) {
        try {
          await redis.publicar(PREFIXO + canal, msg);
          return;
        } catch {
          /* sem Redis, o aviso fica só nesta instância */
        }
      }
      entregar(canal, msg);
    },

    assinar(canal, fn) {
      const novo = !ouvintes.has(canal);
      if (novo) ouvintes.set(canal, new Set());
      ouvintes.get(canal).add(fn);
      if (novo && redis) void redis.assinar(PREFIXO + canal, (m) => entregar(canal, m)).catch(() => {});
      return () => ouvintes.get(canal)?.delete(fn);
    },

    async fechar() {
      fechado = true;
      clearTimeout(espera);
      if (redis) await redis.fechar();
    },
  };
}
