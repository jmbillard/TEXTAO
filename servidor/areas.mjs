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

  return {
    quemE,
    /**
     * O que a rota de quem está logado devolve das áreas: as da pessoa, a de entrada (a última usada, se ela ainda a
     * tem) e as preferências guardadas.
     */
    async daPessoa(email, { cadastros, admin, preferencias }) {
      const eu = await quemE(email, cadastros);
      const areas = areasDaPessoa({ admin, redator: !!eu.redator, editor: !!eu.editor });
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
  const data = (r) => (/^\d{4}-\d{2}-\d{2}$/.test(r.meta?.dataExibicao ?? '') ? r.meta.dataExibicao : '9999');
  return resumos.filter((r) => nomeComparavel(r.meta?.[area] ?? '') === alvo).sort((a, b) => data(a).localeCompare(data(b)) || String(a.meta.claquete).localeCompare(String(b.meta.claquete)));
}
