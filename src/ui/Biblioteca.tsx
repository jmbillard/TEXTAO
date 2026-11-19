import { useEffect, useRef, useState } from 'react';
import { armazenamento, type Resumo } from '../dados/armazenamento';
import { SAIR_DO_ACESSO, type Identidade } from '../dados/identidade';
import { novoId, type Pessoa, type Roteiro } from '../modelo/tipos';
import { Icone } from './icones';
import { dataCurta, haQuantoTempo, plural } from './util';

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

export function Biblioteca({ abrir, abrirArquivo, criar, avisar, identidade, definirPerfil }: Props) {
  const [roteiros, setRoteiros] = useState<Resumo[] | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'meus' | 'publicos'>('todos');
  const [busca, setBusca] = useState('');
  const [apagando, setApagando] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = () => armazenamento.listar().then(setRoteiros, () => setRoteiros([]));
  useEffect(() => {
    void carregar();
  }, []);

  const duplicar = async (resumo: Resumo) => {
    const r = await armazenamento.ler(resumo.id);
    if (!r) return avisar('Não consegui abrir esse roteiro.');
    const agora = new Date().toISOString();
    const eu: Pessoa | undefined = identidade ? { nome: identidade.nome, email: identidade.email } : undefined;
    const copia: Roteiro = { ...structuredClone(r), id: novoId(), revisao: 1, criadoEm: agora, atualizadoEm: agora, criadoPor: eu, alteradoPor: eu, publico: false, compartilhadoCom: [], meu: true };
    copia.meta.titulo = r.meta.titulo ? `${r.meta.titulo} (cópia)` : '';
    copia.meta.status = 'rascunho';
    await armazenamento.salvar(copia);
    abrir(copia.id);
  };
  const apagar = async (r: Resumo) => {
    await armazenamento.apagar(r.id);
    setApagando(null);
    avisar('Roteiro apagado.');
    void carregar();
  };

  const termo = busca.trim().toLowerCase();
  const temPublicos = (roteiros ?? []).some((r) => !r.meu);
  const visiveis = (roteiros ?? [])
    .filter((r) => filtro === 'todos' || (filtro === 'meus' ? r.meu : !r.meu))
    .filter((r) => !termo || [r.meta.titulo, r.meta.programa, r.meta.redator, r.meta.locutor, r.dono?.nome].join(' ').toLowerCase().includes(termo));

  return (
    <div className="pagina">
      <main className="biblioteca">
        <header className="bib-topo">
          <span className="marca" aria-hidden="true">r</span>
          <h1 className="titulo-serifa">Roteiros</h1>
          <span className="espaco" />
          <Perfil identidade={identidade} definirPerfil={definirPerfil} />
        </header>

        <section className="entrada">
          <button className="entrada-soltar" onClick={() => entrada.current?.click()}>
            <span className="entrada-icone"><Icone nome="importar" tam={20} /></span>
            <span className="entrada-texto">
              <strong>Trazer do Word</strong>
              <span>Arraste o arquivo ou clique para escolher</span>
            </span>
          </button>
          <button className="entrada-novo" onClick={criar}>
            <Icone nome="mais" tam={18} />
            Começar em branco
          </button>
          <input
            ref={entrada}
            type="file"
            accept=".docx,.rtf,.pdf,.txt,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) abrirArquivo(f);
              e.target.value = '';
            }}
          />
        </section>

        {EXEMPLOS.length > 0 && (
          <section className="exemplos">
            <span className="rotulo">Exemplos</span>
            {EXEMPLOS.map(([nome, arquivo]) => (
              <button
                key={arquivo}
                className="opcao"
                onClick={async () => {
                  try {
                    const r = await fetch('./exemplos.json');
                    if (!r.ok) throw new Error();
                    const b64 = ((await r.json()) as Record<string, string>)[arquivo];
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

        {roteiros && roteiros.length > 0 && (
          <section className="lista">
            <div className="lista-topo">
              {temPublicos ? (
                <div className="segmento" role="radiogroup" aria-label="Quais roteiros mostrar">
                  {([['todos', 'Todos'], ['meus', 'Meus'], ['publicos', 'De colegas']] as const).map(([id, nome]) => (
                    <button key={id} role="radio" aria-checked={filtro === id} onClick={() => setFiltro(id)}>{nome}</button>
                  ))}
                </div>
              ) : (
                <h2 className="rotulo">{plural(visiveis.length, 'roteiro', 'roteiros')}</h2>
              )}
              <input className="busca" type="search" placeholder="Buscar por programa, título ou locutor" aria-label="Buscar roteiros" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <ul>
              {visiveis.map((r) => {
                const nArtes = r.nArtes;
                return (
                  <li key={r.id} className="item">
                    <button className="item-abrir" onClick={() => abrir(r.id)}>
                      <span className="item-titulo">{r.meta.titulo || 'Sem título'}</span>
                      <span className="item-sub">
                        {[r.meta.programa, dataCurta(r.meta.dataExibicao), r.meta.locutor && `loc. ${r.meta.locutor}`].filter(Boolean).join(' · ') || 'Rascunho'}
                        {!r.meu && r.dono && <span className="etiqueta-lista">de {r.dono.nome}{r.podeEditar ? ' · você edita' : ''}</span>}
                        {r.meu && (r.publico || r.compartilhado) && <span className="etiqueta-lista">{r.publico ? 'todos leem' : 'compartilhado'}</span>}
                      </span>
                    </button>
                    <span className="item-artes">{plural(nArtes, 'arte', 'artes')}</span>
                    <span className="item-quando">{haQuantoTempo(r.atualizadoEm)}</span>
                    {apagando === r.id ? (
                      <span className="item-acoes confirmando">
                        <button className="botao-texto perigo" onClick={() => apagar(r)}>Apagar</button>
                        <button className="botao-texto" onClick={() => setApagando(null)}>Manter</button>
                      </span>
                    ) : (
                      <span className="item-acoes">
                        <button className="botao-icone" title="Duplicar" aria-label={`Duplicar ${r.meta.titulo}`} onClick={() => duplicar(r)}><Icone nome="duplicar" /></button>
                        {r.meu && <button className="botao-icone" title="Apagar" aria-label={`Apagar ${r.meta.titulo}`} onClick={() => setApagando(r.id)}><Icone nome="lixo" /></button>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!visiveis.length && <p className="suave vazio">Nada encontrado para “{busca}”.</p>}
          </section>
        )}
        {roteiros && roteiros.length === 0 && <p className="suave vazio">Nenhum roteiro ainda.</p>}
      </main>
    </div>
  );
}
