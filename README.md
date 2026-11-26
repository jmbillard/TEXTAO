# PROMeiro

Ferramenta de revisão de roteiros da Arte do Promo. Os roteiros chegam do Word (ou em PDF) numa fila; quem revisa confere a claquete, a atração e as artes, e manda para o Trello.

## O aviso do Trello: a única rota fora do Cloudflare Access

O Trello avisa o PROMeiro direto a cada mudança no quadro (card novo, mudou de lista, arquivado, designer no card,
arte marcada no checklist, prioridade, complexidade, praça e prazo de entrega), e o PROMeiro anota os eventos da
Produção. Para isso:

1. **No Portainer:** `TRELLO_SEGREDO` com o "Secret" da mesma API key do `TRELLO_KEY` (no admin de Power-Ups do
   Trello, a chave → Secret) e `PROMEIRO_URL` com o endereço público (ex.: `https://promeiro.exemplo.com`). O quadro
   é o da Configuração › Conexões.
2. **No Cloudflare Zero Trust (Access → Applications):** uma aplicação self-hosted no mesmo domínio, **só com o
   caminho `/api/trello/aviso`**, e uma política **Bypass** para Everyone. Mais nada: o resto do PROMeiro continua
   atrás do login. (Uma aplicação com caminho vale antes da do domínio inteiro.) Deixe `ACCESS_TEAM_DOMAIN` e
   `ACCESS_AUD` preenchidas: com elas o PROMeiro confere a assinatura do login, e um cabeçalho de e-mail forjado por
   quem passou pelo Bypass não vale. O que estiver embaixo do caminho (`/api/trello/aviso/…`) responde 404.
3. **Reinicie** o container. Na subida (e de hora em hora) o PROMeiro confere o webhook do quadro: registra se não
   houver, liga de novo se o Trello desligou e tira o de um quadro antigo. Logo depois, recupera o que faltou: lê as
   ações do quadro desde o último evento guardado (no máximo 30 dias e 10 páginas de 1000 ações) e anota o que não
   tinha chegado, sem duplicar. O log diz `[aviso do trello]`.

O PROMeiro só aceita o aviso com a assinatura do Trello (o cabeçalho `X-Trello-Webhook`, o HMAC-SHA1 do corpo e do
endereço com o Secret); o resto recebe 401 e não é processado. O `HEAD` na rota responde 200: é como o Trello confere
o endereço ao registrar.

## Manutenção: a data dos roteiros que já estavam na fila

Os roteiros importados antes da correção do "D-M-V" (o "5-12-2" lido como 12/02) podem estar na fila com a data
errada. No Portainer, abra o console do container `promeiro` (`/bin/sh`) e rode
`node --experimental-strip-types servidor/corrigir-datas.mjs`: ele usa o banco da variável `DADOS`
(`$DADOS/roteirista.db`) e só lista cada roteiro com a claquete, a data gravada, a data nova e a claquete com a barra,
quando ela muda. Conferida a lista, rode o mesmo comando com `--aplicar` para gravar só esses. Ficam de fora os já
enviados ao Trello, os sem data na claquete, os com a data mudada depois da importação e os com a data tirada do
texto do roteiro. A fila é avisada pelo Redis; sem ele, as datas novas aparecem ao recarregar. Rode com os roteiros
listados fechados no editor: quem estiver com um aberto pode gravar a data antiga de volta.
