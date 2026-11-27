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
  nunca chega às rotas com login, nem com o caminho torto (`%2e%2e`, barras repetidas, outra caixa; #145). É esse o endereço que vai nos filmes recentes do Padeiro
  (veja "Os filmes recentes do Padeiro"), no lugar do link temporário do Teable que o fluxo `filmes-recentes` do n8n
  manda.

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

## Os filmes recentes do Padeiro

A claquete do Padeiro, com o campo vazio, mostra os filmes com exibição perto de hoje (#142). Com a chave do Padeiro
(pendente ou ligada), eles vêm do PROMeiro; sem a chave, com a revogada, com o Padeiro de antes ou com o PROMeiro fora
do ar, continuam vindo do fluxo `filmes-recentes` do n8n (PROMO: FILMES PARA O PADEIRO).

- `GET /api/padeiro/filmes`, com a chave: `{ atualizado_em, filmes: [...] }`, no mesmo formato do n8n. Um item por
  filme com exibição não cancelada de 2 dias atrás a 45 dias à frente (a próxima exibição; sem ela, a mais recente), os
  próximos primeiro e depois os dos últimos dias. Cada um leva `exibicao_id`, `filme_id`, `titulo`, `ano`, `pasta`
  ("TÍTULO (ANO)"), `projeto` e `output` (`{ win, mac }`, com essa pasta no último nível), `exibicao` (AAAA-MM-DD),
  `sessao`, `inedito`, `trello` (o card) e `poster`. Lê do Postgres do Teable (as tabelas `exibicoes` e `filmes`, com o
  `nome_da_pasta`); nada vem do Trello.
- **O pôster** é o endereço público do PROMeiro (`PROMEIRO_URL/api/publico/poster/<filme>?t=<POSTER_PUBLICO_TOKEN>`),
  quando o filme tem pôster no Teable ou a cópia do PROMeiro. Sem o `PROMEIRO_URL` ou sem o `POSTER_PUBLICO_TOKEN`, o
  filme vem sem pôster (`null`). O endereço é fixo: não expira como o link do Teable.
- A chave pendente também lê, porque o n8n já dava a mesma lista sem chave nenhuma. A revogada, `403`; sem a chave, ou
  com uma que não vale, `401`. Com o Postgres do Teable fora, `503`, e o Padeiro volta ao n8n.

**Para desligar o fluxo `filmes-recentes` do n8n** (o passo é seu, depois de conferir):

1. **O Padeiro novo em todos os computadores**, com o endereço do PROMeiro na configuração. Nos Cadastros ›
   Padeiros, cada computador da equipe aparece com a chave (pendente serve; revogada, não).
2. **Confira com a chave:** `curl -s -H "X-Chave-Do-Padeiro: <chave>" https://<promeiro>/api/padeiro/filmes` traz os
   mesmos filmes que `curl -s https://<n8n>/webhook/filmes-recentes` (os pôsteres em endereços diferentes, e o
   `atualizado_em`). Abra um pôster da lista do PROMeiro num navegador anônimo: a imagem abre sem login.
3. **Confira no Padeiro:** a claquete com o campo vazio mostra os filmes, com o pôster, a exibição e a etiqueta (A
   PRODUZIR ou JÁ TEM PROJETO), como antes.
4. **Confira no n8n:** em Executions, filtrando o fluxo "PROMO: FILMES PARA O PADEIRO", as chamadas param de chegar
   (o Padeiro com a chave não chama mais o webhook). As que ainda chegam são de um Padeiro sem a chave, de antes ou
   com o PROMeiro fora do ar naquela hora: atualize esse computador antes de seguir.
5. **Desligue:** no n8n, abra o fluxo, baixe uma cópia (… → Download) e desative o fluxo (o botão Active). Não apague.
   Daí em diante, o Padeiro sem a chave fica com a lista dos filmes vazia (a claquete continua funcionando, só sem os
   filmes recentes).

**Para voltar atrás:** ative o fluxo de novo no n8n. O Padeiro sem a chave volta a usar o webhook na hora; o com a
chave continua no PROMeiro (e cai no webhook quando o PROMeiro não responde).

## A semana lado a lado com a planilha (a foto da edição)

Durante a transição da pauta da edição (#133, ADR 0006), a coordenação monta nas duas: no PROMeiro e na planilha. O
n8n manda ao PROMeiro, de hora em hora, a **foto crua** das abas da planilha, e a tela **Montar a pauta** mostra, acima
da grade, as diferenças entre o dia montado e a foto do mesmo dia, posição por posição. O fluxo do n8n que grava a
pauta no Teable continua como está; a foto é um ramo à parte, que nunca para nem muda a pauta.

**A rota:** `POST /api/publico/edicao/foto`, fora do login, com o cabeçalho `Authorization: Bearer <EDICAO_FOTO_TOKEN>`
e o corpo JSON (até 1 MB) no **formato 1**:

```json
{
  "formato": 1,
  "origem": { "fluxo": "<id do fluxo>", "execucao": "<id da execução>" },
  "lida_em": "2026-11-27T10:15:04.120-03:00",
  "todas_as_abas": ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO", "DOMINGO"],
  "abas": [
    {
      "aba": "SEXTA",
      "intervalo": "'SEXTA'!A1:AD80",
      "sheetId": 0,
      "data_da_aba": "2026-11-27",
      "linhas": [["", "SEXTA", "27/11/2026"], [], ["", "EDITOR: ", "<nome>"], ["", "HORÁRIO: ", "22H AS 6H"]],
      "mesclas": [[3, 1, 4, 17]]
    }
  ]
}
```

- `linhas` é a grade como a API do Google devolve (`FORMATTED_VALUE`), célula por célula, como texto; `mesclas` vem
  em `[linha inicial, coluna inicial, linha final, coluna final)`, contando a partir de 0; `data_da_aba` é só uma
  pista (o PROMeiro lê o dia na própria grade).
- A resposta é `{ "gravadas": n, "iguais": m }`. O PROMeiro guarda no SQLite (a tabela `edicao_fotos`, que entra no
  backup) só a aba que mudou desde a última foto dela; a igual só ganha a hora da confirmação. Passados 180 dias, fica
  só a última foto de cada aba em cada dia.
- Sem o token, ou com o errado, `401`; sem `EDICAO_FOTO_TOKEN` no Portainer, a rota fica desligada (`404`); a foto
  fora do formato, `400`; maior que 1 MB, `413`. O caminho torto (`%2e%2e`, barras repetidas, outra caixa) é `404` e
  nunca chega às rotas com login.
- **A leitura:** a grade da foto vira o mesmo texto que a pessoa colaria da planilha e passa pelo leitor do **Colar da
  planilha** (#130). A comparação casa cada posição pelo editor e pelo turno (a vaga, pelo turno e pela ilha) e mostra
  o turno, a ilha, o horário, as demandas e os avisos que diferem, e quem está fora só de um lado. A grafia (`Dp` ×
  `(DP)`, caixa, acento) não é diferença.

**O seu lado** (o PROMeiro não mexe no n8n):

1. **No Portainer:** gere o token (`openssl rand -hex 24`), ponha em `EDICAO_FOTO_TOKEN` e atualize a stack.
2. **No n8n, a credencial:** Credentials → New → **Header Auth**, nome "PROMeiro - foto da edição", com o *Name*
   `Authorization` e o *Value* `Bearer <o mesmo token>`.
3. **No n8n, o ramo da foto**, no fluxo da esteira de pós dos editores, saindo do nó `Globals` (ao lado do ramo da
   pauta, que não muda). O `Globals` ganha duas constantes: `planilha_edicao` (o id da planilha, o mesmo do nó
   `Get data`) e `promeiro_foto` (`http://promeiro/api/publico/edicao/foto`). Os quatro nós, todos com
   *On Error* → **Continue** (`continueRegularOutput`); os HTTP com 3 tentativas (*Retry On Fail*) e 30 s de timeout:
   1. **`Foto: lê as abas`** (HTTP Request, GET, *Predefined Credential Type* → Google Sheets, a mesma credencial do
      `Get data`): `https://sheets.googleapis.com/v4/spreadsheets/{{ $json.constants.planilha_edicao }}/values:batchGet?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&ranges='SEGUNDA'!A1:AD80&ranges='TERÇA'!A1:AD80&…&ranges='DOMINGO'!A1:AD80`
      (as 7 faixas numa chamada só).
   2. **`Foto: lê as mesclas`** (HTTP Request, GET, a mesma credencial):
      `https://sheets.googleapis.com/v4/spreadsheets/{{ id }}?fields=sheets(properties(sheetId,title),merges)`.
   3. **`Foto: monta o pacote`** (Code, *Run Once for All Items*): monta o JSON do formato 1 acima, com `lida_em:
      $now.toISO()`, `origem: { fluxo: $workflow.id, execucao: $execution.id }`, `todas_as_abas` (os títulos de
      `sheets`) e, para cada uma das 7 abas, `linhas` (os `values` da faixa, cada célula como texto), `mesclas` (os
      `merges` da aba, em `[startRowIndex, startColumnIndex, endRowIndex, endColumnIndex]`) e a pista `data_da_aba`.
      Sem a leitura das abas, não devolve nada (o ramo para ali).
   4. **`Foto: manda ao PROMeiro`** (HTTP Request, POST, *Generic Credential Type* → Header Auth "PROMeiro - foto da
      edição"): o endereço `{{ $('Globals').first().json.constants.promeiro_foto }}`, *Body* JSON com
      `{{ JSON.stringify($json) }}`.
4. **A rede:** o PROMeiro está na rede do n8n (`REDE_N8N`), e por ali o pedido nem passa pelo Cloudflare. Se o nome
   `promeiro` não resolver no n8n, use o endereço público (`PROMEIRO_URL/api/publico/edicao/foto`); aí é preciso uma
   aplicação no Cloudflare Access **só para o caminho `api/publico/edicao`**, com a política **Bypass** para Everyone
   (como a do pôster público).
5. **Confira** de dentro do container do n8n (ou troque o endereço pelo público), com o token no lugar de `<token>`:

   ```sh
   curl -i -X POST http://promeiro/api/publico/edicao/foto \
     -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
     -d '{"formato":1,"lida_em":"2026-11-27T10:15:00-03:00","abas":[{"aba":"TESTE","linhas":[["","SEXTA","27/11/2026"]],"mesclas":[]}]}'
   ```

   A resposta é `200 {"gravadas":1,"iguais":0}`; o mesmo pedido de novo dá `{"gravadas":0,"iguais":1}`. Sem o
   cabeçalho, `401`; `404` quer dizer que o `EDICAO_FOTO_TOKEN` está vazio no PROMeiro. Depois da primeira rodada do
   fluxo, a tela **Montar a pauta** mostra, acima da grade, "Lado a lado com a planilha · aba …, lida …" no dia da aba.

**Para desligar:** desligue o nó `Foto: manda ao PROMeiro` no n8n, ou esvazie o `EDICAO_FOTO_TOKEN` (a rota volta a
responder 404). As fotos guardadas ficam no SQLite; o ramo da pauta do n8n não depende delas.

## A prévia de filmes que chega por e-mail

A prévia mensal de filmes em PDF chega por e-mail ao mesmo gatilho do n8n que recebe as alterações da grade (#157). O
n8n manda o anexo ao PROMeiro, que **só guarda o arquivo**, como prévia **por preparar**: ela aparece na aba **Filmes**
como "prévia nova · chegou por e-mail", e a bolinha do Filmes no topo acende. A primeira pessoa que abrir a prévia
dispara o preparo no navegador, o mesmo da subida à mão (as páginas úteis, os pôsteres e a leitura pela IA). O aviso no
Teams é do n8n, depois da resposta do PROMeiro.

**A rota:** `POST /api/publico/filmes/previa`, fora do login, com o cabeçalho
`Authorization: Bearer <FILMES_PREVIA_TOKEN>` e o corpo `multipart/form-data` (até 30 MB):

- `pdf`: o arquivo, com o nome original (obrigatório; tem de começar com `%PDF-`);
- `chegou_em`: a hora em que o e-mail chegou, ISO (opcional; sem ela, vale a hora da chegada ao PROMeiro).

A resposta (`200`):

```json
{ "id": "<id da prévia>", "existente": false, "correcao": false, "nome": "PRÉVIA <MÊS> <ANO>.pdf", "link": "<PROMEIRO_URL>/#/filmes" }
```

- **O mesmo PDF não se repete:** o PROMeiro calcula a impressão SHA-256 do arquivo, a mesma que o navegador calcula na
  subida à mão. O mesmo PDF de novo, por e-mail ou subido à mão, responde `"existente": true`, com o id e o nome da
  prévia que já existe, e não cria nada: o n8n só avisa no Teams quando `existente` é `false`.
- **Um PDF diferente** vira **outra prévia, ao lado**; a antiga continua. Com o mesmo nome de uma prévia que já existe
  (sem contar a caixa, os acentos, a pontuação e o "(1)" do anexo repetido), ela é a prévia corrigida do mesmo mês:
  `"correcao": true` na resposta (para o aviso do Teams dizer) e a etiqueta "correção" na aba Filmes.
- Sem o token, ou com o errado, `401`; sem o `FILMES_PREVIA_TOKEN` no Portainer, a rota fica desligada (`404`); com a
  aba Filmes desligada (sem `N8N_FILMES_LER` ou `FILMES_PASTA`), `503`; o corpo que não é multipart, sem o campo `pdf`
  ou com um arquivo que não é PDF, `400`; maior que 30 MB, `413`. O caminho torto (`%2e%2e`, barras repetidas, outra
  caixa) é `404` e nunca chega às rotas com login.
- O PDF inteiro fica em `FILMES_PASTA/<id>/previa.pdf`; a leitura das páginas é a de sempre (`N8N_FILMES_LER`).

**O seu lado** (o PROMeiro não mexe no n8n):

1. **No Portainer:** gere o token (`openssl rand -hex 24`), ponha em `FILMES_PREVIA_TOKEN` e atualize a stack. Use um
   token só desta rota (não o da foto da edição).
2. **No n8n, a credencial:** Credentials → New → **Header Auth**, nome "PROMeiro - prévia de filmes", com o *Name*
   `Authorization` e o *Value* `Bearer <o mesmo token>`.
3. **No n8n, o ramo do PDF**, no fluxo da programação de filmes, saindo do nó que separa os anexos, em paralelo ao filtro
   do `.xlsx`: um filtro (extensão `pdf`, tamanho > 0 e o nome do anexo começando com "PRÉVIA", sem ligar para caixa e
   acento) e um **HTTP Request** (POST, *Generic Credential Type* → Header Auth "PROMeiro - prévia de filmes", *Body*
   **Form-Data**: `pdf` do tipo *n8n Binary File* com o binário do anexo, e `chegou_em` com a data do e-mail). Depois,
   um IF em `existente == false` antes do cartão do Teams, com o `link` da resposta.
4. **A rede:** pelo nome interno (`http://promeiro/api/publico/filmes/previa`, na `REDE_N8N`), o pedido nem passa pelo
   Cloudflare, e não é preciso Bypass. **Só se o n8n usar o endereço público** (`PROMEIRO_URL/api/publico/filmes/previa`)
   é preciso uma aplicação no Cloudflare Access **só para o caminho `api/publico/filmes`**, com a política **Bypass**
   para Everyone (como a do pôster público e a da foto da edição).
5. **Confira** de dentro do container do n8n (ou troque o endereço pelo público), com o token no lugar de `<token>` e um
   PDF qualquer de teste no lugar de `teste.pdf`:

   ```sh
   curl -i -X POST http://promeiro/api/publico/filmes/previa \
     -H 'Authorization: Bearer <token>' \
     -F 'pdf=@teste.pdf;type=application/pdf' -F 'chegou_em=2026-11-27T09:00:00-03:00'
   ```

   A resposta é `200` com `"existente": false`; o mesmo pedido de novo dá `"existente": true`, com o mesmo `id`. Sem o
   cabeçalho, `401`; `404` quer dizer que o `FILMES_PREVIA_TOKEN` está vazio no PROMeiro. Com o endereço público, confira
   também que `curl -i PROMEIRO_URL/api/eu` continua pedindo o login. A prévia de teste aparece na aba Filmes; abri-la
   dispara o preparo e a leitura pela IA.

**Para desligar:** desligue o nó HTTP do ramo do PDF no n8n, ou esvazie o `FILMES_PREVIA_TOKEN` (a rota volta a
responder 404). As prévias que já chegaram ficam na aba Filmes, como as subidas à mão.

## A virada da pauta: o PROMeiro grava no Teable

Passada a semana lado a lado (#134, ADR 0006), a pauta da edição passa a sair do PROMeiro: publicar grava o dia na
tabela da pauta da edição (`EDICAO_producao`) da base do PROMeiro, e o fluxo do n8n que lê a planilha é desligado. Quem
decide a hora é a **chave da virada**, na Configuração (só administradores), que vem **desligada**: desligada, publicar
fica só no PROMeiro e nada vai ao Teable.

**O que o PROMeiro grava**, pela API do Teable (o mesmo `TEABLE_TOKEN` dos Cadastros), no formato que o n8n grava hoje:
uma linha por demanda, com `claquete`, `editor` (o link para o cadastro de editores, pelo nome), `data` (00:00 do dia em
São Paulo), `expediente_inicio` e `expediente_fim` (o horário da posição; sem eles, se o PROMeiro não entendeu o
horário), `anotacao` e `alterado_em`. Os avisos de cada posição vão como linhas com a caixinha `anotacao` marcada, com
o editor e o expediente da posição; o recado do dia, como uma linha com a caixinha marcada, sem editor e sem expediente.

- **Republicar** ajusta as linhas do dia, sem duplicar: o PROMeiro guarda no SQLite (a tabela `pauta_no_teable`, que
  entra no backup) o vínculo de cada item publicado com o registro do Teable. Cria o item novo, muda só o que mudou (o
  `alterado_em` vai junto, só nele), apaga o que saiu. O registro que alguém apagou à mão no Teable é criado de novo.
- **O rascunho nunca vai.** Só publicar e desfazer mexem no Teable.
- **Desfazer** a publicação volta o Teable para a publicação anterior; desfeita a única, as linhas do dia saem.
- **O dia publicado é do PROMeiro:** na primeira vez, as linhas que o n8n tinha gravado da planilha naquele dia são
  apagadas (lidas do Postgres do Teable; sem ele, ficam, e a tela avisa). Os outros dias não são tocados.
- **Na Pauta da edição**, no dia que o PROMeiro gravou vale o publicado, e as linhas do Teable daquele dia (o espelho)
  não entram de novo. O dia que ninguém publicou, e os de antes da virada, continuam vindo do Teable.
- **Com o Teable fora do ar**, a publicação vale no PROMeiro (a Pauta já mostra o dia publicado) e a tela de montar diz
  "Não gravei no Teable…". Publicar de novo termina o que faltou, sem duplicar.
- Desligada a chave, o PROMeiro não toca mais no Teable (nem ao desfazer), e a Pauta volta à junção de antes.

**O passo a passo** (o PROMeiro não mexe no n8n):

1. **Antes:** confira, na semana lado a lado, que a pauta montada no PROMeiro bate com a planilha, e que a
   Configuração › Conexões acha a tabela `EDICAO_producao` na base (sem ela, a chave não liga).
2. **No n8n, desative o fluxo que lê a planilha:** no fluxo **PROMO: ESTEIRA PÓS - EDITORES**, desligue o gatilho
   "updates regulares" e o ramo que grava a pauta (o `Get data` da planilha, o "Compare DEMANDAS" e os POST, PATCH e
   DELETE na `EDICAO_producao`, e a criação dos editores "(sem ID)*"). Se o cartão do Teams já sai pelo PROMeiro (#135,
   `TEAMS_PAUTA_URL`), desligue também os gatilhos "MANHÃ" e "NOITE". O que o fluxo faz fora da planilha (o campo
   editor dos cards do Trello, os cards de filme) fica a seu critério; se ninguém mais precisa, desative o fluxo
   inteiro (o botão *Active*). Salve e confira em *Executions* que a rodada seguinte (no minuto 15) não grava mais.
3. **No PROMeiro, ligue a chave:** Configuração › **Pauta no Teable** › "Ligar a gravação no Teable…" › "Já desativei:
   ligar". Vale na hora e entra no Histórico da Configuração. Ligar não grava nada: só a próxima publicação vai.
4. **Publique de novo** os dias de hoje em diante (Montar a pauta › Conferir e publicar › Publicar de novo). Cada dia
   vai ao Teable e a tela mostra "gravada no Teable às …"; um erro aparece no lugar, com o motivo.
5. **Confira** no Teable, na tabela `EDICAO_producao`, as linhas do dia (uma por demanda, os avisos e o recado com a
   caixinha marcada) e, na Pauta da edição, o dia como foi publicado.
6. **Depois:** o ramo da foto (a semana lado a lado) já não é preciso; desligue o nó `Foto: manda ao PROMeiro` ou
   esvazie o `EDICAO_FOTO_TOKEN`.

**Para voltar atrás:** desligue a chave (Configuração › Pauta no Teable › "Desligar a gravação no Teable") e reative
o fluxo do n8n. As linhas que o PROMeiro gravou ficam no Teable, e o n8n as acerta pela planilha na rodada seguinte.

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
