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
