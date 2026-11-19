import { useCallback, useEffect, useRef, useState } from 'react';
import { armazenamento } from './dados/armazenamento';
import { iniciarSessao, salvarPerfilLocal, type Identidade } from './dados/identidade';
import { converterLayout } from './editor/extensoes';
import { interpretar, lerArquivo, montarDoc, type Importacao } from './importar';
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
  const [identidade, setIdentidade] = useState<Identidade | null>(null);
  const [pronto, setPronto] = useState(false);
  const [sessao, setSessao] = useState(0);
  useEffect(() => {
    void iniciarSessao().then((s) => {
      setIdentidade(s.identidade);
      setPronto(true);
      setSessao((n) => n + 1);
    });
  }, []);
  const pessoa = identidade ? { nome: identidade.nome, email: identidade.email } : undefined;

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
                    // reabre com o mesmo ID; se esse ID já é de outra pessoa, entra como um roteiro novo
          let novo = { ...roteiro, origem: arquivo.name, publico: false, meu: true };
          try {
            await armazenamento.salvar(novo);
          } catch (e) {
            if ((e as { status?: number }).status !== 403) throw e;
            novo = { ...novo, id: novoId(), criadoPor: pessoa, alteradoPor: pessoa };
            await armazenamento.salvar(novo);
          }
          ir({ t: 'editor', id: novo.id });
          return;
        }
        const imp = interpretar(await lerArquivo(dados, arquivo.name));
        // arquivo sem autor (RTF, TXT): o redator é quem está importando, pelo início do e-mail
        const login = identidade?.email.split('@')[0] || identidade?.nome;
        if (!imp.meta.redator && login) {
          imp.meta.redator = login;
          imp.faltando = imp.faltando.filter((f) => f !== 'quem escreveu');
          imp.entendido.push(`O arquivo não traz autor → redação: ${login} (seu login)`);
        }
        ir({ t: 'importar', imp });
      } catch (e) {
        avisar(e instanceof SyntaxError ? 'Não consegui ler esse .json.' : e instanceof Error ? e.message : 'Não consegui ler esse arquivo.');
      }
    },
    [avisar, ir, identidade], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const criar = useCallback(
    async (base?: Partial<Roteiro>) => {
      const agora = new Date().toISOString();
      const meta = base?.meta ?? { ...metaVazia(), redator: identidade?.nome ?? lerLocal('roteirista.redator') };
      const roteiro: Roteiro = {
        id: novoId(), meta, doc: base?.doc ?? docVazio(meta.layout), revisao: 1, criadoEm: agora, atualizadoEm: agora, origem: base?.origem,
        criadoPor: pessoa, alteradoPor: pessoa,
      };
      await armazenamento.salvar(roteiro);
      ir({ t: 'editor', id: roteiro.id });
    },
    [ir, identidade], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const concluirImportacao = useCallback(
    // o roteiro é sempre texto corrido; as cores do Word ficam com o significado que o app deduziu
    (imp: Importacao) => criar({ meta: { ...imp.meta, layout: 'coluna_unica' }, doc: converterLayout(montarDoc(imp), 'coluna_unica'), origem: imp.bruto.arquivo }),
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

  if (!pronto) return <div className="pagina" />;

  return (
    <>
      {tela.t === 'biblioteca' && <Biblioteca key={sessao} abrir={(id) => ir({ t: 'editor', id })} abrirArquivo={abrirArquivo} criar={() => criar()} avisar={avisar} identidade={identidade} definirPerfil={(p) => {
        salvarPerfilLocal(p);
        // com o perfil, o servidor (se houver) passa a reconhecer a pessoa
        void iniciarSessao().then((s) => {
          setIdentidade(s.identidade);
          setSessao((n) => n + 1);
        });
      }} />}
      {tela.t === 'importar' && <TelaImportar imp={tela.imp} concluir={() => concluirImportacao(tela.imp)} cancelar={() => ir({ t: 'biblioteca' })} />}
      {tela.t === 'editor' && <TelaEditor key={tela.id} id={tela.id} voltar={() => ir({ t: 'biblioteca' })} avisar={avisar} pessoa={pessoa} />}

      {soltando && (
        <div className="soltar" aria-hidden="true">
          <div className="soltar-cartao">
            <span className="soltar-titulo">Pode soltar</span>
            <span>.docx, .rtf, .pdf, .txt ou um .json exportado daqui</span>
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
