# PROMeiro

A ferramenta da equipe de arte da Globo Promo para receber os roteiros (claquetes), revisar as artes pedidas e
mandar cada um para produção no Trello, com o registro no banco (Teable, base PROMeiro).

## Roteiro e revisão

**Claquete**:
O identificador de um roteiro que pede arte: o nome da atração (ou a key dela) e, quase sempre, a data (`Chef(Fut)3/11`).
Ganhar claquete própria é o que faz de algo uma atração.
_Evitar_: título, nome do roteiro

**Roteiro**:
O texto que chega (Word, RTF, PDF ou colado) com a claquete, o redator, a data e as artes sublinhadas.
_Evitar_: script, documento

**Arte**:
Um trecho sublinhado do roteiro que vira uma peça a produzir (cartão, rodapé, lettering…), com um ou mais tipos.
O trecho sublinhado de novo é a mesma arte quando o texto bate sem caixa, acento e pontuação ("AO VIVO!" e "Ao vivo";
"AOVIVO" é outra): a lista, as contas e o checklist levam cada arte uma vez, na ordem da primeira aparição.
_Evitar_: GC, letreiro (no código), item

**Artes a produzir**:
As artes do checklist do Trello: cada arte uma vez (a de vários tipos também), menos a que já existe (✓ ou do acervo
da atração) e a que não vai ser produzida (✕). É o "N artes" da fila, da agenda, do editor e de "Muitas artes", e bate
com a contagem da produção da arte no Teable (`quantasAProduzir`).
_Evitar_: total de artes (a lista do editor mostra todas, com as riscadas)

**Tipo da arte**:
A forma da arte (cartão, rodapé, lettering, foto…), guardada no acervo pela sigla (`CRT`, `RDP`…).

**Fila**:
A lista de roteiros por dia de exibição para revisar e mandar ao Trello. Só roteiros: os filmes da grade não entram.

**Próximo para revisar**:
O roteiro que o Enviar do editor e a tecla R da fila abrem: o primeiro da fila que pede revisão, que ninguém revisou e
que nenhuma outra pessoa está com aberto agora. Sem nenhum, volta para a fila. Abrir à mão o roteiro de um colega
continua livre (é a edição simultânea), com o aviso "Fulana está revisando este roteiro.".
_Evitar_: seguinte (a seta que anda pela fila, sem pular ninguém)

**Pendência**:
Algo que impede ou pede atenção antes do envio (sem editor, sem data, claquete repetida…); algumas são dispensáveis.

**Palpite do redator**:
Quando o roteiro chega sem redator, o nome que o PROMeiro sugere, à mão e com "?", no lugar do "???": pelo texto (a
assinatura no fim, o cabeçalho, o resto) ou pelas últimas claquetes da atração (3 das últimas 5, na mesma praça, em 60
dias). Vale o texto; o outro fica no topo do Escolher. Só redatores ativos. Nunca é preenchido sozinho: um toque aceita,
o × recusa, e a recusa fica guardada no roteiro. O autor do arquivo que não é redator cadastrado não vira o redator.
_Evitar_: redator automático, preenchimento

**Já existe (✓)**:
A arte confirmada como já produzida: sai do checklist, vai na linha JÁ EXISTEM do card e, no envio, entra no acervo.
_Evitar_: concluída, repetida

**Complexidade da arte**:
BAIXA, MÉDIA ou ALTA (1, 2, 3), marcada na revisão para cada arte a produzir; a não marcada é BAIXA. O card leva a
maior complexidade das artes dele, na mesma escala do campo do Trello e da produção da arte, e a arte entra no acervo
com a sua. A arte que já existe (✓) fica com a complexidade que o acervo já tem.
_Evitar_: dificuldade, peso

**Não produzir (✕)**:
A arte que sai do checklist sem dizer que existe.

**Tour da revisão**:
O passeio curto e interativo pela revisão, da chegada do roteiro ao envio, com o roteiro de exemplo: sete passos, e
cada um só segue quando a pessoa faz a ação dele. O convite aparece na primeira entrada; terminar, pular ou dizer
"Agora não" fica guardado no servidor, por pessoa, e o convite não volta.
_Evitar_: tutorial, onboarding

**Roteiro de exemplo**:
O roteiro fictício e fixo do tour da revisão. Vive só na memória do navegador de quem faz o tour: não é gravado, não
aparece na fila de mais ninguém e nunca vai ao Trello. O id tem o prefixo reservado `tour-`, que o servidor recusa ao
salvar e ao enviar. O "card de exemplo" da agenda é só a aparência simulada dele, não um card do Trello.
_Evitar_: roteiro de teste, roteiro fake

## Atrações e filmes

**Atração**:
Tudo o que ganha claquete própria: programa, novela, show, VT, lançamento de filme (A Clínica, Antártida, Marta).
Tem keys, categoria e as pastas de projeto e de output.
_Evitar_: programa (quando for o conceito geral), produção

**Key**:
O começo da claquete que aponta a atração (`CLINICA`, `PREMIO 2026`), na tabela KEY_atracoes.
_Evitar_: padrão, apelido

**Sessão de filme**:
A atração que exibe filmes da grade (Tela Quente, Supercine, Corujão…). A arte dela é do filme daquele dia: o acervo
dela é "do filme".

**Identidade própria do filme**:
A arte feita para aquele filme (título, cartão…), com um card para cada exibição. É o caso das sessões de filme, menos a
Sessão da Tarde. Na prévia, é a fileira de cima.

**Sessão da Tarde**:
A sessão de filme cuja arte é um template vertical, sem identidade própria do filme: os filmes da semana viram um card
só. Na prévia, é a fileira de baixo; um filme lido ali por engano é arrastado para a fileira de cima. As artes
produzidas para cada filme (o título no template) entram no acervo dele como as de qualquer atração.

**Filme**:
Um título da grade que passa numa sessão, sem claquete própria; mora na tabela `filmes`. Lançamento com claquete
própria é atração, não filme.

**Exibição**:
Um filme numa sessão num dia, com o card do Trello dele e as artes do card. É o registro de cada card de filme.
_Evitar_: produção (para filmes)

**Prévia**:
O PDF mensal da programação de filmes, lido na aba Filmes, que vira os cards de filme.

**Aba Filmes**:
A tela do PROMeiro que lê a prévia, confere cada filme com o banco e cria os cards de filme.
_Evitar_: FilmeBOT (o site avulso que ela substitui)

## Produção e acervo

**Card**:
O cartão no Trello de uma claquete (ou de um filme), com o checklist das artes.

**Praça**:
Para quem é a claquete (G5, SP, RJ, INTER) e, por isso, para onde vai o card: cada praça tem a sua entrada, a sua
saída e a sua opção no campo Praça. A praça é dado, não código: cada uma diz como aparece no nome da claquete (termina
em " SP"; começa com "RIO " e um separador) e como pode vir escrita (o **também lida como**: "REDE" é a G5). A ordem
das praças decide quando duas regras batem ("RIO SHOW SP" é do Rio) e uma é a **praça padrão**, a que vale quando
nenhuma bate. Sem nada salvo na Configuração, valem as **praças de fábrica** (as de sempre).
_Evitar_: região, emissora

**Duplicada**:
Dois ou mais cards do quadro com a mesma claquete (pela key, sem acento, caixa e pontuação), a mesma praça e a mesma
versão: um reenvio, um card criado à mão em cima de outro. Versões diferentes (-2, V2, B, Opção N) não são duplicadas.
Cada grupo é um **caso**, que a aba Duplicadas dos Cadastros mostra só para administradores. **Ignorar** ("não é
duplicada") tira o caso da lista sem mudar nada no Trello nem no Teable: ele vai para **Resolvidas** e para o
**Registro** (quem fez o quê e quando, com o motivo), volta com **Reabrir** e volta sozinho quando entra card novo no
grupo (a assinatura, os ids dos cards, mudou).
_Evitar_: card repetido, claquete duplicada (no envio, "duplicado" é a claquete que já tinha entrado hoje na produção)

**Produção (ARTE_producao)**:
O registro de cada card de claquete de roteiro: status, designers, entrega. Card de filme não entra aqui.
_Evitar_: demanda

**Critério da agenda**:
O que decide o dia de cada card na agenda No Trello. É um de três; a escolha fica no navegador:
- **exibição** (o padrão): o dia em que vai ao ar;
- **entrada**: o dia em que entrou na produção (data_entrada); a semana termina hoje;
- **entrega**: o dia em que saiu (data_entrega); o card que ainda não saiu fica no dia da exibição, tracejado, como
  um prazo.
_Evitar_: filtro, ordenação

**Acervo**:
As artes que uma atração (ou um filme) já tem prontas, na tabela ARTES_acervo. A arte do roteiro que bate com o
acervo vem riscada.
_Evitar_: banco de artes, biblioteca

**Acervo da atração**:
Como o acervo de uma atração funciona. É um de três valores; sem valor, vale "próprio":
- **próprio**: as artes prontas são da própria atração (o caso comum);
- **do filme**: a sessão de filme; as artes prontas são do filme daquele dia, em qualquer sessão;
- **sem acervo**: a atração genérica (VTs, EVENTOS, Shows Diversos…), que não guarda arte; o que tem linguagem própria
  ganha atração própria.
Não é a categoria: a categoria diz o gênero (novela, show, filme…), e dentro de uma categoria há os três acervos.
_Evitar_: tipo da atração, Genérica, Atração (como valor)

**Ficha da atração**:
O painel que abre ao clicar numa atração em Cadastros › Atrações, no lugar de "Nova atração": nome, categoria, acervo,
keys e a seção Acervo (o total de artes prontas, a divisão por tipo com "sem tipo" em destaque e "Ver as N", que troca
a lista pelo acervo da atração). É ali que ficam a importação do acervo e o novo pacote. No celular, só consulta.
_Evitar_: página da atração, detalhe

**Importação do acervo**:
O CSV da pasta de output de uma atração (`nome;caminho;criado em`) que vira artes do acervo dela, conferido antes de
gravar, na ficha da atração. Só administradores e só atração de acervo próprio. Cada arquivo vira uma arte: o prefixo
"SIGLA - " é o tipo da arte (a sigla mais longa primeiro) e `_alfa`/`_alpha` é lettering. Cada linha vem com um estado:
- **nova**: a arte não está no acervo da atração;
- **completa o acervo**: a mesma arte está lá sem tipo, e só ganha o tipo;
- **corrige o acervo**: o nome do acervo é que estava errado (quase igual ao do arquivo): a mesma linha do acervo é
  renomeada, com o mesmo id;
- **já no acervo**: a mesma arte (pela chave) com o mesmo tipo; não muda nada;
- **cópia** (o filtro "Versões e cópias"): o arquivo copiado ("- Copy", "(1)"), a versão da mesma arte (D/E, VERT,
  6S…) ou a mesma arte repetida no CSV; conta uma vez e não é gravada;
- **fora**: a pasta, o nome sem "SIGLA - ", ou a linha que quem confere tirou ou decidiu deixar fora;
- **para decidir**: a pergunta que a conferência faz antes de gravar, na própria linha: o nome parecido com um do
  acervo ("é a mesma: erro no arquivo", "o do acervo está errado: corrigir" ou "é outra arte"), o acento sugerido pelas
  palavras das fontes (o sugerido ou como está), o tipo tirado do começo do nome sem "SIGLA - " (confirmar ou fica
  fora), a sigla que não é tipo, como COMP (fica fora ou ganha um tipo do campo, nunca uma opção nova) e o rodapé
  composto (dois nomes num rodapé). Nome e tipo também se editam na linha, e o estado é recalculado pela chave; em
  lote: aceitar os acentos sugeridos, deixar fora as de uma sigla, dar um tipo às marcadas e tirar as marcadas. O
  Gravar só libera sem decisão pendente ("Faltam N decisões"), e o servidor também recusa.
As **regras de conversão** escrevem a arte como o roteiro escreve, e cada linha mostra o "antes → depois · regra": a hora
("2 10" → "2:10", com o dia junto e o período no texto), PROX → PRÓXIMO (PRÓXIMA antes do dia da semana), os acentos de
um dicionário fechado (NAO → NÃO) e a grafia da primeira fonte que tem a arte: o acervo da atração, os roteiros dela,
os roteiros de todas, o acervo de todas.
Gravar relê o acervo, cria as novas, dá o tipo às que completam e renomeia as que corrigem o acervo; o resultado é o
total "antes → depois". Cada arte gravada leva o **caminho** do arquivo (o campo `caminho` de ARTES_acervo; a que só
ganha o tipo ou o nome leva o caminho quando ainda não tem um).
Os **avisos** da conferência: os caminhos fora da **pasta de output** da atração (a do cadastro, o mesmo Output do card;
sem ela, a pasta mais comum dos caminhos já gravados no acervo dela) pedem a confirmação "É de … mesmo" para gravar, ou
levam o CSV para a atração em cuja pasta eles estão; o arquivo **já importado** (o mesmo nome ou os mesmos caminhos numa
importação não desfeita, ou os caminhos já gravados no acervo) diz quando, sem travar; com os caminhos na pasta e o
arquivo novo, o aviso é verde.
Cada importação gravada fica em **Importações**, na ficha (a data, o arquivo, quem e +N), e pode ser **desfeita** por
7 dias: logo depois pela caixinha preta e, até o prazo, pelo histórico. Desfazer apaga as artes criadas e devolve o tipo
e o nome antigos das que mudaram; a linha que alguém mexeu no Teable depois (a data de modificação dela mudou) não volta,
e o PROMeiro diz qual. A gravação **interrompida** (um lote que falhou) fica registrada até onde foi e pode ser desfeita
ou **retomada** (os lotes que faltaram, sem duplicar o que o lote sem resposta já tinha criado).
Com **lembrar as decisões** (marcado por padrão, no pé da conferência), as decisões viram **regras desta atração**, no
formato das regras das cargas à mão (trocas, ignorar, versões, cópias, semSigla e tipos), e a próxima prévia da mesma
atração já vem com elas: a linha diz "regra desta atração". Vira regra o padrão que a decisão nomeia (a sigla que não é
tipo, a abreviação da casa como DP → DAQUI A POUCO, a versão própria como " B" no fim, o nome escrito errado) ou o
próprio arquivo, que volta no próximo CSV da pasta de output (a linha tirada, o tipo decidido). A ficha mostra as regras
aos administradores, para apagar a lembrada errada.
_Evitar_: carga, upload, sincronizar, reverter

**Pacote gráfico novo**:
Quando a atração troca a identidade: as artes do acervo dela deixam de valer (zerar o acervo).
