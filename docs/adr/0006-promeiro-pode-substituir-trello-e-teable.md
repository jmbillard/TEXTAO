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

(O aviso do Trello e a recuperação estão desligados por enquanto: veja a última seção.)

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

A **linha do tempo** (#89) é a leitura desses eventos, para qualquer pessoa logada (não só administradores: é o trabalho
que a equipe toda já vê no card do Trello), sem os ids do Trello; a agenda e as Duplicadas a leem só quando o card abre.

## Por enquanto, o PROMeiro só ESCREVE no Trello; lê do Teable

Decisão do usuário, valendo já: "tudo enviado para o Trello, mas nada pego do Trello; tem que pegar do Teable", no que
for viável sem impactar a produção. O envio continua igual (card, checklist, campos, anexos, o card da semana). O que o
PROMeiro lê vem da produção da arte do Teable, a fonte oficial: os **eventos da Produção** nascem de uma releitura de
minuto em minuto das linhas que o Teable mudou (`__last_modified_time`), comparadas com a Produção guardada, com uma
chave estável por evento (registro + tipo + campo + valor + quando) e sem `quem` (o Teable não diz; quem grava lá é o
n8n); as Duplicadas mostram só o que a produção tem; as novidades das **Pessoas** saem dos designers que aparecem na
produção (e o "saiu" é o designer ativo sem produção há 60 dias). O aviso do Trello (#87) e a recuperação das ações do
quadro (#88) ficam no código, **desligados** (`TRELLO_AVISO`): sem ele, nenhum webhook é registrado e a rota responde
404; ligado, a releitura não roda (uma fonte de eventos por vez). Continuam lidas no Trello só as leituras de que o
envio depende (as listas, os campos, as opções e as etiquetas do quadro; o card que o PROMeiro vai mudar; o card do
filme de onde o card novo copia membros e campos) e, até o Teable ter o dado, o andamento dos cards de filme e o
checklist das prévias (os cards de filme não entram na produção da arte, ADR 0001).

## Os anexos (#90): o PROMeiro guarda o PDF e os pôsteres

O PDF do roteiro que vai ao card e os pôsteres dos filmes ficam no SQLite do PROMeiro (no backup) e são servidos por
endereço fixo; o Trello continua recebendo o PDF e o Teable, o pôster. O PDF não vai ao Teable: nenhum link dele é
escrito no `doc` da produção da arte (o que já está lá fica). O PROMeiro acha o PDF da comparação pela própria
ligação, o card da Produção guardado com o anexo, e não o baixa mais do Trello; só a Produção antiga, sem PDF
guardado, ainda usa o `doc` antigo do Teable como último recurso. O pôster que o Teable
ainda tem vira cópia do PROMeiro no primeiro pedido; o que ele perdeu não volta. Para o Padeiro, que abre o pôster sem
login, uma segunda exceção ao Access, só para `/api/publico/poster`, com um token de serviço fixo no endereço
(`POSTER_PUBLICO_TOKEN`): o pôster é público por natureza e o fluxo filmes-recentes já é aberto, então um token só
basta para não deixar o caminho aberto a qualquer um. Não responde a pergunta de como o Padeiro se identifica para o
resto da API: o token do pôster só abre o pôster.

## Rumo do produto (interrogatório de 27/11/2026)

O interrogatório que a primeira seção deixou para depois foi feito. Decisões:

- **Para quem é:** o PROMeiro é de toda a Promo (arte, redação, edição e coordenação), cada um na sua **área de
  trabalho**.
- **Meta de 6 meses:** o PROMeiro vira o lugar de trabalho da arte. O designer pega, produz e entrega pelo PROMeiro, e
  o Trello vira um espelho que ninguém precisa abrir.
- **Aparelho:** o trabalho é no computador; o celular serve para acompanhar e responder rápido.
- **As dores que guiam as prioridades:** ninguém atualiza nada; os dados não têm padrão; há ferramentas demais.

**O andamento sem depender de lembrar.** Duas frentes:

1. **O aviso do Padeiro:** o Padeiro avisa o PROMeiro direto, sem o n8n. Abrir ou criar o projeto pelo card ou pela
   Produção conta como Produzindo, com o designer. O designer se cadastra pelo próprio Padeiro e ganha uma **chave do
   Padeiro**, ligada ao usuário do computador; o cadastro fica pendente até um administrador aprovar e ligar ao
   designer. Isto responde a pergunta aberta da segunda seção: uma chave por usuário do computador, ligada ao designer, e não um
   token de serviço.
2. **A tela de produções:** uma faixa por praça, com as colunas Entrada · Produzindo · Entregue. Qualquer designer muda
   a etapa (arrastando ou com um botão), e o PROMeiro move o card no Trello. Ao marcar Entregue, avisa se falta arte,
   mas deixa entregar. A agenda No Trello continua existindo ao lado dela.

**Conflito PROMeiro × Trello:** vale o último que aconteceu, e os dois viram evento na linha do tempo.

**O padrão dos dados.** O PROMeiro aceita qualquer grafia na entrada e grava sempre no padrão. As grafias antigas da
pauta da edição, das atrações e do acervo serão corrigidas por uma tela de manutenção, só de administradores (a
**correção de grafia**): ela lista as correções "de → para" para conferir, aplica no Teable e guarda o valor antigo para
desfazer. Isto muda a regra de que o PROMeiro só lê a pauta da edição: a correção é a exceção autorizada. Escrever a
pauta, pela coordenação, só vem quando o Teable sair.

**As ferramentas.** Cada fluxo do n8n é desligado assim que o PROMeiro o cobre, como já foi feito com as Duplicadas e o
FilmeBOT. A ordem geral continua: Trello, depois Teable, depois n8n.

**O fim do Trello.** O Trello é pago pela empresa, que tira dele os dados de produtividade da equipe, e esses dados são
imprecisos. Ele só sai quando ninguém mais mexer nele e o PROMeiro oferecer à empresa dados precisos.

**Para depois.** O relatório de produtividade e o registro do uso de IA esperam a empresa padronizar os dados pedidos a
todas as equipes da pós e do design. Hoje ela olha o número de peças, a complexidade das peças e o uso de IA em cada
produção.

**A ordem das próximas frentes:** a tela de produções e a correção de grafia, em paralelo; depois, o aviso do Padeiro.

## A coordenação monta a pauta (interrogatório de 27/11/2026)

Esta decisão revê a anterior ("escrever a pauta, pela coordenação, só vem quando o Teable sair"): a **coordenação**
passa a montar e publicar a pauta da edição no PROMeiro já, com o Teable ainda no lugar. Decisões:

- **Substitui a planilha da edição.** Antes, uma semana lado a lado: o PROMeiro mostra a foto crua da planilha e as
  diferenças com a pauta dele. Passada a semana, o fluxo do n8n que lê a planilha é desligado.
- **Grava no Teable só ao publicar**, de forma compatível com o que o Teable já tem: os avisos viram linhas com a
  caixinha de anotação marcada. O rascunho fica só no PROMeiro.
- **O cartão da pauta no Teams.** O PROMeiro manda o cartão em horários configuráveis, pelo mesmo endereço do Power
  Automate que o n8n usa (guardado como segredo). O cartão leva a pauta por turno, os avisos e o recado do dia;
  republicar manda "pauta alterada".
- **Edição simultânea, com presença:** mais de uma pessoa da coordenação monta ao mesmo tempo, e cada uma vê quem mais
  está ali.
- **Editor novo:** um nome que não está nos cadastros entra como pendente, e um administrador confirma.
- **Publica mesmo com pendências** da conferência: elas avisam, não travam. (Confirmado por um produtor da edição,
  em 27/11/2026: "pode, avisando".)
- **Ausência num dia publicado:** marcar a ausência de quem está escalado num dia já publicado oferece tirar a pessoa
  e republicar.
- **A tela é um híbrido:** a grade, como a planilha; a coluna lateral, com quem falta distribuir, quem está sem escala
  e quem está fora; e o colar da planilha, para trazer o que já foi escrito lá.

## O Padeiro fala com o PROMeiro (interrogatório de 27/11/2026)

Esta seção responde, de vez, a pergunta aberta da segunda seção: como o Padeiro se identifica. Decisões:

- **Um caminho só do Padeiro**, embaixo de `/api/padeiro/`, que só responde com a **chave do Padeiro** e é liberado no
  Cloudflare Access. A chave é uma por usuário e por computador, ligada ao designer por um administrador, e pode ser
  revogada.
- **Primeiro passam por ele** as Produções, que substituem os cards do Trello no grupo NO TRELLO do Padeiro, e o
  **aviso do Padeiro**.
- **Depois que esse caminho funcionar**, passam também os filmes recentes, o índice das atrações (buscar) e o webhook
  do projeto. Cada fluxo do n8n é desligado quando o PROMeiro cobrir o que ele faz.
