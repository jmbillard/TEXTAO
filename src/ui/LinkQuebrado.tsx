/* A tela do link quebrado: o roteiro apagado (com a lápide, quando o servidor sabe quem apagou), sem permissão, que
   não existe, a prévia de filme vencida e o servidor fora do ar. O desenho é sorteado entre três (cena cortada,
   claquete, investigação) sem repetir o último; a lápide é sempre a claquete, preenchida e riscada. */
import { useEffect, useState, type ReactNode } from 'react';
import type { Lapide, Leitura } from '../dados/armazenamento';
import { Icone } from './icones';
import { diaEMes, lembrarVariante, partesDaClaquete, varianteDaVez, type Variante } from './linkQuebrado';
import { SetaCurvaEm } from './setaCurva';
import './linkQuebrado.css';

export type CasoQuebrado =
  | { tipo: 'apagado'; lapide?: Lapide }
  | { tipo: 'sem-permissao' }
  | { tipo: 'nao-existe' }
  | { tipo: 'vencida' }
  | { tipo: 'erro' };

/** O caso da tela para uma leitura que não deu o roteiro. */
export const casoDaLeitura = (l: Exclude<Leitura, { estado: 'ok' }>): CasoQuebrado =>
  l.estado === 'apagado' ? { tipo: 'apagado', lapide: l.lapide } : l.estado === 'sem-permissao' ? { tipo: 'sem-permissao' } : l.estado === 'nao-existe' ? { tipo: 'nao-existe' } : { tipo: 'erro' };

interface Props {
  caso: CasoQuebrado;
  voltar: () => void;
  /** Com a lápide: a fila abre já buscando a claquete. */
  buscar?: (termo: string) => void;
  /** Com a versão nova: abre ela. */
  abrir?: (id: string) => void;
  /** Na prévia vencida: a lista das prévias. */
  verPrevias?: () => void;
  /** No erro de rede: lê de novo. */
  tentar?: () => void;
}

/** O desenho de cada caso sem lápide. */
type CasoDoDesenho = 'apagado' | 'privado' | 'naoexiste' | 'vencida';

export function LinkQuebrado({ caso, voltar, buscar, abrir, verPrevias, tentar }: Props) {
  const [variante] = useState<Variante>(varianteDaVez);
  const lapide = caso.tipo === 'apagado' ? caso.lapide : undefined;
  // a variante sorteada só conta como a última quando ela aparece (a lápide e o erro não sorteiam)
  const sorteia = caso.tipo !== 'erro' && !lapide;
  useEffect(() => {
    if (sorteia) lembrarVariante(variante);
  }, [sorteia, variante]);

  const voltarTexto = (
    <button className="botao-texto" type="button" onClick={voltar}>
      Voltar para a fila
    </button>
  );
  const voltarPrimario = (
    <button className="botao primario" type="button" onClick={voltar}>
      <Icone nome="voltar" tam={14} traco={2} /> Voltar para a fila
    </button>
  );

  let cena: ReactNode = null;
  let titulo: ReactNode;
  let acoes: ReactNode;
  if (caso.tipo === 'erro') {
    titulo = 'Não consegui falar com o servidor.';
    acoes = (
      <>
        {tentar && (
          <button className="botao primario" type="button" onClick={tentar}>
            Tentar de novo
          </button>
        )}
        {voltarTexto}
      </>
    );
  } else if (lapide) {
    const { nome } = partesDaClaquete(lapide.claquete);
    const nova = !!lapide.substituto && !!abrir;
    cena = <Claquete caso={nova ? 'nova' : 'lapide'} lapide={lapide} />;
    const claquete = lapide.claquete ? <em>{lapide.claquete}</em> : 'Este roteiro';
    titulo = nova ? (
      <>{claquete} tem uma versão nova.</>
    ) : (
      <>
        {claquete} foi apagado por {lapide.por} em {diaEMes(lapide.em)}.
      </>
    );
    acoes = nova ? (
      <>
        <button className="botao primario" type="button" onClick={() => abrir(lapide.substituto!)}>
          Abrir a versão nova
        </button>
        {voltarTexto}
      </>
    ) : nome && buscar ? (
      <>
        <button className="botao primario lq-buscar" type="button" onClick={() => buscar(nome)}>
          <Icone nome="lupa" tam={14} traco={2} /> <span>Buscar “{nome}” na fila</span>
        </button>
        {voltarTexto}
      </>
    ) : (
      voltarPrimario
    );
  } else {
    const desenho: CasoDoDesenho = caso.tipo === 'apagado' ? 'apagado' : caso.tipo === 'sem-permissao' ? 'privado' : caso.tipo === 'nao-existe' ? 'naoexiste' : 'vencida';
    cena = variante === 'cortada' ? <CenaCortada caso={desenho} /> : variante === 'claquete' ? <Claquete caso={desenho} /> : <Investigacao caso={desenho} />;
    titulo = { apagado: 'Este roteiro saiu de cena.', privado: 'Este roteiro está nos bastidores.', naoexiste: 'Esta cena nunca foi rodada.', vencida: 'Esta prévia saiu de cartaz.' }[desenho];
    acoes =
      desenho === 'vencida' && verPrevias ? (
        <>
          <button className="botao primario" type="button" onClick={verPrevias}>
            <Icone nome="voltar" tam={14} traco={2} /> Ver as prévias
          </button>
          {voltarTexto}
        </>
      ) : (
        voltarPrimario
      );
  }

  return (
    <div className={`lq-pagina ${caso.tipo === 'erro' ? 'lq-simples' : ''}`}>
      <section className="lq" aria-labelledby="lq-titulo" data-caso={lapide ? (lapide.substituto && abrir ? 'nova' : 'lapide') : caso.tipo} data-variante={sorteia ? variante : undefined}>
        {cena}
        <h1 id="lq-titulo" className="titulo-serifa lq-titulo">
          {titulo}
        </h1>
        <div className="lq-acoes">{acoes}</div>
      </section>
    </div>
  );
}

/* ---------- o traço à mão: linhas com um tremor fixo (a mesma semente desenha sempre igual) ---------- */

type Ponto = readonly [number, number];
function criarMao(semente = 7) {
  let s = semente;
  const acaso = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  };
  return (pontos: Ponto[], tremor = 1.2) => {
    let d = `M${pontos[0][0]} ${pontos[0][1]}`;
    for (let i = 1; i < pontos.length; i++) {
      const [a, b] = [pontos[i - 1], pontos[i]];
      const mx = (a[0] + b[0]) / 2 + acaso() * tremor * 2;
      const my = (a[1] + b[1]) / 2 + acaso() * tremor * 2;
      d += ` Q${mx.toFixed(1)} ${my.toFixed(1)} ${(b[0] + acaso() * tremor).toFixed(1)} ${(b[1] + acaso() * tremor).toFixed(1)}`;
    }
    return d;
  };
}
const Traco = ({ d, cor, larg, tracar }: { d: string; cor: string; larg: number; tracar?: boolean }) => (
  <path className={`lq-mao ${tracar ? 'lq-tracar' : ''}`} d={d} stroke={cor} strokeWidth={larg} pathLength={1} />
);
/** A anotação à mão, escrita da esquerda para a direita. */
const Nota = ({ x, y, giro = -4, tam, children }: { x: number; y: number; giro?: number; tam?: number; children: ReactNode }) => (
  <text className="lq-nota lq-escrita" x={x} y={y} transform={`rotate(${giro} ${x} ${y})`} style={tam ? { fontSize: tam } : undefined}>
    {children}
  </text>
);
/** A seta curva do app, na cor das anotações. */
const Seta = ({ de, ate, espelhar }: { de: Ponto; ate: Ponto; espelhar?: boolean }) => <SetaCurvaEm className="lq-seta" de={de} ate={ate} espelhar={espelhar} />;

/* ---------- cena cortada: a película com o quadro que saiu ---------- */

function Furos({ x0, x1 }: { x0: number; x1: number }) {
  const xs: number[] = [];
  for (let x = x0 + 5; x < x1 - 8; x += 14) xs.push(x);
  return (
    <>
      {xs.map((x) => (
        <g key={x}>
          <rect x={x} y={69} width={7} height={6} rx={1.5} className="lq-furo" />
          <rect x={x} y={145} width={7} height={6} rx={1.5} className="lq-furo" />
        </g>
      ))}
    </>
  );
}
/** A borda cortada a tesoura, de cima para baixo. */
function zigue(x: number, lado: number) {
  const p: string[] = [];
  for (let y = 64, i = 0; y < 156; y += 8, i++) p.push(`${x + (i % 2 ? lado * 5 : 0)} ${y}`);
  p.push(`${x} 156`);
  return p;
}
function Pedaco({ x0, x1, cortaDir = false, cortaEsq = false }: { x0: number; x1: number; cortaDir?: boolean; cortaEsq?: boolean }) {
  let d = `M${x0} 64 `;
  d += cortaDir ? `L${zigue(x1, -1).join(' L')} ` : `L${x1} 64 L${x1} 156 `;
  d += cortaEsq ? `L${zigue(x0, 1).reverse().join(' L')} Z` : `L${x0} 156 Z`;
  return (
    <>
      <path d={d} fill="var(--lq-filme)" />
      <Furos x0={x0} x1={x1} />
    </>
  );
}
function Quadro({ x, desenho, apagado, mao }: { x: number; desenho?: 'sol' | 'arvore'; apagado?: boolean; mao: ReturnType<typeof criarMao> }) {
  const tinta = 'color-mix(in srgb, var(--lq-filme) 70%, transparent)';
  return (
    <>
      <rect x={x} y={82} width={80} height={56} rx={2} fill="var(--lq-quadro)" opacity={apagado ? 0.28 : undefined} />
      {desenho === 'sol' && (
        <>
          <Traco d={mao([[x + 6, 124], [x + 30, 112], [x + 52, 120], [x + 74, 108]], 1)} cor={tinta} larg={1.6} />
          <circle cx={x + 56} cy={97} r={7} fill="none" stroke={tinta} strokeWidth={1.6} />
        </>
      )}
      {desenho === 'arvore' && (
        <>
          <Traco d={mao([[x + 6, 126], [x + 74, 126]], 0.8)} cor={tinta} larg={1.6} />
          <Traco d={mao([[x + 40, 126], [x + 40, 104]], 0.6)} cor={tinta} larg={1.6} />
          <circle cx={x + 40} cy={98} r={11} fill="none" stroke={tinta} strokeWidth={1.6} />
        </>
      )}
    </>
  );
}
function CenaCortada({ caso }: { caso: CasoDoDesenho }) {
  const mao = criarMao();
  let s: ReactNode;
  if (caso === 'apagado')
    s = (
      <>
        <g className="lq-ponta-esq">
          <Pedaco x0={14} x1={128} cortaDir />
          <Quadro x={30} desenho="sol" mao={mao} />
        </g>
        <g className="lq-ponta-dir">
          <Pedaco x0={232} x1={346} cortaEsq />
          <Quadro x={250} desenho="arvore" mao={mao} />
        </g>
        {/* o lugar do quadro que saiu, tracejado, e o picote caindo */}
        <rect x={140} y={82} width={80} height={56} rx={2} fill="none" stroke="var(--tinta3)" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.7} />
        <rect className="lq-picote" x={172} y={152} width={10} height={7} rx={1} fill="var(--lq-filme)" />
        <Seta de={[194, 46]} ate={[176, 78]} />
        <Nota x={196} y={40} giro={-5}>essa cena foi cortada</Nota>
      </>
    );
  else if (caso === 'privado')
    s = (
      <>
        <g className="lq-inteira">
          <Pedaco x0={14} x1={346} />
          <Quadro x={30} desenho="sol" mao={mao} />
          <Quadro x={140} mao={mao} />
          <Quadro x={250} desenho="arvore" mao={mao} />
          {/* a fita crepe tapando o quadro do meio */}
          <g transform="rotate(-9 180 110)">
            <rect x={128} y={96} width={104} height={28} fill="color-mix(in srgb, var(--producao) 30%, var(--lq-quadro))" opacity={0.95} />
            <text x={180} y={117} textAnchor="middle" className="lq-fita">privado</text>
          </g>
        </g>
        <Nota x={194} y={40}>só com convite do dono</Nota>
      </>
    );
  else if (caso === 'naoexiste')
    s = (
      <>
        <g className="lq-inteira">
          <Pedaco x0={14} x1={346} />
          <Quadro x={30} desenho="sol" mao={mao} />
          <rect x={140} y={82} width={80} height={56} rx={2} fill="var(--lq-filme)" stroke="var(--lq-quadro)" strokeWidth={1.2} strokeDasharray="3 4" opacity={0.9} />
          <text x={180} y={122} textAnchor="middle" className="lq-interrogacao">?</text>
          <Quadro x={250} desenho="arvore" mao={mao} />
        </g>
        <Seta de={[204, 48]} ate={[188, 78]} />
        <Nota x={206} y={42} giro={-5}>nunca rodaram essa</Nota>
      </>
    );
  else
    s = (
      <>
        {/* a película desbotou */}
        <g className="lq-inteira" opacity={0.55}>
          <Pedaco x0={14} x1={346} />
          <Quadro x={30} apagado mao={mao} />
          <Quadro x={140} apagado mao={mao} />
          <Quadro x={250} apagado mao={mao} />
        </g>
        <Nota x={186} y={40}>ficou 60 dias em cartaz</Nota>
      </>
    );
  return (
    <svg className="lq-cena" viewBox="0 0 360 200" role="img" aria-label="Uma tira de filme">
      {s}
    </svg>
  );
}

/* ---------- a claquete ---------- */

function Listras({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const id = `lq-listras-${y}`;
  return (
    <>
      <clipPath id={id}>
        <rect x={x} y={y} width={w} height={h} rx={3} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y} width={w} height={h} fill="var(--lq-lousa)" />
        {Array.from({ length: 10 }, (_, k) => k - 1).map((i) => (
          <path key={i} d={`M${x + i * 24} ${y + h} l14 -${h} h12 l-14 ${h} z`} fill="var(--lq-giz)" />
        ))}
      </g>
    </>
  );
}
const Giz = ({ x, y, tam, children, largura }: { x: number; y: number; tam?: number; children: ReactNode; largura?: number }) => (
  <text className="lq-giz" x={x} y={y} style={tam ? { fontSize: tam } : undefined} textLength={largura} lengthAdjust={largura ? 'spacingAndGlyphs' : undefined}>
    {children}
  </text>
);
const Rotulo = ({ x, y, children }: { x: number; y: number; children: string }) => (
  <text className="lq-rotulo" x={x} y={y}>
    {children}
  </text>
);

function Claquete({ caso, lapide }: { caso: CasoDoDesenho | 'lapide' | 'nova'; lapide?: Lapide }) {
  const mao = criarMao();
  const risco = (x: number, y: number, w: number) => <Traco d={mao([[x, y], [x + w * 0.3, y - 3], [x + w * 0.6, y + 2], [x + w, y - 2]], 1.4)} cor="var(--lq-giz)" larg={2} />;
  const comLapide = caso === 'lapide' || caso === 'nova';
  const g = 'color-mix(in srgb, var(--lq-giz) 35%, transparent)';
  let s: ReactNode = null;
  if (caso === 'apagado')
    s = (
      <>
        {risco(100, 110, 130)}
        {risco(100, 150, 60)}
        <Giz x={196} y={154} tam={24}>?</Giz>
        {risco(100, 190, 70)}
        <Seta de={[300, 124]} ate={[218, 146]} espelhar />
        <Nota x={282} y={112} giro={-6}>TAKE ?</Nota>
        <Nota x={4} y={40} giro={-5}>alguém apagou a cena</Nota>
      </>
    );
  else if (caso === 'privado') {
    const tarja = 'color-mix(in srgb, var(--lq-giz) 85%, transparent)';
    s = (
      <>
        <rect x={100} y={104} width={132} height={11} rx={1} fill={tarja} />
        <rect x={100} y={143} width={56} height={11} rx={1} fill={tarja} />
        <rect x={196} y={143} width={24} height={11} rx={1} fill={tarja} />
        <rect x={100} y={183} width={64} height={11} rx={1} fill={tarja} />
        <Nota x={6} y={40} giro={-6}>confidencial</Nota>
      </>
    );
  } else if (caso === 'naoexiste')
    s = (
      <>
        <Giz x={196} y={154} tam={26}>?</Giz>
        <Nota x={4} y={40} giro={-5}>esperando a cena…</Nota>
      </>
    );
  else if (caso === 'vencida')
    s = (
      <>
        <g opacity={0.22}>
          {risco(100, 110, 120)}
          {risco(100, 150, 50)}
          {risco(196, 150, 30)}
          {risco(100, 190, 60)}
        </g>
        <Nota x={4} y={40} giro={-5}>o giz apagou com o tempo</Nota>
      </>
    );
  else if (lapide) {
    // a lápide: a claquete preenchida e riscada
    const { nome, data } = partesDaClaquete(lapide.claquete);
    const prod = nome.length > 24 ? `${nome.slice(0, 23)}…` : nome;
    s = (
      <>
        <Giz x={102} y={114} largura={prod.length > 16 ? 160 : undefined}>{prod}</Giz>
        <Giz x={102} y={154}>{data || '—'}</Giz>
        <Giz x={196} y={154}>1</Giz>
        <text className="lq-nota" x={102} y={194} style={{ fontSize: 19 }}>
          {lapide.por.split(' ')[0]}, {diaEMes(lapide.em)}
        </text>
        {caso === 'nova' ? (
          <>
            <Traco d={mao([[192, 150], [212, 142]], 0.6)} cor="var(--ultra)" larg={2.2} tracar />
            <Nota x={220} y={156} giro={-4} tam={26}>2</Nota>
            <Seta de={[314, 124]} ate={[238, 146]} espelhar />
            <Nota x={282} y={112} giro={-5} tam={19}>versão nova</Nota>
          </>
        ) : (
          <>
            <Traco d={mao([[98, 158], [150, 132], [200, 116], [262, 96]], 2)} cor="var(--ultra)" larg={2.4} tracar />
            <Seta de={[308, 132]} ate={[222, 186]} espelhar />
            <Nota x={280} y={122} giro={-5} tam={19}>quem cortou</Nota>
          </>
        )}
      </>
    );
  }
  return (
    <svg className="lq-cena" viewBox="0 0 360 210" role="img" aria-label="Uma claquete">
      <g className={`lq-braco ${caso === 'privado' ? 'fechado' : ''}`}>
        <Listras x={90} y={54} w={182} h={15} />
      </g>
      <Listras x={90} y={70} w={182} h={15} />
      <rect x={90} y={86} width={182} height={114} rx={5} fill="var(--lq-lousa)" />
      <circle cx={96} cy={70} r={2.4} fill="var(--lq-giz)" />
      <path d="M90 120 H272 M90 160 H272 M186 120 V160" stroke={g} strokeWidth={1} />
      <Rotulo x={100} y={100}>PROD.</Rotulo>
      <Rotulo x={100} y={134}>{comLapide ? 'DATA' : 'CENA'}</Rotulo>
      <Rotulo x={196} y={134}>TAKE</Rotulo>
      <Rotulo x={100} y={174}>{comLapide ? 'CORTE' : 'DATA'}</Rotulo>
      {s}
    </svg>
  );
}

/* ---------- investigação: a lupa passeia e não acha nada ---------- */

function Clipe({ x, y, giro }: { x: number; y: number; giro: number }) {
  return (
    <g transform={`rotate(${giro} ${x} ${y})`}>
      <Traco d={`M${x} ${y + 26} V${y + 4} a5 5 0 0 1 10 0 V${y + 30} a7 7 0 0 1 -14 0 V${y + 8}`} cor="var(--tinta2)" larg={1.6} />
    </g>
  );
}
function Lupa() {
  return (
    <g className="lq-lupa">
      <circle cx={250} cy={70} r={22} fill="color-mix(in srgb, var(--ultra) 14%, transparent)" className="lq-lupa-vidro" />
      <circle cx={250} cy={70} r={22} fill="none" stroke="var(--tinta)" strokeWidth={3} />
      <Traco d="M266 86 L286 106" cor="var(--tinta)" larg={6} />
      <Traco d="M240 60 q4 -6 11 -6" cor="var(--tinta3)" larg={1.6} />
    </g>
  );
}
function Investigacao({ caso }: { caso: CasoDoDesenho }) {
  const mao = criarMao();
  const folha = (x: number, y: number, w: number, h: number) => mao([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y - 0.5]], 0.9);
  let s: ReactNode;
  if (caso === 'apagado')
    s = (
      <>
        <g transform="rotate(-3 180 110)">
          <Traco d={folha(126, 34, 108, 146)} cor="var(--tinta3)" larg={1.2} />
        </g>
        <rect x={126} y={34} width={108} height={146} fill="none" stroke="var(--regua-forte)" strokeWidth={1} strokeDasharray="3 5" transform="rotate(-3 180 110)" />
        <Clipe x={150} y={20} giro={-14} />
        <Nota x={18} y={118} giro={-6}>estava aqui</Nota>
        <Seta de={[56, 134]} ate={[118, 126]} />
      </>
    );
  else if (caso === 'privado')
    s = (
      <>
        {/* um envelope fechado */}
        <g transform="rotate(-4 180 110)">
          <rect x={112} y={64} width={136} height={90} rx={3} fill="var(--papel)" stroke="var(--tinta3)" strokeWidth={1.2} />
          <Traco d={mao([[112, 64], [180, 112], [248, 64]], 0.8)} cor="var(--tinta3)" larg={1.2} />
          <circle cx={180} cy={112} r={7} fill="var(--ultra)" opacity={0.85} />
          <text x={122} y={146} className="lq-envelope">para: o dono</text>
        </g>
        <Nota x={16} y={40} giro={-6}>lacrado</Nota>
      </>
    );
  else if (caso === 'naoexiste')
    s = (
      <>
        <Traco d={mao([[60, 186], [120, 184], [200, 187], [300, 185]], 0.8)} cor="var(--regua-forte)" larg={1.2} />
        <Nota x={30} y={70} giro={-6}>nada por aqui</Nota>
      </>
    );
  else
    s = (
      <>
        <g transform="rotate(-3 180 110)" opacity={0.35}>
          <rect x={126} y={34} width={108} height={146} fill="var(--papel)" stroke="var(--regua-forte)" />
          {[56, 70, 84, 98, 112].map((y) => (
            <path key={y} d={`M138 ${y} H${210 - (y % 28)}`} stroke="var(--regua-forte)" strokeWidth={3} strokeLinecap="round" />
          ))}
        </g>
        <Nota x={10} y={70} giro={-6}>o prazo venceu</Nota>
      </>
    );
  return (
    <svg className="lq-cena" viewBox="0 0 360 200" role="img" aria-label="Uma lupa procurando">
      {s}
      <Lupa />
    </svg>
  );
}
