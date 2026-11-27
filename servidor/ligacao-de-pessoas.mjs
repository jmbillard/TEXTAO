/* Ligar pessoa e cadastro pelo e-mail (#106): quem já entrou no PROMeiro (a tabela usuarios do SQLite) e parece, pelo
   nome, ser um redator ou editor dos cadastros que ainda não tem e-mail vira a sugestão "É Fulana, dos
   redatores?" nos Cadastros, só para administradores. "É" grava o e-mail no Teable (cadastros.mudarEmail); "Não é"
   fica guardado aqui, no SQLite, e a mesma sugestão não volta (até alguém desfazer). */
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';

/** Os tipos de cadastro que têm e-mail, como na rota (/api/cadastros/redatores…). */
export const TIPOS_COM_EMAIL = ['redatores', 'editores'];

// "da", "de", "dos"… não contam na comparação ("Ana da Silva" é "Ana Silva")
const PARTICULAS = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
const palavras = (nome) => nomeComparavel(nome).split(' ').filter((p) => p && !PARTICULAS.has(p));

/** As duas palavras são iguais ou diferem numa letra só (uma a mais, a menos ou trocada). */
function umaLetraDeDiferenca(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [curta, longa] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < curta.length && curta[i] === longa[i]) i++;
  // trocada: o resto bate depois da letra; a mais: o resto da curta bate com o da longa depois dela
  return curta.length === longa.length ? curta.slice(i + 1) === longa.slice(i + 1) : curta.slice(i) === longa.slice(i + 1);
}
// palavra curta ("Ana", "Leo") só vale igual: uma letra de diferença nela já é outro nome
const quase = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && umaLetraDeDiferenca(a, b));

/**
 * O nome de quem entrou parece o nome do cadastro: sem caixa, acento e pontuação, o primeiro nome bate e o sobrenome
 * de um aparece no outro, com até uma letra de diferença em cada palavra de 4 letras ou mais ("Mariana Telles" e
 * "Marina Teles"; "Ana Paula Lima" e "Ana Lima"). Um nome de uma palavra só (o login "ana@") nunca sugere: é pouco
 * para dizer quem é.
 */
export function pareceSer(nomeDoUsuario, nomeDoCadastro) {
  const u = palavras(nomeDoUsuario);
  const c = palavras(nomeDoCadastro);
  if (u.length < 2 || c.length < 2 || !quase(u[0], c[0])) return false;
  return u.slice(1).some((p) => quase(p, c.at(-1))) || c.slice(1).some((p) => quase(p, u.at(-1)));
}

/** @param db o SQLite do PROMeiro (a tabela `cadastros_nao_e` é criada aqui) */
export function criarLigacaoDePessoas({ db }) {
  db.exec(`CREATE TABLE IF NOT EXISTS cadastros_nao_e (
    tipo TEXT NOT NULL,
    cadastro TEXT NOT NULL,
    email TEXT NOT NULL,
    por TEXT,
    em TEXT NOT NULL,
    PRIMARY KEY (tipo, cadastro, email)
  )`);
  const q = {
    todas: db.prepare('SELECT tipo, cadastro, email FROM cadastros_nao_e'),
    naoE: db.prepare('INSERT INTO cadastros_nao_e (tipo, cadastro, email, por, em) VALUES (?, ?, ?, ?, ?) ON CONFLICT (tipo, cadastro, email) DO NOTHING'),
    desfazer: db.prepare('DELETE FROM cadastros_nao_e WHERE tipo = ? AND cadastro = ? AND email = ?'),
  };
  const chave = (tipo, cadastro, email) => `${tipo}|${cadastro}|${String(email).toLowerCase()}`;

  return {
    /**
     * As sugestões: cada usuário que parece ser um redator (ou editor) sem e-mail, menos quem já está ligado a um
     * cadastro do mesmo tipo e o "Não é" guardado. Na ordem do nome de quem entrou.
     * @param usuarios [{ email, nome }] de quem já entrou
     * @param cadastros a leitura dos Cadastros ({ redatores, editores }, com o e-mail)
     * @returns [{ tipo, id, nome, email, usuario }]
     */
    sugestoes(usuarios, cadastros) {
      const recusadas = new Set(q.todas.all().map((l) => chave(l.tipo, l.cadastro, l.email)));
      const achadas = [];
      for (const tipo of TIPOS_COM_EMAIL) {
        const lista = cadastros?.[tipo] ?? [];
        const ligados = new Set(lista.map((c) => c.email).filter(Boolean));
        for (const c of lista) {
          if (c.email) continue;
          for (const u of usuarios) {
            const email = String(u.email).toLowerCase();
            if (ligados.has(email) || recusadas.has(chave(tipo, c.id, email)) || !pareceSer(u.nome, c.nome)) continue;
            achadas.push({ tipo, id: c.id, nome: c.nome, email, usuario: u.nome });
          }
        }
      }
      return achadas.sort((a, b) => a.usuario.localeCompare(b.usuario, 'pt-BR') || a.tipo.localeCompare(b.tipo));
    },
    /** "Não é": guarda, e a sugestão desse usuário para esse cadastro não volta. */
    naoE: (tipo, cadastro, email, por) => q.naoE.run(tipo, cadastro, String(email).toLowerCase(), por, new Date().toISOString()),
    /** Desfaz o "Não é": a sugestão volta (se ainda couber). */
    desfazer: (tipo, cadastro, email) => q.desfazer.run(tipo, cadastro, String(email).toLowerCase()),
  };
}
