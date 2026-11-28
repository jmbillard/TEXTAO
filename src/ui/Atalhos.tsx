import { useEffect, useState } from 'react';
import { ETIQUETAS } from '../modelo/tipos';
import { ATALHO_DAS_ARTES, ATALHO_DE_COMENTAR, atalho } from './util';

type Tela = 'fila' | 'revisao' | 'escrita' | 'leitura' | 'cadastros' | 'comparar' | 'filmes' | 'configuracao' | 'andamento' | 'correcoes' | 'pauta' | 'montar';
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
      [ATALHO_DAS_ARTES, 'Recolhe ou mostra a lista das artes (a escolha vale também na folha de escrita)'],
      [atalho('Mod-z'), 'Desfaz'],
    ],
  },
  // a folha de escrita (#190) e o modo limpo (#193). Os próximos tickets acrescentam as linhas deles: comentar (#192) e
  // o Enviar (#194)
  escrita: {
    titulo: 'Escrever',
    linhas: [
      ['/', 'Comandos: /locucao, /arte, /sonora, /edicao, /trilha, /locutor, /producao, /locacao, /comentario (recado para a edição, a produção ou a arte, ou comentário sobre o texto), /timecode, /arquivo, /texto'],
      ['Tab', 'Confirma o tipo adivinhado (o "?"); de novo, troca pelo próximo'],
      ['Shift+Tab', 'Troca pelo tipo anterior'],
      [atalho('Mod-u'), 'Arte: o selecionado (no meio da frase) ou, sem seleção, o trecho todo'],
      ['Enter', 'Trecho novo'],
      ['↑ ↓ Enter', 'Escolhe no menu do / e no do tipo'],
      [ATALHO_DE_COMENTAR, 'Comenta o trecho selecionado (#192); no balão, Enter envia e @ chama alguém'],
      ['Esc', 'Fecha os menus e os balões'],
      [atalho('Mod-z'), 'Desfaz'],
      [atalho('Mod-Shift-z'), 'Refaz'],
      [atalho('Mod-Shift-l'), 'Modo limpo: só a folha, com a cara do .docx (de novo, sai)'],
      [ATALHO_DAS_ARTES, 'Recolhe ou mostra a lista das artes: a folha ganha o espaço (vale também na revisão)'],
      [atalho('Mod-Enter'), 'Enviar: confere a claquete e põe o roteiro na fila'],
    ],
  },
  // a folha de escrita em leitura (quem só lê e o último envio aberto pela Pauta, #197): sem os atalhos de escrever; o
  // comentar só para quem pode comentar (a opção `comenta`)
  leitura: {
    titulo: 'Ler o roteiro',
    linhas: [
      [ATALHO_DE_COMENTAR, 'Comenta o trecho selecionado; no balão, Enter envia e @ chama alguém'],
      [atalho('Mod-Shift-l'), 'Modo limpo: só a folha, com a cara do .docx (de novo, sai)'],
      [ATALHO_DAS_ARTES, 'Recolhe ou mostra a lista das artes'],
      ['Esc', 'Fecha os balões'],
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
  correcoes: { titulo: 'Correção de grafia', linhas: [['Esc', 'Fecha menus e balões']] },
  pauta: {
    titulo: 'Pauta da edição',
    linhas: [
      ['← →', 'Semana (ou dia) anterior e próxima'],
      ['Esc', 'Fecha o balão do aviso e a ficha'],
    ],
  },
  montar: {
    titulo: 'Montar a pauta',
    linhas: [
      ['Tab', 'Próximo campo'],
      ['Enter', 'Nova linha de demanda (no editor, escolhe da lista)'],
      ['↑ ↓', 'Entre as linhas (e na lista dos editores)'],
      ['⌫', 'Na linha vazia, apaga a linha'],
      ['← →', 'Semana anterior e próxima (fora dos campos)'],
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
export function Atalhos({ tela, fazerTour, comenta = true }: { tela: Tela; fazerTour?: () => void; /** sem ele, a linha do comentar sai */ comenta?: boolean }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setAberto(false);
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      // no texto da revisão (que é travado) vale; em campos de digitar, o "?" é do campo, e também no texto da folha de
      // escrita, onde se digita
      if (alvo?.closest('input, textarea, select') || (tela === 'escrita' && alvo?.isContentEditable)) return;
      e.preventDefault();
      setAberto((x) => !x);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [tela]);
  const t = { ...LINHAS[tela], linhas: LINHAS[tela].linhas.filter(([k]) => comenta || k !== ATALHO_DE_COMENTAR) };
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
