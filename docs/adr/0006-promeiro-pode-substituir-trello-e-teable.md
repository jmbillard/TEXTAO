---
status: proposta (direção)
---

# O PROMeiro pode virar a ferramenta de gestão da arte, no lugar do Trello e, depois, do Teable

A equipe de arte entrou no Trello porque era o que havia e era fácil de implantar, mas não usa quase nada do que ele
oferece: ninguém usa notificações nem comentários, ninguém atualiza os campos. O uso real é olhar o card que está lá,
produzir o After e arrastar o card para completo na fila de saída: a correria do dia a dia (entrou o card, produziu a
arte, mandou). Foi por isso que tanta automação foi parar no n8n: ninguém preenche nada à mão. O Teable é o banco
(Postgres por baixo) e a tela de editar tabelas, e o PROMeiro já está absorvendo parte dessa tela (Cadastros, acervo,
Configuração, Duplicadas).

A direção é o PROMeiro cobrir o fluxo mínimo que importa: **a produção entra → o designer pega → produz → marca como
entregue na saída**. Substituir o Trello exige só isso no começo (um quadro com uma lista por etapa, o designer no card,
arrastar para entregue, ver o card com as artes e o texto), e não as funções que a equipe não usa. Notificações,
comentários e anexos podem vir depois, como ganho. A migração, se acontecer, é por etapas e sem dia de virada: espelho
→ o PROMeiro manda e o Trello espelha → o trabalho do designer no PROMeiro → desligar o Trello → um Postgres próprio no
lugar do Teable.

É uma direção, não um plano: as decisões detalhadas (a unidade central, o banco, o histórico, os adaptadores) ficam para
um interrogatório futuro, ainda não feito.

**Consequências** (o que evitar desde já, sem obrigar trabalho agora): não acoplar código novo a conceitos do Trello
(lista, card, id do Trello) quando houver um conceito próprio do PROMeiro; preferir automações novas dentro do PROMeiro
a novos fluxos do n8n disparados pelo Trello; o PROMeiro guardar o que é dele (originais, histórico) sem depender do
Trello nem do Teable para isso.
