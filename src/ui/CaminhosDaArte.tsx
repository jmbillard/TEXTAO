import { useEffect, useState, useSyncExternalStore } from 'react';
import { nomeNoFim, type CaminhosDaArte as Caminhos, type NosDoisSistemas } from '../modelo/caminhosDaArte';
import { Icone } from './icones';
import { copiarTexto, ehMac } from './util';
import './caminhosDaArte.css';

/* Os caminhos da arte (#202): a pasta de saída (em destaque: é de onde a edição pega o render) e o projeto (o `.aep`)
   de uma Produção, cada um com o copiar, em Windows e Mac. A mesma peça na ficha da claquete da Pauta e no card aberto
   de Produções. Sem caminho, quem usa não põe a peça: nada aparece. */

type Sistema = 'win' | 'mac';
const NOME_DO_SISTEMA: Record<Sistema, string> = { win: 'Windows', mac: 'Mac' };
const outro = (s: Sistema): Sistema => (s === 'win' ? 'mac' : 'win');

/* O sistema escolhido vale para todos os caminhos à vista (as Produções da ficha, as duas telas) e fica lembrado neste
   navegador; sem escolha, o de quem vê. */
const LEMBRADO = 'promeiro.caminhos-da-arte.sistema';
function lembrado(): Sistema | null {
  try {
    const v = localStorage.getItem(LEMBRADO);
    return v === 'win' || v === 'mac' ? v : null;
  } catch {
    return null;
  }
}
let sistemaAgora: Sistema | null = null;
const ouvintes = new Set<() => void>();
const lerSistema = (): Sistema => (sistemaAgora ??= lembrado() ?? (ehMac ? 'mac' : 'win'));
function escolherSistema(s: Sistema) {
  sistemaAgora = s;
  try {
    localStorage.setItem(LEMBRADO, s);
  } catch {
    // sem o armazenamento do navegador, vale só até recarregar
  }
  for (const f of ouvintes) f();
}
const ouvir = (f: () => void) => (ouvintes.add(f), () => void ouvintes.delete(f));

/**
 * O botão de copiar um caminho: copia e troca o texto por "Copiado" (em laranja, nunca um ✓) por um instante; a falha
 * diz "Não consegui copiar". O mesmo dos caminhos dos Filmes e dos caminhos da arte.
 * @param aoCopiar o aviso de quem usa (o dos Filmes), depois de copiar ou de falhar
 */
export function BotaoDeCopiar({ texto, rotulo = 'Copiar caminho', descricao, primario = false, aoCopiar }: { texto: string; rotulo?: string; descricao?: string; primario?: boolean; aoCopiar?: (ok: boolean) => void }) {
  const [copiado, setCopiado] = useState<'sim' | 'nao' | null>(null);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(null), 1800);
    return () => clearTimeout(t);
  }, [copiado]);
  return (
    <button
      type="button"
      className={`botao copiar-caminho${primario ? ' primario' : ''}${copiado === 'sim' ? ' copiado' : ''}`}
      aria-label={descricao}
      onClick={() =>
        void copiarTexto(texto).then(
          () => (setCopiado('sim'), aoCopiar?.(true)),
          () => (setCopiado('nao'), aoCopiar?.(false)),
        )
      }
    >
      <Icone nome="copiar" tam={14} traco={1.8} />
      <span className="copiar-caminho-texto" key={copiado ?? 'parado'} aria-live="polite">
        {copiado === 'sim' ? 'Copiado' : copiado === 'nao' ? 'Não consegui copiar' : rotulo}
      </span>
    </button>
  );
}

/** Um caminho da arte: o rótulo, o caminho no sistema escolhido (ou, sem ele, no outro, com o aviso) e o copiar. */
function UmCaminho({ tipo, caminho, sistema, ordem }: { tipo: 'saida' | 'projeto'; caminho: NosDoisSistemas; sistema: Sistema; ordem: number }) {
  const noSistema = caminho[sistema] ? sistema : outro(sistema);
  const texto = caminho[noSistema];
  const saida = tipo === 'saida';
  const nome = saida ? '' : nomeNoFim(texto);
  const pasta = nome ? texto.slice(0, texto.length - nome.length) : texto;
  return (
    <div className={`cda-caminho cda-${tipo}`} data-caminho={tipo} data-sistema={noSistema} style={{ '--ordem': ordem } as React.CSSProperties}>
      <div className="cda-cabeca-do-caminho">
        <span className="cda-rotulo">
          <Icone nome={saida ? 'producao' : 'arquivo'} tam={14} traco={1.8} />
          {saida ? 'Pasta de saída' : 'Projeto'}
        </span>
        {saida && <span className="cda-dica">a edição pega o render aqui</span>}
        {noSistema !== sistema && <span className="cda-so">só no {NOME_DO_SISTEMA[noSistema]}</span>}
      </div>
      <code className="cda-texto" key={noSistema} title={texto}>
        {pasta}
        {nome && <b>{nome}</b>}
      </code>
      <BotaoDeCopiar texto={texto} rotulo="Copiar" primario={saida} descricao={`Copiar o caminho ${saida ? 'da pasta de saída' : 'do projeto'} (${NOME_DO_SISTEMA[noSistema]})`} />
    </div>
  );
}

/**
 * Os caminhos da arte de uma Produção, com a troca Windows / Mac (começa no sistema de quem vê, e a escolha vale para
 * todos os caminhos à vista). A troca só aparece
 * quando algum caminho existe nos dois.
 * @param titulo o que vem depois de "Caminhos da arte" (a praça, quando a claquete tem várias Produções)
 */
export function CaminhosDaArte({ caminhos, titulo }: { caminhos: Caminhos; titulo?: string }) {
  const sistema = useSyncExternalStore(ouvir, lerSistema, lerSistema);
  const lista = [caminhos.saida && ({ tipo: 'saida', c: caminhos.saida } as const), caminhos.projeto && ({ tipo: 'projeto', c: caminhos.projeto } as const)].filter((x) => !!x);
  if (!lista.length) return null;
  const nosDois = lista.some(({ c }) => c.win && c.mac);
  return (
    <section className="caminhos-da-arte" aria-label={`Caminhos da arte${titulo ? ` · ${titulo}` : ''}`}>
      <div className="cda-cabeca">
        <span className="cda-titulo">
          Caminhos da arte
          {titulo && <small>{titulo}</small>}
        </span>
        {nosDois && (
          <div className="segmento cda-sistema" role="radiogroup" aria-label="O sistema dos caminhos" data-sistema={sistema}>
            <span className="cda-pastilha" aria-hidden="true" />
            {(['win', 'mac'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sistema === s} onClick={() => escolherSistema(s)}>
                {NOME_DO_SISTEMA[s]}
              </button>
            ))}
          </div>
        )}
      </div>
      {lista.map(({ tipo, c }, i) => (
        <UmCaminho key={tipo} tipo={tipo} caminho={c} sistema={sistema} ordem={i} />
      ))}
    </section>
  );
}
