import { useCallback, useEffect, useRef, useState } from 'react';
import { Cadastros } from './ui/Cadastros';
import { armazenamento, atualizarVocabulario, temCadastros, type TipoCadastro, consultarPauta, guardarOriginal, mandarParaTrello, temTrello } from './dados/armazenamento';
import { iniciarSessao, salvarPerfilLocal, type Identidade } from './dados/identidade';
import { converterLayout } from './editor/extensoes';
import { interpretar, lerArquivo, montarDoc, type Importacao } from './importar';
import { exportar, pendencias, roteiroDoJson } from './modelo/exportar';
import { docVazio, metaVazia, novoId, type Roteiro } from './modelo/tipos';
import { Biblioteca } from './ui/Biblioteca';
import { TelaEditor } from './ui/TelaEditor';
import { DesenhosDeCursor } from './ui/cursores';
import { acharPrograma, chaveDaClaquete, dataDaClaquete, pracaDaClaquete } from './modelo/vocabularios';

type Tela = { t: 'biblioteca' } | { t: 'editor'; id: string } | { t: 'cadastros'; aba?: TipoCadastro; claquete?: string };

/** Um arquivo solto na fila que não deu para ler. Some ao recarregar. */
export interface Falha {
  nome: string;
  motivo: string;
}
const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const lerLocal = (chave: string) => {
  try {
    return localStorage.getItem(chave) ?? '';
  } catch {
    return '';
  }
};

const telaDoHash = (): Tela => {
  const m = /^#\/r\/(.+)$/.exec(location.hash);
  if (m) return { t: 'editor', id: decodeURIComponent(m[1]) };
  const c = /^#\/cadastros(?:\/(atracoes|redatores|editores))?$/.exec(location.hash);
  return c ? { t: 'cadastros', aba: (c[1] as TipoCadastro | undefined) ?? 'atracoes' } : { t: 'biblioteca' };
};

export function App() {
  const [tela, setTela] = useState<Tela>(telaDoHash);
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  const [soltando, setSoltando] = useState(false);
  const arrasto = useRef(0);
  const [identidade, setIdentidade] = useState<Identidade | null>(null);
  const [pronto, setPronto] = useState(false);
  const [sessao, setSessao] = useState(0);
  // fila: roteiros que acabaram de chegar (ganham a animação) e arquivos que não deu para ler
  const [novos, setNovos] = useState<string[]>([]);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [chegou, setChegou] = useState(0);
  // o que está sendo lido agora, quando demora (PDF digitalizado, lido por OCR)
  const [lendo, setLendo] = useState<{ nome: string; detalhe: string } | null>(null);
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
    const hash = nova.t === 'editor' ? `#/r/${encodeURIComponent(nova.id)}` : nova.t === 'cadastros' ? `#/cadastros/${nova.aba ?? 'atracoes'}` : '#/';
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

  /** Lê um arquivo de roteiro e devolve o roteiro pronto para guardar, com o que já dá para saber sozinho. */
  const lerRoteiro = useCallback(
    async (arquivo: File, aoProgredir?: (texto: string) => void): Promise<Roteiro> => {
      const imp: Importacao = interpretar(await lerArquivo(await arquivo.arrayBuffer(), arquivo.name, aoProgredir));
      // o editor vem da pauta da edição, pela claquete
      const pauta = await consultarPauta(imp.meta.claquete);
      if (!imp.meta.editor) imp.meta.editor = pauta.editor;
      // quando a claquete bate com a pauta, vale a grafia de lá: "Quem Ama(Prologo)26/10 Rede"
      if (pauta.claquete) imp.meta.claquete = pauta.claquete;
      // arquivo sem autor (RTF, TXT): o redator é quem está subindo, pelo início do e-mail
      const login = identidade?.email.split('@')[0] || identidade?.nome;
      if (!imp.meta.redator && login) imp.meta.redator = login;
      const agora = new Date().toISOString();
      // o roteiro é sempre texto corrido; as cores do Word ficam com o significado que o app deduziu
      const roteiro: Roteiro = {
        id: novoId(), meta: { ...imp.meta, layout: 'coluna_unica' }, doc: converterLayout(montarDoc(imp), 'coluna_unica'),
        revisao: 1, criadoEm: agora, atualizadoEm: agora, origem: imp.bruto.arquivo, criadoPor: pessoa, alteradoPor: pessoa,
      };
      roteiro.meta.revisar = pendencias(exportar(roteiro));
      return roteiro;
    },
    [identidade], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Vários roteiros de uma vez: cada um é lido aqui mesmo, guardado e aparece na fila. */
  const importarParaFila = useCallback(
    async (arquivos: File[]) => {
      ir({ t: 'biblioteca' });
      await atualizarVocabulario();
      // claquete que já está na fila: o arquivo novo é uma versão nova dela, e a ficha pergunta se substitui
      const naFila = new Map<string, string>();
      for (const r of await armazenamento.listar().catch(() => [])) {
        const k = chaveDaClaquete(r.meta.claquete ?? '');
        if (k) naFila.set(k, r.id);
      }
      for (const arquivo of arquivos) {
        try {
          const roteiro = await lerRoteiro(arquivo, (detalhe) => setLendo({ nome: arquivo.name, detalhe }));
          const k = chaveDaClaquete(roteiro.meta.claquete);
          if (k && naFila.has(k)) roteiro.meta.substitui = naFila.get(k);
          if (k) naFila.set(k, roteiro.id);
          await armazenamento.salvar(roteiro);
          setNovos((n) => [...n, roteiro.id]);
          // o arquivo como veio fica no servidor: é ele que vira o PDF do card
          const guardado = guardarOriginal(roteiro.id, arquivo).catch(() => {});
          // sem pendência, vai direto para o Trello; os marcados para revisar esperam a revisão
          if (temTrello() && !roteiro.meta.revisar?.length && !roteiro.meta.substitui)
            void guardado.then(() => mandarParaTrello(roteiro)).catch((e) => avisar(`${roteiro.meta.claquete || arquivo.name} não foi para o Trello: ${e instanceof Error ? e.message : e}`)).finally(() => setChegou((n) => n + 1));
        } catch (e) {
          // as mensagens das bibliotecas de leitura vêm em inglês e não ajudam quem está subindo o roteiro
          const bruto = e instanceof Error ? e.message : '';
          const motivo = !bruto || /zip|central directory|xml|undefined|null|cannot|unexpected|invalid|password/i.test(bruto)
            ? 'O arquivo parece corrompido, ou não é do tipo que o nome diz.'
            : bruto;
          setFalhas((f) => [...f.filter((x) => x.nome !== arquivo.name), { nome: arquivo.name, motivo }]);
        }
        setLendo(null);
        setChegou((n) => n + 1);
        await pausa(260); // uma ficha de cada vez, para dar para acompanhar
      }
    },
    [lerRoteiro], // eslint-disable-line react-hooks/exhaustive-deps
  );

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
        await importarParaFila([arquivo]);
      } catch (e) {
        avisar(e instanceof SyntaxError ? 'Não consegui ler esse .json.' : e instanceof Error ? e.message : 'Não consegui ler esse arquivo.');
      }
    },
    [avisar, ir, identidade, importarParaFila], // eslint-disable-line react-hooks/exhaustive-deps
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

  /** Folha para colar do Word: a claquete vem primeiro, porque é dela que saem editor, praça, data e atração. */
  const colarComClaquete = useCallback(
    async (claquete: string) => {
      await atualizarVocabulario();
      const pauta = await consultarPauta(claquete).catch(() => ({ editor: '', claquete: '' }));
      const programa = acharPrograma(claquete);
      const meta = {
        ...metaVazia(),
        claquete: pauta.claquete || claquete,
        editor: pauta.editor,
        praca: pracaDaClaquete(claquete),
        dataExibicao: dataDaClaquete(claquete),
        programa: programa?.nome ?? '',
        tipoPrograma: programa?.tipo ?? 'outro',
        redator: identidade?.nome ?? lerLocal('roteirista.redator'),
      };
      await criar({ meta });
    },
    [criar, identidade], // eslint-disable-line react-hooks/exhaustive-deps
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
      const arquivos = [...(e.dataTransfer?.files ?? [])];
      // um .json exportado daqui reabre o roteiro; o resto entra na fila, todos de uma vez
      if (arquivos.length === 1 && /\.json$/i.test(arquivos[0].name)) void abrirArquivo(arquivos[0]);
      else if (arquivos.length) void importarParaFila(arquivos.filter((a) => !/\.json$/i.test(a.name)));
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
  }, [abrirArquivo, importarParaFila]);

  if (!pronto) return <div className="pagina" />;

  return (
    <>
      {tela.t === 'biblioteca' && <Biblioteca key={sessao} novos={novos} falhas={falhas} chegou={chegou} lendo={lendo} tirarFalha={(nome) => setFalhas((f) => f.filter((x) => x.nome !== nome))} abrir={(id) => ir({ t: 'editor', id })} abrirArquivo={abrirArquivo} criar={(claquete) => void colarComClaquete(claquete)} cadastros={(inicio) => ir({ t: 'cadastros', ...inicio })} avisar={avisar} identidade={identidade} definirPerfil={(p) => {
        salvarPerfilLocal(p);
        // com o perfil, o servidor (se houver) passa a reconhecer a pessoa
        void iniciarSessao().then((s) => {
          setIdentidade(s.identidade);
          setSessao((n) => n + 1);
        });
      }} />}
      {tela.t === 'editor' && <TelaEditor key={tela.id} id={tela.id} voltar={() => ir({ t: 'biblioteca' })} abrir={(id) => ir({ t: 'editor', id })} avisar={avisar} pessoa={pessoa} cadastrarAtracao={temCadastros() ? (claquete) => ir({ t: 'cadastros', aba: 'atracoes', claquete }) : undefined} />}
      {tela.t === 'cadastros' && <Cadastros key={`${tela.aba}-${tela.claquete ?? ''}`} voltar={() => ir({ t: 'biblioteca' })} avisar={avisar} inicio={{ aba: tela.aba, claquete: tela.claquete }} />}

      <DesenhosDeCursor />
      {soltando && (
        <div className="soltar" aria-hidden="true">
          <div className="soltar-cartao">
            <span className="soltar-titulo">Pode soltar</span>
            <span>Quantos roteiros quiser: .docx, .rtf ou .pdf</span>
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
