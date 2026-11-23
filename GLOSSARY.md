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

**Não produzir (✕)**:
A arte que sai do checklist sem dizer que existe.

## Atrações e filmes

**Atração**:
Tudo o que ganha claquete própria: programa, novela, show, VT, lançamento de filme (A Clínica, Antártida, Marta).
Tem keys, categoria e as pastas de projeto e de output.
_Evitar_: programa (quando for o conceito geral), produção

**Key**:
O começo da claquete que aponta a atração (`CLINICA`, `PREMIO 2026`), na tabela KEY_atracoes.
_Evitar_: padrão, apelido

**Sessão de filme**:
A atração que exibe filmes da grade (Tela Quente, Supercine, Corujão…). A arte dela é do filme daquele dia.

**Filme**:
Um título da grade que passa numa sessão, sem claquete própria; mora na tabela `filmes`. Lançamento com claquete
própria é atração, não filme.

**Exibição**:
Um filme numa sessão num dia, com o card do Trello dele e as artes do card. É o registro de cada card de filme.
_Evitar_: produção (para filmes)

**Prévia**:
O PDF mensal da programação de filmes, lido pelo FilmeBOT, que vira os cards de filme.

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

**Pacote gráfico novo**:
Quando a atração troca a identidade: as artes do acervo dela deixam de valer (zerar o acervo).
