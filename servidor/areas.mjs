/* As áreas de trabalho (#101): quem é quem pela ligação por e-mail (#106) com os cadastros de redatores e editores, as
   áreas da pessoa e "meus roteiros". Nada é lido do Trello: os cadastros vêm do Teable (pelo módulo dos Cadastros, com
   o cache dele) e os roteiros, do SQLite do PROMeiro. */
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { areaDeEntrada, areasDaPessoa } from '../src/modelo/areas.ts';

/** Quanto a rota de quem está logado espera pelos cadastros: o navegador desiste do /api/eu em 3 s. */
const ESPERA_DOS_CADASTROS = 1500;

export function criarAreas({ espera = ESPERA_DOS_CADASTROS } = {}) {
  // a última leitura boa dos cadastros: com o Teable lento ou fora do ar, quem é quem continua o de antes
  let ultimaBoa = null;
  async function lerCadastros(cadastros) {
    let prazo;
    try {
      const lido = await Promise.race([cadastros.ler(), new Promise((_, nao) => (prazo = setTimeout(() => nao(new Error('os cadastros demoraram')), espera)))]);
      if (lido?.ligado) ultimaBoa = lido;
      return lido?.ligado ? lido : ultimaBoa;
    } catch {
      return ultimaBoa;
    } finally {
      clearTimeout(prazo);
    }
  }

  /** O cadastro de redator e o de editor ligados ao e-mail ({ id, nome } ou null). */
  async function quemE(email, cadastros) {
    const lido = await lerCadastros(cadastros);
    const meu = (lista) => {
      const c = (lista ?? []).find((x) => x.email && x.email === String(email).toLowerCase());
      return c ? { id: c.id, nome: c.nome } : null;
    };
    return { redator: meu(lido?.redatores), editor: meu(lido?.editores) };
  }

  /** Os nomes dos cadastros de redatores e de editores, para dar a grafia certa a quem aparece no "de quem" (#105). */
  async function nomesDosCadastros(cadastros) {
    const lido = await lerCadastros(cadastros);
    const nomes = (lista) => (lista ?? []).map((c) => c.nome).filter(Boolean);
    return { redator: nomes(lido?.redatores), editor: nomes(lido?.editores) };
  }

  /** As keys de cada editor (o apelido dele na planilha da edição), pelo nome do cadastro, para o colar (#130). */
  async function apelidosDosEditores(cadastros) {
    const lido = await lerCadastros(cadastros);
    return Object.fromEntries((lido?.editores ?? []).filter((e) => e.nome).map((e) => [e.nome, (e.keys ?? []).map((k) => k.key).filter(Boolean)]));
  }

  /** Os redatores e os editores dos cadastros que têm e-mail ({ nome, email }): quem a menção @nome acha (#192). */
  async function pessoasDosCadastros(cadastros) {
    const lido = await lerCadastros(cadastros);
    return [...(lido?.redatores ?? []), ...(lido?.editores ?? [])].filter((c) => c.nome && c.email).map((c) => ({ nome: c.nome, email: c.email }));
  }

  return {
    quemE,
    nomesDosCadastros,
    pessoasDosCadastros,
    apelidosDosEditores,
    /**
     * O que a rota de quem está logado devolve das áreas: as da pessoa, a de entrada (a última usada, se ela ainda a
     * tem) e as preferências guardadas. `coordenacao`: a pessoa é da coordenação (#123), que também tem a do Editor.
     */
    async daPessoa(email, { cadastros, admin, preferencias, coordenacao = false }) {
      const eu = await quemE(email, cadastros);
      const areas = areasDaPessoa({ admin, redator: !!eu.redator, editor: !!eu.editor, coordenacao });
      const prefs = preferencias.ler(email);
      return { areas, area: areaDeEntrada(prefs.area, areas), preferencias: prefs };
    },
  };
}

/**
 * Os roteiros em que a pessoa aparece no campo da área (o redator ou o editor), pelo nome do cadastro dela, sem caixa,
 * acento e pontuação. Na ordem da data de exibição; os sem data no fim.
 * @param resumos os roteiros como a fila os recebe ({ id, meta, … })
 * @param area 'redator' | 'editor'
 * @param nome o nome do cadastro da pessoa
 */
export function dosMeusRoteiros(resumos, area, nome) {
  const alvo = nomeComparavel(nome);
  if (!alvo) return [];
  return porData(resumos.filter((r) => nomeComparavel(r.meta?.[area] ?? '') === alvo));
}

/** Na ordem da data de exibição; os sem data no fim; no mesmo dia, pela claquete. */
function porData(roteiros) {
  const data = (r) => (/^\d{4}-\d{2}-\d{2}$/.test(r.meta?.dataExibicao ?? '') ? r.meta.dataExibicao : '9999');
  return roteiros.sort((a, b) => data(a).localeCompare(data(b)) || String(a.meta.claquete).localeCompare(String(b.meta.claquete)));
}

/**
 * Os roteiros de todos, para o administrador (#105): os que têm alguém no campo da área, e quem são (para o filtro
 * "de quem"), cada um com quantos roteiros. A pessoa é o nome sem caixa, acento e pontuação; o nome mostrado é o do
 * cadastro, quando há um, ou a grafia do primeiro roteiro dela (pela data). Com `de` diferente de "todos", só os roteiros
 * daquela pessoa; a lista de quem continua inteira.
 * @param resumos os roteiros como a fila os recebe ({ id, meta, … })
 * @param area 'redator' | 'editor'
 * @param de 'todos' ou o nome de alguém
 * @param nomesDoCadastro os nomes do cadastro da área
 */
export function deTodos(resumos, area, de, nomesDoCadastro = []) {
  const doCadastro = new Map(nomesDoCadastro.map((n) => [nomeComparavel(n), n]));
  const pessoas = new Map();
  const comAlguem = porData(resumos.filter((r) => nomeComparavel(r.meta?.[area] ?? '')));
  for (const r of comAlguem) {
    const chave = nomeComparavel(r.meta[area]);
    const p = pessoas.get(chave) ?? { nome: doCadastro.get(chave) ?? String(r.meta[area]).trim(), roteiros: 0 };
    p.roteiros += 1;
    pessoas.set(chave, p);
  }
  const alvo = de === 'todos' ? null : nomeComparavel(de);
  return {
    pessoas: [...pessoas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    roteiros: alvo === null ? comAlguem : comAlguem.filter((r) => nomeComparavel(r.meta[area]) === alvo),
  };
}
