import { useEffect, useRef, useState } from 'react';
import type { Falha } from '../App';
import { armazenamento, type Resumo } from '../dados/armazenamento';
import { corDe } from '../dados/colaboracao';
import { ouvirFila } from '../dados/eventos';
import { SAIR_DO_ACESSO, type Identidade } from '../dados/identidade';
import type { Pessoa } from '../modelo/tipos';
import { Icone } from './icones';
import { Marca } from './pecas';
import { semAcento } from '../modelo/vocabularios';
import { dataCurtaComDia, plural } from './util';

/** Roteiros de demonstração, lidos de ./exemplos.json (arquivo → base64) quando o build é feito com VITE_EXEMPLOS=1. */
const EXEMPLOS: [string, string][] = import.meta.env.VITE_EXEMPLOS
  ? [
      ['Quem Ama Cuida (colunas)', 'Quem_AmaPrologo26_10_Rede.docx'],
      ['Eliana (.rtf)', 'Eliana_20_9.rtf'],
      ['Encontro', 'Encontro_27_10.docx'],
      ['Nobreza do Amor', 'Nobreza_27_10.docx'],
      ['Futebol', 'FutBrasileirao28_10_Sp.docx'],
    ]
  : [];

interface Props {
  abrir: (id: string) => void;
  abrirArquivo: (arquivo: File) => void;
  criar: () => void;
  avisar: (texto: string) => void;
  identidade: Identidade | null;
  definirPerfil: (p: Pessoa) => void;
  /** Roteiros que acabaram de chegar: a ficha deles se monta com animação. */
  novos: string[];
  /** Arquivos soltos que não deu para ler. */
  falhas: Falha[];
  tirarFalha: (nome: string) => void;
  /** Muda a cada arquivo processado, para a fila se atualizar. */
  chegou: number;
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();

/** Quem está usando. Com login na porta, só mostra; sem ele, deixa a pessoa se identificar. */
function Perfil({ identidade, definirPerfil }: Pick<Props, 'identidade' | 'definirPerfil'>) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setNome(identidade?.nome ?? '');
    setEmail(identidade?.email ?? '');
  }, [identidade]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div className="perfil" ref={caixa}>
      <button className={`perfil-botao ${identidade ? '' : 'falta'}`} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        {identidade ? (
          <>
            <span className="perfil-avatar">{iniciais(identidade.nome)}</span>
            <span className="perfil-nome">{identidade.nome}</span>
          </>
        ) : (
          'Quem é você?'
        )}
      </button>
      {aberto && (
        <div className="perfil-painel" role="dialog" aria-label="Seu perfil">
          {identidade?.origem === 'acesso' ? (
            <>
              <strong>{identidade.nome}</strong>
              <span className="suave">{identidade.email}</span>
              <p className="suave pequeno">Você entrou com a conta da empresa. Seus roteiros saem assinados com este nome.</p>
              <a className="botao-texto" href={SAIR_DO_ACESSO}>Sair</a>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!nome.trim()) return;
                definirPerfil({ nome, email });
                setAberto(false);
              }}
            >
              <label htmlFor="perfil-nome">Seu nome</label>
              <input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como assina os roteiros" autoFocus autoComplete="name" />
              <label htmlFor="perfil-email">E-mail da empresa</label>
              <input id="perfil-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" autoComplete="email" />
              <p className="suave pequeno">Fica só neste navegador e assina os roteiros que você escrever.</p>
              <button className="botao primario" disabled={!nome.trim()}>Salvar</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- ficha da fila ---------- */

const RABISCOS = [
  'M13 25 C 9 11, 27 4, 43 6 C 60 9, 61 31, 42 37 C 25 42, 5 37, 8 22 C 10 11, 23 5, 38 4',
  'M50 9 C 30 2, 6 9, 6 23 C 6 37, 30 42, 46 38 C 62 33, 62 12, 44 7 C 34 4, 22 5, 15 9',
  'M10 18 C 14 6, 36 2, 50 8 C 63 14, 58 34, 40 38 C 22 42, 4 34, 7 20 C 9 12, 18 7, 28 5',
];

/** "#7 artes" circulado à caneta. Na ficha nova, o círculo é desenhado por último. */
function Contagem({ n, traco, desenhar }: { n: number; traco: number; desenhar: boolean }) {
  return (
    <span className={`contagem ${desenhar ? 'desenhar' : ''}`}>
      #{n} <em>{n === 1 ? 'arte' : 'artes'}</em>
      <svg viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d={RABISCOS[traco % RABISCOS.length]} /></svg>
    </span>
  );
}

/** A claquete aparece como se fosse digitada; quando termina, o resto da ficha surge. */
function useDigitacao(texto: string, ligar: boolean): [string, boolean] {
  const [n, setN] = useState(ligar ? 0 : texto.length);
  useEffect(() => {
    if (!ligar) return setN(texto.length);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setN(texto.length);
    setN(0);
    const passo = Math.max(14, Math.min(42, 900 / Math.max(1, texto.length)));
    const t = setInterval(() => setN((v) => (v >= texto.length ? (clearInterval(t), v) : v + 1)), passo);
    return () => clearInterval(t);
  }, [texto, ligar]);
  return [texto.slice(0, n), n >= texto.length];
}

function Ficha({ r, nova, ordem, abrir, acoes }: { r: Resumo; nova: boolean; ordem: number; abrir: () => void; acoes: React.ReactNode }) {
  const claquete = r.meta.claquete || r.meta.titulo || r.meta.programa || 'Sem claquete';
  const [digitado, terminou] = useDigitacao(claquete, nova);
  const revisar = r.meta.revisar ?? [];
  const semEditor = !r.meta.editor;
  return (
    <li className={`ficha ${revisar.length ? 'revisar' : 'pronta'} ${nova ? 'nova' : ''} ${terminou ? 'montada' : 'digitando'}`}>
      <span className={`ficha-marca ${revisar.length ? 'revisar' : 'ok'}`} aria-hidden="true">{revisar.length ? <Icone nome="atencao" tam={12} traco={3} /> : <Icone nome="certo" tam={12} traco={3} />}</span>
      <button className="ficha-claquete" onClick={abrir} aria-label={`Abrir ${claquete}`}>
        <b>{digitado}{nova && !terminou && <i className="cursor" />}</b>
        <span className="some">
          {r.meta.programa || 'atração não reconhecida'}
          {r.meta.praca && <span className="ficha-praca">{r.meta.praca}</span>}
          {r.meta.dataExibicao ? ` · ${dataCurtaComDia(r.meta.dataExibicao)}` : ' · sem data'}
        </span>
      </button>
      <span className="ficha-gente some">
        {r.meta.redator || 'sem redator'}
        <small className={semEditor ? 'falta' : ''}>{semEditor ? 'edição: não está na pauta' : `edição: ${r.meta.editor}`}</small>
      </span>
      <span className="ficha-artes some"><Contagem n={r.nArtes} traco={ordem} desenhar={nova && terminou} /></span>
      <span className="ficha-acoes some">
        {acoes}
        <button className={`botao ${revisar.length ? 'primario' : ''}`} onClick={abrir}>{revisar.length ? 'Revisar' : 'Abrir'}</button>
      </span>
      {revisar.length > 0 && <span className="ficha-pendencias some">{revisar.map((m) => <span key={m} className="pendencia">{m}</span>)}</span>}
    </li>
  );
}

export function Biblioteca({ abrir, abrirArquivo, criar, avisar, identidade, definirPerfil, novos, falhas, tirarFalha, chegou }: Props) {
  const [roteiros, setRoteiros] = useState<Resumo[] | null>(null);
  const [busca, setBusca] = useState('');
  const [apagando, setApagando] = useState<string | null>(null);

  const carregar = () => armazenamento.listar().then(setRoteiros, () => setRoteiros([]));
  useEffect(() => {
    void carregar();
  }, [chegou]);

  // fila ao vivo: o que os colegas sobem aparece aqui na hora, com a mesma animação
  const [deOutros, setDeOutros] = useState<string[]>([]);
  const [colegas, setColegas] = useState<{ nome: string; email: string }[]>([]);
  const eu = identidade?.email;
  useEffect(() => {
    let prazo: ReturnType<typeof setTimeout> | undefined;
    const recarregar = () => {
      clearTimeout(prazo);
      prazo = setTimeout(() => void carregar(), 350);
    };
    const parar = ouvirFila((e) => {
      if (e.tipo === 'presenca') return setColegas(e.pessoas.filter((p) => p.email !== eu));
      if (e.tipo === 'criado' && e.por !== eu) setDeOutros((d) => [...d, e.id]);
      recarregar();
    });
    return () => {
      parar();
      clearTimeout(prazo);
    };
  }, [eu]); // eslint-disable-line react-hooks/exhaustive-deps

  const apagar = async (r: Resumo) => {
    await armazenamento.apagar(r.id);
    setApagando(null);
    avisar('Roteiro tirado da fila.');
    void carregar();
  };

  const termo = semAcento(busca.trim());
  const aberto = (roteiros ?? []).some((r) => r.aberto);
  const todos = roteiros ?? [];
  const visiveis = todos.filter((r) => !termo || semAcento([r.meta.claquete, r.meta.programa, r.meta.redator, r.meta.editor, r.meta.titulo].join(' ')).includes(termo));
  const paraRevisar = todos.filter((r) => r.meta.revisar?.length).length;
  const vazio = roteiros !== null && !todos.length && !falhas.length;

  return (
    <div className="pagina">
      <main className="biblioteca fila">
        <header className="bib-topo">
          <h1 className="bib-marca"><Marca /></h1>
          <span className="espaco" />
          {colegas.length > 0 && (
            <div className="na-fila" title={`Também com a fila aberta: ${colegas.map((c) => c.nome).join(', ')}`}>
              {colegas.slice(0, 5).map((c) => (
                <span key={c.email} className="presente" style={{ background: corDe(c.email) }}>{iniciais(c.nome)}</span>
              ))}
              {colegas.length > 5 && <span className="presente mais">+{colegas.length - 5}</span>}
              <span className="na-fila-texto">{colegas.length === 1 ? `${colegas[0].nome.split(/\s+/)[0]} também está aqui` : `mais ${colegas.length} aqui`}</span>
            </div>
          )}
          <Perfil identidade={identidade} definirPerfil={definirPerfil} />
        </header>

        {EXEMPLOS.length > 0 && (
          <section className="exemplos">
            <span className="rotulo">Exemplos</span>
            {EXEMPLOS.map(([nome, arquivo]) => (
              <button
                key={arquivo}
                className="opcao"
                onClick={async () => {
                  try {
                    const resposta = await fetch('./exemplos.json');
                    if (!resposta.ok) throw new Error();
                    const b64 = ((await resposta.json()) as Record<string, string>)[arquivo];
                    abrirArquivo(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], arquivo));
                  } catch {
                    avisar('Não consegui abrir o exemplo.');
                  }
                }}
              >
                {nome}
              </button>
            ))}
          </section>
        )}

        {vazio ? (
          <section className="fila-vazia">
            <span className="fila-vazia-icone"><Icone nome="importar" tam={26} /></span>
            <h2 className="titulo-serifa">Arraste os roteiros para cá</h2>
            <p className="suave">Quantos quiser de uma vez: .docx, .rtf ou .pdf. Cada um vira uma ficha na fila.</p>
            <button className="botao-texto" onClick={criar}>ou cole o texto copiado do Word</button>
          </section>
        ) : (
          roteiros && (
            <section className="lista">
              <div className="fila-topo">
                <div>
                  <h2 className="titulo-serifa"><em>{todos.length}</em> {todos.length === 1 ? 'roteiro na fila' : 'roteiros na fila'}</h2>
                  <p className="fila-conta">
                    <span><i className="ponto ok" />{plural(todos.length - paraRevisar, 'pronto', 'prontos')}</span>
                    {paraRevisar > 0 && <span><i className="ponto revisar" />{paraRevisar} para revisar</span>}
                    {falhas.length > 0 && <span><i className="ponto erro" />{plural(falhas.length, 'não lido', 'não lidos')}</span>}
                  </p>
                </div>
                {todos.length > 6 && (
                  <label className="busca">
                    <Icone nome="lupa" tam={15} traco={2} />
                    <input type="search" placeholder="Buscar por atração, claquete ou redator" aria-label="Buscar roteiros" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  </label>
                )}
              </div>

              <ul className="fichas">
                {falhas.map((f) => (
                  <li key={f.nome} className="ficha erro montada">
                    <span className="ficha-marca erro" aria-hidden="true"><Icone nome="fechar" tam={11} traco={3} /></span>
                    <span className="ficha-claquete"><b>{f.nome.replace(/\.[^.]+$/, '')}</b><span>Não consegui ler este arquivo</span></span>
                    <span className="ficha-acoes"><button className="botao" onClick={() => tirarFalha(f.nome)}>Tirar da fila</button></span>
                    <span className="ficha-pendencias"><span className="pendencia erro">{f.motivo}</span></span>
                  </li>
                ))}
                {visiveis.map((r, k) => (
                  <Ficha
                    key={r.id}
                    r={r}
                    nova={novos.includes(r.id) || deOutros.includes(r.id)}
                    ordem={k}
                    abrir={() => abrir(r.id)}
                    acoes={
                      apagando === r.id ? (
                        <>
                          <button className="botao-texto perigo" onClick={() => apagar(r)}>Tirar</button>
                          <button className="botao-texto" onClick={() => setApagando(null)}>Manter</button>
                        </>
                      ) : (
                        (r.meu || aberto) && (
                          <button className="botao-icone ficha-lixo" title="Tirar da fila" aria-label={`Tirar ${r.meta.claquete || r.meta.titulo} da fila`} onClick={() => setApagando(r.id)}><Icone nome="lixo" /></button>
                        )
                      )
                    }
                  />
                ))}
              </ul>
              {!visiveis.length && termo && <p className="suave vazio">Nada encontrado para “{busca}”.</p>}
              <p className="fila-rodape">Arraste mais roteiros para qualquer ponto da tela. <button className="botao-texto" onClick={criar}>Colar do Word</button></p>
            </section>
          )
        )}
      </main>
    </div>
  );
}
