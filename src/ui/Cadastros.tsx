import { useEffect, useRef, useState } from 'react';
import { Vagas } from './vagas';
import { Comemoracao, tremerDeLeve } from './Comemoracao';
import { festaDoSemCadastro, linhaDoTotal, montarTiras } from './regrasDaComemoracao';
import { reconhecerNaFila } from '../dados/reconhecer';
import { acentuar } from '../modelo/acento';
import {
  cadastrar,
  darKey,
  desfazerImportacao,
  lerAcervoDaFicha,
  lerImportacoes,
  lerRegrasDaAtracao,
  apagarRegraDaAtracao,
  retomarImportacao,
  type RegraDaAtracao,
  type ImportacaoDesfeita,
  type ImportacaoNoHistorico,
  lerCadastros,
  lerTotaisDoAcervo,
  mudarAcervo,
  mudarEmailDoCadastro,
  ignorarNomeNovo,
  ligarNomeNovo,
  marcarCoordenacao,
  type NomeNovoDaPauta,
  responderNaoE,
  type SugestaoDeEmail,
  preverImportacao,
  removerCadastro,
  zerarAcervo,
  type AcervoDaAtracao,
  type AcervoDaFicha,
  type AtracaoCadastro,
  type Cadastros as DadosCadastros,
  type CampoCaminho,
  type EditorCadastro,
  type PreviaDaImportacao,
  type ResultadoDaImportacao,
  type KeyCadastro,
  type RedatorCadastro,
  type TipoCadastro,
  ignorarKey,
  lerSemCadastro,
  type KeySemCadastro,
} from '../dados/armazenamento';
import { chaveDaClaquete, semAcento } from '../modelo/vocabularios';
import { semPracaNoComeco, semPracaNoFim } from '../modelo/pracas';
import { SetaCurva } from './setaCurva';
import { caminhoDoIcone, Icone } from './icones';
import { Marca } from './pecas';
import { plural } from './util';
import { useTelaDeCelular } from './faixa';
import { FichaNoCelular, ListaDoAcervo, SecaoAcervo } from './FichaDaAtracao';
import { ListaDeDuplicadas, PainelDasDuplicadas, useDuplicadas } from './Duplicadas';
import { ListaDePadeiros, PainelDosPadeiros, usePadeiros } from './Padeiros';
import { FormDaIlha, ICONE_DAS_ILHAS, ListaDasIlhas, useIlhas } from './IlhasNosCadastros';
import { CoordenacaoNaLinha, EmailNaLinha, quemNoCadastro, SugestaoDeEmailNaLista } from './EmailDoCadastro';
import { NomeNovoNaLista, TituloDosNomesNovos } from './NomesNovosNosCadastros';
import { AreaDeImportar, ConferenciaDaImportacao, HistoricoDasImportacoes, RegrasDaAtracaoNaFicha, ResultadoDaImportacaoNaTela } from './ImportarAcervo';

/* Cadastros: o que o PROMeiro usa para reconhecer cada roteiro. Tudo vai direto para o Teable
   (e redator/editor novo também para o Trello). O que está sendo cadastrado aparece na lista como
   uma folha de rascunho, solta por cima, que assenta no lugar quando é salva. */

const ICONE_SEM = 'M4 7h11l5 5-5 5H4z M9 12h.01';

const ICONES = {
  atracoes: 'M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M8.5 3l3.5 4 3.5-4',
  redatores: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  editores: caminhoDoIcone('edicao'),
} as const;
const NOMES: Record<TipoCadastro, string> = { atracoes: 'Atrações', redatores: 'Redatores', editores: 'Editores' };
const RABISCO = 'M2 9 C 30 3, 70 4, 98 6 C 70 8, 40 10, 14 12';

function Desenho({ d, tam = 18 }: { d: string; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Key como a pauta e o n8n escrevem: maiúsculas, sem acento. */
export const comoKey = (s: string) =>
  semAcento(s)
    .toUpperCase()
    .replace(/&/g, 'E')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos', 'e', 'a', 'o', 'em', 'com']);
/** Claquete que veio do nome do arquivo está toda em maiúsculas: o nome da atração sai em caixa de título. */
const caixaDeTitulo = (s: string) =>
  s === s.toUpperCase()
    ? s.toLowerCase().replace(/\p{L}+/gu, (p, i: number) => (i > 0 && MINUSCULAS.has(p) ? p : p[0].toUpperCase() + p.slice(1)))
    : s;

/** "Festa na Praça 19/11 Rede" → "Festa na Praça": o que vem antes da data. */
export const atracaoDaClaquete = (claquete: string) =>
  caixaDeTitulo(
    semPracaNoFim(semPracaNoComeco(claquete.trimStart()).split(/\s*\(|\s+\d{1,2}\s*\/\s*\d{1,2}|\s+\d{1,2}[_ ]\d{1,2}\b/)[0]).trim(),
  );

/** A atração nova que o "+ Nova atração" do balão manda para os cadastros: o nome inicial e a key a ligar. */
export interface AtracaoNova {
  nome: string;
  key: string;
}

/** "+ Nova atração" no "Ligar a…": o nome que a atração nova já traz. Com texto na busca, o texto; com a busca
    vazia, a key como aparece na claquete (uma claquete que dá a mesma key, com acento) ou em caixa de título, com
    os acentos que dá para pôr (a grafia das claquetes e das atrações cadastradas, ou o dicionário: acentuar). */
export function nomeDaAtracaoNova(busca: string, key: string, claquetes: string[] = [], cadastradas: string[] = []) {
  if (busca.trim()) return busca.trim();
  const k = comoKey(key);
  const daClaquete = claquetes.map(atracaoDaClaquete).find((n) => n && comoKey(n) === k);
  return acentuar(daClaquete ?? caixaDeTitulo(k), [...claquetes, ...cadastradas]);
}

/** Sem cadastro: a linha que a folha de rascunho cobre, a da primeira key da lista que está no rascunho (-1: nenhuma,
    e a folha entra no alto da lista). */
export function linhaDoRascunho(keysDaLista: string[], keysDoRascunho: string[]) {
  const doRascunho = new Set(keysDoRascunho.map(comoKey));
  return keysDaLista.findIndex((k) => doRascunho.has(comoKey(k)));
}

/** Prévia do caminho: as fórmulas do Teable com os campos trocados pelo que está digitado. */
export function previaDoCaminho(formula: string, valores: Record<string, string>) {
  if (!formula) return '';
  return formula
    .split('&')
    .map((p) => p.trim())
    .map((p) => {
      const aspas = /^"(.*)"$/s.exec(p);
      if (aspas) return aspas[1].replace(/\\\\/g, '\\');
      const campo = /^\{(.+)\}$/.exec(p);
      if (campo) return valores[campo[1]] || '…';
      return '…';
    })
    .join('');
}

/* ---------- pedaços ---------- */

type AbaExtra = { ativa: boolean; total: number; abrir: () => void };
function Abas({ aba, mudar, totais, sem, dup, pad, ilhas }: { aba: TipoCadastro; mudar: (a: TipoCadastro) => void; totais: Record<TipoCadastro, number>; sem: AbaExtra; dup: AbaExtra | null; pad: AbaExtra | null; ilhas: AbaExtra }) {
  const outra = sem.ativa || !!dup?.ativa || !!pad?.ativa || ilhas.ativa;
  return (
    <div className="abas-cad" role="tablist" aria-label="Cadastros">
      {(Object.keys(NOMES) as TipoCadastro[]).map((a) => (
        <button key={a} role="tab" aria-selected={aba === a && !outra} title={aba === a && !outra ? undefined : NOMES[a]} onClick={() => mudar(a)}>
          <Desenho d={ICONES[a]} />
          {aba === a && !outra ? (
            <span className="rot">
              {NOMES[a]} <b>{totais[a]}</b>
              <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
                <path key={a} pathLength={1} d={RABISCO} />
              </svg>
            </span>
          ) : (
            <sup>{totais[a]}</sup>
          )}
        </button>
      ))}
      {/* as keys que aparecem nas claquetes e nenhuma atração reconhece */}
      <AbaDeFora nome="Sem cadastro" icone={<Desenho d={ICONE_SEM} />} aba={sem} />
      {/* as salas de edição (#124): no PROMeiro, para a montagem da pauta */}
      <AbaDeFora nome="Ilhas" icone={<Desenho d={ICONE_DAS_ILHAS} />} aba={ilhas} classe="aba-ilhas" />
      {/* os cards repetidos no quadro do Trello: só administradores (o número são todos os casos pendentes) */}
      {dup && <AbaDeFora nome="Duplicadas" icone={<Icone nome="duplicar" tam={18} />} aba={dup} classe="aba-dup" />}
      {/* a chave do Padeiro (#137): só administradores (o número são as pendentes) */}
      {pad && <AbaDeFora nome="Padeiros" icone={<Icone nome="chave" tam={18} />} aba={pad} classe="aba-pad" />}
    </div>
  );
}

/** Uma aba que não é de cadastro (Sem cadastro, Duplicadas): o nome sublinhado quando ativa; fechada, só o número. */
function AbaDeFora({ nome, icone, aba, classe }: { nome: string; icone: React.ReactNode; aba: AbaExtra; classe?: string }) {
  return (
    <button role="tab" className={classe} aria-selected={aba.ativa} title={aba.ativa ? undefined : nome} onClick={aba.abrir}>
      {icone}
      {aba.ativa ? (
        <span className="rot">
          {nome} <b>{aba.total}</b>
          <svg className="sub" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength={1} d={RABISCO} />
          </svg>
        </span>
      ) : (
        <sup>{aba.total}</sup>
      )}
    </button>
  );
}

/** "Ligar a…": a busca nas atrações, com "+ Nova atração" sempre no fim (ela recebe o que está na busca). */
/** A busca de atração: `nova` põe o "+ Nova atração" (sem ele, só a busca, como no card aberto da tela de produções, #160). */
/**
 * A busca para ligar um nome de uma lista (a atração do cadastro; #178, a campanha do card aberto): o campo, o "+ Nova"
 * preso embaixo dele e a lista filtrada sem caixa e acento, pelas setas e pelo Enter.
 * @param dica o que o campo pede (padrão: "Buscar atração"); rotuloDaNova, o botão de criar (padrão: "+ Nova atração")
 */
export function MenuLigar({ atracoes, ligar, nova, fechar, dentro = false, dica = 'Buscar atração', rotuloDaNova = '+ Nova atração' }: { atracoes: string[]; ligar: (nome: string) => void; nova?: (busca: string) => void; fechar: () => void; dentro?: boolean; dica?: string; rotuloDaNova?: string }) {
  const [busca, setBusca] = useState('');
  const [marcado, setMarcado] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const t = semAcento(busca.trim());
  const achadas = atracoes.filter((a) => !t || semAcento(a).includes(t));
  // -1 é o "+ Nova atração", preso embaixo da busca; sem nenhuma achada, ele já vem marcado
  const NOVA = -1;
  useEffect(() => {
    if (dentro) return; // dentro de um balão, quem fecha com o clique fora é o balão
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && fechar();
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [fechar, dentro]);
  useEffect(() => setMarcado(achadas.length || !nova ? 0 : NOVA), [busca]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = useRef<HTMLUListElement>(null);
  useEffect(() => {
    lista.current?.querySelector('.marcado')?.scrollIntoView({ block: 'nearest' });
  }, [marcado]);
  const escolher = (k: number) => (k >= 0 && k < achadas.length ? ligar(achadas[k]) : nova?.(busca));
  return (
    <div className="escolha-nome-menu menu-ligar" ref={caixa}>
      <input
        autoFocus
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={dica}
        aria-label={dica}
        onKeyDown={(e) => {
          if (e.key === 'Escape') fechar();
          else if (e.key === 'ArrowDown') (e.preventDefault(), setMarcado((m) => Math.min(achadas.length - 1, m + 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setMarcado((m) => Math.max(nova ? NOVA : 0, m - 1)));
          else if (e.key === 'Enter') (e.preventDefault(), escolher(marcado));
        }}
      />
      {nova && (
        <button type="button" className={`nova-ligar ${marcado === NOVA ? 'marcado' : ''}`} onMouseEnter={() => setMarcado(NOVA)} onMouseDown={(e) => e.preventDefault()} onClick={() => nova(busca)}>
          {rotuloDaNova}
        </button>
      )}
      <ul role="listbox" ref={lista}>
        {achadas.map((a, k) => (
          <li key={a} role="option" aria-selected={k === marcado} className={k === marcado ? 'marcado' : ''} onMouseEnter={() => setMarcado(k)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(k)}>
            {a}
          </li>
        ))}
        {!achadas.length && <li className="vazio-ligar">Nenhuma com “{busca}”</li>}
      </ul>
    </div>
  );
}

/** "As 142 claquetes dos últimos 90 dias têm atração.", com o número em destaque. */
function LinhaDoTotal({ total }: { total: number }) {
  const l = linhaDoTotal(total);
  return (
    <>
      {l.antes}
      <b>{l.numero}</b>
      {l.depois}
    </>
  );
}

/** Hoje, curto, como na claquete ("25/11"). */
const hojeCurto = () => {
  const d = new Date();
  return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Uma key sem cadastro: quantos roteiros, as claquetes de exemplo, a atração parecida, ligar, nova e ignorar. */
function LinhaSemCadastro({ k, atracoes, ligar, nova, ignorar }: { k: KeySemCadastro; atracoes: string[]; ligar: (nome: string) => void; nova: (busca: string) => void; ignorar: () => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="item-cad sem-cad">
      <div className="nome">
        <span className="key grande">{k.key}</span>
        <span className="qtd">{plural(k.roteiros, 'roteiro', 'roteiros')}</span>
      </div>
      <div className="lado-cad">
        {k.sugestao && (
          <button type="button" className="ligar-sug" title={`Pôr a key ${k.key} em ${k.sugestao}`} onClick={() => ligar(k.sugestao)}>
            {k.sugestao}?
          </button>
        )}
        <span className="ligar-a">
          <button type="button" className="ligar-icone" aria-label={`Ligar ${k.key} a uma atração`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <span className="ligar-texto" aria-hidden="true">Ligar a…</span>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path className="curva" d="M5.6 16.6 C 6 6, 18 18, 18.4 7.4" />
              <circle cx="4" cy="19" r="2.6" />
              <circle cx="20" cy="5" r="2.6" />
            </svg>
          </button>
          {menu && <MenuLigar atracoes={atracoes} ligar={(n) => (setMenu(false), ligar(n))} nova={(busca) => (setMenu(false), nova(busca))} fechar={() => setMenu(false)} />}
        </span>
      </div>
      <div className="exemplos">{k.exemplos.map((e) => <span key={e}>{e}</span>)}</div>
      <button type="button" className="ignorar-key" title="Ignorar: não é atração" aria-label={`Ignorar ${k.key}`} onClick={ignorar}>
        <Icone nome="fechar" tam={11} traco={2.4} />
      </button>
    </div>
  );
}

function Chips({ itens, mudar, rotulo, placeholder }: { itens: string[]; mudar: (k: string[]) => void; rotulo: string; placeholder: string }) {
  const [texto, setTexto] = useState('');
  const confirmar = () => {
    const k = comoKey(texto);
    if (k && !itens.includes(k)) mudar([...itens, k]);
    setTexto('');
  };
  return (
    <div className="entrada-cad chips" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
      {itens.map((k) => (
        <span key={k} className="key">
          {k}
          <button type="button" aria-label={`Tirar ${k}`} onClick={() => mudar(itens.filter((x) => x !== k))}>
            <Icone nome="fechar" tam={10} traco={2.6} />
          </button>
        </span>
      ))}
      <input
        aria-label={rotulo}
        value={texto}
        placeholder={itens.length ? '' : placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            confirmar();
          } else if (e.key === 'Backspace' && !texto && itens.length) mudar(itens.slice(0, -1));
        }}
        onBlur={confirmar}
      />
    </div>
  );
}

/** "+ key" que vira um campo ali mesmo, na linha. */
function NovaKey({ salvar }: { salvar: (k: string) => Promise<boolean> }) {
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const enviando = useRef(false);
  if (!aberta)
    return (
      <button type="button" className="key nova" onClick={() => setAberta(true)}>
        <Icone nome="mais" tam={11} traco={2.4} /> key
      </button>
    );
  const enviar = async () => {
    if (enviando.current) return;
    const k = comoKey(texto);
    if (!k) return setAberta(false);
    enviando.current = true;
    setSalvando(true);
    if (await salvar(k)) {
      setTexto('');
      setAberta(false);
    }
    setSalvando(false);
    enviando.current = false;
  };
  return (
    <input
      className="key editando"
      autoFocus
      disabled={salvando}
      value={texto}
      aria-label="Key nova"
      placeholder="NOVA KEY"
      onChange={(e) => setTexto(e.target.value.toUpperCase())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void enviar();
        if (e.key === 'Escape') setAberta(false);
      }}
      onBlur={() => (texto.trim() ? void enviar() : setAberta(false))}
      size={Math.max(8, texto.length + 1)}
    />
  );
}

function ChipKey({ k, recem, remover }: { k: KeyCadastro; recem: boolean; remover?: () => void }) {
  return (
    <span className={`key ${recem ? 'recem' : ''}`}>
      {k.key}
      {remover && (
        <button type="button" className="tirar-key" aria-label={`Remover a key ${k.key}`} title="Remover a key" onClick={remover}>
          <Icone nome="fechar" tam={10} traco={2.6} />
        </button>
      )}
    </span>
  );
}

/** Lixeira: some na hora e a caixinha preta embaixo oferece desfazer (só administradores). */
function Remover({ pode, nome, remover }: { pode: boolean; nome: string; remover: () => void }) {
  if (!pode)
    return (
      <span className="lixo-cad travado" title="Só administradores removem">
        <Icone nome="lixo" />
      </span>
    );
  return (
    <button type="button" className="lixo-cad" aria-label={`Remover ${nome}`} title="Remover (o nome continua no Trello, nos cards antigos)" onClick={remover}>
      <Icone nome="lixo" />
    </button>
  );
}

/** Pacote gráfico novo: as artes da atração no acervo deixam de valer (só administradores). */
function NovoPacote({ nome, avisar, depois }: { nome: string; avisar: (t: string) => void; depois: () => void }) {
  const [conferindo, setConferindo] = useState(false);
  const [indo, setIndo] = useState(false);
  if (conferindo)
    return (
      <span className="remover-conferir">
        Pacote gráfico novo? As artes de {nome} deixam de valer.
        <button type="button" className="botao-texto" onClick={() => setConferindo(false)}>Não</button>
        <button
          type="button"
          className="botao-texto perigo"
          disabled={indo}
          onClick={async () => {
            setIndo(true);
            try {
              const r = await zerarAcervo(nome);
              avisar(r.zeradas ? `${nome}: ${plural(r.zeradas, 'arte deixou', 'artes deixaram')} de valer. As próximas entram como novas.` : `${nome} não tinha artes no acervo.`);
              depois();
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não consegui trocar o pacote.');
            }
            setIndo(false);
            setConferindo(false);
          }}
        >
          Trocar
        </button>
      </span>
    );
  return (
    <button type="button" className="botao-texto pacote-cad" title="Pacote gráfico novo: as artes da atração no acervo deixam de valer" onClick={() => setConferindo(true)}>
      novo pacote
    </button>
  );
}

/** O acervo da atração, como aparece na tela (próprio é o padrão). */
const ACERVOS: { valor: AcervoDaAtracao; rotulo: string; dica: string }[] = [
  { valor: 'proprio', rotulo: 'próprio', dica: 'As artes prontas são da atração.' },
  { valor: 'filme', rotulo: 'do filme', dica: 'Sessão de filme: as artes prontas são do filme do dia.' },
  { valor: 'sem', rotulo: 'sem acervo', dica: 'Sem acervo: nenhuma arte fica guardada.' },
];
const rotuloDoAcervo = (a: AcervoDaAtracao) => ACERVOS.find((x) => x.valor === a)?.rotulo ?? 'próprio';

/** A escolha do acervo: as três opções, uma sempre marcada. */
function EscolhaDoAcervo({ valor, mudar, desligado = false }: { valor: AcervoDaAtracao; mudar: (a: AcervoDaAtracao) => void; desligado?: boolean }) {
  return (
    <div className="cats" role="radiogroup" aria-label="Acervo">
      {ACERVOS.map((a) => (
        <button key={a.valor} type="button" role="radio" aria-checked={valor === a.valor} title={a.dica} disabled={desligado} onClick={() => mudar(a.valor)}>
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

/** O acervo de uma atração da lista: a marca (do filme, sem acervo; o próprio só aparece ao passar o mouse), que abre
    as três opções para trocar. */
function AcervoNaLista({ atracao, trocar }: { atracao: AtracaoCadastro; trocar: (a: AcervoDaAtracao) => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [indo, setIndo] = useState(false);
  if (aberto)
    return (
      <span className="acervo-trocar" onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}>
        <EscolhaDoAcervo
          valor={atracao.acervo}
          desligado={indo}
          mudar={async (a) => {
            if (a !== atracao.acervo) {
              setIndo(true);
              await trocar(a);
              setIndo(false);
            }
            setAberto(false);
          }}
        />
      </span>
    );
  return (
    <button type="button" className={`acervo-cad ${atracao.acervo}`} title="O acervo da atração: clique para trocar" onClick={() => setAberto(true)}>
      {atracao.acervo === 'proprio' ? 'acervo próprio' : rotuloDoAcervo(atracao.acervo)}
    </button>
  );
}

/** A folha de rascunho: o que está no formulário, solto por cima da lista. */
function Rascunho({ nome, categoria, keys, assentando }: { nome: string; categoria?: string; keys: string[]; assentando: boolean }) {
  return (
    <div className={`folha-rascunho ${assentando ? 'assentando' : ''}`}>
      <div className="item-cad rascunho" aria-live="polite">
        <div className="nome">
          <span className="digitando">
            {nome || ' '}
            <svg className="ibeam-cad" viewBox="0 0 12 28" aria-hidden="true">
              <path d="M2 2 Q6 2 6 6 V22 Q6 26 2 26 M10 2 Q6 2 6 6 M10 26 Q6 26 6 22 M3.5 14 H8.5" />
            </svg>
          </span>
          {categoria && <span className="cat">{categoria}</span>}
        </div>
        <div className="keys">
          {keys.map((k) => (
            <span key={k} className="key">{k}</span>
          ))}
        </div>
        <SetaCurva className="seta-form" />
        <span className="nota">ainda não salvo</span>
      </div>
    </div>
  );
}

/* ---------- tela ---------- */

interface Props {
  voltar: () => void;
  avisar: (t: string) => void;
  /** Abre já numa aba e, para atração, com o formulário preenchido a partir da claquete (ou com o nome e a key
      que o "+ Nova atração" do balão escolheu). */
  inicio?: { aba?: TipoCadastro; claquete?: string; ilhas?: boolean } & Partial<AtracaoNova>;
}

export function Cadastros({ voltar, avisar, inicio }: Props) {
  const [dados, setDados] = useState<DadosCadastros | null>(null);
  const [falha, setFalha] = useState('');
  const [aba, setAba] = useState<TipoCadastro>(inicio?.aba ?? 'atracoes');
  const [busca, setBusca] = useState('');
  const [recem, setRecem] = useState<string[]>([]);
  const [assentando, setAssentando] = useState(false);
  // a aba "Sem cadastro": as keys das claquetes que nenhuma atração reconhece (o formulário da direita é o de atração;
  // a folha de rascunho toma o lugar da linha da key que leva)
  const [semCad, setSemCad] = useState(false);
  // a aba Duplicadas (só administradores)
  const [dupAberta, setDupAberta] = useState(false);
  // a aba Padeiros (#137, só administradores); aberta, ela toma o lugar da lista e do painel como a Duplicadas
  const [padAberta, setPadAberta] = useState(false);
  // a aba Ilhas (#124)
  const [ilhasAbertas, setIlhasAbertas] = useState(!!inicio?.ilhas);
  const ilhas = useIlhas(ilhasAbertas, avisar);
  // onde a tira de rascunho abre a vaga na lista
  const [nomeVaga, setNomeVaga] = useState<string | null>(null);
  const vaga = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = vaga.current;
    if (!el) return;
    const t = setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 60);
    return () => clearTimeout(t);
  }, [nomeVaga, aba, semCad]);
  const [salvando, setSalvando] = useState(false);
  const [sem, setSem] = useState<KeySemCadastro[] | null>(null);
  // apagar, remover key e ignorar: some na hora, a caixinha preta oferece desfazer e só depois vai para o servidor
  const [escondidos, setEscondidos] = useState<string[]>([]);
  const [desfazer, setDesfazer] = useState<{ texto: React.ReactNode; id: string } | null>(null);
  const pendente = useRef<{ id: string; executar: () => Promise<void>; timer: number } | null>(null);
  const nomeAtr = useRef<HTMLInputElement>(null);
  // as claquetes que têm atração: o número e a amostra da comemoração do Sem cadastro zerado (total null: ainda não
  // chegou, ou o cadastro que zerou a lista acabou de mudar o número)
  const [reconhecidas, setReconhecidas] = useState<{ total: number | null; amostra: string[] }>({ total: null, amostra: [] });
  const carregarSem = () =>
    lerSemCadastro().then(
      (r) => {
        setSem(r.keys);
        setReconhecidas({ total: r.reconhecidas.total, amostra: r.reconhecidas.amostra });
      },
      () => setSem([]),
    );
  // a comemoração: o cadastro (ou o "Ligar a…") desta tela que zerou o Sem cadastro. destacadas: os exemplos das
  // linhas que saíram, guardados antes de elas saírem; cena: a atração que vai na claquete
  const [festa, setFesta] = useState<{ destacadas: string[]; cena: string } | null>(null);
  const listaEl = useRef<HTMLElement>(null);
  // o Sem cadastro como está agora (as funções assíncronas de salvar e ligar leem daqui, não da renderização velha)
  const semAgora = useRef({ sem, escondidos, semCad });
  semAgora.current = { sem, escondidos, semCad };
  /** Começa a comemoração se as keys que saem levam a última linha que aparece no Sem cadastro. */
  const comemorarSeZerou = (saem: string[], cena: string, comoNaLinha: (key: string) => string) => {
    const { sem: linhas, escondidos: esc, semCad: naAba } = semAgora.current;
    if (!naAba || !linhas) return false;
    const visiveis = linhas.filter((k) => !esc.includes(`sem:${k.key}`)).map((k) => ({ key: comoNaLinha(k.key), exemplos: k.exemplos }));
    const f = festaDoSemCadastro(visiveis, saem);
    if (!f) return false;
    setFesta({ destacadas: f.destacadas, cena });
    // o total muda com este cadastro: a linha do número espera o novo
    setReconhecidas((r) => ({ ...r, total: null }));
    return true;
  };
  useEffect(() => {
    void carregarSem();
  }, []);

  // a ficha da atração: clicar na linha abre no lugar de "Nova atração"; "Ver as N" troca a lista pelo acervo dela
  const celular = useTelaDeCelular();
  const [aberta, setAberta] = useState<string | null>(null);
  const [verAcervo, setVerAcervo] = useState(false);
  const [ficha, setFicha] = useState<{ nome: string; acervo: AcervoDaFicha | null; falha: string } | null>(null);
  // quantas artes cada atração tem no acervo (pelo nome sem acento nem caixa); null: o acervo não está ligado
  const [noAcervo, setNoAcervo] = useState<Map<string, number> | null>(null);
  const nomeComparavel = (nome: string) => semAcento(nome).toUpperCase().trim();
  const carregarTotais = () =>
    lerTotaisDoAcervo().then(
      (r) => setNoAcervo(r.ligado ? new Map(Object.entries(r.totais).map(([nome, n]) => [nomeComparavel(nome), n])) : null),
      () => setNoAcervo(null),
    );
  useEffect(() => {
    void carregarTotais();
  }, []);
  // o histórico das importações da atração aberta (some quando a leitura falha: a ficha continua)
  const [historico, setHistorico] = useState<{ nome: string; lista: ImportacaoNoHistorico[] } | null>(null);
  const lerHistorico = (nome: string) =>
    lerImportacoes(nome).then(
      (r) => setHistorico({ nome, lista: r.importacoes }),
      () => setHistorico({ nome, lista: [] }),
    );
  // as regras desta atração (#63), só para administradores (some quando a leitura falha: a ficha continua)
  const [regras, setRegras] = useState<{ nome: string; lista: RegraDaAtracao[] } | null>(null);
  const lerRegras = (nome: string) =>
    lerRegrasDaAtracao(nome).then(
      (r) => setRegras({ nome, lista: r.regras }),
      () => setRegras({ nome, lista: [] }),
    );
  const apagarRegra = async (id: number, atracao: string) => {
    try {
      await apagarRegraDaAtracao(id);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui apagar a regra.');
    }
    await lerRegras(atracao);
  };
  const lerFicha = (nome: string) => {
    setFicha((f) => (f?.nome === nome ? f : { nome, acervo: null, falha: '' }));
    void lerHistorico(nome);
    if (dados?.podeApagar) void lerRegras(nome);
    return lerAcervoDaFicha(nome).then(
      (acervo) => setFicha((f) => (f?.nome === nome ? { nome, acervo, falha: '' } : f)),
      (e: Error) => setFicha((f) => (f?.nome === nome ? { nome, acervo: null, falha: e.message || 'Não consegui ler o acervo.' } : f)),
    );
  };
  const abrirFicha = (a: AtracaoCadastro) => {
    setImportacao(null);
    setAberta(a.id);
    setVerAcervo(false);
    void lerFicha(a.nome);
    if (celular) window.scrollTo(0, 0);
  };
  // a importação do acervo por CSV, da atração aberta: lendo o arquivo, conferindo a prévia ou com o resultado gravado
  const [importacao, setImportacao] = useState<{
    atracao: string;
    lendo: boolean;
    falha: string;
    previa?: PreviaDaImportacao;
    resultado?: ResultadoDaImportacao;
    desfazendo?: boolean;
    desfeita?: ImportacaoDesfeita;
  } | null>(null);
  const importacaoAgora = useRef(importacao);
  importacaoAgora.current = importacao;
  // a caixinha preta logo depois de gravar: "+N no acervo de X. Desfazer" por alguns segundos
  const [caixinha, setCaixinha] = useState<{ id: string; atracao: string; novas: number } | null>(null);
  const prazoDaCaixinha = useRef(0);
  const fecharCaixinha = () => {
    clearTimeout(prazoDaCaixinha.current);
    setCaixinha(null);
  };
  useEffect(() => () => clearTimeout(prazoDaCaixinha.current), []);
  const gravou = (atracao: string, resultado: ResultadoDaImportacao) => {
    setImportacao((i) => (i ? { ...i, resultado } : i));
    window.scrollTo(0, 0);
    if (!resultado.importacao) return;
    clearTimeout(prazoDaCaixinha.current);
    setCaixinha({ id: resultado.importacao, atracao, novas: resultado.novas });
    prazoDaCaixinha.current = window.setTimeout(() => setCaixinha(null), 8000);
  };
  /** Desfaz a importação (a caixinha preta, o resultado ou o histórico da ficha): a ficha e a lista releem o total. */
  const desfazerAImportacao = async (id: string, atracao: string) => {
    fecharCaixinha();
    const naTela = () => importacaoAgora.current?.resultado?.importacao === id;
    setImportacao((i) => (i?.resultado?.importacao === id ? { ...i, desfazendo: true } : i));
    try {
      const feito = await desfazerImportacao(id);
      setImportacao((i) => (i?.resultado?.importacao === id ? { ...i, desfazendo: false, desfeita: feito } : i));
      // no resultado, a tela mostra; na ficha, o aviso (as que não voltaram ficam no histórico)
      if (!naTela())
        avisar(
          `Importação desfeita: o acervo de ${atracao} tem ${feito.depois}.` +
            (feito.naoVoltaram.length ? ` ${plural(feito.naoVoltaram.length, 'linha não voltou', 'linhas não voltaram')}: veja em Importações.` : ''),
        );
      void lerFicha(atracao);
      void carregarTotais();
    } catch (e) {
      setImportacao((i) => (i?.resultado?.importacao === id ? { ...i, desfazendo: false } : i));
      avisar(e instanceof Error ? e.message : 'Não consegui desfazer a importação.');
      void lerHistorico(atracao);
    }
  };
  /** Retoma a gravação que parou no meio (o histórico da ficha). */
  const retomarAImportacao = async (id: string, atracao: string) => {
    try {
      const r = await retomarImportacao(id);
      avisar(`Importação retomada: o acervo de ${atracao} tem ${r.depois}.`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui retomar a importação.');
    }
    void lerFicha(atracao);
    void carregarTotais();
  };
  const importar = (atracao: string) => async (arquivo: File) => preverOCsv(atracao, arquivo.name, () => arquivo.text());
  const preverOCsv = async (atracao: string, nome: string, ler: () => Promise<string>) => {
    setImportacao({ atracao, lendo: true, falha: '' });
    try {
      const previa = await preverImportacao(atracao, nome, await ler());
      setImportacao((i) => (i?.atracao === atracao ? { atracao, lendo: false, falha: '', previa } : i));
      window.scrollTo(0, 0);
    } catch (e) {
      setImportacao((i) => (i?.atracao === atracao ? { atracao, lendo: false, falha: e instanceof Error ? e.message : 'Não consegui ler o CSV.' } : i));
    }
  };
  /** O CSV de outra atração (#62): o mesmo arquivo vai para a ficha da atração em cuja pasta de output estão os
      caminhos, e a conferência recomeça lá. */
  const importarEmOutra = (previa: PreviaDaImportacao) => (nome: string) => {
    const a = dados?.atracoes.find((x) => x.nome.localeCompare(nome, 'pt-BR', { sensitivity: 'base' }) === 0);
    if (!a) return;
    abrirFicha(a);
    void preverOCsv(a.nome, previa.arquivo, async () => previa.csv);
  };
  /** Sai da conferência (ou do resultado) de volta à ficha; com o acervo gravado, a ficha e a lista releem o total. */
  const voltarDaImportacao = (atracao: string, ver = false) => {
    // o acervo antigo não aparece nem por um instante: a ficha relê. Sem resultado também relê (a gravação que parou
    // no meio mudou o acervo e está em Importações)
    if (importacao?.resultado) setFicha({ nome: atracao, acervo: null, falha: '' });
    void lerFicha(atracao);
    void carregarTotais();
    setImportacao(null);
    setVerAcervo(ver);
  };
  const fecharFicha = () => {
    setImportacao(null);
    setAberta(null);
    setVerAcervo(false);
    setFicha(null);
  };

  // formulários, um por aba
  const daClaquete = inicio?.claquete ? atracaoDaClaquete(inicio.claquete) : '';
  const nomeInicial = inicio?.nome ?? daClaquete;
  const keyInicial = inicio?.key ? comoKey(inicio.key) : daClaquete ? comoKey(daClaquete) : '';
  const [atr, setAtr] = useState({ nome: nomeInicial, keys: keyInicial ? [keyInicial] : [], categoria: '', acervo: 'proprio' as AcervoDaAtracao, campos: {} as Record<string, string> });
  // o nome que a pessoa confirmou ser de outra atração, depois do aviso de que parece uma que já existe (#118)
  const [outraAtracao, setOutraAtracao] = useState('');
  const [red, setRed] = useState({ nome: '', keys: [] as string[] });
  const [edi, setEdi] = useState({ nome: '', keys: [] as string[] });

  const carregar = (renovar = false) =>
    lerCadastros(renovar).then(
      (d) => {
        setDados(d);
        setFalha('');
      },
      (e: Error) => setFalha(e.message),
    );
  useEffect(() => {
    void carregar();
  }, []);

  const marcarRecem = (ids: string[]) => {
    setRecem(ids);
    setTimeout(() => setRecem([]), 2400);
  };

  /** Atração nova: os roteiros da fila que estavam sem atração e começam com uma das keys passam a ter. */
  /** Salva o formulário da aba: a folha assenta, a lista recarrega e o item novo pisca. */
  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      let msg = '';
      let id = '';
      let depois: (() => Promise<void>) | null = null;
      let tirarDoSem: (() => void) | null = null;
      if (aba === 'atracoes') {
        const keysNovas = atr.keys.map(comoKey);
        const r = await cadastrar<{ id: string; nome: string; keys: string[] }>('atracoes', { ...atr, ...(outraAtracao && outraAtracao === atr.nome ? { outra: true } : {}) });
        // no Sem cadastro, as linhas dessas keys saem junto com a folha (sem esperar a lista nova); se eram as
        // últimas, a comemoração guarda os exemplos delas antes
        tirarDoSem = () => {
          comemorarSeZerou(keysNovas, r.nome, comoKey);
          setSem((l) => l?.filter((x) => !keysNovas.includes(comoKey(x.key))) ?? l);
        };
        id = r.id;
        msg = `${r.nome} cadastrada.`;
        // reconhecer os roteiros da fila leva um tempo: acontece depois que a folha assenta
        depois = async () => {
          const n = await reconhecerNaFila(r.nome);
          if (n) avisar(`${r.nome}: ${plural(n, 'roteiro reconhecido', 'roteiros reconhecidos')} na fila.`);
        };
      } else if (aba === 'redatores') {
        const r = await cadastrar<{ id: string; nome: string; trello: boolean }>('redatores', red);
        id = r.id;
        msg = `${r.nome} cadastrado${r.trello ? ', também no Trello' : ''}.`;
      } else {
        const r = await cadastrar<{ id: string; nome: string; trello: boolean }>('editores', edi);
        id = r.id;
        msg = `${r.nome} cadastrado${r.trello ? ', também no Trello' : ''}.`;
      }
      setAssentando(true);
      await new Promise((ok) => setTimeout(ok, 520));
      await carregar(true);
      setAssentando(false);
      tirarDoSem?.();
      if (aba === 'atracoes') setAtr({ nome: '', keys: [], categoria: '', acervo: 'proprio', campos: {} });
      else if (aba === 'redatores') setRed({ nome: '', keys: [] });
      else setEdi({ nome: '', keys: [] });
      marcarRecem([id]);
      avisar(msg);
      void depois?.();
      void carregarSem();
    } catch (e) {
      // parece uma atração que já existe: salvar de novo com o mesmo nome confirma que é outra
      if (aba === 'atracoes' && (e as { status?: number }).status === 409 && e instanceof Error && e.message.includes(' parece ')) setOutraAtracao(atr.nome);
      avisar(e instanceof Error ? e.message : 'Não consegui cadastrar.');
    }
    setSalvando(false);
  };

  const novaKey = (tipo: TipoCadastro, id: string) => async (key: string) => {
    try {
      const k = await darKey(tipo, id, key);
      await carregar(true);
      marcarRecem([k.id]);
      if (tipo === 'atracoes') {
        const a = dados?.atracoes.find((x) => x.id === id);
        if (a) {
          const n = await reconhecerNaFila(a.nome);
          if (n) avisar(`${plural(n, 'roteiro reconhecido', 'roteiros reconhecidos')} na fila.`);
        }
      }
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui gravar a key.');
      return false;
    }
  };
  /** Troca o acervo de uma atração da lista (vai direto para o Teable). */
  const trocarAcervo = (a: AtracaoCadastro) => async (acervo: AcervoDaAtracao) => {
    try {
      await mudarAcervo(a.id, acervo);
      await carregar(true);
      if (a.id === aberta) void lerFicha(a.nome);
      avisar(`${a.nome}: acervo ${rotuloDoAcervo(acervo)}.`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui trocar o acervo.');
    }
  };
  /** Liga a key a uma atração que já existe (pelo nome) e tira a linha da lista. */
  const ligarKey = async (key: string, nome: string) => {
    const a = dados?.atracoes.find((x) => x.nome === nome);
    if (!a) return avisar(`${nome} não está nos cadastros.`);
    if (await novaKey('atracoes', a.id)(key)) {
      const zerou = comemorarSeZerou([key], a.nome, (k) => k);
      setSem((l) => l?.filter((x) => x.key !== key) ?? l);
      avisar(`${key} agora é de ${a.nome}.`);
      // o número da comemoração já conta a key ligada
      if (zerou) void carregarSem();
    }
  };
  /** "+ Nova": o formulário da direita começa com a key e com o nome (o da busca, ou o da key). */
  const novaComKey = (k: KeySemCadastro, busca: string) => {
    setAtr({ nome: nomeDaAtracaoNova(busca, k.key, k.exemplos, dados?.atracoes.map((a) => a.nome)), keys: [comoKey(k.key)], categoria: '', acervo: 'proprio', campos: {} });
    setTimeout(() => nomeAtr.current?.focus(), 0);
  };
  /** Executa já o que estava esperando o desfazer (outro apagar começou, ou a tela vai fechar). */
  const concluir = () => {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    setDesfazer(null);
    void p.executar().finally(() => setEscondidos((l) => l.filter((x) => x !== p.id)));
  };
  const comDesfazer = (id: string, texto: React.ReactNode, executar: () => Promise<void>) => {
    concluir();
    setEscondidos((l) => [...l, id]);
    setDesfazer({ texto, id });
    pendente.current = { id, executar, timer: window.setTimeout(concluir, 6000) };
  };
  const desfazerAgora = () => {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    setDesfazer(null);
    setEscondidos((l) => l.filter((x) => x !== p.id));
  };
  // sair da tela não cancela: o que foi apagado é apagado
  useEffect(() => () => {
    const p = pendente.current;
    if (p) (clearTimeout(p.timer), void p.executar());
  }, []);

  const ignorar = (key: string) =>
    comDesfazer(`sem:${key}`, <><b>{key}</b> ignorada.</>, async () => {
      try {
        await ignorarKey(key);
        setSem((l) => l?.filter((x) => x.key !== key) ?? l);
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'Não consegui ignorar.');
      }
    });

  const remover = (tipo: TipoCadastro, id: string, nome: string, keyId?: string) => () =>
    comDesfazer(keyId ? `${id}:${keyId}` : id, keyId ? <>Key <b>{nome}</b> removida.</> : <><b>{nome}</b> removido.</>, async () => {
      try {
        await removerCadastro(tipo, id, keyId);
        await carregar(true);
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'Não consegui remover.');
      }
    });

  // o e-mail do login (#106): grava na hora e a caixinha preta oferece desfazer (que grava o de antes)
  const [gravado, setGravado] = useState<{ id: string; texto: React.ReactNode; voltar: () => Promise<void> } | null>(null);
  const prazoDoGravado = useRef(0);
  useEffect(() => () => clearTimeout(prazoDoGravado.current), []);
  const mostrarGravado = (id: string, texto: React.ReactNode, voltar: () => Promise<void>) => {
    clearTimeout(prazoDoGravado.current);
    setGravado({ id, texto, voltar });
    prazoDoGravado.current = window.setTimeout(() => setGravado(null), 6000);
  };
  const voltarGravado = async () => {
    const g = gravado;
    if (!g) return;
    clearTimeout(prazoDoGravado.current);
    setGravado(null);
    try {
      await g.voltar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui desfazer.');
    }
    await carregar(true);
  };
  /** Grava o e-mail do cadastro (à mão ou pelo "É"); `texto` é o que a caixinha diz. */
  const gravarEmail = async (tipo: SugestaoDeEmail['tipo'], id: string, email: string, texto: (e: string) => React.ReactNode) => {
    try {
      const r = await mudarEmailDoCadastro(tipo, id, email);
      await carregar(true);
      marcarRecem([id]);
      mostrarGravado(`email:${id}:${r.email}`, texto(r.email), async () => void (await mudarEmailDoCadastro(tipo, id, r.antes)));
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui gravar o e-mail.');
      return false;
    }
  };
  const emailAMao = (tipo: SugestaoDeEmail['tipo'], c: RedatorCadastro | EditorCadastro) => (email: string) =>
    gravarEmail(tipo, c.id, email, (e) => (e ? <><b>{e}</b> agora é o e-mail de {c.nome}.</> : <>{c.nome} ficou sem e-mail.</>));
  const simE = (s: SugestaoDeEmail) => void gravarEmail(s.tipo, s.id, s.email, (e) => <><b>{e}</b> agora está ligado a {quemNoCadastro(s.tipo, s.nome)}.</>);
  /** Marca ou tira o editor da coordenação (#123), pelo e-mail dele. */
  const mudarCoordenacao = (c: EditorCadastro) => async (marcar: boolean) => {
    try {
      const r = await marcarCoordenacao(c.email, marcar);
      setDados((d) => (d ? { ...d, coordenacao: r.coordenacao } : d));
      avisar(marcar ? `${c.nome} agora é da coordenação: monta a pauta.` : `${c.nome} saiu da coordenação.`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui mudar a coordenação.');
    }
  };
  /** O nome novo da pauta (#132): ligar ao editor que já existe, cadastrar como editor novo ou ignorar. */
  const ligarONomeNovo = (n: NomeNovoDaPauta) => async (e: EditorCadastro) => {
    try {
      await ligarNomeNovo(n.nome, e.id);
      await carregar(true);
      marcarRecem([e.id]);
      avisar(`${n.nome} agora é ${e.nome}: a pauta mostra o nome do cadastro.`);
    } catch (falha) {
      avisar(falha instanceof Error ? falha.message : 'Não consegui ligar o nome.');
    }
  };
  const cadastrarONomeNovo = (n: NomeNovoDaPauta) => async () => {
    try {
      const r = await cadastrar<{ id: string; nome: string; trello: boolean }>('editores', { nome: n.nome });
      await carregar(true);
      marcarRecem([r.id]);
      avisar(`${r.nome} cadastrado${r.trello ? ', também no Trello' : ''}.`);
    } catch (falha) {
      avisar(falha instanceof Error ? falha.message : 'Não consegui cadastrar.');
    }
  };
  const ignorarONomeNovo = (n: NomeNovoDaPauta) => async () => {
    try {
      await ignorarNomeNovo(n.nome);
      await carregar(true);
      mostrarGravado(`nome-novo:${n.nome}`, <><b>{n.nome}</b> fica na pauta como está. O PROMeiro não pergunta de novo.</>, async () => void (await ignorarNomeNovo(n.nome, true)));
    } catch (falha) {
      avisar(falha instanceof Error ? falha.message : 'Não consegui guardar a resposta.');
    }
  };
  const naoE = async (s: SugestaoDeEmail) => {
    try {
      await responderNaoE(s);
      await carregar(true);
      mostrarGravado(`nao-e:${s.id}:${s.email}`, <><b>{s.email}</b> não é {quemNoCadastro(s.tipo, s.nome)}. O PROMeiro não pergunta de novo.</>, async () => void (await responderNaoE(s, true)));
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui guardar a resposta.');
    }
  };

  // lista da aba, filtrada pela busca
  const termo = semAcento(busca.trim());
  const casa = (...partes: string[]) => !termo || semAcento(partes.join(' ')).includes(termo);
  const totais = { atracoes: dados?.atracoes.length ?? 0, redatores: dados?.redatores.length ?? 0, editores: dados?.editores.length ?? 0 };
  const pode = !!dados?.podeApagar;
  const duplicadas = useDuplicadas(pode, dupAberta, busca);
  const padeiros = usePadeiros(pode);

  // a atração da ficha (a removida fecha a ficha); com ela aberta, o formulário e a folha de rascunho esperam
  const atracaoAberta = aba === 'atracoes' && !semCad && aberta ? (dados?.atracoes.find((a) => a.id === aberta && !escondidos.includes(a.id)) ?? null) : null;
  // o acervo lido para ela (o de outra atração, ainda chegando, não conta)
  const fichaAberta = atracaoAberta && ficha?.nome === atracaoAberta.nome ? ficha : null;
  // o rascunho entra na ordem alfabética
  const rascunho =
    atracaoAberta ? null
    : aba === 'atracoes' ? (atr.nome || atr.keys.length ? { nome: atr.nome, categoria: atr.categoria, keys: atr.keys } : null)
    : aba === 'redatores' ? (red.nome || red.keys.length ? { nome: red.nome, keys: red.keys } : null)
    : edi.nome || edi.keys.length ? { nome: edi.nome, keys: edi.keys } : null;
  // o lugar segue o nome com um respiro: abre a vaga quando a pessoa para de digitar, não a cada letra
  const nomeRascunho = rascunho ? rascunho.nome : null;
  useEffect(() => {
    if (nomeRascunho === null) return setNomeVaga(null);
    const t = setTimeout(() => setNomeVaga(nomeRascunho), nomeVaga === null ? 120 : 380);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeRascunho]);
  // a folha de rascunho na vaga que ela abre: a mesma na lista da aba e no Sem cadastro
  const folhaNaVaga = () =>
    rascunho && (
      <div className="vaga" ref={vaga}>
        <Rascunho nome={rascunho.nome} categoria={'categoria' in rascunho ? rascunho.categoria : undefined} keys={rascunho.keys} assentando={assentando} />
      </div>
    );
  const comRascunho = <T extends { nome: string }>(lista: T[], render: (x: T) => React.ReactNode) => {
    const itens = lista.map((x) => ({ nome: x.nome, k: (x as unknown as { id: string }).id, no: render(x) }));
    if (rascunho && nomeVaga !== null) {
      const achou = itens.findIndex((x) => x.nome.localeCompare(nomeVaga || '\uffff', 'pt-BR') > 0);
      const pos = achou < 0 ? itens.length : achou;
      itens.splice(pos, 0, { nome: '', k: `rascunho-${aba}-${pos}`, no: folhaNaVaga() });
    }
    return (
      <Vagas itens={itens} chave={(x) => x.k}>
        {(x) => x.no}
      </Vagas>
    );
  };

  const listaAtracoes = (dados?.atracoes ?? []).filter((a) => !escondidos.includes(a.id) && casa(a.nome, a.categoria, ...a.keys.map((k) => k.key)));
  const listaRedatores = (dados?.redatores ?? []).filter((r) => !escondidos.includes(r.id) && casa(r.nome, r.email, ...r.keys.map((k) => k.key)));
  const listaEditores = (dados?.editores ?? []).filter((e) => !escondidos.includes(e.id) && casa(e.nome, e.email, ...e.keys.map((k) => k.key)));
  // as sugestões "É Fulana, dos redatores?" da aba (só administradores recebem)
  const sugestoesDaAba = (dados?.sugestoes ?? []).filter((x) => x.tipo === aba);
  // os nomes novos da pauta (#132), na aba dos Editores (só administradores recebem)
  const nomesNovosDaBusca = (dados?.nomesNovos ?? []).filter((n) => casa(n.nome));
  const itemAtracao = (a: AtracaoCadastro) => (
    <div
      key={a.id}
      className={`item-cad atracao-cad ${recem.includes(a.id) ? 'chegou' : ''} ${aberta === a.id ? 'aberta' : ''}`}
      // a linha inteira abre a ficha; os botões, as keys e o "+ key" de dentro continuam fazendo o que fazem
      onClick={(e) => !(e.target as HTMLElement).closest('button, input, .key, .acervo-trocar') && abrirFicha(a)}
    >
      <div className="nome">
        <button type="button" className="abrir-ficha" aria-current={aberta === a.id ? 'true' : undefined} title="Abrir a ficha da atração" onClick={() => abrirFicha(a)}>
          {a.nome}
        </button>{' '}
        {a.categoria && <span className="cat">{a.categoria}</span>}
        <AcervoNaLista atracao={a} trocar={trocarAcervo(a)} />
      </div>
      <div className="lado-cad">
        {noAcervo && a.acervo === 'proprio' && (() => {
          const n = noAcervo.get(nomeComparavel(a.nome)) ?? 0;
          return (
            <span className="qtd-acervo">
              <b>{n}</b> {n === 1 ? 'arte' : 'artes'}
            </span>
          );
        })()}
        {noAcervo && a.acervo === 'filme' && <span className="qtd-acervo">acervo do filme</span>}
        <Remover pode={pode} nome={a.nome} remover={remover('atracoes', a.id, a.nome)} />
      </div>
      <div className="keys">
        <Vagas eixo="x" itens={a.keys.filter((k) => !escondidos.includes(`${a.id}:${k.id}`))} chave={(k) => k.id}>
          {(k) => <ChipKey k={k} recem={recem.includes(k.id) || recem.includes(a.id)} remover={pode ? remover('atracoes', a.id, k.key, k.id) : undefined} />}
        </Vagas>
        <NovaKey salvar={novaKey('atracoes', a.id)} />
      </div>
    </div>
  );
  const itemRedator = (r: RedatorCadastro) => (
    <div key={r.id} className={`item-cad ${recem.includes(r.id) ? 'chegou' : ''}`}>
      <div className="nome">
        {r.nome} <EmailNaLinha email={r.email} pode={pode} salvar={emailAMao('redatores', r)} />
      </div>
      <div className="lado-cad">
        {r.trello && <span className="no-trello"><Icone nome="quadro" tam={14} /> no Trello</span>}
        <Remover pode={pode} nome={r.nome} remover={remover('redatores', r.id, r.nome)} />
      </div>
      <div className="keys">
        <Vagas eixo="x" itens={r.keys.filter((k) => !escondidos.includes(`${r.id}:${k.id}`))} chave={(k) => k.id}>
          {(k) => <ChipKey k={k} recem={recem.includes(k.id) || recem.includes(r.id)} remover={pode ? remover('redatores', r.id, k.key, k.id) : undefined} />}
        </Vagas>
        <NovaKey salvar={novaKey('redatores', r.id)} />
      </div>
    </div>
  );
  const itemEditor = (e: EditorCadastro) => (
    <div key={e.id} className={`item-cad ${recem.includes(e.id) ? 'chegou' : ''}`}>
      <div className="nome">
        {e.nome} <EmailNaLinha email={e.email} pode={pode} salvar={emailAMao('editores', e)} />{' '}
        <CoordenacaoNaLinha nome={e.nome} email={e.email} pode={pode} marcada={!!e.email && (dados?.coordenacao ?? []).includes(e.email.toLowerCase())} mudar={mudarCoordenacao(e)} />
      </div>
      <div className="lado-cad">
        {e.trello && <span className="no-trello"><Icone nome="quadro" tam={14} /> no Trello</span>}
        <Remover pode={pode} nome={e.nome} remover={remover('editores', e.id, e.nome)} />
      </div>
      <div className="keys">
        <Vagas eixo="x" itens={e.keys.filter((k) => !escondidos.includes(`${e.id}:${k.id}`))} chave={(k) => k.id}>
          {(k) => <ChipKey k={k} recem={recem.includes(k.id) || recem.includes(e.id)} remover={pode ? remover('editores', e.id, k.key, k.id) : undefined} />}
        </Vagas>
        <NovaKey salvar={novaKey('editores', e.id)} />
      </div>
    </div>
  );

  const limpar = () => (aba === 'atracoes' ? setAtr({ nome: '', keys: [], categoria: '', acervo: 'proprio', campos: {} }) : aba === 'redatores' ? setRed({ nome: '', keys: [] }) : setEdi({ nome: '', keys: [] }));
  const xLimpar = rascunho && (
    <button type="button" className="limpar-campo" title="Limpar" aria-label="Limpar o formulário" onClick={(e) => { e.preventDefault(); limpar(); }}>
      <Icone nome="fechar" tam={14} />
    </button>
  );
  const valoresCaminho = { ...atr.campos, atracao: atr.nome, categoria: atr.categoria };
  // as abas e a busca, no alto da lista (a mesma na aba Padeiros, que tem a própria lista)
  const topoDaLista = (
    <div className="lista-topo">
      <Abas
        aba={aba}
        mudar={(a) => { setAba(a); setSemCad(false); setDupAberta(false); setPadAberta(false); setIlhasAbertas(false); setBusca(''); setFesta(null); fecharFicha(); }}
        totais={totais}
        sem={{ ativa: semCad, total: sem?.length ?? 0, abrir: () => { setAba('atracoes'); setSemCad(true); setDupAberta(false); setPadAberta(false); setIlhasAbertas(false); setBusca(''); setFesta(null); fecharFicha(); } }}
        dup={pode ? { ativa: dupAberta, total: duplicadas.lista?.pendentes ?? 0, abrir: () => { setAba('atracoes'); setSemCad(false); setDupAberta(true); setPadAberta(false); setIlhasAbertas(false); setBusca(''); setFesta(null); fecharFicha(); } } : null}
        pad={pode ? { ativa: padAberta, total: padeiros.pendentes, abrir: () => { setAba('atracoes'); setSemCad(false); setDupAberta(false); setPadAberta(true); setIlhasAbertas(false); setBusca(''); setFesta(null); fecharFicha(); } } : null}
        ilhas={{ ativa: ilhasAbertas, total: ilhas.dados?.ilhas.length ?? 0, abrir: () => { setAba('atracoes'); setSemCad(false); setDupAberta(false); setPadAberta(false); setIlhasAbertas(true); setBusca(''); setFesta(null); fecharFicha(); } }}
      />
      <label className="cad-busca">
        <Icone nome="lupa" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={ilhasAbertas ? 'Buscar ilha' : padAberta ? 'Buscar usuário, sigla ou designer' : dupAberta ? 'Buscar claquete' : semCad ? 'Buscar key ou claquete' : aba === 'atracoes' ? 'Buscar atração ou key' : aba === 'redatores' ? 'Buscar redator, key ou e-mail' : 'Buscar editor, key ou e-mail'} />
      </label>
    </div>
  );
  const prontoParaSalvar =
    aba === 'atracoes' ? !!atr.nome.trim() && atr.keys.length > 0 : aba === 'redatores' ? !!red.nome.trim() : !!edi.nome.trim();

  return (
    <div className="pagina cadastros">
      <header className="cad-topo">
        <button className="voltar-cad" onClick={voltar}>
          <Icone nome="voltar" tam={16} /> Fila
        </button>
        <Marca />
        <span />
      </header>
      {celular && atracaoAberta ? (
        <main className="cad">
          <FichaNoCelular key={atracaoAberta.id} nome={atracaoAberta.nome} acervo={fichaAberta?.acervo ?? null} falha={fichaAberta?.falha ?? ''} voltar={fecharFicha} />
        </main>
      ) : atracaoAberta && importacao?.atracao === atracaoAberta.nome && importacao.previa ? (
        <main className="cad cad-importar">
          <p className="trilha-cad">
            <button type="button" className="botao-texto" onClick={() => { setImportacao(null); fecharFicha(); }}>Cadastros</button>
            <Icone nome="direita" tam={13} />
            <button type="button" className="botao-texto" onClick={() => voltarDaImportacao(atracaoAberta.nome)}>{atracaoAberta.nome}</button>
            <Icone nome="direita" tam={13} />
            <b>Importar acervo</b>
          </p>
          {importacao.resultado ? (
            <ResultadoDaImportacaoNaTela
              previa={importacao.previa}
              resultado={importacao.resultado}
              desfeita={importacao.desfeita}
              desfazendo={!!importacao.desfazendo}
              desfazer={() => importacao.resultado?.importacao && void desfazerAImportacao(importacao.resultado.importacao, atracaoAberta.nome)}
              verFicha={() => voltarDaImportacao(atracaoAberta.nome)}
              verAcervo={() => voltarDaImportacao(atracaoAberta.nome, true)}
            />
          ) : (
            <ConferenciaDaImportacao
              previa={importacao.previa}
              cancelar={() => voltarDaImportacao(atracaoAberta.nome)}
              gravado={(resultado) => gravou(atracaoAberta.nome, resultado)}
              importarEm={dados?.podeApagar ? importarEmOutra(importacao.previa) : undefined}
            />
          )}
        </main>
      ) : (
      <main className="cad">
        <h1>Cadastros</h1>
        <p className="sub">O que o PROMeiro usa para reconhecer cada roteiro e cada pessoa. Tudo aqui vai direto para o Teable e para o Trello.</p>

        {falha && <p className="cad-falha">{falha}</p>}
        {dados && !dados.ligado && (
          <p className="cad-falha">Os cadastros vêm do Teable, e este servidor ainda não está ligado a ele (TEABLE_URL, TEABLE_TOKEN e as tabelas).</p>
        )}

        <div className="cad-grade">
          {atracaoAberta && verAcervo ? (
            <ListaDoAcervo key={atracaoAberta.id} nome={atracaoAberta.nome} acervo={fichaAberta?.acervo ?? null} voltar={() => setVerAcervo(false)} />
          ) : ilhasAbertas ? (
          <section ref={listaEl} className="lista-cad" aria-label="Ilhas">
            {topoDaLista}
            <ListaDasIlhas estado={ilhas} busca={busca} />
          </section>
          ) : padAberta && pode ? (
          <section ref={listaEl} className="lista-cad" aria-label="Padeiros">
            {topoDaLista}
            <ListaDePadeiros {...padeiros} busca={busca} />
          </section>
          ) : (
          <section ref={listaEl} className="lista-cad" aria-label={dupAberta ? 'Duplicadas' : semCad ? 'Sem cadastro' : NOMES[aba]}>
            {topoDaLista}
            {!dados && !falha && <p className="cad-vazio">Carregando…</p>}
            {dupAberta && pode && (
              <ListaDeDuplicadas {...duplicadas} busca={busca} celular={celular} />
            )}
            {!dupAberta && semCad && dados && sem && (() => {
              const lista = sem.filter((k) => !escondidos.includes(`sem:${k.key}`) && casa(k.key, ...k.exemplos));
              const nomes = dados.atracoes.map((x) => x.nome).sort((x, y) => x.localeCompare(y, 'pt-BR'));
              // a lista vazia: a mensagem entra depois que a última linha (ou a folha) sai
              // (sem nenhuma linha: o repouso da comemoração; ela só roda quando um cadastro desta tela zera a lista)
              const vazio = !sem.some((k) => !escondidos.includes(`sem:${k.key}`)) ? (
                <Comemoracao
                  frase="Corta! Tá tudo cadastrado."
                  linha={reconhecidas.total == null ? null : <LinhaDoTotal total={reconhecidas.total} />}
                  tiras={festa ? montarTiras(festa.destacadas, reconhecidas.amostra) : []}
                  claquete={{ cena: festa?.cena ?? '', data: hojeCurto(), take: reconhecidas.total == null ? '' : reconhecidas.total.toLocaleString('pt-BR') }}
                  animar={!!festa}
                  aoBater={() => tremerDeLeve(listaEl.current)}
                  aoAcabar={() => setFesta(null)}
                />
              ) : (
                <p className="cad-vazio">Nada com “{busca}”.</p>
              );
              // a atração nova: a folha de rascunho toma o lugar da linha da key (sem ela no rascunho, entra no alto)
              const itens: { k: string; no: React.ReactNode }[] = lista.map((k) => ({
                k: k.key,
                no: <LinhaSemCadastro k={k} atracoes={nomes} ligar={(n) => void ligarKey(k.key, n)} nova={(busca) => novaComKey(k, busca)} ignorar={() => ignorar(k.key)} />,
              }));
              if (aba === 'atracoes' && rascunho && nomeVaga !== null) {
                const coberta = linhaDoRascunho(lista.map((k) => k.key), rascunho.keys);
                itens.splice(Math.max(coberta, 0), coberta < 0 ? 0 : 1, { k: `rascunho-sem-${coberta < 0 ? '' : lista[coberta].key}`, no: folhaNaVaga() });
              }
              return (
                <Vagas itens={itens} chave={(x) => x.k} vazio={vazio}>
                  {(x) => x.no}
                </Vagas>
              );
            })()}
            {!dupAberta && semCad && !sem && <p className="cad-vazio">Procurando nas claquetes…</p>}
            {!dupAberta && !semCad && dados && sugestoesDaAba.map((x) => <SugestaoDeEmailNaLista key={`${x.id}:${x.email}`} s={x} simE={() => simE(x)} naoE={() => void naoE(x)} />)}
            {!dupAberta && !semCad && dados && aba === 'editores' && !!nomesNovosDaBusca.length && (
              <section aria-label="Nomes novos da pauta, pendentes">
                <TituloDosNomesNovos n={nomesNovosDaBusca.length} />
                {nomesNovosDaBusca.map((n) => (
                  <NomeNovoNaLista key={n.nome} n={n} editores={dados.editores} ligar={ligarONomeNovo(n)} cadastrar={cadastrarONomeNovo(n)} ignorar={ignorarONomeNovo(n)} />
                ))}
              </section>
            )}
            {!dupAberta && !semCad && dados && aba === 'atracoes' && comRascunho(listaAtracoes, itemAtracao)}
            {!dupAberta && !semCad && dados && aba === 'redatores' && comRascunho(listaRedatores, itemRedator)}
            {!dupAberta && !semCad && dados && aba === 'editores' && comRascunho(listaEditores, itemEditor)}
            {!dupAberta && !semCad && dados && termo && !rascunho && !(aba === 'atracoes' ? listaAtracoes : aba === 'redatores' ? listaRedatores : listaEditores).length && (
              <p className="cad-vazio">Nada com “{busca}”.</p>
            )}
          </section>
          )}

          {ilhasAbertas ? (
            <FormDaIlha estado={ilhas} desenho={<Desenho d={ICONE_DAS_ILHAS} />} />
          ) : padAberta && pode ? (
            <PainelDosPadeiros lista={padeiros.lista} />
          ) : dupAberta && pode ? (
            <PainelDasDuplicadas registro={duplicadas.registro} recente={duplicadas.recente} reabrir={duplicadas.reabrir} celular={celular} soOlhar={duplicadas.lista?.ligado ? duplicadas.lista.soOlhar : null} mudarModo={duplicadas.mudarModo} depoisDeRecriar={duplicadas.depoisDeApagar} />
          ) : atracaoAberta ? (
            <aside className="form-cad ficha-atr" aria-label={`Ficha de ${atracaoAberta.nome}`}>
              <button type="button" className="botao-texto volta-ficha" onClick={fecharFicha}>
                + Nova atração
              </button>
              <h2>
                <span className="bolha"><Desenho d={ICONES.atracoes} /></span>
                {atracaoAberta.nome}
              </h2>
              <p className="dica">{[atracaoAberta.categoria, `acervo ${rotuloDoAcervo(atracaoAberta.acervo)}`].filter(Boolean).join(' · ')}</p>
              <div className="campo-cad">
                <span>Keys</span>
                <div className="keys-ficha">
                  <Vagas eixo="x" itens={atracaoAberta.keys.filter((k) => !escondidos.includes(`${atracaoAberta.id}:${k.id}`))} chave={(k) => k.id}>
                    {(k) => <ChipKey k={k} recem={recem.includes(k.id)} remover={pode ? remover('atracoes', atracaoAberta.id, k.key, k.id) : undefined} />}
                  </Vagas>
                  <NovaKey salvar={novaKey('atracoes', atracaoAberta.id)} />
                </div>
              </div>
              <SecaoAcervo acervo={fichaAberta?.acervo ?? null} falha={fichaAberta?.falha ?? ''} ver={() => setVerAcervo(true)} />
              {fichaAberta?.acervo?.ligado && fichaAberta.acervo.acervo === 'proprio' && (
                <AreaDeImportar
                  pode={pode}
                  lendo={importacao?.atracao === atracaoAberta.nome && importacao.lendo}
                  falha={importacao?.atracao === atracaoAberta.nome ? importacao.falha : ''}
                  abrir={importar(atracaoAberta.nome)}
                />
              )}
              {historico?.nome === atracaoAberta.nome && (
                <HistoricoDasImportacoes
                  importacoes={historico.lista}
                  desfazer={(id) => desfazerAImportacao(id, atracaoAberta.nome)}
                  retomar={(id) => retomarAImportacao(id, atracaoAberta.nome)}
                />
              )}
              {pode && regras?.nome === atracaoAberta.nome && <RegrasDaAtracaoNaFicha regras={regras.lista} apagar={(id) => apagarRegra(id, atracaoAberta.nome)} />}
              {pode && atracaoAberta.acervo === 'proprio' && (
                <div className="rodape-ficha">
                  <span className="qtd-acervo">só administradores</span>
                  <NovoPacote
                    nome={atracaoAberta.nome}
                    avisar={avisar}
                    depois={() => {
                      void lerFicha(atracaoAberta.nome);
                      void carregarTotais();
                    }}
                  />
                </div>
              )}
            </aside>
          ) : (
          <aside className="form-cad">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void salvar();
              }}
            >
              <h2>
                <span className="bolha"><Desenho d={ICONES[aba]} /></span>
                {aba === 'atracoes' ? 'Nova atração' : aba === 'redatores' ? 'Novo redator' : 'Novo editor'}
              </h2>
              {aba === 'atracoes' && (
                <>
                  <p className="dica">
                    {inicio?.claquete && daClaquete && atr.nome === daClaquete ? (
                      <>Veio de <b>{inicio.claquete}</b>, que ninguém reconheceu.</>
                    ) : (
                      'Entra na lista que reconhece as claquetes.'
                    )}
                  </p>
                  <label className="campo-cad">
                    <span>Nome</span>
                    <span className="com-limpar"><input ref={nomeAtr} className="entrada-cad" value={atr.nome} onChange={(e) => setAtr({ ...atr, nome: e.target.value })} placeholder="Como a atração se chama" autoFocus />{xLimpar}</span>
                  </label>
                  <div className="campo-cad">
                    <span>Keys</span>
                    <Chips itens={atr.keys} mudar={(keys) => setAtr({ ...atr, keys })} rotulo="Keys" placeholder="Como começa a claquete" />
                    <small>
                      Como a atração começa na claquete.{' '}
                      {inicio?.claquete && atr.keys[0] && chaveDaClaquete(inicio.claquete).startsWith(atr.keys[0]) && (
                        <>
                          <mark>{atr.keys[0]}</mark>
                          {chaveDaClaquete(inicio.claquete).slice(atr.keys[0].length)}
                        </>
                      )}
                    </small>
                  </div>
                  {!!dados?.categorias.length && (
                    <div className="campo-cad">
                      <span>Categoria</span>
                      <div className="cats" role="radiogroup" aria-label="Categoria">
                        {dados.categorias.map((c) => (
                          <button key={c} type="button" role="radio" aria-checked={atr.categoria === c} onClick={() => setAtr({ ...atr, categoria: atr.categoria === c ? '' : c })}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="campo-cad">
                    <span>Acervo</span>
                    <EscolhaDoAcervo valor={atr.acervo} mudar={(acervo) => setAtr({ ...atr, acervo })} />
                    <small>{ACERVOS.find((x) => x.valor === atr.acervo)?.dica}</small>
                  </div>
                  {!!dados?.camposCaminho.length && (
                    <div className="caminhos-cad">
                      <div className="titulo">Caminhos</div>
                      {dados.camposCaminho.map((c: CampoCaminho) => (
                        <label key={c.nome} className="campo-cad">
                          <span>{c.nome.replace(/_/g, ' ')}</span>
                          {c.opcoes?.length ? (
                            <div className="cats">
                              {c.opcoes.map((o) => (
                                <button key={o} type="button" aria-pressed={atr.campos[c.nome] === o} onClick={() => setAtr({ ...atr, campos: { ...atr.campos, [c.nome]: atr.campos[c.nome] === o ? '' : o } })}>
                                  {o}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <input className="entrada-cad" value={atr.campos[c.nome] ?? ''} onChange={(e) => setAtr({ ...atr, campos: { ...atr.campos, [c.nome]: e.target.value } })} />
                          )}
                        </label>
                      ))}
                      {Object.entries(dados.formulas).filter(([, f]) => f).map(([nome, f]) => (
                        <div key={nome} className="previa-caminho">
                          <b>{nome.replace(/_win$/, '').replace(/_/g, ' ')}</b> {previaDoCaminho(f, valoresCaminho)}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {aba === 'redatores' && (
                <>
                  <p className="dica">Entra na lista do campo REDATOR do Trello e no Teable.</p>
                  <label className="campo-cad">
                    <span>Nome no card</span>
                    <span className="com-limpar"><input className="entrada-cad" value={red.nome} onChange={(e) => setRed({ ...red, nome: e.target.value })} placeholder="Como aparece no Trello" autoFocus />{xLimpar}</span>
                  </label>
                  <div className="campo-cad">
                    <span>Keys</span>
                    <Chips itens={red.keys} mudar={(keys) => setRed({ ...red, keys })} rotulo="Keys do redator" placeholder="ex.: gpires" />
                    <small>O autor gravado no .docx, ou o começo do e-mail. É por elas que o PROMeiro reconhece quem escreveu. Sem nenhuma, vale o nome.</small>
                  </div>
                </>
              )}
              {aba === 'editores' && (
                <>
                  <p className="dica">Entra na lista do campo EDITOR do Trello e no Teable.</p>
                  <label className="campo-cad">
                    <span>Nome no card</span>
                    <span className="com-limpar"><input className="entrada-cad" value={edi.nome} onChange={(e) => setEdi({ ...edi, nome: e.target.value })} placeholder="Como aparece no Trello" autoFocus />{xLimpar}</span>
                  </label>
                  <div className="campo-cad">
                    <span>Keys da pauta</span>
                    <Chips itens={edi.keys} mudar={(keys) => setEdi({ ...edi, keys })} rotulo="Keys da pauta" placeholder="Como aparece na pauta" />
                    <small>Como o nome aparece na planilha da pauta da edição.</small>
                  </div>
                </>
              )}
              <p className="efeito">
                {aba === 'atracoes'
                  ? 'Cria a atração e as keys no Teable. Os roteiros da fila que começam com essas keys são reconhecidos na hora.'
                  : 'Remover tira do PROMeiro e do Teable; no Trello o nome continua, para os cards antigos.'}
                {!pode && <> <b>Só administradores removem.</b></>}
              </p>
              <div className="acoes">
                <button className="botao primario" disabled={!prontoParaSalvar || salvando || !dados?.ligado}>
                  <Icone nome="mais" tam={15} traco={2.2} /> {salvando ? 'Cadastrando…' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </aside>
          )}
        </div>
      </main>
      )}
      {desfazer && (
        <div className="desfazer" role="status" key={desfazer.id}>
          <span>{desfazer.texto}</span>
          <button className="botao-texto" onClick={desfazerAgora}>Desfazer</button>
        </div>
      )}
      {gravado && !desfazer && !caixinha && (
        <div className="desfazer" role="status" key={gravado.id}>
          <span>{gravado.texto}</span>
          <button className="botao-texto" onClick={() => void voltarGravado()}>Desfazer</button>
        </div>
      )}
      {caixinha && !desfazer && (
        <div className="desfazer caixinha-importacao" role="status" key={caixinha.id}>
          <span>
            {caixinha.novas ? <><b>+{caixinha.novas}</b> no acervo de {caixinha.atracao}.</> : <>Importação gravada no acervo de {caixinha.atracao}.</>}
          </span>
          <button className="botao-texto" onClick={() => void desfazerAImportacao(caixinha.id, caixinha.atracao)}>Desfazer</button>
        </div>
      )}
    </div>
  );
}

