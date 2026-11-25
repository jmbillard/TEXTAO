# PROMeiro

Ferramenta de revisão de roteiros da Arte do Promo. Os roteiros chegam do Word (ou em PDF) numa fila; quem revisa confere a claquete, a atração e as artes, e manda para o Trello.

## Manutenção: a data dos roteiros que já estavam na fila

Os roteiros importados antes da correção do "D-M-V" (o "5-12-2" lido como 12/02) podem estar na fila com a data
errada. No Portainer, abra o console do container `promeiro` (`/bin/sh`) e rode
`node --experimental-strip-types servidor/corrigir-datas.mjs`: ele usa o banco da variável `DADOS`
(`$DADOS/roteirista.db`) e só lista cada roteiro com a claquete, a data gravada, a data nova e a claquete com a barra,
quando ela muda. Conferida a lista, rode o mesmo comando com `--aplicar` para gravar só esses. Ficam de fora os já
enviados ao Trello, os sem data na claquete, os com a data mudada depois da importação e os com a data tirada do
texto do roteiro. A fila é avisada pelo Redis; sem ele, as datas novas aparecem ao recarregar. Rode com os roteiros
listados fechados no editor: quem estiver com um aberto pode gravar a data antiga de volta.
