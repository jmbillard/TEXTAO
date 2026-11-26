/* A seção Pessoas da Configuração (#77): os membros do quadro do Trello comparados com a tabela designers do Teable
   (quem entrou, quem saiu), cadastrar como designer, marcar inativo, ignorar e desfazer. As regras sem rede ficam em
   src/modelo/pessoas.ts; aqui, a leitura e a gravação. A última verificação fica guardada no SQLite (o pontinho do menu
   do perfil sai dela, sem ir ao Trello a cada pedido), e o que foi ignorado também, até alguém desfazer. Os membros do
   quadro são a fonte por enquanto (ADR 0006): o que sai daqui é "designer", não "membro do Trello". */
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { novidadesDoQuadro } from '../src/modelo/pessoas.ts';
import { lerIdDoQuadro, pracasSalvas } from './configuracao-pracas.mjs';
import { opcaoDe } from './cadastros.mjs';

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
  // o e-mail digitado para quem o Trello não dá (ao tornar administrador): vai junto no cadastro de designer
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
          return { registro: String(x.id ?? ''), nome: String(f.designer ?? '').trim(), ativo: nomeComparavel(opcaoDe(f.status)) !== 'INATIVO', email: String(f.email ?? '').trim().toLowerCase(), idNoTrello: String(f.designer_ID ?? '').trim() };
        }),
      );
      if (pagina.length < POR_PAGINA) break;
    }
    return todos;
  }

  /** Os membros do quadro de agora: [{ id, nome, email }] (o e-mail só quando o Trello dá). */
  async function lerMembros(trello, env) {
    const id = await lerIdDoQuadro(trello, env, pracasSalvas(env).pracas);
    if (!id) throw new Error('não sei qual é o quadro do Trello (falta TRELLO_QUADRO ou uma lista configurada)');
    const lidos = await trello.ler(`/boards/${id}/members`, { fields: 'fullName,username,email' });
    return (Array.isArray(lidos) ? lidos : [])
      .map((m) => ({ id: String(m.id ?? ''), nome: String(m.fullName || m.username || '').trim(), email: String(m.email ?? '').trim().toLowerCase() }))
      .filter((m) => m.id && m.nome);
  }

  /** O que falta para verificar ('' quando dá). */
  function falta(trello, env) {
    const { url, token, tabela } = doTeable(env);
    if (!url || !token) return 'O Teable não está configurado (TEABLE_URL e TEABLE_TOKEN).';
    if (!tabela) return 'Não achei a tabela designers na base do Teable.';
    if (!(trello?.ler && trello.config?.chave && trello.config?.token)) return 'O Trello não está configurado (TRELLO_KEY e TRELLO_TOKEN no Portainer).';
    return '';
  }

  const ignoradas = () => new Map(q.ignoradas.all().map((l) => [l.chave, l]));
  /** O e-mail de quem entrou: o do Trello ou o digitado ao tornar administrador ('' sem nenhum). */
  const emailDe = (novidade) => novidade.email || (novidade.membro ? (q.email.get(novidade.membro)?.email ?? '') : '');

  return {
    /**
     * Lê os membros do quadro e a tabela designers e guarda o que mudou. Com o Trello ou o Teable fora, guarda o erro
     * e mantém as novidades da última verificação que deu certo.
     * @returns { em, novidades, designers, erro? }
     */
    async verificar(trello, env) {
      const antes = copia.ler(GUARDADA)?.dados ?? null;
      const semPoder = falta(trello, env);
      if (semPoder) return { em: '', novidades: [], designers: [], erro: semPoder };
      try {
        const [membros, designers] = await Promise.all([lerMembros(trello, env), lerDesigners(env)]);
        const feita = { em: new Date().toISOString(), novidades: novidadesDoQuadro(membros, designers), designers };
        copia.guardar(GUARDADA, feita);
        return feita;
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        console.warn(`[pessoas] não consegui ver os membros do quadro: ${motivo}`);
        return { ...(antes ?? { em: '', novidades: [], designers: [] }), erro: `Não consegui ver o quadro do Trello e a tabela designers do Teable: ${motivo}.` };
      }
    },
    /** A última verificação guardada (sem ir ao Trello). */
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
    lembrarEmail: (membro, email) => membro && q.lembrarEmail.run(membro, String(email).trim().toLowerCase()),
    ignorar: (novidade, por) => q.ignorar.run(novidade.chave, novidade.nome, por, new Date().toISOString()),
    desfazer: (chave) => q.desfazer.run(chave),

    /** Cadastra quem entrou no quadro como designer: ativo, o id do membro, o nome e o e-mail (o do Trello ou o
        digitado ao tornar administrador), quando há. */
    async cadastrar(env, novidade) {
      const email = emailDe(novidade);
      const fields = { designer: novidade.nome, status: 'ativo', designer_ID: novidade.membro, ...(email ? { email } : {}) };
      await teable(env, 'POST', `/table/${encodeURIComponent(doTeable(env).tabela)}/record`, { fieldKeyType: 'name', typecast: true, records: [{ fields }] });
      // cadastrado como designer, o e-mail está na tabela: não precisa mais ser lembrado aqui
      q.esquecerEmail.run(novidade.membro);
    },
    /** Marca como inativo o designer que saiu do quadro. */
    async inativar(env, novidade) {
      await teable(env, 'PATCH', `/table/${encodeURIComponent(doTeable(env).tabela)}/record/${encodeURIComponent(novidade.registro)}`, { fieldKeyType: 'name', typecast: true, record: { fields: { status: 'inativo' } } });
    },
  };
}
