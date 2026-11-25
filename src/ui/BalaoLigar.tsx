import { useEffect, useRef, useState } from 'react';
import { darKey, lerCadastros, sugerirLigacao, type AtracaoCadastro } from '../dados/armazenamento';
import { reconhecerNaFila } from '../dados/reconhecer';
import { MenuLigar, comoKey, nomeDaAtracaoNova, type AtracaoNova } from './Cadastros';
import { plural } from './util';

/** Ligar a key de uma claquete a uma atração sem sair da fila ou da revisão: a key já vem da claquete (dá para
    encurtar), a atração parecida aparece escrita à mão e a busca acha o resto. "+ Nova atração" leva aos cadastros
    com o nome (o da busca, ou o da key) e a key. */
export function BalaoLigar({ claquete, ligado, nova, fechar, avisar, aberto }: { claquete: string; ligado: (nome: string) => void; nova: (atracao: AtracaoNova) => void; fechar: () => void; avisar: (t: string) => void; aberto?: string }) {
  const [key, setKey] = useState('');
  const [sugestao, setSugestao] = useState('');
  const [atracoes, setAtracoes] = useState<AtracaoCadastro[] | null>(null);
  const [indo, setIndo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && fechar();
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [fechar]);

  useEffect(() => {
    let vivo = true;
    sugerirLigacao(claquete).then((r) => vivo && (setKey(r.key), setSugestao(r.sugestao)), () => {});
    lerCadastros().then((d) => vivo && setAtracoes(d.atracoes), () => vivo && setAtracoes([]));
    return () => {
      vivo = false;
    };
  }, [claquete]);

  const ligar = async (nome: string) => {
    const a = atracoes?.find((x) => x.nome === nome);
    const k = comoKey(key);
    if (!a || !k || indo) return;
    setIndo(true);
    try {
      await darKey('atracoes', a.id, k);
      const n = await reconhecerNaFila(a.nome, aberto);
      avisar(`${k} agora é de ${a.nome}.${n > 0 ? ` ${plural(n, 'roteiro reconhecido', 'roteiros reconhecidos')} na fila.` : ''}`);
      ligado(a.nome);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui ligar a key.');
      setIndo(false);
    }
  };

  const nomes = (atracoes ?? []).map((a) => a.nome).sort((x, y) => x.localeCompare(y, 'pt-BR'));
  return (
    <div className="balao-ligar" ref={caixa} role="dialog" aria-label="Ligar a uma atração" onKeyDown={(e) => e.key === 'Escape' && fechar()}>
      <div className="balao-topo">
        <span>Ligar</span>
        <input className="key editando" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} aria-label="Key" size={Math.max(4, key.length + 1)} />
        <span>a</span>
        {sugestao && (
          <button type="button" className="ligar-sug" disabled={indo} onClick={() => void ligar(sugestao)} title={`Pôr a key ${key} em ${sugestao}`}>
            {sugestao}?
          </button>
        )}
      </div>
      {atracoes === null ? (
        <p className="balao-carregando">Carregando as atrações…</p>
      ) : (
        <MenuLigar dentro atracoes={nomes} ligar={(n) => void ligar(n)} nova={(busca) => nova({ nome: nomeDaAtracaoNova(busca, key, [claquete]), key: comoKey(key) })} fechar={fechar} />
      )}
    </div>
  );
}
