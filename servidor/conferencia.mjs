/* A conferência de um filme lido na prévia com o banco de filmes e com as exibições (função pura).

   1. Candidatos: os filmes do banco com a mesma chave sem artigos (chaveDoTitulo) e ano compatível (±1); o filme do
      banco sem ano é compatível. Sem ano na prévia, todos os da mesma chave são candidatos.
   2. Um candidato: é ele (✓).
   3. Nenhum: é filme novo (✓), o caso normal do inédito, mesmo com outro filme do mesmo título e outro ano.
   4. Mais de um: "qual filme?" (!), com os candidatos para escolher, mais "outro filme (novo)".
   5. Candidato único com o ano a um de distância: "ano diferente" (!), para escolher entre os dois anos.
   6. Já existe card do mesmo filme, na mesma sessão e no mesmo dia: a marca é o Trello, e o filme não vai.
   7. Sem título (a leitura não achou): "sem título" (!), até a pessoa corrigir o título.

   A escolha da pessoa (um candidato, filme novo ou um dos anos) resolve a pergunta. As artes do card que o filme já
   tem no acervo ficam em "existentes" e não contam como novas. */
import { chaveDeArte } from './acervo.mjs';
import { chaveDoTitulo } from './titulo.mjs';

const DIAS = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
/** "05/12/2026" → "2026-12-05" (ou '' se a leitura não trouxe uma data). */
export function diaDaPrevia(data) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(data ?? '').trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
const mesmaSessao = (a, b) => chaveDeArte(a).replaceAll(' ', '') === chaveDeArte(b).replaceAll(' ', '');

/** As artes do card de filme, a regra do fluxo CARDS: o título, HOJE, AMANHÃ, o dia, PRÓXIMO(A) dia e, na Tela
    Quente, TELA QUENTE APRESENTA. */
function artesDoCard(titulo, sessao, dia) {
  const artes = [String(titulo).toUpperCase(), 'HOJE', 'AMANHÃ'];
  if (dia) {
    const d = new Date(`${dia}T12:00:00Z`).getUTCDay();
    artes.push(DIAS[d], `${d === 0 || d === 6 ? 'PRÓXIMO' : 'PRÓXIMA'} ${DIAS[d]}`);
  }
  if (/TELA\s*QUENTE/i.test(sessao)) artes.push('TELA QUENTE APRESENTA');
  return artes;
}

/**
 * @param lido { titulo, ano, sessao, data ("DD/MM/AAAA"), escolha?: { filme?: 'rec…' | 'novo', ano?: number } }
 * @param banco.filmes [{ id, titulo, ano }]; banco.exibicoes [{ filme (id), sessao, dia ("AAAA-MM-DD"), link }],
 *   já sem as canceladas; banco.acervo Map(id do filme → [arte])
 * @returns { marca: 'ok' | 'atencao' | 'trello', pergunta?: 'qual-filme' | 'ano-diferente' | 'sem-titulo', filme: { id, titulo, ano }
 *   ou null (filme novo), novo, ano, candidatos?, anos?, link?, artes: { novas, existentes } }
 */
export function conferirFilme(lido, { filmes = [], exibicoes = [], acervo = new Map() } = {}) {
  const chave = chaveDoTitulo(lido.titulo);
  const ano = Number.isInteger(lido.ano) ? lido.ano : null;
  const escolha = lido.escolha ?? {};
  const dia = diaDaPrevia(lido.data);
  const compativel = (f) => ano === null || f.ano === null || Math.abs(f.ano - ano) <= 1;
  const candidatos = chave ? filmes.filter((f) => chaveDoTitulo(f.titulo) === chave && compativel(f)) : [];
  const cardDe = (f) => (f && dia ? exibicoes.find((e) => e.filme === f.id && e.dia === dia && mesmaSessao(e.sessao, lido.sessao)) : undefined);

  let filme = null;
  let pergunta = chave ? undefined : 'sem-titulo';
  if (escolha.filme === 'novo') filme = null;
  else if (escolha.filme && filmes.some((f) => f.id === escolha.filme)) filme = filmes.find((f) => f.id === escolha.filme);
  else if (candidatos.length === 1) filme = candidatos[0];
  else if (candidatos.length > 1) {
    // o candidato que já tem card nesta sessão e neste dia é ele
    const comCard = candidatos.filter(cardDe);
    if (comCard.length === 1) filme = comCard[0];
    else pergunta = 'qual-filme';
  }
  const escolheuFilme = !!escolha.filme;
  let anoFinal = filme?.ano ?? ano;
  if (filme && !escolheuFilme && ano !== null && filme.ano !== null && filme.ano !== ano) {
    if (escolha.ano === ano || escolha.ano === filme.ano) anoFinal = escolha.ano;
    else pergunta = 'ano-diferente';
  }

  const card = cardDe(filme);
  const titulo = filme?.titulo ?? lido.titulo;
  const jaTem = new Set((filme ? acervo.get(filme.id) ?? [] : []).map(chaveDeArte));
  const artes = { novas: [], existentes: [] };
  for (const a of artesDoCard(titulo, lido.sessao, dia)) (jaTem.has(chaveDeArte(a)) ? artes.existentes : artes.novas).push(a);

  const r = {
    marca: card ? 'trello' : pergunta ? 'atencao' : 'ok',
    filme: filme ? { id: filme.id, titulo: filme.titulo, ano: filme.ano } : null,
    novo: !filme && !pergunta,
    ano: pergunta === 'qual-filme' ? ano : anoFinal,
    artes,
  };
  if (card) r.link = card.link;
  else if (pergunta === 'qual-filme') {
    r.pergunta = pergunta;
    r.candidatos = candidatos.map((f) => ({ id: f.id, titulo: f.titulo, ano: f.ano }));
  } else if (pergunta === 'sem-titulo') r.pergunta = pergunta;
  else if (pergunta === 'ano-diferente') {
    r.pergunta = pergunta;
    r.anos = [ano, filme.ano];
  }
  return r;
}
