import { useCallback, useEffect, useRef, useState } from 'react';
import { Comparar } from './ui/Comparar';
import { Atalhos } from './ui/Atalhos';
import { Cadastros, type AtracaoNova } from './ui/Cadastros';
import { Filmes } from './ui/Filmes';
import { armazenamento, marcarTourVisto, atracaoNoServidor, relatarSemAtracao, atualizarVocabulario, temCadastros, type TipoCadastro, consultarAcervo, consultarPauta, palpitesDoRedator, consultarProducao, resumoDaProducao, guardarOriginal, mandarParaTrello, temTrello, type TextoOriginal } from './dados/armazenamento';
import { iniciarSessao, salvarPerfilLocal, type Identidade } from './dados/identidade';
import { converterLayout } from './editor/extensoes';
import { interpretar, lerArquivo, montarDoc, type Importacao } from './importar';
import type { DocBruto } from './importar/bruto';
import { exportar, pendencias, roteiroDoJson, travamTrello } from './modelo/exportar';
import { docVazio, metaVazia, novoId, type ArteDoAcervo, type Roteiro } from './modelo/tipos';
import { chaveDeArte } from './modelo/diferencas';
import { Biblioteca } from './ui/Biblioteca';
import { TelaEditor } from './ui/TelaEditor';
import { aplicarCursorNoMouse, DesenhosDeCursor, meuCursor } from './ui/cursores';
import { corDe } from './dados/colaboracao';
import { TourDaRevisao } from './tour/TourDaRevisao';
import { passoAtual, pular, recomecar, tourNaEntrada, type Tour } from './tour/passos';
import { ehCelular } from './ui/util';
import { colocarExemplo, exemploNoTrello, ID_DO_EXEMPLO, roteiroDeExemplo } from './tour/exemplo';
import { quantasAtracoes, atracaoCadastrada, programasConhecidos, acharPrograma, chaveDaClaquete, dataDaClaquete, pracaDaClaquete, refazerPelaAtracao } from './modelo/vocabularios';

/** Envio automático ao Trello do roteiro que chega sem pendência. Desligado durante a conferência do acervo:
    tudo passa pela revisão e vai pelo botão Enviar. */
const ENVIO_AUTOMATICO = false;

type Tela = { t: 'biblioteca' } | { t: 'editor'; id: string } | { t: 'comparar'; id: string } | ({ t: 'cadastros'; aba?: TipoCadastro; claquete?: string } & Partial<AtracaoNova>) | { t: 'filmes'; id?: string };

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
  const k = /^#\/comparar\/(.+)$/.exec(location.hash);
  if (k) return { t: 'comparar', id: decodeURIComponent(k[1]) };
  const f = /^#\/filmes(?:\/(.+))?$/.exec(location.hash);
  if (f) return { t: 'filmes', id: f[1] ? decodeURIComponent(f[1]) : undefined };
  const c = /^#\/cadastros(?:\/(atracoes|redatores|editores))?$/.exec(location.hash);
  return c ? { t: 'cadastros', aba: (c[1] as TipoCadastro | undefined) ?? 'atracoes' } : { t: 'biblioteca' };
};
/** O endereço aponta para uma tela que o app não conhece (e caiu na fila). */
const hashDesconhecido = () => telaDoHash().t === 'biblioteca' && !/^#?\/?$/.test(location.hash);
const AVISO_DO_HASH = 'Esse endereço não existe mais. Você está na fila.';

/** O texto do arquivo como chegou, parágrafo a parágrafo, com o sublinhado do redator (para o PDF do card). */
const textosOriginais = new Map<string, TextoOriginal>();
const textoDoOriginal = (bruto: DocBruto): TextoOriginal =>
  bruto.blocos
    .flatMap((b) => (b.tipo === 'p' ? [b.par] : b.linhas.flatMap((linha) => linha.flatMap((celula) => celula))))
    .map((par) => par.filter((r) => r.t).map((r) => ({ t: r.t, ...(r.u ? { u: 1 as const } : {}), ...(r.b ? { b: 1 as const } : {}), ...(r.i ? { i: 1 as const } : {}) })));

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
  // o tour da revisão: o convite aparece na primeira entrada de quem ainda não viu (guardado no servidor, por pessoa)
  const [tour, setTour] = useState<Tour | null>(null);
  // no celular, o tour não aparece (nem pelo "Fazer o tour") e não conta como visto. Decidido pela largura da tela na
  // entrada, e não a cada mudança: girar o aparelho no meio do tour não o derruba nem o faz surgir
  const [noCelular] = useState(ehCelular);
  useEffect(() => {
    void iniciarSessao().then((s) => {
      setIdentidade(s.identidade);
      setSemLogin(!!s.semLogin);
      setPronto(true);
      setSessao((n) => n + 1);
      setTour(tourNaEntrada(s.tourRevisao, noCelular));
    });
  }, [noCelular]);
  const mudarTour = useCallback((t: Tour) => {
    setTour(t);
    if (t.fase !== 'fim' && t.fase !== 'fora') return;
    // Terminar (a despedida), pular ou "Agora não": o servidor guarda (a despedida que some sozinha não grava de novo),
    // e o exemplo sai da fila e da agenda (a vaga fecha)
    if (t.fase === 'fim' || t.como === 'pulou') void marcarTourVisto().catch(() => {});
    if (colocarExemplo(null)) setChegou((n) => n + 1);
  }, []);
  /** O exemplo chega à fila como um roteiro de verdade: a vaga abre e a claquete é digitada. Nenhum arquivo é lido. */
  const trazerExemplo = useCallback(() => {
    const r = roteiroDeExemplo();
    colocarExemplo(r);
    setNovos((n) => [...n.filter((id) => id !== r.id), r.id]);
    setChegou((n) => n + 1);
  }, []);
  const pessoa = identidade ? { nome: identidade.nome, email: identidade.email } : undefined;
  const [semLogin, setSemLogin] = useState(false);

  // o meu cursor divertido no meu próprio mouse: refeito quando muda o cursor, a cor ou o tema
  useEffect(() => {
    if (!pronto) return;
    const email = identidade?.email ?? '';
    const aplicar = () => requestAnimationFrame(() => aplicarCursorNoMouse(meuCursor(email), corDe(email)));
    aplicar();
    const tema = window.matchMedia?.('(prefers-color-scheme: dark)');
    const obs = new MutationObserver(aplicar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('promeiro:cursor', aplicar);
    tema?.addEventListener?.('change', aplicar);
    return () => {
      obs.disconnect();
      window.removeEventListener('promeiro:cursor', aplicar);
      tema?.removeEventListener?.('change', aplicar);
    };
  }, [pronto, identidade?.email]);

  const avisar = useCallback((texto: string) => setAviso({ texto, n: Date.now() }), []);
  // link para uma tela que não existe: a fila abre, com um aviso curto
  useEffect(() => {
    if (pronto && hashDesconhecido()) avisar(AVISO_DO_HASH);
  }, [pronto, avisar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4200);
    return () => clearTimeout(t);
  }, [aviso]);

  const ir = useCallback((nova: Tela) => {
    const hash = nova.t === 'editor' ? `#/r/${encodeURIComponent(nova.id)}` : nova.t === 'comparar' ? `#/comparar/${encodeURIComponent(nova.id)}` : nova.t === 'cadastros' ? `#/cadastros/${nova.aba ?? 'atracoes'}` : nova.t === 'filmes' ? `#/filmes${nova.id ? `/${encodeURIComponent(nova.id)}` : ''}` : '#/';
    try {
      if (location.hash !== hash) history.pushState(null, '', hash);
    } catch {
      /* páginas embutidas podem não permitir mudar o endereço */
    }
    // a comparação abre por cima da fila: a fila fica onde estava, sem voltar ao topo
    setTela((antes) => {
      if (nova.t !== 'comparar' && !(antes.t === 'comparar' && nova.t === 'biblioteca')) window.scrollTo(0, 0);
      return nova;
    });
  }, []);
  // o "Buscar na fila" do link quebrado: a fila abre de novo, já com a busca
  const [buscaNaFila, setBuscaNaFila] = useState<{ termo: string; n: number } | null>(null);
  const buscarNaFila = useCallback(
    (termo: string) => {
      setBuscaNaFila((b) => ({ termo, n: (b?.n ?? 0) + 1 }));
      ir({ t: 'biblioteca' });
    },
    [ir],
  );
  // o tour da revisão anda na fila e no editor do exemplo. Se a pessoa sai do caminho (o voltar do navegador, outra
  // tela), o tour sai, como ao pular; e, com o tour fora, o editor do exemplo (que já sumiu) volta para a fila.
  const noEditorDoExemplo = tela.t === 'editor' && tela.id === ID_DO_EXEMPLO;
  const ondeEsta = noEditorDoExemplo ? 'editor' : tela.t === 'biblioteca' ? 'fila' : null;
  const tourAgora = useRef(tour);
  tourAgora.current = tour;
  useEffect(() => {
    const t = tourAgora.current;
    const p = t && passoAtual(t);
    if (t && p && p.tela !== ondeEsta) mudarTour(pular(t));
  }, [ondeEsta, mudarTour]);
  useEffect(() => {
    if (noEditorDoExemplo && (!tour || tour.fase === 'fora')) ir({ t: 'biblioteca' });
  }, [noEditorDoExemplo, tour, ir]);
  /** Revisar no exemplo, durante o tour: o editor do exemplo abre. */
  const abrirExemplo = useCallback(() => ir({ t: 'editor', id: ID_DO_EXEMPLO }), [ir]);
  /** Enviado o exemplo, durante o tour: a fila volta e, com a agenda já na tela, o card dele entra nela (a vaga abre). */
  const levarAoTrello = useCallback(() => {
    ir({ t: 'biblioteca' });
    const desde = performance.now();
    const esperar = () => {
      // a fila montou (a agenda, ou o convite de soltar quando ainda não há card); sem ela, desiste em 3 s
      const naTela = document.querySelector('.secao-trello, .convite-compacto, .fila-vazia');
      if (!naTela && performance.now() - desde < 3000) return void requestAnimationFrame(esperar);
      setTimeout(() => exemploNoTrello() && setChegou((n) => n + 1), 350);
    };
    requestAnimationFrame(esperar);
  }, [ir]);
  /** "Fazer o tour" no "?": o tour recomeça na fila, com o exemplo de antes fora. O servidor não muda. */
  const refazerTour = useCallback(() => {
    if (colocarExemplo(null)) setChegou((n) => n + 1);
    ir({ t: 'biblioteca' });
    setTour(recomecar());
  }, [ir]);
  useEffect(() => {
    const aoVoltar = () => {
      setTela(telaDoHash());
      if (hashDesconhecido()) setAviso({ texto: AVISO_DO_HASH, n: Date.now() });
    };
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
      // quem sobe o arquivo não é o redator: sem redator, o login não entra no lugar dele (a fila sugere um nome)
      const agora = new Date().toISOString();
      // o roteiro é sempre texto corrido; as cores do Word ficam com o significado que o app deduziu
      const roteiro: Roteiro = {
        id: novoId(), meta: { ...imp.meta, layout: 'coluna_unica' }, doc: converterLayout(montarDoc(imp), 'coluna_unica'),
        revisao: 1, criadoEm: agora, atualizadoEm: agora, origem: imp.bruto.arquivo, criadoPor: pessoa, alteradoPor: pessoa,
      };
      roteiro.meta.revisar = pendencias(exportar(roteiro));
      textosOriginais.set(roteiro.id, textoDoOriginal(imp.bruto));
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
      const acervos = new Map<string, Promise<ArteDoAcervo[]>>();
      // só os dos últimos 3 meses: a claquete não tem o ano, e a do ano que vem bateria com a deste ano
      const limite = new Date(Date.now() - 92 * 86_400_000).toISOString();
      for (const r of await armazenamento.listar().catch(() => [])) {
        if (r.atualizadoEm < limite) continue;
        const k = chaveDaClaquete(r.meta.claquete ?? '');
        if (k) naFila.set(k, r.id);
      }
      for (const arquivo of arquivos) {
        try {
          const roteiro = await lerRoteiro(arquivo, (detalhe) => setLendo({ nome: arquivo.name, detalhe }));
          // atração não reconhecida pela lista do navegador: o servidor procura nas keys do Teable
          // (também quando o que achou não é do cadastro: o nome embutido "Eliana" não é a atração "Em Família com Eliana")
          if ((!roteiro.meta.programa || !atracaoCadastrada(roteiro.meta.programa)) && roteiro.meta.claquete) {
            const antes = roteiro.meta.programa;
            const nome = await atracaoNoServidor(roteiro.meta.claquete);
            if (nome) Object.assign(roteiro.meta, { programa: nome, tipoPrograma: programasConhecidos().find((x) => x.nome === nome)?.tipo ?? 'outro' });
            // a atração com número no nome ("Fórmula 1") que o navegador não conhecia: o número dela saiu da data
            const refeita = nome ? refazerPelaAtracao(roteiro.meta, arquivo.name, nome) : null;
            if (refeita) {
              Object.assign(roteiro.meta, refeita);
              roteiro.meta.revisar = pendencias(exportar(roteiro));
            }
            // ficou sem atração: o servidor fica sabendo o que o navegador tinha, para o diagnóstico
            if (!nome) relatarSemAtracao({ claquete: roteiro.meta.claquete, arquivo: arquivo.name, achadoNoNavegador: antes, atracoesNoNavegador: quantasAtracoes(), porLista: acharPrograma(roteiro.meta.claquete)?.nome ?? '' });
          }
          // sem redator: o PROMeiro sugere um nome, pelo texto e pelas últimas claquetes da atração (já com a atração
          // que o servidor achou), sem preencher sozinho
          if (!roteiro.meta.redator) {
            const paragrafos = (textosOriginais.get(roteiro.id) ?? []).map((par) => par.map((r) => r.t).join(''));
            roteiro.meta.sugestoesRedator = await palpitesDoRedator(roteiro.meta, paragrafos).catch(() => []);
          }
          const k = chaveDaClaquete(roteiro.meta.claquete);
          if (k && naFila.has(k)) roteiro.meta.substitui = naFila.get(k);
          if (k) naFila.set(k, roteiro.id);
          // não está na fila, mas já está na produção da arte: a ficha pergunta se é uma v2
          if (!roteiro.meta.substitui) {
            const np = await consultarProducao(roteiro.meta.claquete);
            if (np) roteiro.meta.naProducao = resumoDaProducao(np);
          }
          // artes que a atração já tem prontas: ficam marcadas para a conferência e seguram o envio automático
          if (roteiro.meta.programa) {
            const chave = `${roteiro.meta.programa.trim().toLowerCase()}|${roteiro.meta.dataExibicao ?? ''}`;
            if (!acervos.has(chave)) acervos.set(chave, consultarAcervo(roteiro.meta.programa, roteiro.meta.dataExibicao ?? '').then((a) => a.artes));
            const doAcervo = await acervos.get(chave)!;
            const noRoteiro = new Set(exportar(roteiro).artes.map((a) => chaveDeArte(a.texto)));
            const ja = doAcervo.filter((a) => noRoteiro.has(a.chave));
            if (ja.length) {
              roteiro.meta.jaExistem = ja;
              roteiro.meta.revisar = pendencias(exportar(roteiro));
            }
          }
          await armazenamento.salvar(roteiro);
          setNovos((n) => [...n, roteiro.id]);
          // o arquivo como veio fica no servidor: é ele que vira o PDF do card
          const guardado = guardarOriginal(roteiro.id, arquivo, textosOriginais.get(roteiro.id)).catch(() => {});
          textosOriginais.delete(roteiro.id);
          // sem pendência, vai direto para o Trello (quando o envio automático está ligado); os marcados para revisar esperam a revisão
          if (ENVIO_AUTOMATICO && temTrello() && !travamTrello(roteiro.meta.revisar).length && !roteiro.meta.substitui && !roteiro.meta.naProducao)
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

  /** Arquivos soltos na janela ou escolhidos no seletor: o mesmo caminho. */
  const receberArquivos = useCallback(
    (arquivos: File[]) => {
      // um .json exportado daqui reabre o roteiro; o resto entra na fila, todos de uma vez
      if (arquivos.length === 1 && /\.json$/i.test(arquivos[0].name)) void abrirArquivo(arquivos[0]);
      else if (arquivos.length) void importarParaFila(arquivos.filter((a) => !/\.json$/i.test(a.name)));
    },
    [abrirArquivo, importarParaFila],
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
      receberArquivos([...(e.dataTransfer?.files ?? [])]);
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
  }, [receberArquivos]);

  if (!pronto) return <div className="pagina" />;

  return (
    <>
      {(tela.t === 'biblioteca' || tela.t === 'comparar') && <Biblioteca key={`${sessao}-${buscaNaFila?.n ?? 0}`} buscaInicial={buscaNaFila?.termo} aoFundo={tela.t === 'comparar'} novos={novos} falhas={falhas} chegou={chegou} lendo={lendo} tirarFalha={(nome) => setFalhas((f) => f.filter((x) => x.nome !== nome))} abrir={(id) => ir({ t: 'editor', id })} comparar={(id) => ir({ t: 'comparar', id })} abrirArquivo={abrirArquivo} receberArquivos={receberArquivos} criar={(claquete) => void colarComClaquete(claquete)} cadastros={(inicio) => ir({ t: 'cadastros', ...inicio })} filmes={() => ir({ t: 'filmes' })} avisar={avisar} identidade={identidade} definirPerfil={(p) => {
        salvarPerfilLocal(p);
        // com o perfil, o servidor (se houver) passa a reconhecer a pessoa
        void iniciarSessao().then((s) => {
          setIdentidade(s.identidade);
          setSessao((n) => n + 1);
        });
      }} />}
      {semLogin && (
        <div className="faixa-sem-login" role="alert">
          O servidor não reconheceu o seu login: os roteiros estão ficando só neste navegador. Veja <a href="/api/diagnostico" target="_blank" rel="noreferrer">o diagnóstico</a>.
        </div>
      )}
      {tela.t === 'editor' && <TelaEditor key={tela.id} id={tela.id} voltar={() => ir({ t: 'biblioteca' })} abrir={(id) => ir({ t: 'editor', id })} comparar={(id) => ir({ t: 'comparar', id })} avisar={avisar} pessoa={pessoa} cadastrarAtracao={temCadastros() ? (claquete, nova) => ir({ t: 'cadastros', aba: 'atracoes', claquete, ...nova }) : undefined} buscarNaFila={buscarNaFila} />}
      {tela.t === 'comparar' && <Comparar key={tela.id} id={tela.id} voltar={() => ir({ t: 'biblioteca' })} revisar={(id) => ir({ t: 'editor', id })} avisar={avisar} buscar={buscarNaFila} />}
      {ondeEsta && tour && tour.fase !== 'fora' && <TourDaRevisao tour={tour} mudar={mudarTour} trazerExemplo={trazerExemplo} abrirExemplo={abrirExemplo} levarAoTrello={levarAoTrello} />}
      <Atalhos tela={tela.t === 'biblioteca' ? 'fila' : tela.t === 'editor' ? 'revisao' : tela.t} fazerTour={noCelular ? undefined : refazerTour} />
      {tela.t === 'filmes' && <Filmes key={tela.id ?? 'lista'} aberta={tela.id} abrir={(id) => ir({ t: 'filmes', id })} voltar={() => ir({ t: 'biblioteca' })} avisar={avisar} />}
      {tela.t === 'cadastros' && <Cadastros key={`${tela.aba}-${tela.claquete ?? ''}-${tela.nome ?? ''}-${tela.key ?? ''}`} voltar={() => ir({ t: 'biblioteca' })} avisar={avisar} inicio={{ aba: tela.aba, claquete: tela.claquete, nome: tela.nome, key: tela.key }} />}

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
