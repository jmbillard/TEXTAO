/* O nome novo da pauta (#132), nos Editores dos Cadastros, só para administradores: o editor que a coordenação escreveu
   na pauta e não está nos Cadastros fica pendente, no alto da lista, com os dias em que aparece. O administrador
   cadastra o nome como editor novo, liga a um editor que já existe ("é a mesma pessoa?", com a sugestão já escolhida)
   ou ignora. Ligar grava o nome como key do editor e a pauta passa a mostrar o nome do cadastro. */
import { useEffect, useState } from 'react';
import type { EditorCadastro, NomeNovoDaPauta } from '../dados/armazenamento';
import { DIAS_DA_SEMANA, partes } from './pecasDaPauta';
import './nomesNovos.css';

/** "sex 27/11". */
function diaCurto(iso: string) {
  const p = partes(iso);
  return `${DIAS_DA_SEMANA[p.semana]} ${p.dia}/${p.mes + 1}`;
}

/** Onde o nome está: "na pauta de sex 27/11 (publicada) e sáb 28/11 (rascunho)", até quatro dias e o resto contado. */
export function ondeNaPauta(dias: NomeNovoDaPauta['dias']) {
  const vistos = dias.slice(0, 4).map((d) => `${diaCurto(d.dia)} (${d.publicado ? 'publicada' : 'rascunho'})`);
  const resto = dias.length - vistos.length;
  if (resto) vistos.push(`mais ${resto} ${resto === 1 ? 'dia' : 'dias'}`);
  const lista = vistos.length > 1 ? `${vistos.slice(0, -1).join(', ')} e ${vistos.at(-1)}` : vistos[0];
  return `na pauta de ${lista}`;
}

/** O título do bloco, com quantos pendentes. */
export function TituloDosNomesNovos({ n }: { n: number }) {
  return (
    <h3 className="titulo-nomes-novos">
      Nomes novos da pauta, pendentes <span className="conta-nomes-novos">{n}</span>
    </h3>
  );
}

export function NomeNovoNaLista({ n, editores, ligar, cadastrar, ignorar }: { n: NomeNovoDaPauta; editores: EditorCadastro[]; ligar: (editor: EditorCadastro) => Promise<void>; cadastrar: () => Promise<void>; ignorar: () => Promise<void> }) {
  const [escolhido, setEscolhido] = useState(n.sugestao?.id ?? '');
  const [indo, setIndo] = useState(false);
  useEffect(() => setEscolhido(n.sugestao?.id ?? ''), [n.sugestao?.id]);
  const com = (f: () => Promise<void>) => async () => {
    setIndo(true);
    await f();
    setIndo(false);
  };
  const editor = editores.find((e) => e.id === escolhido);
  return (
    <div className="nome-novo-cad" role="group" aria-label={`Nome novo: ${n.nome}`}>
      <p className="nome-nome-novo">
        <b>{n.nome}</b> <span className="etiqueta-nome-novo">nome novo</span>
      </p>
      <p className="onde-nome-novo">{ondeNaPauta(n.dias)}, sem cadastro com este nome.</p>
      <div className="acoes-nome-novo">
        <label className="mesma-pessoa">
          <span>É a mesma pessoa?</span>
          <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} disabled={indo} aria-label={`Quem é ${n.nome}`}>
            {!escolhido && <option value="">Escolha…</option>}
            {editores.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        {n.sugestao && escolhido === n.sugestao.id && <span className="sugestao-nome-novo">{n.sugestao.por === 'key' ? 'pela key' : 'pelo nome'}</span>}
        <button type="button" className="botao primario" disabled={!editor || indo} onClick={com(() => ligar(editor!))}>
          Ligar
        </button>
        <button type="button" className="botao" disabled={indo} onClick={com(cadastrar)}>
          Cadastrar como editor novo
        </button>
        <button type="button" className="botao-texto" disabled={indo} onClick={com(ignorar)}>
          Ignorar
        </button>
      </div>
    </div>
  );
}
