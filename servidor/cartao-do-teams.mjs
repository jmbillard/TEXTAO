/* O cartão da pauta no Teams (#135, ADR 0006): o PROMeiro manda ao Teams o cartão da pauta publicada, nos horários da
   Configuração (src/modelo/horariosDoCartao.ts), pelo endereço do Power Automate que o n8n usava, guardado como segredo
   no Portainer (TEAMS_PAUTA_URL). Sem ele, nada é mandado. O corpo é o mesmo do n8n ({ card: o Adaptive Card em
   texto }), para o fluxo do Power Automate continuar igual.
   - O cartão: o dia ("PAUTA - SEXTA 27/11"), quando foi publicada, o recado do dia e, ao tocar no cabeçalho, a pauta por
     turno (na ordem da Configuração): cada posição com o editor, a ilha e o horário, as claquetes e os avisos (⚑); no
     fim, o link para a Pauta do PROMeiro naquele dia.
   - Os horários: o servidor confere de minuto em minuto, no relógio de São Paulo. Cada horário que chegou (dentro de
     meia hora) leva a pauta publicada do dia (ou a de amanhã); o dia sem pauta publicada não manda nada.
   - teams_envios, no SQLite: cada envio, com a chave do horário (o dia e a hora em São Paulo) e a pauta como foi
     mandada. A chave é única: reiniciar não manda de novo o horário que já foi. O envio é anotado antes de sair
     ('enviando'): se o servidor cair no meio, ele não vai de novo (no máximo uma vez). O Teams que recusa fica
     'falhou' e é tentado de novo, até 3 vezes, enquanto o horário está na janela.
   - "Pauta alterada": republicar um dia que já foi ao Teams manda o cartão de novo, com o que mudou desde o último
     envio daquele dia. O dia que ainda não foi não manda nada: o horário leva a pauta nova. */
import { randomUUID } from 'node:crypto';
import { nomeComparavel } from '../src/modelo/ligarPeloNome.ts';
import { rotuloDaIlha } from '../src/modelo/ilhas.ts';
import { turnosDaConfiguracao, turnosDoDia } from '../src/modelo/turnos.ts';
import { horariosDaConfiguracao, horariosVencidos, relogioDeSaoPaulo } from '../src/modelo/horariosDoCartao.ts';

/** O segredo: o endereço do Power Automate (fica no Portainer, ADR 0007). */
export const SEGREDO_DO_TEAMS = 'TEAMS_PAUTA_URL';
const JANELA_EM_MINUTOS = 30;
const TENTATIVAS = 3;
const SEMANA = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];

const limpo = (v) => String(v ?? '').trim();
/** "SEXTA 27/11". */
const nomeDoDia = (dia) => `${SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** "14H05 de 26/11", no relógio de São Paulo. */
function quando(instante) {
  const { dia, hora } = relogioDeSaoPaulo(new Date(instante));
  return `${hora.replace(':', 'H')} de ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/* ---------- o que mudou ---------- */

/**
 * O que mudou de uma pauta mandada para a nova, em linhas legíveis: por posição (na ordem da nova), o editor, o turno,
 * a ilha e o horário, as claquetes que entraram (ou vieram de outro editor) e os avisos novos; depois as claquetes e
 * os avisos que saíram, as posições que saíram e o recado do dia.
 * @param antes, depois { posicoes, recado }; turnos e ilhas para os nomes
 */
export function oQueMudouNaPauta(antes, depois, { turnos = [], ilhas = [] } = {}) {
  const nomeDoTurno = (id) => turnos.find((t) => t.id === id)?.nome ?? id;
  const nomeDaIlha = (id) => {
    const i = ilhas.find((x) => x.id === id);
    return i ? rotuloDaIlha(i) : id ? 'outra ilha' : 'sem ilha';
  };
  const quem = (p) => limpo(p.editor) || `sem editor (${nomeDoTurno(p.turno)})`;
  const chave = (t) => nomeComparavel(t);
  /** Os itens de `de` que não estão em `em` (contando as repetições), pelo texto comparável. */
  const menos = (de, em) => {
    const restam = (em ?? []).map((x) => chave(x.texto));
    return de.filter((x) => {
      const i = restam.indexOf(chave(x.texto));
      if (i < 0) return true;
      restam.splice(i, 1);
      return false;
    });
  };
  // cada posição nova com a de antes: o mesmo id ou, senão, o mesmo editor
  const par = new Map();
  for (const p of depois.posicoes) {
    const a = antes.posicoes.find((x) => x.id === p.id) ?? antes.posicoes.find((x) => limpo(x.editor) && chave(x.editor) === chave(p.editor) && !depois.posicoes.some((y) => y.id === x.id));
    if (a) par.set(p, a);
  }
  const comPar = new Set(par.values());
  const deDepois = new Map([...par].map(([p, a]) => [a, p]));
  const entrou = depois.posicoes.flatMap((p) => menos(p.demandas, par.get(p)?.demandas).map((d) => ({ p, texto: d.texto })));
  const saiu = antes.posicoes.flatMap((a) => menos(a.demandas, deDepois.get(a)?.demandas).map((d) => ({ a, texto: d.texto })));
  // a claquete que saiu de um e entrou em outro: uma linha só ("X: de → para")
  const veioDe = new Map();
  for (const e of entrou) {
    const i = saiu.findIndex((s) => chave(s.texto) === chave(e.texto));
    if (i >= 0) veioDe.set(e, saiu.splice(i, 1)[0]);
  }
  const linhas = [];
  for (const p of depois.posicoes) {
    const a = par.get(p);
    if (!a) linhas.push(`+ ${quem(p)} (${nomeDoTurno(p.turno)}${p.horario ? `, ${p.horario}` : ''})`);
    else {
      if (chave(a.editor) !== chave(p.editor)) linhas.push(`${nomeDoTurno(p.turno)}: ${quem(a)} → ${quem(p)}`);
      if (a.turno !== p.turno) linhas.push(`${quem(p)}: ${nomeDoTurno(a.turno)} → ${nomeDoTurno(p.turno)}`);
      if ((a.ilha ?? '') !== (p.ilha ?? '')) linhas.push(`${quem(p)}: ${nomeDaIlha(a.ilha)} → ${nomeDaIlha(p.ilha)}`);
      if (a.horario !== p.horario) linhas.push(`${quem(p)}: ${a.horario || 'sem horário'} → ${p.horario || 'sem horário'}`);
    }
    for (const e of entrou.filter((x) => x.p === p)) {
      const de = veioDe.get(e);
      linhas.push(de ? `${e.texto}: ${quem(de.a)} → ${quem(p)}` : `+ ${quem(p)}: ${e.texto}`);
    }
    for (const v of menos(p.avisos, a?.avisos)) linhas.push(`⚑ ${quem(p)}: ${v.texto}`);
  }
  // o que saiu: as claquetes e os avisos das posições que ficaram, e as posições que saíram (com o que tinham)
  for (const s of saiu.filter((x) => comPar.has(x.a))) linhas.push(`− ${quem(s.a)}: ${s.texto}`);
  for (const [p, a] of par) for (const v of menos(a.avisos, p.avisos)) linhas.push(`− ⚑ ${quem(a)}: ${v.texto}`);
  for (const a of antes.posicoes) if (!comPar.has(a)) linhas.push(`− ${quem(a)} saiu da ${nomeDoTurno(a.turno)}`);
  if (limpo(antes.recado) !== limpo(depois.recado)) linhas.push(`Recado do dia: ${limpo(depois.recado) || 'saiu'}`);
  return linhas;
}

/* ---------- o cartão ---------- */

const texto = (text, extra = {}) => ({ type: 'TextBlock', text, wrap: true, ...extra });

/**
 * O Adaptive Card da pauta de um dia, no formato do n8n (o cabeçalho que abre e fecha a pauta, a pauta por turno e o
 * rodapé com o link).
 * @param o.dia o dia (AAAA-MM-DD); o.posicoes e o.recado como foram publicados; o.turnos (na ordem da grade) e o.ilhas
 *   para os nomes; o.publicadaEm quando foi publicada; o.link o endereço da Pauta do PROMeiro ('' sem); o.mudancas as
 *   linhas do que mudou (só na "pauta alterada")
 */
export function cartaoDaPauta({ dia, posicoes, recado = '', turnos = [], ilhas = [], publicadaEm, link = '', mudancas = null }) {
  const alterada = Array.isArray(mudancas);
  const nomeDaIlha = (id) => {
    const i = ilhas.find((x) => x.id === id);
    return i ? rotuloDaIlha(i) : '';
  };
  const blocoDaPosicao = (p) => ({
    type: 'Container',
    style: 'emphasis',
    separator: true,
    spacing: 'Medium',
    items: [
      {
        type: 'ColumnSet',
        columns: [
          { type: 'Column', width: 'stretch', items: [texto(limpo(p.editor) || 'sem editor', { size: 'Small', weight: 'Bolder', spacing: 'None' })] },
          { type: 'Column', width: 'auto', items: [texto([nomeDaIlha(p.ilha), p.horario].filter(Boolean).join(' · '), { size: 'Small', spacing: 'None', horizontalAlignment: 'Right' })] },
        ],
      },
      ...(p.demandas.length ? [texto(p.demandas.map((d) => `• ${d.texto}`).join('\n'), { fontType: 'Monospace', size: 'Small', spacing: 'Small' })] : []),
      ...(p.avisos.length ? [texto(p.avisos.map((a) => `⚑ ${a.texto}`).join('\n'), { size: 'Small', color: 'Warning', spacing: 'Small' })] : []),
    ],
  });
  // os turnos do dia, na ordem da Configuração (o que saiu dela e ainda tem posição, no fim); o vazio não aparece
  const porTurno = turnosDoDia(turnos, posicoes)
    .map((t) => ({ t, ps: posicoes.filter((p) => p.turno === t.id && (limpo(p.editor) || p.demandas.length || p.avisos.length)) }))
    .filter((x) => x.ps.length)
    .flatMap(({ t, ps }) => [texto(t.nome.toUpperCase(), { weight: 'Bolder', size: 'Small', color: 'Accent', spacing: 'Large' }), ...ps.map(blocoDaPosicao)]);
  return {
    type: 'AdaptiveCard',
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.3',
    body: [
      {
        type: 'ColumnSet',
        selectAction: { type: 'Action.ToggleVisibility', targetElements: ['pautaContent'] },
        style: 'emphasis',
        columns: [
          { type: 'Column', width: '50px', items: [texto('📺', { horizontalAlignment: 'Center', style: 'heading', size: 'ExtraLarge' })] },
          {
            type: 'Column',
            width: 'stretch',
            items: [
              texto(`${alterada ? 'PAUTA ALTERADA' : 'PAUTA'} - ${nomeDoDia(dia)}`, { style: 'heading', size: 'Large', color: alterada ? 'Attention' : 'Accent', maxLines: 1 }),
              texto(`${alterada ? 'alterada' : 'publicada'} às ${quando(publicadaEm)}`, { spacing: 'None', maxLines: 1, size: 'Small', isSubtle: true }),
            ],
          },
        ],
      },
      ...(alterada && mudancas.length
        ? [{ type: 'Container', id: 'oQueMudou', spacing: 'Medium', items: [texto('O que mudou', { weight: 'Bolder', size: 'Small' }), ...mudancas.map((m) => texto(m, { size: 'Small', spacing: 'None' }))] }]
        : []),
      ...(limpo(recado) ? [texto(`Recado do dia: ${limpo(recado)}`, { spacing: 'Medium', size: 'Small', weight: 'Bolder', color: 'Warning' })] : []),
      { type: 'Container', id: 'pautaContent', isVisible: false, items: porTurno },
      ...(link ? [texto(`[Abrir a pauta no PROMeiro](${link})`, { id: 'footer', spacing: 'Large', size: 'Small', isSubtle: true })] : []),
    ],
  };
}

/* ---------- os envios ---------- */

/**
 * @param db o SQLite do PROMeiro (a tabela teams_envios é criada aqui)
 * @param escala a montagem da pauta (servidor/escala.mjs): os dias publicados; ilhas o cadastro das ilhas
 * @param valores () => a configuração de agora (o segredo, os horários, os turnos e o PROMEIRO_URL)
 * @param enviar (url, init) o fetch do Teams (os testes trocam pelo falso); relogio () => o instante de agora
 * @returns conferir() manda o que chegou na hora (nunca lança); republicado(dia) manda a "pauta alterada" (nunca
 *   lança); emDia() espera os envios em curso; secao() o que a Configuração mostra
 */
export function criarCartaoDoTeams({ db, escala, ilhas, valores, enviar = fetch, relogio = () => new Date() }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams_envios (
      id TEXT PRIMARY KEY,
      chave TEXT UNIQUE,
      dia TEXT NOT NULL,
      tipo TEXT NOT NULL,
      estado TEXT NOT NULL,
      tentativas INTEGER NOT NULL DEFAULT 1,
      em TEXT NOT NULL,
      pauta TEXT NOT NULL,
      erro TEXT
    );
    CREATE INDEX IF NOT EXISTS teams_envios_dia ON teams_envios (dia, em);
  `);
  const q = {
    pelaChave: db.prepare('SELECT id, estado, tentativas FROM teams_envios WHERE chave = ?'),
    anotar: db.prepare("INSERT INTO teams_envios (id, chave, dia, tipo, estado, em, pauta) VALUES (?, ?, ?, ?, 'enviando', ?, ?)"),
    deNovo: db.prepare("UPDATE teams_envios SET estado = 'enviando', tentativas = tentativas + 1, em = ?, pauta = ?, erro = NULL WHERE id = ?"),
    fim: db.prepare('UPDATE teams_envios SET estado = ?, erro = ? WHERE id = ?'),
    ultimoDoDia: db.prepare("SELECT pauta FROM teams_envios WHERE dia = ? AND estado = 'enviado' ORDER BY em DESC LIMIT 1"),
    ultimo: db.prepare('SELECT dia, tipo, estado, em, erro FROM teams_envios ORDER BY em DESC LIMIT 1'),
  };
  let fila = Promise.resolve();
  /** Um envio por vez: dois horários (ou um horário e uma republicação) nunca correm juntos. */
  const emFila = (f) => (fila = fila.then(f).catch((e) => console.warn(`[teams] ${e instanceof Error ? e.message : e}`)));

  const endereco = () => limpo(valores()[SEGREDO_DO_TEAMS]);
  /** A pauta publicada que vale no dia ({ posicoes, recado, em }) ou null. */
  function publicada(dia) {
    const d = escala.publicadas(dia, dia)[0];
    const em = escala.lerDia(dia).publicacao?.em;
    return d && em ? { posicoes: d.posicoes.map((p) => ({ ...p, avisos: p.avisos ?? [] })), recado: d.recado ?? '', em } : null;
  }
  function montar(dia, pauta, mudancas = null) {
    const env = valores();
    const base = limpo(env.PROMEIRO_URL).replace(/\/+$/, '');
    return cartaoDaPauta({
      dia,
      ...pauta,
      turnos: turnosDaConfiguracao(env),
      ilhas: ilhas.todas(),
      publicadaEm: mudancas ? relogio() : pauta.em,
      link: base ? `${base}/#/pauta/dia/${dia}` : '',
      mudancas,
    });
  }
  /** Manda e anota o fim do envio (a linha já está como 'enviando'). */
  async function mandar(id, cartao, oQue) {
    let erro = null;
    try {
      const r = await enviar(endereco(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card: JSON.stringify(cartao) }) });
      if (!r.ok) erro = `o Teams respondeu ${r.status}`;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
    q.fim.run(erro ? 'falhou' : 'enviado', erro, id);
    if (erro) console.warn(`[teams] não mandei ${oQue}: ${erro}`);
    else console.log(`[teams] mandei ${oQue}`);
  }
  const instantaneo = (pauta) => JSON.stringify({ posicoes: pauta.posicoes, recado: pauta.recado });

  /** Os horários que chegaram: cada um uma vez (pela chave), com a pauta publicada do dia. */
  function conferir() {
    return emFila(async () => {
      if (!endereco()) return;
      const agora = relogio();
      for (const v of horariosVencidos(horariosDaConfiguracao(valores()), agora, JANELA_EM_MINUTOS)) {
        const ja = q.pelaChave.get(v.chave);
        if (ja && (ja.estado !== 'falhou' || ja.tentativas >= TENTATIVAS)) continue;
        const pauta = publicada(v.pautaDe);
        if (!pauta) continue;
        const em = agora.toISOString();
        let id = ja?.id;
        if (id) q.deNovo.run(em, instantaneo(pauta), id);
        else q.anotar.run((id = randomUUID()), v.chave, v.pautaDe, 'pauta', em, instantaneo(pauta));
        await mandar(id, montar(v.pautaDe, pauta), `a pauta de ${v.pautaDe} (horário das ${v.horario.hora})`);
      }
    });
  }

  /** Republicou: se o dia já foi ao Teams, manda a "pauta alterada" com o que mudou desde o último envio dele. */
  function republicado(dia) {
    return emFila(async () => {
      if (!endereco()) return;
      const mandada = q.ultimoDoDia.get(dia);
      const pauta = publicada(dia);
      if (!mandada || !pauta) return;
      const env = valores();
      const mudancas = oQueMudouNaPauta(JSON.parse(mandada.pauta), pauta, { turnos: turnosDoDia(turnosDaConfiguracao(env), pauta.posicoes), ilhas: ilhas.todas() });
      if (!mudancas.length) return;
      const id = randomUUID();
      q.anotar.run(id, null, dia, 'alterada', relogio().toISOString(), instantaneo(pauta));
      await mandar(id, montar(dia, pauta, mudancas), `a pauta alterada de ${dia}`);
    });
  }

  return {
    conferir,
    republicado,
    emDia: () => fila,
    /** A seção da Configuração: o que falta no Portainer e o último envio. */
    secao() {
      const u = q.ultimo.get();
      return {
        falta: endereco() ? [] : [SEGREDO_DO_TEAMS],
        ultimo: u ? { dia: u.dia, tipo: u.tipo, em: u.em, ok: u.estado === 'enviado', ...(u.erro ? { erro: u.erro } : {}) } : null,
      };
    },
  };
}
