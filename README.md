# PROMeiro

Ferramenta de revisão de roteiros da Arte do Promo. Os roteiros chegam do Word (ou em PDF) numa fila; quem revisa confere a claquete, a atração e as artes, e manda para o Trello.

## O PROMeiro só escreve no Trello; lê do Teable

Por enquanto (ADR 0006), tudo o que o PROMeiro manda vai para o Trello como sempre (o card, a checklist, os campos,
os anexos, o card da semana dos filmes), mas o que ele **lê** vem do Teable: a produção da arte, os eventos da
Produção, as Duplicadas e as novidades das Pessoas. Do Trello ele só lê o que precisa para enviar certo: as listas,
os campos, as opções e as etiquetas do quadro (a Configuração e a conferência), o card que ele mesmo vai mudar (a versão
nova do roteiro, o card da semana dos filmes) e o card do filme da sessão, de onde o card novo copia os membros e os
campos. Ficam também, até o Teable ter o mesmo dado, o andamento dos cards de filme na aba Filmes e o checklist das
prévias no acervo do filme (os cards de filme não entram na produção da arte, ADR 0001).

**Os eventos da Produção** nascem da produção da arte: de minuto em minuto, o PROMeiro relê as linhas que o Teable
mudou (pela coluna `__last_modified_time`) e anota o que mudou em cada uma (etapa, designer que entrou ou saiu, praça,
prioridade, complexidade; a linha nova vira Produção). O log diz `[producoes] releitura do Teable`.

## Os anexos: guardados pelo PROMeiro

O PDF do roteiro que vai ao card e os pôsteres dos filmes (#90) ficam no SQLite do PROMeiro (a tabela `anexos`, que
entra no backup com o resto do banco) e são servidos por endereço fixo:

- **O PDF do roteiro:** o envio gera o PDF como sempre (o Stirling converte o Word; sem ele, `servidor/pdf.mjs`),
  anexa ao card do Trello como antes e guarda uma cópia, ligada ao card da Produção; a versão nova (V2) também, no
  mesmo card. Nenhum link do PDF vai ao Teable: o envio não escreve o campo `doc` da produção da arte, e a V2 não o
  muda (o `doc` que já está lá fica como está). Comparar com o que está na produção lê o PDF mais recente guardado
  para o card; só a Produção antiga, sem PDF guardado, ainda usa o `doc` do Teable (o endereço do PROMeiro é lido
  daqui; o link do anexo do Trello, o último recurso, baixa do Trello). A cópia é servida em
  `/api/anexos/<id>/<nome>.pdf`, só para quem está logado.
- **Os pôsteres:** `/api/filmes/poster/<filme>` serve a cópia do PROMeiro. Sem ela, busca no Teable (campo `poster`
  da tabela de filmes) e guarda a cópia; a cópia é conferida com o Teable de 6 em 6 horas (um pôster novo posto lá à
  mão a substitui; o Teable sem o arquivo não apaga a cópia). Sem os dois, 404 limpo, e o "não tem" fica guardado
  (1 hora; 5 minutos quando o Teable não respondeu), sem ir ao Teable a cada pedido. O pôster da prévia entra no
  PROMeiro no Envio da aba Filmes, junto com o do cadastro. Os pôsteres que o armazenamento do Teable já perdeu não
  voltam: só voltam se alguém puser de novo (no Teable, ou pela prévia).
- **O pôster para o Padeiro:** o Padeiro abre o pôster numa `<img>`, sem login. Com `POSTER_PUBLICO_TOKEN` no
  Portainer, `PROMEIRO_URL/api/publico/poster/<filme>?t=<token>` serve o mesmo pôster fora do login; precisa de uma
  aplicação no Cloudflare Access só para o caminho `/api/publico/poster`, com uma política **Bypass** (como a do aviso
  do Trello). Sem o token, ou com o errado, 404; o que mais estiver embaixo de `/api/publico/` também responde 404 e
  nunca chega às rotas com login, nem com o caminho torto (`%2e%2e`, barras repetidas, outra caixa; #145). O fluxo `filmes-recentes` do n8n passa a mandar esse endereço no lugar do link
  temporário do Teable.

## O caminho do Padeiro (a chave do Padeiro)

O Padeiro (a extensão do After Effects) roda fora do Cloudflare Access e fala com o PROMeiro por um caminho só dele,
embaixo de `/api/padeiro/` (#137). Ali só vale a **chave do Padeiro**, no cabeçalho `X-Chave-Do-Padeiro`; o login do
Access nunca é lido, e o que não é uma rota do Padeiro responde 404, sem chegar às rotas com login (vale também para
`/api/padeiros`, barras repetidas e `%2e%2e` no caminho).

- `POST /api/padeiro/cadastro` `{ usuario, computador, sistema, sigla }` (a única rota sem chave): devolve
  `201 { chave, estado: "pendente" }`. Uma chave por usuário e por computador. O cadastro de novo do mesmo par, com a
  chave pendente ou revogada, troca a chave na hora (a antiga deixa de valer). Com a chave **ligada**, ela não cai: o
  cadastro vira um **pedido novo do mesmo computador**, pendente, ao lado dela nos Cadastros › Padeiros; aprovar o
  pedido troca a chave (a de antes cai), recusar mantém a de antes. O PROMeiro guarda só o hash (SHA-256) da chave, no SQLite (a
  tabela `padeiros`, que entra no backup).
- `GET /api/padeiro/eu`, com a chave: `{ estado, usuario, computador, sigla, designer }`, com o estado `pendente`,
  `ligada` ou `revogada`. Sem a chave, ou com uma que não vale mais, `401`.
- Nos **Cadastros › Padeiros** (só administradores), a lista com usuário, computador, sigla, designer ligado e último
  aviso; ligar a um designer da tabela designers do Teable (a sigla sugere qual), trocar o designer e revogar.

Para liberar o caminho no Cloudflare Access (o passo é seu; sem ele, o Padeiro recebe a tela de login do Access e não
se cadastra, e nada mais muda):

1. **No Cloudflare Zero Trust (Access → Applications → Add an application → Self-hosted):** o mesmo domínio do
   PROMeiro, **só com o caminho `api/padeiro`** (o Access cobre o que está embaixo dele). Nome sugerido:
   "PROMeiro · Padeiro".
2. **A política:** uma só, com a ação **Bypass** e a regra **Everyone** (como a do pôster público e a do aviso do
   Trello). Não ponha outra política nessa aplicação.
3. **Confira** de fora, sem login: `curl -i https://<promeiro>/api/padeiro/eu` responde `401` com
   `{"erro":"Chave do Padeiro desconhecida…"}` (o PROMeiro respondeu); a tela de login do Access (302 ou 403) quer
   dizer que o Bypass não pegou. `curl -i https://<promeiro>/api/eu` continua pedindo o login do Access.
4. **No Padeiro:** o endereço do PROMeiro na configuração; ele pede a chave sozinho, e ela aparece pendente nos
   Cadastros › Padeiros até um administrador ligar.

**Para voltar atrás:** apague a aplicação "PROMeiro · Padeiro" no Access (Access → Applications → a aplicação →
Delete). O caminho volta para trás do login, como o resto do domínio: o Padeiro deixa de falar com o PROMeiro (e
segue pelo n8n, como antes), e as chaves continuam guardadas, sem valer para nada até o Bypass voltar. Para cortar um
Padeiro só, sem mexer no Access, revogue a chave dele nos Cadastros.

## O aviso do Trello: desligado

O aviso do Trello (#87, o webhook do quadro, e a recuperação das ações do quadro, #88) está **desligado por padrão** e
não precisa de nada: nem do `TRELLO_SEGREDO`, nem da exceção no Cloudflare Access. Sem `TRELLO_AVISO=1`, nenhum
webhook é registrado, nada do quadro é lido e a rota `/api/trello/aviso` responde 404. O código fica para quando for a
hora; com o aviso ligado, a releitura do Teable não roda (uma fonte de eventos por vez). Para ligar:

1. **No Portainer:** `TRELLO_AVISO=1`, `TRELLO_SEGREDO` com o "Secret" da mesma API key do `TRELLO_KEY` (no admin de
   Power-Ups do Trello, a chave → Secret) e `PROMEIRO_URL` com o endereço público. O quadro é o da Configuração ›
   Conexões.
2. **No Cloudflare Zero Trust (Access → Applications):** uma aplicação self-hosted no mesmo domínio, **só com o
   caminho `/api/trello/aviso`**, e uma política **Bypass** para Everyone. Deixe `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`
   preenchidas: com elas o PROMeiro confere a assinatura do login, e um cabeçalho de e-mail forjado por quem passou
   pelo Bypass não vale. O que estiver embaixo do caminho (`/api/trello/aviso/…`) responde 404.
3. **Reinicie** o container. Na subida (e de hora em hora) o PROMeiro confere o webhook do quadro e recupera o que
   faltou (as ações do quadro desde o último evento, no máximo 30 dias e 10 páginas de 1000), sem duplicar. O log diz
   `[aviso do trello]`. Só o aviso assinado pelo Trello (`X-Trello-Webhook`) é aceito; o resto recebe 401.

## Manutenção: a data dos roteiros que já estavam na fila

Os roteiros importados antes da correção do "D-M-V" (o "5-12-2" lido como 12/02) podem estar na fila com a data
errada. No Portainer, abra o console do container `promeiro` (`/bin/sh`) e rode
`node --experimental-strip-types servidor/corrigir-datas.mjs`: ele usa o banco da variável `DADOS`
(`$DADOS/roteirista.db`) e só lista cada roteiro com a claquete, a data gravada, a data nova e a claquete com a barra,
quando ela muda. Conferida a lista, rode o mesmo comando com `--aplicar` para gravar só esses. Ficam de fora os já
enviados ao Trello, os sem data na claquete, os com a data mudada depois da importação e os com a data tirada do
texto do roteiro. A fila é avisada pelo Redis; sem ele, as datas novas aparecem ao recarregar. Rode com os roteiros
listados fechados no editor: quem estiver com um aberto pode gravar a data antiga de volta.
