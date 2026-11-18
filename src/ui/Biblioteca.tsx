import { useEffect, useRef, useState } from 'react';
import { armazenamento } from '../dados/armazenamento';
import { exportar } from '../modelo/exportar';
import { novoId, type Roteiro } from '../modelo/tipos';
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
}

export function Biblioteca({ abrir, abrirArquivo, criar, avisar }: Props) {
  const [roteiros, setRoteiros] = useState<Roteiro[] | null>(null);
  const [busca, setBusca] = useState('');
  const [apagando, setApagando] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = () => armazenamento.listar().then(setRoteiros, () => setRoteiros([]));
  useEffect(() => {
    void carregar();
  }, []);

  const duplicar = async (r: Roteiro) => {
    const agora = new Date().toISOString();
    const copia: Roteiro = { ...structuredClone(r), id: novoId(), revisao: 1, criadoEm: agora, atualizadoEm: agora };
    copia.meta.titulo = r.meta.titulo ? `${r.meta.titulo} (cópia)` : '';
    copia.meta.status = 'rascunho';
    await armazenamento.salvar(copia);
    abrir(copia.id);
  };
  const apagar = async (r: Roteiro) => {
    await armazenamento.apagar(r.id);
    setApagando(null);
    avisar('Roteiro apagado.');
    void carregar();
  };

  const termo = busca.trim().toLowerCase();
  const visiveis = (roteiros ?? []).filter((r) => !termo || [r.meta.titulo, r.meta.programa, r.meta.redator, r.meta.locutor].join(' ').toLowerCase().includes(termo));

  return (
    <div className="pagina">
      <main className="biblioteca">
        <header className="bib-topo">
          <span className="marca" aria-hidden="true">r</span>
          <h1 className="titulo-serifa">Roteiros</h1>
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
            accept=".docx,.rtf,.txt,.json"
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
              <h2 className="rotulo">{plural(visiveis.length, 'roteiro', 'roteiros')}</h2>
              <input className="busca" type="search" placeholder="Buscar por programa, título ou locutor" aria-label="Buscar roteiros" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <ul>
              {visiveis.map((r) => {
                const nArtes = exportar(r).artes.length;
                return (
                  <li key={r.id} className="item">
                    <button className="item-abrir" onClick={() => abrir(r.id)}>
                      <span className="item-titulo">{r.meta.titulo || 'Sem título'}</span>
                      <span className="item-sub">
                        {[r.meta.programa, dataCurta(r.meta.dataExibicao), r.meta.locutor && `loc. ${r.meta.locutor}`].filter(Boolean).join(' · ') || 'Rascunho'}
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
                        <button className="botao-icone" title="Apagar" aria-label={`Apagar ${r.meta.titulo}`} onClick={() => setApagando(r.id)}><Icone nome="lixo" /></button>
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
