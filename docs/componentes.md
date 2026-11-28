# Os componentes compartilhados

O catálogo das peças de UI que se repetem entre as telas (#171). A regra do usuário: **o que é reaproveitado com o
mesmo propósito se comporta igual**. Antes de criar uma peça, procure aqui. Se ela existe, use-a com o mesmo
comportamento e o mesmo movimento. Se precisar de uma variação, ela vira uma opção da peça, nunca uma cópia.

Os caminhos são relativos a `src/ui/`. O movimento de todas segue o padrão: a curva `--suave` (`SUAVE` em `cena.tsx`),
as durações `--rapido` (0.15s) e `--medio` (0.2s) e o respeito ao `prefers-reduced-motion` (`semMovimento()`, em
`util.ts`).

## Regras que valem para todas

- **Nada de "unha"** (faixa colorida na borda esquerda). O estado vai numa bolinha, numa etiqueta, no fundo
  levemente tingido ou no texto.
- **Nada de check verde.** O estado (entregue, pronto, confere) é a `BolinhaDeEstado`. O ✓ só marca a opção
  escolhida num menu ou seletor, e nunca em `--ok`.
- **Toda tela de lista ou agenda tem a `BuscaNaLupa`, no lugar de todas** (veja abaixo).
- **O laranja `--ultra` é o destaque**: o que é seu, o que é agora, o número da sua tarefa.

## Cards e listas

| Peça | Onde mora | O que é | Quando usar |
|---|---|---|---|
| `CardAberto` | `CardAberto.tsx` | O painel que cresce do card clicado e volta para ele, por cima de tudo. `FecharOCardAberto` é o × dele. | Para abrir qualquer card: a agenda No Trello, a Pauta, as Produções e os Filmes. Nada de abrir em linha. |
| `Vagas` | `vagas.tsx` | A lista com vagas animadas: o item que entra abre a vaga e o que sai a fecha (`eixo` "y" para linhas, "x" para chips). O `vazio` entra depois que a última vaga fecha. | Toda lista em que um item entra ou sai sem trocar a tela. |
| `useDeslize` | `vagas.tsx` | O FLIP dos `[data-card]`: o que muda de lugar desliza até o lugar novo. | Quando a disposição muda (ordem, coluna). Não serve para a troca de semana (aí é a troca). |
| `CASCATA_MS` | `cena.tsx` | O passo da cascata de entrada e quantos entram nela. | Toda lista ou coluna que chega em cascata. |
| `useSaida` | `pecas.tsx` | Mantém na tela, por um tempo, o item que saiu da lista, enquanto ele recolhe. | Quando um item sai e não pode sumir de estalo. |
| `MenuDeContexto` | `MenuDeContexto.tsx` | O menu do clique direito, no ponto do clique, sempre dentro da janela. | Qualquer menu de contexto. |

## Busca

| Peça | Onde mora | O que é | Quando usar |
|---|---|---|---|
| `BuscaNaLupa` | `BuscaNaLupa.tsx` | A busca recolhida na lupa: "/" ou um clique abrem; Esc limpa e recolhe; o × é o nosso, em `--tinta3`. | Toda tela de lista ou agenda, sem exceção. |
| `ListaDeAchados` | `ListaDeAchados.tsx` | A lista dos achados no lugar do que a tela mostrava: o topo, a dica, o fio que corre enquanto busca, as linhas em cascata. | A busca que troca a tela pelos achados (Produções, agenda de filmes, Campanhas). |
| `NadaNaBusca` | `pecas.tsx` | O vazio da busca, à mão: "nada com “x”", com onde se buscou. | Toda busca sem resultado. |
| `AbaComRabisco` | `pecas.tsx` | A aba das listas com abas (`abas-cad`): fechada, o ícone (ou o nome, com `mostrarNome`) e o número pequeno; ativa, o nome com o número em laranja e o rabisco que se escreve embaixo. | As abas de uma lista: os Cadastros e os Roteiros. |

**O lugar da lupa** (`estilos.css`, perto de `.busca.lupa`). A lupa fica na linha do título da tela, na ponta direita,
depois das outras ferramentas. Quando a cabeça tem a navegação do tempo (o "voltar para hoje" e o ‹ período ›), ela
fica logo antes dela, e a navegação fica parada na ponta. Aberta, cresce para a esquerda. No celular, ela é o quadrado
de 44 px na ponta direita da linha do título e, aberta, cobre a linha. As marcas:

- `cabeca-com-lupa` vai na cabeça;
- `lupa-da-cabeca` vai na `BuscaNaLupa` (pelo `className`);
- `ao-lado-da-lupa` vai no que fica à esquerda dela na linha do título, para guardar o lugar no celular;
- `nav-do-tempo` vai nas setas do período.

O e2e confere com `lugarDaLupa`, de `tests/e2e/coerencia.cjs`. Os Cadastros têm a lupa na ponta da cabeça da lista
(as abas), e as listas dentro de um painel (o acervo da ficha) têm a dela no painel.

## Estado, marcas e toque à mão

| Peça | Onde mora | O que é | Quando usar |
|---|---|---|---|
| `BolinhaDeEstado` | `pecas.tsx` | O pontinho da etapa: entrada neutra, produzindo `--ultra`, aprovação, entregue `--ok`, arquivada. O estado `ok` (pronto, confere, pode) também é ela; `escrevendo` é o roteiro sendo escrito, e `salvando`/`salvou` são a marca de salvo da folha de escrita (a laranja, nunca um ✓). Tamanhos: `pequena` (6 px) e `ficha` (8 px, a classe `tam-ficha`). | Todo estado. É ela que diz "está tudo certo", nunca um ✓ verde. |
| `EtiquetaDaCampanha` | `EtiquetaDaCampanha.tsx` | A etiqueta da campanha, no tom dela: a primeira e "+N". Abre a página da campanha. | Onde um card mostra a campanha: agenda, Pauta, Produções, card aberto. |
| `NumeroCirculado` | `pecas.tsx` | O número circulado à caneta em `--ultra`. | Um por tela: o número da sua tarefa. |
| `VoceAMao` | `pecas.tsx` | O "você" à mão, em `--ultra`. | Ao lado do que é seu (a sua linha na Pauta, o seu card nas Produções). |
| `RelativoAMao` | `pecas.tsx` | "hoje", "amanhã" ou "ontem" à mão. | Ao lado de um dia. |
| `Vazio` | `pecas.tsx` | O vazio curto à mão ("nada aqui", "ninguém"). `pequeno` para células e colunas estreitas. | Os vazios de lista e de coluna. Os vazios que explicam (formulários) ficam no texto comum. |
| `MarcaTexto` | `pecas.tsx` | A passada de marca-texto da claquete de prioridade. | A prioridade, onde a claquete aparece. |
| `Riscado` | `Comparar.tsx` | O risco à mão que atravessa cada linha do texto. | O que saiu do roteiro e a arte que já existe. |
| `BalaoDeInfo` | `BalaoDeInfo.tsx` | O balão de fala que abre o texto ali mesmo. | A observação de uma claquete ou de uma posição. |
| `FogoComTroca` | `fogo.tsx` | O fogo da complexidade, com a troca cruzada de nível. | Onde a complexidade da arte muda. |

## Tempo: agenda, período e contadores

| Peça | Onde mora | O que é | Quando usar |
|---|---|---|---|
| `Periodo` | `topoDaAgenda.tsx` | O período em partes, contando: os dias com algarismos de largura fixa, os meses que apagam na virada. `largura` "fixa" (celular) ou "suave" (computador). | Todo seletor de período (agenda, Pauta, agenda de filmes). |
| `PeriodoQueConta` | `topoDaAgenda.tsx` | O `Periodo` do celular, contando pelos dias da faixa. | A agenda no celular. |
| `periodoPorExtenso`, `periodoCurto` | `fila.ts` | O texto do período: "23 – 29 de novembro" e "25 – 26/11". Um travessão só, em todas as telas. | O texto para o leitor de tela e onde o período vai escrito. |
| `dataPorExtenso` | `util.ts` | O dia por extenso: "sexta, 27 de novembro". | Todo dia escrito por extenso. |
| `VoltarParaHoje` | `topoDaAgenda.tsx` | O "voltar para hoje": aparece fora de hoje e desliza no sentido da troca. Com `abreVaga`, abre a vaga de lado. O `sentido` vem de `useSentidoDaTroca`. | Toda navegação por dia ou semana: agenda, agenda de filmes, Pauta, Montar a pauta. |
| `TopoDoDia` | `topoDaAgenda.tsx` | O cabeçalho do dia: "QUA 25 hoje", com o hoje circulado e as marcas que se escrevem à mão. | O topo de cada dia de uma agenda. |
| `NumeroQueConta` | `topoDaAgenda.tsx` | O número que conta até o novo, com a palavra que acompanha ("1 card", "2 cards"). | Todo contador que muda à vista. |
| `ResumoQueConta` | `topoDaAgenda.tsx` | O resumo dos dias à vista ("17 cards · 9 entregues · 2 prioridades"), contando. Outras agendas dão as `palavras` delas. | O resumo ao lado do título de uma agenda. |
| `ItemQueAbre` | `topoDaAgenda.tsx` | O item que abre e fecha a vaga de lado, sem a linha pular. | Um pedaço de linha que aparece e some. |
| `useContagem`, `useEsmaeceAoMudar` | `topoDaAgenda.tsx` | A contagem até o valor novo e, com o movimento reduzido, o esmaecer no lugar dela. | Os contadores. |
| `useTrocaDeSemana`, `useTrocaDaPauta` | `trocaDeSemana.ts`, `trocaDaPauta.ts` | A troca de semana ou de dia: o que sai esmaece e o que entra chega, com os tempos `TROCA_SAI_MS` e `TROCA_ENTRA_MS`. | A troca de período de uma agenda. |
| `Conta` | `Producoes.tsx` | A contagem da coluna, que pula de leve quando muda. | As colunas por etapa. |

## Desfazer, convites e nomes

| Peça | Onde mora | O que é | Quando usar |
|---|---|---|---|
| `CaixinhaDoDesfazer` | `desfazer.tsx` | A caixinha preta embaixo: a frase, o "Desfazer" sublinhado, o × e o trilho do tempo. Fica 8 s (`PRAZO_DO_DESFAZER`). | Toda ação que se pode desfazer. |
| `useDesfazerAdiado` | `desfazer.tsx` | O desfazer adiado: some na hora e só vai ao servidor no fim do prazo. | Apagar, remover ou ignorar nos Cadastros e nas Pessoas. |
| `ConviteDeArrastar`, `ConviteCompacto` | `pecas.tsx` | A área de soltar: o quadro tracejado com o título que se escreve e a versão deitada ao lado do título da fila. | Toda área de soltar arquivo (a fila, os Filmes). |
| `MenuLigar` | `Cadastros.tsx` | A busca para ligar um nome de uma lista, com o "+ Nova" preso embaixo, pelas setas e pelo Enter. | Ligar uma atração, uma campanha ou uma Produção. |
| `EscolhaDeNome` | `pecas.tsx` | Escolher um nome da lista do Teable, com busca e o palpite à mão. | O redator e o editor. |
| `ListaDosTurnos` | `TurnosDaConfiguracao.tsx` | A lista de turnos da Configuração (nome, horário, ordem, tirar, "+ Novo turno"). `qual` escolhe a da edição ou a da arte. | As seções de turnos. |
| `Compartilhar` | `Compartilhar.tsx` | O painel de quem tem acesso a um roteiro: o modo (fechado ou de todos) e as pessoas, sem acesso, lendo ou escrevendo. `escrito` troca só os textos para os do Roteiro escrito no PROMeiro. | O botão de visibilidade da revisão e da folha de escrita. |

## Topo e cenas

| Peça | Onde mora | O que é | Quando usar |
|---|---|---|---|
| `CaminhosDoTopo` | `SeletorDeArea.tsx` | Os caminhos da linha do logo, sempre na mesma ordem e no mesmo lugar. | O topo de toda tela de área. |
| `Marca` | `pecas.tsx` | A marca do app. | O topo. |
| `criarPalco`, `FraseAMao` | `cena.tsx` | O palco das cenas (anima, marca prazos, desfaz tudo e para sozinho com o movimento reduzido) e a frase à mão com o risco. | As cenas: a fila zerada e a comemoração. |
| `Icone` | `icones.tsx` | Os ícones de traço fino. | Todo ícone. O `certo` (✓) só marca a opção escolhida. |
