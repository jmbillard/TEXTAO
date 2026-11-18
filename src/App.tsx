import { useCallback, useEffect, useRef, useState } from 'react';
import { armazenamento } from './dados/armazenamento';
import { interpretar, lerArquivo, montarDoc, type Importacao, type Resposta } from './importar';
import { roteiroDoJson } from './modelo/exportar';
import { docVazio, metaVazia, novoId, type Roteiro } from './modelo/tipos';
import { Biblioteca } from './ui/Biblioteca';
import { TelaEditor } from './ui/TelaEditor';
import { TelaImportar } from './ui/TelaImportar';

type Tela = { t: 'biblioteca' } | { t: 'importar'; imp: Importacao } | { t: 'editor'; id: string };

const lerLocal = (chave: string) => {
  try {
    return localStorage.getItem(chave) ?? '';
  } catch {
    return '';
  }
};

const telaDoHash = (): Tela => {
  const m = /^#\/r\/(.+)$/.exec(location.hash);
  return m ? { t: 'editor', id: decodeURIComponent(m[1]) } : { t: 'biblioteca' };
};

export function App() {
  const [tela, setTela] = useState<Tela>(telaDoHash);
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  const [soltando, setSoltando] = useState(false);
  const arrasto = useRef(0);

  const avisar = useCallback((texto: string) => setAviso({ texto, n: Date.now() }), []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4200);
    return () => clearTimeout(t);
  }, [aviso]);

  const ir = useCallback((nova: Tela) => {
    const hash = nova.t === 'editor' ? `#/r/${encodeURIComponent(nova.id)}` : '#/';
    try {
      if (location.hash !== hash) history.pushState(null, '', hash);
    } catch {
      /* páginas embutidas podem não permitir mudar o endereço */
    }
    setTela(nova);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const aoVoltar = () => setTela(telaDoHash());
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  const abrirArquivo = useCallback(
    async (arquivo: File) => {
      try {
        const dados = await arquivo.arrayBuffer();
        if (/\.json$/i.test(arquivo.name)) {
          const roteiro = roteiroDoJson(JSON.parse(new TextDecoder().decode(dados)));
          await armazenamento.salvar({ ...roteiro, origem: arquivo.name });
          ir({ t: 'editor', id: roteiro.id });
          return;
        }
        ir({ t: 'importar', imp: interpretar(await lerArquivo(dados, arquivo.name)) });
      } catch (e) {
        avisar(e instanceof SyntaxError ? 'Não consegui ler esse .json.' : e instanceof Error ? e.message : 'Não consegui ler esse arquivo.');
      }
    },
    [avisar, ir],
  );

  const criar = useCallback(
    async (base?: Partial<Roteiro>) => {
      const agora = new Date().toISOString();
      const meta = base?.meta ?? { ...metaVazia(), redator: lerLocal('roteirista.redator') };
      const roteiro: Roteiro = { id: novoId(), meta, doc: base?.doc ?? docVazio(meta.layout), revisao: 1, criadoEm: agora, atualizadoEm: agora, origem: base?.origem };
      await armazenamento.salvar(roteiro);
      ir({ t: 'editor', id: roteiro.id });
    },
    [ir],
  );

  const concluirImportacao = useCallback(
    (imp: Importacao, respostas: Record<number, Resposta>) => criar({ meta: imp.meta, doc: montarDoc(imp, respostas), origem: imp.bruto.arquivo }),
    [criar],
  );

  // soltar um arquivo em qualquer lugar da janela
  useEffect(() => {
    const temArquivo = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const entrar = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      arrasto.current++;
      setSoltando(true);
    };
    const sair = () => {
      arrasto.current = Math.max(0, arrasto.current - 1);
      if (!arrasto.current) setSoltando(false);
    };
    const sobre = (e: DragEvent) => temArquivo(e) && e.preventDefault();
    const soltar = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      arrasto.current = 0;
      setSoltando(false);
      const arquivo = e.dataTransfer?.files[0];
      if (arquivo) void abrirArquivo(arquivo);
    };
    window.addEventListener('dragenter', entrar);
    window.addEventListener('dragleave', sair);
    window.addEventListener('dragover', sobre);
    window.addEventListener('drop', soltar);
    return () => {
      window.removeEventListener('dragenter', entrar);
      window.removeEventListener('dragleave', sair);
      window.removeEventListener('dragover', sobre);
      window.removeEventListener('drop', soltar);
    };
  }, [abrirArquivo]);

  return (
    <>
      {tela.t === 'biblioteca' && <Biblioteca abrir={(id) => ir({ t: 'editor', id })} abrirArquivo={abrirArquivo} criar={() => criar()} avisar={avisar} />}
      {tela.t === 'importar' && <TelaImportar imp={tela.imp} concluir={(r) => concluirImportacao(tela.imp, r)} cancelar={() => ir({ t: 'biblioteca' })} />}
      {tela.t === 'editor' && <TelaEditor key={tela.id} id={tela.id} voltar={() => ir({ t: 'biblioteca' })} avisar={avisar} />}

      {soltando && (
        <div className="soltar" aria-hidden="true">
          <div className="soltar-cartao">
            <span className="soltar-titulo">Pode soltar</span>
            <span>.docx, .rtf, .txt ou um .json exportado daqui</span>
          </div>
        </div>
      )}
      <div className="avisos" role="status" aria-live="polite">
        {aviso && (
          <div className="aviso" key={aviso.n}>
            {aviso.texto}
          </div>
        )}
      </div>
    </>
  );
}
