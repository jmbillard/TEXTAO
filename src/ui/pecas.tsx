import { useRef } from 'react';
import { SUBTIPOS_ARTE, normalizarSubtipo, type Meta, type SubtipoArte } from '../modelo/tipos';
import { editoresConhecidos, redatoresConhecidos } from '../modelo/vocabularios';
import { dataPorExtenso } from './util';

/** A marca do app. */
export const Marca = () => (
  <span className="logo-app" aria-label="PROMeiro">
    <b>PROM</b>eiro
  </span>
);

/** Uma telinha que mostra onde a arte entra no quadro. Sem tipo, fica tracejada. */
export function Miniatura({ subtipo }: { subtipo: string }) {
  return <span className="mini" data-subtipo={normalizarSubtipo(subtipo) || 'vazio'} aria-hidden="true" />;
}

/** Grade para escolher o tipo da arte. Clicar no tipo já escolhido volta a deixar em branco. */
export function EscolhaDeTipo({ valor, escolher, atalhos }: { valor: SubtipoArte; escolher: (s: SubtipoArte) => void; atalhos?: boolean }) {
  return (
    <div className="escolha-bloco">
      <div className="escolha" role="radiogroup" aria-label="Tipo da arte">
        {SUBTIPOS_ARTE.map((s, k) => (
          <button key={s.id} role="radio" aria-checked={valor === s.id} aria-keyshortcuts={atalhos ? String(k + 1) : undefined} onClick={() => escolher(valor === s.id ? '' : s.id)}>
            <Miniatura subtipo={s.id} />
            <span>{atalhos && <kbd>{k + 1}</kbd>}{s.curto}</span>
          </button>
        ))}
      </div>
      {atalhos && <p className="escolha-dica"><kbd>1</kbd>–<kbd>9</kbd> escolhe · <kbd>↑</kbd><kbd>↓</kbd> troca de arte · <kbd>Esc</kbd> fecha</p>}
    </div>
  );
}

type DadosClaquete = Pick<Meta, 'claquete' | 'redator' | 'editor' | 'dataExibicao'>;

/** A claquete da chamada: nome, equipe e exibição. Com `mudar`, os campos são editáveis. */
export function Claquete({ dados, mudar }: { dados: DadosClaquete; mudar?: (m: Partial<Meta>) => void }) {
  const data = useRef<HTMLInputElement>(null);
  const campo = (rotulo: string, chave: 'claquete' | 'redator' | 'editor', vazio: string, lista?: string) =>
    mudar ? (
      <input
        value={dados[chave] ?? ''}
        placeholder={vazio}
        aria-label={rotulo}
        list={lista}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => mudar({ [chave]: e.target.value })}
      />
    ) : (
      <div>{dados[chave]}</div>
    );
  // na conferência do arquivo, o que não foi identificado não aparece
  const mostra = (v: string) => !!mudar || !!v;
  return (
    <section className="claquete" aria-label="Claquete">
      <div className="ripa" aria-hidden="true" />
      <div className="quadro">
        {mostra(dados.claquete) && (
          <label className="campo-c nome">
            <small>Claquete</small>
            {campo('Claquete', 'claquete', 'NOME DA CHAMADA')}
          </label>
        )}
        {(mostra(dados.redator) || mostra(dados.editor)) && (
          <div className="dupla">
            {mostra(dados.redator) && (
              <label className="campo-c">
                <small>Redator</small>
                {campo('Redator', 'redator', 'quem escreveu', 'lista-redatores')}
              </label>
            )}
            {mostra(dados.editor) && (
              <label className="campo-c">
                <small>Editor</small>
                {campo('Editor', 'editor', 'escolher…', 'lista-editores')}
              </label>
            )}
          </div>
        )}
        {mostra(dados.dataExibicao) && (
          <div className="campo-c ultimo">
            <small>Exibição</small>
            {mudar ? (
              <span className="campo-data">
                <button className={dados.dataExibicao ? '' : 'vago'} onClick={() => data.current?.showPicker?.()}>
                  {dataPorExtenso(dados.dataExibicao) || 'escolher a data'}
                </button>
                <input ref={data} type="date" tabIndex={-1} aria-label="Data de exibição" value={dados.dataExibicao} onChange={(e) => mudar({ dataExibicao: e.target.value })} />
              </span>
            ) : (
              <div>{dataPorExtenso(dados.dataExibicao)}</div>
            )}
          </div>
        )}
      </div>
      {mudar && <datalist id="lista-redatores">{redatoresConhecidos().map((p) => <option key={p} value={p} />)}</datalist>}
      {mudar && <datalist id="lista-editores">{editoresConhecidos().map((p) => <option key={p} value={p} />)}</datalist>}
    </section>
  );
}
