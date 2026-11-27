import { useEffect, useState } from 'react';
import { ETIQUETAS } from '../modelo/tipos';
import { atalho } from './util';

type Tela = 'fila' | 'revisao' | 'cadastros' | 'comparar' | 'filmes' | 'configuracao' | 'andamento' | 'pauta';
type Linha = [tecla: string, oque: string];

const LINHAS: Record<Tela, { titulo: string; linhas: Linha[] }> = {
  fila: {
    titulo: 'Fila',
    linhas: [
      ['R', 'Abre o próximo roteiro para revisar'],
      ['/', 'Abre a busca (Esc limpa e fecha)'],
      ['Arrastar', 'Solta .docx, .rtf ou .pdf em qualquer ponto da tela'],
      ['Esc', 'Fecha menus e balões'],
    ],
  },
  revisao: {
    titulo: 'Revisão',
    linhas: [
      [atalho('Mod-u'), 'Marca o trecho como arte'],
      ['Shift+clique', 'Seleciona várias artes na lista'],
      ['1 2 3', 'Leva a arte (ou as selecionadas) à BAIXA, MÉDIA ou ALTA'],
      ['E', 'Marca a arte (ou as selecionadas) como já existe ou devolve à lista'],
      ...ETIQUETAS.map((e): Linha => [atalho(e.atalho), e.nome]),
      [atalho('Mod-Enter'), 'Manda para o Trello ou abre o próximo'],
      [atalho('Mod-z'), 'Desfaz'],
    ],
  },
  filmes: {
    titulo: 'Filmes',
    linhas: [
      ['← →', 'Página anterior e próxima da prévia'],
      ['Arrastar', 'Solta o PDF da prévia na tela'],
    ],
  },
  cadastros: {
    titulo: 'Cadastros',
    linhas: [
      ['Enter', 'Grava a key nova (ou separa com vírgula)'],
      ['↑ ↓ Enter', 'Escolhe a atração no Ligar a…'],
      ['Esc', 'Fecha menus e balões'],
    ],
  },
  comparar: { titulo: 'Comparar', linhas: [['Esc', 'Fecha menus e balões']] },
  andamento: { titulo: 'Andamento', linhas: [['Esc', 'Fecha menus e balões']] },
  pauta: {
    titulo: 'Pauta da edição',
    linhas: [
      ['← →', 'Semana anterior e próxima'],
      ['Esc', 'Fecha o balão do aviso'],
    ],
  },
  configuracao: {
    titulo: 'Configuração',
    linhas: [
      ['Arrastar', 'Muda a ordem das praças (ou ↑ ↓ na alça)'],
      ['Esc', 'Fecha a escolha e a conferência'],
    ],
  },
};

/** "?" mostra os atalhos da tela onde a pessoa está e, embaixo, "Fazer o tour" (o tour da revisão de novo). */
export function Atalhos({ tela, fazerTour }: { tela: Tela; fazerTour?: () => void }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setAberto(false);
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      // no texto da revisão (que é travado) vale; em campos de digitar, o "?" é do campo
      if (alvo?.closest('input, textarea, select')) return;
      e.preventDefault();
      setAberto((x) => !x);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  const t = LINHAS[tela];
  return (
    <>
      <button type="button" className="botao-atalhos" aria-label="Atalhos do teclado" title="Atalhos (?)" onClick={() => setAberto((x) => !x)}>
        ?
      </button>
      {aberto && (
        <div className="atalhos-fundo" onClick={() => setAberto(false)}>
          <div className="atalhos-cartao" role="dialog" aria-label={`Atalhos: ${t.titulo}`} onClick={(e) => e.stopPropagation()}>
            <h2>
              Atalhos <span>{t.titulo}</span>
            </h2>
            <dl>
              {t.linhas.map(([k, o]) => (
                <div key={k + o}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{o}</dd>
                </div>
              ))}
              <div>
                <dt>
                  <kbd>?</kbd>
                </dt>
                <dd>Mostra ou esconde este cartão</dd>
              </div>
            </dl>
            {fazerTour && (
              <div className="atalhos-pe">
                <button
                  type="button"
                  className="botao-texto"
                  onClick={() => {
                    setAberto(false);
                    fazerTour();
                  }}
                >
                  Fazer o tour
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
