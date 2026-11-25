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
_Evitar_: GC, letreiro (no código), item

**Tipo da arte**:
A forma da arte (cartão, rodapé, lettering, foto…), guardada no acervo pela sigla (`CRT`, `RDP`…).

**Fila**:
A lista de roteiros por dia de exibição para revisar e mandar ao Trello. Só roteiros: os filmes da grade não entram.

**Pendência**:
Algo que impede ou pede atenção antes do envio (sem editor, sem data, claquete repetida…); algumas são dispensáveis.

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

**Produção (ARTE_producao)**:
O registro de cada card de claquete de roteiro: status, designers, entrega. Card de filme não entra aqui.
_Evitar_: demanda

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

**Pacote gráfico novo**:
Quando a atração troca a identidade: as artes do acervo dela deixam de valer (zerar o acervo).
