import { useEffect, useState, type ReactNode } from 'react';
import { apelidoDoRoteiro, useApelidos } from '../dados/apelidos';
import { NomeDaClaquete, versoesDoResumo } from './Apelido';
import { EditorContent, useEditor } from '@tiptap/react';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Arte, Celula, Etiqueta, Imagem, Linha, TipoDoTrecho } from '../editor/extensoes';
import { armazenamento, roteiroDa, type Leitura, type MeuRoteiro, type MeusRoteiros as Lidos } from '../dados/armazenamento';
import type { AreaDosRoteiros } from '../modelo/areas';
import type { ArteDoRoteiro, ArtesDoRoteiro, EstadoDaArte } from '../modelo/artesDoRoteiro';
import { CICLO, frasesDoCiclo, type CicloDoRoteiro } from '../modelo/cicloDoRoteiro';
import { NOMES_COLUNAS, type NoJSON, type Roteiro } from '../modelo/tipos';
import { Icone } from './icones';
import { plural } from './util';
import './areas.css';

/* O roteiro aberto do Redator e do Editor (#104): o texto só para leitura (o mesmo documento do editor, com as artes
   sublinhadas, sem digitar), o ciclo com os passos e as datas e, no Editor, as artes do roteiro com o estado e a
   origem. Tem endereço próprio (#/redator/r/<id>) e vai ao anterior e ao próximo de "meus roteiros" sem voltar à lista.
   A lista ("meus roteiros") vem de MeusRoteiros, que continua a relê-la. Nada vem do Trello. */

interface Props {
  area: AreaDosRoteiros;
  id: string;
  /** a linha do logo: o caminho "PROMeiro / redator ▾", a Pauta da edição e o perfil */
  /** "meus roteiros" como a lista leu (e relê na cadência da agenda): o ciclo, as artes e a ordem da navegação */
  lido: Lidos | null;
  topo: ReactNode;
  abrir: (id: string) => void;
  voltar: () => void;
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** A data de exibição: "qua, 3/12"; sem data completa, null. */
function diaDaExibicao(iso: string | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return null;
  const [a, m, d] = (iso as string).split('-').map(Number);
  return `${DIAS[new Date(a, m - 1, d).getDay()]}, ${d}/${m}`;
}

/** O texto do roteiro com as extensões do editor, sem digitar: as artes e as etiquetas aparecem como na revisão. */
function TextoSoLeitura({ doc }: { doc: NoJSON }) {
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, Bold, Italic, HardBreak, Arte, Etiqueta, Imagem, Linha, Celula, TipoDoTrecho],
    content: doc,
    editable: false,
    editorProps: { attributes: { class: 'texto', lang: 'pt-BR', 'aria-label': 'Texto do roteiro', 'aria-readonly': 'true' } },
  });
  return <EditorContent editor={editor} />;
}

/** O ciclo em pé: cada passo com a data e, no Produzindo, quem da arte está com ele; os de antes do PROMeiro apagados. */
function CicloEmPe({ ciclo, daArte }: { ciclo: CicloDoRoteiro; daArte: string[] }) {
  const ultimoAntes = ciclo.passos.filter((p) => p.situacao === 'em-breve').at(-1)?.id;
  return (
    <ol className="ciclo-em-pe">
      {ciclo.passos.map((p) => {
        const [frase] = frasesDoCiclo([p]);
        const com = p.id === 'produzindo' && p.situacao !== 'depois' && daArte.length ? `com ${daArte.join(' e ')}` : '';
        const quando = [frase, com].filter(Boolean).join(' · ');
        return [
          <li key={p.id} className={p.situacao} data-passo={p.id} aria-current={p.situacao === 'agora' ? 'step' : undefined}>
            <span className="ponto" />
            <span className="nome">{p.nome}</span>
            {quando && <span className="quando">{quando}</span>}
          </li>,
          p.id === ultimoAntes && (
            <li key="nota" className="ciclo-nota" aria-hidden="true">
              antes do PROMeiro: em breve
            </li>
          ),
        ];
      })}
    </ol>
  );
}

const NOME_DO_ESTADO: Record<EstadoDaArte, string> = { 'a-fazer': 'a fazer', produzindo: 'produzindo', entregue: 'entregue', 'ja-existe': 'já existe' };

/** As artes do roteiro no Editor: cada uma com o estado e a origem, e quantas já foram entregues no topo. */
function ArtesDoEditor({ artes }: { artes: ArtesDoRoteiro }) {
  const arte = (a: ArteDoRoteiro, k: number) => (
    <li key={`${a.origem}-${k}`} className={`arte-aberta ${a.estado}`} data-estado={a.estado} data-origem={a.origem}>
      <span className="st" aria-hidden="true" />
      <span className="t">{a.texto}</span>
      <span className="estado-da-arte">{NOME_DO_ESTADO[a.estado]}</span>
      <span className="meta">
        {a.tipos.length > 0 && <span>{a.tipos.join(' · ')}</span>}
        <span className={`origem ${a.origem}`}>{a.origem === 'designer' ? 'do designer' : 'do roteiro'}</span>
      </span>
    </li>
  );
  return (
    <section className="cartao-lado" aria-label="Artes">
      <h3>
        Artes
        <small className="artes-entregues">{artes.aProduzir ? `${artes.entregues} de ${artes.aProduzir} entregues` : 'nenhuma a produzir'}</small>
      </h3>
      {artes.lista.length ? <ul className="artes-abertas">{artes.lista.map(arte)}</ul> : <p className="cartao-vazio">O roteiro não tem artes marcadas.</p>}
      <p className="artes-pe">Pela revisão e pela produção da arte.</p>
    </section>
  );
}

export function RoteiroAberto({ area, id, lido, topo, abrir, voltar }: Props) {
  // o apelido da claquete (#120) aparece no lugar dela: redesenha quando ele muda
  useApelidos();
  const [leitura, setLeitura] = useState<{ id: string; l: Leitura } | null>(null);
  // o texto: o roteiro guardado, como o editor o lê
  useEffect(() => {
    let vivo = true;
    void armazenamento.ler(id).then((l) => vivo && setLeitura({ id, l }));
    return () => {
      vivo = false;
    };
  }, [id]);

  const roteiros = lido?.roteiros ?? [];
  const k = roteiros.findIndex((r) => r.id === id);
  const meu: MeuRoteiro | undefined = roteiros[k];
  const anterior = k > 0 ? roteiros[k - 1] : undefined;
  const proximo = k >= 0 ? roteiros[k + 1] : undefined;
  const roteiro: Roteiro | undefined = leitura?.id === id ? roteiroDa(leitura.l) : undefined;
  const meta = roteiro?.meta ?? meu?.meta;
  const colunas = roteiro ? NOMES_COLUNAS[roteiro.meta.layout] : null;
  const nomeDe = (r: MeuRoteiro | undefined) => apelidoDoRoteiro(r?.id) || r?.meta.claquete || 'sem claquete';
  const dia = diaDaExibicao(meta?.dataExibicao);

  return (
    <div className="pagina">
      {topo}
      <main className="roteiro-aberto" aria-busy={!leitura}>
        <div className="aberto-topo">
          <button type="button" className="aberto-voltar" onClick={voltar}>
            <Icone nome="voltar" tam={16} /> Roteiros
          </button>
          {k >= 0 && (
            <nav className="aberto-nav" aria-label="Anterior e próximo">
              <button type="button" className="botao-icone" disabled={!anterior} aria-label="Roteiro anterior" title={anterior ? `Anterior: ${nomeDe(anterior)}` : 'É o primeiro'} onClick={() => anterior && abrir(anterior.id)}>
                <Icone nome="voltar" tam={16} traco={2.2} />
              </button>
              <span className="aberto-posicao">
                <b>{k + 1}</b> de {roteiros.length}
              </span>
              <button type="button" className="botao-icone" disabled={!proximo} aria-label="Próximo roteiro" title={proximo ? `Próximo: ${nomeDe(proximo)}` : 'É o último'} onClick={() => proximo && abrir(proximo.id)}>
                <Icone nome="voltar" tam={16} traco={2.2} style={{ transform: 'scaleX(-1)' }} />
              </button>
            </nav>
          )}
          <span className="aberto-leitura">
            <Icone nome="olho" tam={13} /> só leitura
          </span>
        </div>
        <div className="aberto-grade">
          <article className="folha folha-aberta" key={id}>
            <div className="cab">
              <span className="aberto-claquete" title={apelidoDoRoteiro(id) ? `Claquete: ${meta?.claquete ?? ''}` : undefined}>{apelidoDoRoteiro(id) || meta?.claquete ? <NomeDaClaquete nome={apelidoDoRoteiro(id) || meta?.claquete || ''} versoes={meu ? versoesDoResumo(meu) : undefined} /> : 'Sem claquete'}</span>
              <div className="cab-titulo">{meta?.programa || meta?.titulo || 'Sem atração'}</div>
              <div className="cab-frase">
                {[
                  meta?.praca && (
                    <span key="p">
                      Praça <b>{meta.praca}</b>
                    </span>
                  ),
                  dia && (
                    <span key="d">
                      exibe <b>{dia}</b>
                    </span>
                  ),
                  <span key="r">
                    redator <b>{meta?.redator || '—'}</b>
                  </span>,
                  <span key="e">
                    edição <b>{meta?.editor || '—'}</b>
                  </span>,
                ]
                  .filter(Boolean)
                  .flatMap((x, i) => (i ? [' · ', x] : [x]))}
              </div>
            </div>
            {colunas && (
              <div className="colunas-topo rotulo">
                <span>{colunas[0]}</span>
                <span>{colunas[1]}</span>
              </div>
            )}
            <div className={colunas ? 'corpo em-colunas' : 'corpo'}>
              {roteiro ? (
                <TextoSoLeitura key={`${id}-${roteiro.revisao}`} doc={roteiro.doc} />
              ) : leitura?.id === id ? (
                <p className="aviso-meus erro" role="alert">
                  {leitura.l.estado === 'sem-permissao' ? 'Você não tem acesso ao texto deste roteiro.' : leitura.l.estado === 'erro' ? leitura.l.mensagem : 'Este roteiro não está mais no PROMeiro.'}
                </p>
              ) : (
                <p className="aberto-lendo">Lendo o roteiro…</p>
              )}
            </div>
          </article>
          {meu && (
            <aside className="aberto-lado">
              <section className="cartao-lado" aria-label="Onde ele está">
                <h3>
                  Onde ele está <small>{CICLO.find((c) => c.id === meu.ciclo.estado)?.nome}</small>
                </h3>
                <CicloEmPe ciclo={meu.ciclo} daArte={meu.daArte ?? []} />
              </section>
              {area === 'editor' && meu.artes ? (
                <ArtesDoEditor artes={meu.artes} />
              ) : (
                <section className="cartao-lado" aria-label="Quem">
                  <h3>Quem</h3>
                  <p className="quem-aberto">
                    redator: <b>{meu.meta.redator || '—'}</b>
                    <br />
                    edição: <b>{meu.meta.editor || '—'}</b>
                    {meu.artes && (
                      <>
                        <br />
                        {plural(meu.artes.aProduzir, 'arte pedida', 'artes pedidas')} · {plural(meu.artes.entregues, 'entregue', 'entregues')}
                      </>
                    )}
                  </p>
                </section>
              )}
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
