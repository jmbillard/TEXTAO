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
nenhuma bate. Sem nada salvo na Configuração, valem as **praças de fábrica** (as de sempre). A sigla vale antes do
"também lida como" de outra praça: criada a MG, "MG" é da MG, mesmo com a G5 ainda lendo MG.
A **praça nova** nasce na Configuração (sigla, nome, regra; entrada e saída ligadas pelo nome ou à mão): antes de
salvar, a conferência conta as **claquetes recentes** (as da fila do PROMeiro e as da produção da arte, nos últimos 90
dias) que mudariam de praça; ao salvar, o PROMeiro cria a opção dela no campo Praça do Trello (se o Trello recusa, nada
é salvo). Os fluxos do n8n têm as praças escritas dentro: a tela avisa quais ajustar.
_Evitar_: região, emissora

**Configuração**:
A tela, no menu do perfil e só de administradores, onde se muda o que antes só mudava no Portainer: onde as coisas
estão no Trello e no Teable, e as praças. O que é salvo nela vale por cima do Portainer e vale na hora; salvar passa
sempre pela **conferência** (a lista existe e não está arquivada, a opção existe, o campo é do tipo certo) e, com
erro, nada é salvo. Segredos e infraestrutura ficam no Portainer. No celular, só consulta. Toda gravação (de qualquer
seção, também as ações de Pessoas e a troca do quadro ou da base) entra no **histórico**: quem, quando, o antigo → o
novo pelos nomes. **Voltar** a uma linha aplica na hora os valores de antes dela, depois da mesma conferência; o que
não passa (a lista antiga foi arquivada) fica travado, com o porquê.
A migração do Portainer é gradual (ADR 0007): o valor salvo na tela vale; sem ele, vale o do Portainer, e na primeira
vez a tela começa com os valores de lá. A página **Pode apagar do Portainer** (no rodapé) separa as variáveis que o
Portainer ainda tem em três grupos: **pode apagar** (o valor já está salvo na tela, ou o PROMeiro não lê mais; com
"Copiar os nomes"), **ainda não** (sem valor salvo: a do Portainer continua valendo) e **ficam** (segredos,
infraestrutura e a chave-mestra CADASTRO_ADMINS).
_Evitar_: ajustes, painel de controle

**Andamento** (do projeto):
A página, no menu do perfil e só de administradores, que mostra ao vivo onde o projeto está: a **trilha** das etapas
do ADR 0006 (com a etapa atual, fixa no código), uma **frente** por spec (a issue-mãe com sub-issues no GitHub) com a
barra de tickets feitos / total e o que vem agora, e os tickets de cada frente com a **situação**: fechada, pronta no
código (um commit da branch de desenvolvimento cita "(#N)" no título) ou aberta. **Feito** é fechada ou pronta no
código. As frentes são uma lista fixa no código mais as specs novas (mais novas que a última da lista, com sub-issues
e o rótulo pronto-para-agente). O servidor lê o GitHub com um token só de leitura (GITHUB_TOKEN, segredo do
Portainer) e guarda a resposta alguns minutos; sem token ou com o GitHub fora, a página diz isso e mostra a última
leitura guardada. No celular, só consulta.
_Evitar_: dashboard, painel, roadmap

**Fora do ar** (na Configuração):
O Trello ou o Teable que não responde. A seção que depende dele mostra o que está salvo com os nomes da **última
leitura** (o PROMeiro guarda no SQLite cada leitura do quadro, com as listas, os campos, as opções e as etiquetas, e
cada descoberta das tabelas), diz numa linha desde quando ele não responde e fica **travada**: sem ler, nada é
conferido, e sem conferir, nada é salvo (a API recusa). Com o Trello fora, travam Praças, Card, Filmes, trocar o
quadro e, em Pessoas, cadastrar e marcar inativo; com o Teable fora, trocar a base e, em Pessoas, as mesmas ações. O
resto continua (os administradores, o histórico). Quando ele volta, a próxima leitura destrava.
_Evitar_: offline, indisponível

**Ligado pelo nome**:
O PROMeiro procura no quadro o que tem o nome esperado (sem caixa, acento e pontuação: a lista "SP ENTRADA", o campo
de lista "Praça", a opção "SP") e guarda o id: renomear depois não quebra. Achou um só, liga ("achado pelo nome");
não achou, ou achou mais de um, é uma **exceção**, e alguém escolhe à mão ("ligado à mão", que também aparece como
exceção, com "desfazer"). Um id guardado que some do quadro (ou cuja lista foi arquivada) também é exceção. A tela
mostra só as exceções; o resto fica no "ver tudo". Um campo só liga com o tipo certo (lista, texto, data, caixa de
marcar). A opção é sempre do campo dela (ALTA e MÉDIA da Prioridade; BAIXA, MÉDIA e ALTA da Complexidade): trocar o
campo limpa as opções que não são do campo novo, e o nome liga de novo as que acha. Nos cards de filme, a lista com
FILME no nome, a etiqueta "FILME" e a etiqueta de cada **sessão de filme** pelo nome dela (Corujão → "CORUJAO"); a
sessão sem etiqueta também é exceção. A praça dos cards de filme não é pelo nome: é escolhida entre as praças.
_Evitar_: mapeamento, vínculo automático

**Exceção** (na Configuração):
O que precisa de alguém numa seção: o que o nome não achou, o que achou em dobro, o id guardado que sumiu do quadro (ou
cuja lista foi arquivada) e o que foi **ligado à mão**. É o que a seção mostra; o que foi achado pelo nome fica no "ver
tudo", e a linha de estado diz "tudo ligado" quando não há nenhuma.
_Evitar_: erro, pendência (a pendência é do roteiro)

**Conexões**:
O quadro do Trello e a **base** do Teable em que o PROMeiro trabalha, recolhidos no fim da **Configuração**. Trocar um
ou outro pede o nome do novo, digitado; depois o PROMeiro liga tudo de novo pelo nome (no quadro novo, as listas, os
campos, as opções e as etiquetas; na base nova, as tabelas). As tabelas do Teable (atracoes, ARTE_producao, filmes…)
são achadas pelo nome na base, e o nome delas no Postgres vem do próprio Teable; a que falta, ou a coluna que o
código usa e a tabela não tem, aparece num aviso no topo da Configuração. Com o Teable fora do ar, valem as tabelas
da última leitura. O redator ou editor guardado com a opção do quadro antigo ganha a opção no quadro novo quando vai
para um card.
_Evitar_: integrações, credenciais

**Administrador**:
Quem vê a Configuração, as Duplicadas, importa acervo e remove cadastros. É quem está no CADASTRO_ADMINS do Portainer
(a **chave-mestra**: sempre administrador, só sai por lá) mais quem foi posto na seção **Pessoas** da Configuração
(escolhido entre quem já entrou no PROMeiro, ou por um e-mail digitado). Ninguém tira a si mesmo.
_Evitar_: admin (na tela, só em botões curtos), superusuário

**Novidade no quadro**:
Na seção **Pessoas**: o membro do quadro do Trello que não está na tabela designers do Teable ("entrou no quadro":
cadastrar como designer, tornar administrador ou ignorar) e o designer ativo que não está mais no quadro ("saiu do
quadro": marcar inativo, tirar de administrador ou ignorar). O designer é o membro pelo designer_ID (o id do membro no
Trello) ou, sem ele, pelo nome. O PROMeiro olha ao abrir a Configuração e uma vez por dia; havendo novidade, os
administradores veem um pontinho no menu do perfil. **Ignorar** vale até desfazer no "ver tudo". Os membros do quadro
são a fonte por enquanto (ADR 0006).
_Evitar_: membro novo, alerta

**Duplicada**:
Duas ou mais linhas da produção da arte (ARTE_producao), cada uma de um card, com a mesma claquete (pela key, sem
acento, caixa e pontuação), a mesma praça (a da coluna da linha; sem ela, a que a claquete indica) e a mesma versão: um
reenvio, um card criado à mão em cima de outro. Versões diferentes (-2, V2, B, Opção N) não são duplicadas. Só contam
as linhas com card_ID, que não são de filme e que entraram no período (data_entrada), abertas e arquivadas: a lista
não lê o quadro do Trello, porque um card qualquer do quadro (que não é de roteiro) não é duplicada. Só o caso aberto
lê do Trello o que só ele tem, pelo card_ID dos cards do caso; o card apagado lá aparece como "não está mais no Trello".
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
