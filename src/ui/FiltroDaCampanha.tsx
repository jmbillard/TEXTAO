import { useEffect, useRef, useState } from 'react';
import { lerCampanhas } from '../dados/armazenamento';
import type { CampanhaDoCard } from '../modelo/campanhas';
import { MenuLigar } from './Cadastros';
import { EtiquetaDaCampanha } from './EtiquetaDaCampanha';
import { Icone } from './icones';

/* O filtro por campanha da tela de produções (#179), no topo, com as peças que já existem:
   - EscolherCampanha: o botão "Campanha" ao lado da lupa abre a busca das campanhas (o MenuLigar, o mesmo da atração e
     da campanha do card aberto), sem caixa e acento, pelas setas e pelo Enter; escolher filtra;
   - CampanhaDoFiltro: ao lado do título, "só" e a etiqueta da campanha (a EtiquetaDaCampanha, a mesma dos cards), com o
     × que tira o filtro. Entra e sai abrindo e fechando a vaga (as Vagas da etiqueta). */

export function EscolherCampanha({ filtro, filtrar }: { filtro: CampanhaDoCard | null; filtrar: (c: CampanhaDoCard) => void }) {
  const [aberto, setAberto] = useState(false);
  const [campanhas, setCampanhas] = useState<CampanhaDoCard[] | null>(null);
  const caixa = useRef<HTMLSpanElement>(null);
  // a lista lida de novo a cada vez que abre (a criada pelo card aberto, a renomeada)
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    lerCampanhas().then(
      (l) => vivo && setCampanhas(l.map((c) => ({ id: c.id, nome: c.nome }))),
      () => vivo && setCampanhas((c) => c ?? []),
    );
    return () => {
      vivo = false;
    };
  }, [aberto]);
  // o clique fora fecha; o do botão, que também está na caixa, só alterna
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const fechar = () => {
    setAberto(false);
    caixa.current?.querySelector<HTMLButtonElement>('.prod-campanha-botao')?.focus();
  };
  // a que já filtra não aparece para escolher de novo
  const nomes = (campanhas ?? []).filter((c) => c.id !== filtro?.id).map((c) => c.nome);
  return (
    <span className="prod-escolher-campanha" ref={caixa}>
      <button type="button" className={`prod-campanha-botao${filtro ? ' com-filtro' : ''}`} aria-expanded={aberto} aria-haspopup="listbox" title="Filtrar por uma campanha" onClick={() => setAberto((a) => !a)}>
        <i className="prod-campanha-bolinhas" aria-hidden="true" />
        <span>{filtro ? 'Trocar a campanha' : 'Campanha'}</span>
        <Icone nome="baixo" tam={14} traco={2.2} />
      </button>
      {aberto && (
        <span className="prod-menu-campanha">
          {campanhas ? (
            <MenuLigar
              dentro
              atracoes={nomes}
              dica="Buscar campanha"
              ligar={(nome) => {
                const c = campanhas.find((x) => x.nome === nome);
                setAberto(false);
                if (c) filtrar(c);
              }}
              fechar={fechar}
            />
          ) : (
            <span className="escolha-nome-menu menu-ligar prod-menu-lendo">Lendo as campanhas…</span>
          )}
        </span>
      )}
    </span>
  );
}

export function CampanhaDoFiltro({ filtro, tirar }: { filtro: CampanhaDoCard | null; tirar: () => void }) {
  return (
    <span className={`prod-filtro${filtro ? ' ligado' : ''}`} aria-live="polite">
      {filtro && <span className="prod-filtro-so">só</span>}
      <EtiquetaDaCampanha modo="todas" campanhas={filtro ? [filtro] : []} tirar={tirar} rotuloDoTirar={(c) => `Tirar o filtro da campanha ${c.nome} (Esc)`} abrir={tirar} rotuloDoAbrir={(c) => `Só a campanha ${c.nome}: clique para tirar o filtro (Esc)`} />
    </span>
  );
}
