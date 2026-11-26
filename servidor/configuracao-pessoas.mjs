/* A seção Pessoas da Configuração (#77): os designers que aparecem na produção da arte do Teable comparados com a
   tabela designers (quem entrou, quem saiu), cadastrar como designer, marcar inativo, ignorar e desfazer. As regras sem
   rede ficam em src/modelo/pessoas.ts; aqui, a leitura e a gravação. A última verificação fica guardada no SQLite (o
   pontinho do menu do perfil sai dela, sem ler o Teable a cada pedido), e o que foi ignorado também, até alguém
   desfazer. Nada do Trello (ADR 0006: por enquanto o PROMeiro só ESCREVE no Trello; lê do Teable): antes eram os
   membros do quadro. */
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { DIAS_DAS_PESSOAS, novidadesDaProducao } from '../src/modelo/pessoas.ts';
import { opcaoDe } from './cadastros.mjs';

// (a chave guardada é a de antes, quando a fonte era o quadro: a última verificação continua valendo na subida)
const GUARDADA = 'pessoas-do-quadro';
const POR_PAGINA = 1000;
const limpo = (v) => String(v ?? '').trim().replace(/^["'`]+|["'`]+$/g, '');

/**
 * @param db o SQLite do PROMeiro (a tabela `pessoas_ignoradas` é criada aqui)
 * @param copia { ler(chave), guardar(chave, dados) }: a última verificação
 * @param buscar fetch (o Teable de verdade ou um falso)
 */
export function criarPessoas({ db, copia, buscar = fetch }) {
  db.exec('CREATE TABLE IF NOT EXISTS pessoas_ignoradas (chave TEXT PRIMARY KEY, nome TEXT NOT NULL, por TEXT, em TEXT NOT NULL)');
  // o e-mail digitado ao tornar administrador quem entrou (pela chave da novidade): vai junto no cadastro de designer
  db.exec('CREATE TABLE IF NOT EXISTS pessoas_emails (membro TEXT PRIMARY KEY, email TEXT NOT NULL)');
  const q = {
    ignoradas: db.prepare('SELECT chave, nome, por, em FROM pessoas_ignoradas'),
    ignorar: db.prepare('INSERT OR REPLACE INTO pessoas_ignoradas (chave, nome, por, em) VALUES (?, ?, ?, ?)'),
    desfazer: db.prepare('DELETE FROM pessoas_ignoradas WHERE chave = ?'),
    email: db.prepare('SELECT email FROM pessoas_emails WHERE membro = ?'),
    lembrarEmail: db.prepare('INSERT OR REPLACE INTO pessoas_emails (membro, email) VALUES (?, ?)'),
    esquecerEmail: db.prepare('DELETE FROM pessoas_emails WHERE membro = ?'),
  };

  const doTeable = (env) => ({ url: limpo(env.TEABLE_URL).replace(/\/+$/, ''), token: limpo(env.TEABLE_TOKEN || env.TEABLE_TOKEN_ESCRITA), tabela: env.tabelas?.designers?.id ?? '' });
  async function teable(env, metodo, caminho, corpo) {
    const { url, token } = doTeable(env);
    const r = await buscar(`${url}/api${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'o token do Teable não tem permissão na tabela designers' : `o Teable respondeu ${r.status} na tabela designers`);
    return r.json().catch(() => ({}));
  }

  /** A tabela designers: [{ registro, nome, ativo, email, idNoTrello }]. Só "inativo" no status tira de ativo. */
  async function lerDesigners(env) {
    const { tabela } = doTeable(env);
    const todos = [];
    for (let pular = 0; pular < 20 * POR_PAGINA; pular += POR_PAGINA) {
      const r = await teable(env, 'GET', `/table/${encodeURIComponent(tabela)}/record?fieldKeyType=name&take=${POR_PAGINA}&skip=${pular}`);
      const pagina = Array.isArray(r.records) ? r.records : [];
      todos.push(
        ...pagina.map((x) => {
          const f = x.fields ?? {};
          const criadoEm = Date.parse(String(x.createdTime ?? '')) ? new Date(String(x.createdTime)).toISOString() : null;
          return { registro: String(x.id ?? ''), nome: String(f.designer ?? '').trim(), ativo: nomeComparavel(opcaoDe(f.status)) !== 'INATIVO', email: String(f.email ?? '').trim().toLowerCase(), idNoTrello: String(f.designer_ID ?? '').trim(), criadoEm };
        }),
      );
      if (pagina.length < POR_PAGINA) break;
    }
    return todos;
  }

  /** Os designers que aparecem na produção da arte dos últimos dias: [{ nome, ultima }] (servidor/trello.mjs). */
  async function lerDaProducao(trello) {
    const lidos = await trello.designersDaProducao(DIAS_DAS_PESSOAS);
    if (!lidos) throw new Error('a produção da arte do Teable não está configurada');
    return lidos;
  }

  /** O que falta para verificar ('' quando dá). */
  function falta(trello, env) {
    const { url, token, tabela } = doTeable(env);
    if (!url || !token) return 'O Teable não está configurado (TEABLE_URL e TEABLE_TOKEN).';
    if (!tabela) return 'Não achei a tabela designers na base do Teable.';
    if (!(trello?.designersDaProducao && trello.temProducao)) return 'A produção da arte do Teable não está configurada (TEABLE_PG_URL e a ARTE_producao na base).';
    return '';
  }

  const ignoradas = () => new Map(q.ignoradas.all().map((l) => [l.chave, l]));
  /** O e-mail de quem entrou: o que veio na novidade ou o digitado ao tornar administrador ('' sem nenhum). */
  const emailDe = (novidade) => novidade.email || (q.email.get(novidade.chave)?.email ?? (novidade.membro ? (q.email.get(novidade.membro)?.email ?? '') : ''));

  return {
    /**
     * Lê os designers da produção da arte e a tabela designers (os dois no Teable) e guarda o que mudou. Com o Teable
     * fora, guarda o erro e mantém as novidades da última verificação que deu certo; `falhou` diz que foi o Teable.
     * @returns { em, novidades, designers, falhou, erro?, motivo? }
     */
    async verificar(trello, env) {
      const antes = copia.ler(GUARDADA)?.dados ?? null;
      const semPoder = falta(trello, env);
      if (semPoder) return { em: '', novidades: [], designers: [], erro: semPoder };
      const agora = Date.now();
      const [naProducao, designers] = await Promise.allSettled([lerDaProducao(trello), lerDesigners(env)]);
      if (naProducao.status === 'fulfilled' && designers.status === 'fulfilled') {
        const desde = agora - DIAS_DAS_PESSOAS * 86_400_000;
        const feita = { em: new Date(agora).toISOString(), novidades: novidadesDaProducao(naProducao.value, designers.value, { desde }), designers: designers.value };
        copia.guardar(GUARDADA, feita);
        return { ...feita, falhou: [] };
      }
      // #79: o Teable não respondeu, para a tela dizer desde quando e travar o que grava
      const e = naProducao.status === 'rejected' ? naProducao.reason : designers.reason;
      const motivo = e instanceof Error ? e.message : String(e);
      console.warn(`[pessoas] não consegui ver os designers: ${motivo}`);
      return { ...(antes ?? { em: '', novidades: [], designers: [] }), erro: `Não consegui ver a produção da arte e a tabela designers do Teable: ${motivo}.`, falhou: ['teable'], motivo };
    },
    /** A última verificação guardada (sem ler o Teable). */
    guardada: () => copia.ler(GUARDADA)?.dados ?? null,
    /** As novidades, separadas em pendentes e ignoradas. */
    separar(novidades) {
      const ign = ignoradas();
      return {
        pendentes: novidades.filter((n) => !ign.has(n.chave)),
        ignoradas: novidades.filter((n) => ign.has(n.chave)).map((n) => ({ ...n, por: ign.get(n.chave).por ?? '', em: ign.get(n.chave).em })),
      };
    },
    emailDe,
    /** Lembra o e-mail digitado para quem entrou, pela chave da novidade. */
    lembrarEmail: (chave, email) => chave && q.lembrarEmail.run(chave, String(email).trim().toLowerCase()),
    ignorar: (novidade, por) => q.ignorar.run(novidade.chave, novidade.nome, por, new Date().toISOString()),
    desfazer: (chave) => q.desfazer.run(chave),

    /** Cadastra quem entrou como designer: ativo, o nome (como aparece na produção da arte) e o e-mail digitado ao
        tornar administrador, quando há. O id do membro no Trello, só quando a novidade tem (a produção não diz). */
    async cadastrar(env, novidade) {
      const email = emailDe(novidade);
      const fields = { designer: novidade.nome, status: 'ativo', ...(novidade.membro ? { designer_ID: novidade.membro } : {}), ...(email ? { email } : {}) };
      await teable(env, 'POST', `/table/${encodeURIComponent(doTeable(env).tabela)}/record`, { fieldKeyType: 'name', typecast: true, records: [{ fields }] });
      // cadastrado como designer, o e-mail está na tabela: não precisa mais ser lembrado aqui
      q.esquecerEmail.run(novidade.chave);
    },
    /** Marca como inativo o designer que saiu (sem produção nos últimos dias). */
    async inativar(env, novidade) {
      await teable(env, 'PATCH', `/table/${encodeURIComponent(doTeable(env).tabela)}/record/${encodeURIComponent(novidade.registro)}`, { fieldKeyType: 'name', typecast: true, record: { fields: { status: 'inativo' } } });
    },
  };
}
