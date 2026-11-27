/* Montar a pauta, o nome novo pendente (#132): o editor que a coordenação escreveu e não está nos Cadastros entra na
   escala como foi escrito (e publica assim); nos Cadastros, os administradores veem os nomes novos da pauta, pendentes,
   e cadastram o nome como editor novo (o caminho de sempre dos Cadastros, no Teable) ou o ligam a um editor que já
   existe. A lista não é guardada: sai da escala de agora (os rascunhos e as publicações que valem), menos os nomes que
   já são de um cadastro e os ignorados. Assim, o nome corrigido na grade ou cadastrado sai sozinho.
   - escala_nomes_ignorados: o nome (comparável) que um administrador mandou ignorar, para não voltar (até o desfazer);
   - ligar troca o nome, na escala inteira (as posições dos rascunhos, todas as publicações, que o Desfazer pode trazer
     de volta, e as ausências), pelo nome do cadastro, numa transação. A key do editor (no Teable) fica com a rota.
   O SQL é portável (vale também no Postgres). */
import { editorParecido } from '../src/modelo/conferenciaDaEscala.ts';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { normalizarKey } from './cadastros.mjs';

const LIMITE = 80;
const erro = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });

/** O nome do pedido, sem os espaços a mais. Lança (400) o vazio ou longo demais. */
export function nomeNovoDoPedido(nome) {
  const t = String(typeof nome === 'string' ? nome : '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > LIMITE) throw erro('Falta o nome novo.');
  return t;
}

/** @param db o SQLite do PROMeiro, com as tabelas da escala e das ausências já criadas */
export function criarNomesNovos(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS escala_nomes_ignorados (
    nome TEXT PRIMARY KEY,
    escrito TEXT NOT NULL,
    por TEXT,
    em TEXT NOT NULL
  )`);
  const q = {
    posicoes: db.prepare("SELECT id, dia, editor FROM escala_posicoes WHERE editor <> '' ORDER BY dia, ordem"),
    // a publicação que vale em cada dia é a última não desfeita
    publicadas: db.prepare('SELECT dia, posicoes FROM escala_publicacoes WHERE desfeita_em IS NULL ORDER BY dia, em'),
    todasAsPublicacoes: db.prepare('SELECT id, posicoes FROM escala_publicacoes'),
    ausencias: db.prepare('SELECT id, editor FROM escala_ausencias'),
    ignorados: db.prepare('SELECT nome FROM escala_nomes_ignorados'),
    ignorar: db.prepare('INSERT INTO escala_nomes_ignorados (nome, escrito, por, em) VALUES (?, ?, ?, ?) ON CONFLICT (nome) DO NOTHING'),
    desfazer: db.prepare('DELETE FROM escala_nomes_ignorados WHERE nome = ?'),
    trocarNaPosicao: db.prepare('UPDATE escala_posicoes SET editor = ? WHERE id = ?'),
    trocarNaPublicacao: db.prepare('UPDATE escala_publicacoes SET posicoes = ? WHERE id = ?'),
    trocarNaAusencia: db.prepare('UPDATE escala_ausencias SET editor = ? WHERE id = ?'),
  };

  return {
    /**
     * Os nomes novos da escala, em ordem: o nome como foi escrito primeiro, os dias em que aparece (publicado: está na
     * publicação que vale) e a sugestão do "é a mesma pessoa?": o editor que tem o nome como key ('key') ou o que parece
     * pelo nome ('parecido'), ou null.
     * @param editores os cadastrados, como os Cadastros leem ([{ id, nome, keys: [{ key }] }])
     */
    pendentes(editores) {
      const cadastrados = new Set(editores.map((e) => nomeComparavel(e.nome)));
      const ignorados = new Set(q.ignorados.all().map((l) => l.nome));
      const achados = new Map();
      const anotar = (editor, dia, publicado) => {
        const chave = nomeComparavel(editor);
        if (!chave || cadastrados.has(chave) || ignorados.has(chave)) return;
        const n = achados.get(chave) ?? achados.set(chave, { nome: editor, dias: new Map() }).get(chave);
        n.dias.set(dia, (n.dias.get(dia) ?? false) || publicado);
      };
      for (const p of q.posicoes.all()) anotar(p.editor, p.dia, false);
      const porDia = new Map();
      for (const l of q.publicadas.all()) porDia.set(l.dia, l.posicoes);
      for (const [dia, json] of porDia) for (const p of JSON.parse(json)) if (p.editor) anotar(p.editor, dia, true);
      const nomes = editores.map((e) => e.nome);
      return [...achados.values()]
        .map(({ nome, dias }) => {
          const key = normalizarKey(nome);
          const daKey = editores.find((e) => e.keys?.some((k) => k.key === key));
          const parecido = !daKey && editores.find((e) => e.nome === editorParecido(nome, nomes));
          const s = daKey ? { e: daKey, por: 'key' } : parecido ? { e: parecido, por: 'parecido' } : null;
          return {
            nome,
            dias: [...dias].sort(([a], [b]) => a.localeCompare(b)).map(([dia, publicado]) => ({ dia, publicado })),
            sugestao: s ? { id: s.e.id, nome: s.e.nome, por: s.por } : null,
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },

    /** Troca o nome novo pelo do cadastro na escala inteira; devolve em quantos lugares trocou. */
    ligar(nome, cadastro) {
      const alvo = nomeComparavel(nome);
      const e = (editor) => !!editor && nomeComparavel(editor) === alvo;
      let trocas = 0;
      db.exec('BEGIN');
      try {
        for (const p of q.posicoes.all()) if (e(p.editor)) (q.trocarNaPosicao.run(cadastro, p.id), trocas++);
        for (const l of q.todasAsPublicacoes.all()) {
          const posicoes = JSON.parse(l.posicoes);
          if (!posicoes.some((p) => e(p.editor))) continue;
          q.trocarNaPublicacao.run(JSON.stringify(posicoes.map((p) => (e(p.editor) ? { ...p, editor: cadastro } : p))), l.id);
          trocas++;
        }
        for (const a of q.ausencias.all()) if (e(a.editor)) (q.trocarNaAusencia.run(cadastro, a.id), trocas++);
        db.exec('COMMIT');
      } catch (falha) {
        db.exec('ROLLBACK');
        throw falha;
      }
      return trocas;
    },

    /** Ignora o nome (não volta para a lista); `desfazer` o traz de volta. */
    ignorar: (nome, por) => q.ignorar.run(nomeComparavel(nome), nome, String(por ?? '').toLowerCase(), new Date().toISOString()),
    desfazer: (nome) => q.desfazer.run(nomeComparavel(nome)),
  };
}
