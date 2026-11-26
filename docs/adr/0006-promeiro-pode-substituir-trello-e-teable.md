---
status: proposta (direção)
---

# O PROMeiro pode virar a ferramenta de gestão da arte, no lugar do Trello, do Teable e do n8n

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

## Depois do Trello e do Teable, o n8n também sai

Decisão do usuário: logo depois de deixar o Trello e o Teable, deixar o n8n. Fica tudo entre o Padeiro, que funciona
dentro do After Effects, e o PROMeiro, com uma API do PROMeiro com que o Padeiro fala direto. Os fluxos de hoje caem em
três grupos:

1. **Somem com o Trello:** sincronizar card↔banco (PROMO: DB, BATCH: TRELLO CARDS → DB), PRIORIDADE, o relatório de
   CLAQUETES DUPLICADAS (a aba Duplicadas do PROMeiro já o substitui) e o UPLOAD de roteiros.
2. **Viram a API do PROMeiro para o Padeiro:** o webhook do projeto (`/webhook/projeto`), o `/buscar` (índice das
   atrações), filmes-recentes e os cards recentes na claquete.
3. **Integrações de fora** (Teams, a leitura da grade de filmes com IA): passam para dentro do PROMeiro. O n8n só fica
   se surgir uma integração que não compense escrever.

**Regra a partir de agora:** integração nova do Padeiro nasce no PROMeiro, não no n8n. As rotas que substituírem as do
n8n mantêm **exatamente** o mesmo contrato JSON documentado no repositório do Padeiro, para a troca ser só mudar o
endereço na configuração do Padeiro (que já é configurável): uma integração por vez, sem dia de virada.

**Pergunta aberta:** como o Padeiro se identifica no PROMeiro. Hoje o PROMeiro fica atrás do Cloudflare Access e o n8n
faz o meio; a escolha entre um token por designer e um token de serviço fica para antes da primeira rota.

## A fundação (#86–#88): a Produção, os eventos e o aviso do Trello

A spec #85 tirou a primeira etapa (o espelho). A unidade é a **Produção**, com id próprio do PROMeiro (UUID), no SQLite
com SQL comum ao Postgres; o card do Trello e o registro do Teable são referências opcionais. A carga inicial vem só da
produção da arte do Teable (o Trello tem muito lixo), idempotente pelo registro, sem eventos passados. O Trello avisa o
PROMeiro direto, sem o n8n: um webhook que o PROMeiro registra e confere de hora em hora, na única rota fora do
Cloudflare Access, só com a assinatura HMAC do Trello. A tradução da ação em **evento** é pura e cobre criada, etapa
(pela lista; a entrega concluída é Entregue), arquivada, designer, arte do checklist e os campos (prioridade,
complexidade, praça, prazo de entrega); uma ação vira no máximo um evento e o id dela não repete. Card que não é
Produção é ignorado, salvo o criado; um card com várias Produções vale pela mais recente. O que o PROMeiro perdeu fora do
ar ele recupera lendo as ações do quadro desde o último evento (na subida e de hora em hora; 30 dias e 10 páginas no
máximo), pela mesma tradução, mas só nas Produções que já existem: a recuperação não cria Produção (o quadro tem muito
card avulso, e a carga vem do Teable), só o aviso ao vivo cria. O n8n continua sincronizando em paralelo; o PROMeiro ainda não manda no Trello.
