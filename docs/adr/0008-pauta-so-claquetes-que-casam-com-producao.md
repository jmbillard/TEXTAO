# A Pauta da edição só mostra as claquetes que casam com uma Produção

A pauta da edição veio da planilha, e a planilha tem de tudo: a claquete, a tarefa (COMUNICAÇÃO, CALHAUS, a peça sem
data), a instrução para o editor e o recado. Para a Pauta do PROMeiro, o que importa é a claquete que tem arte: é ela
que a arte entrega, que a contagem do dia conta e que a ficha abre. Decisão do usuário (#199): a Pauta é feita **só de
claquetes**, e só das que casam com uma **Produção**.

- **Casar** é o cruzamento que a Pauta já fazia (`cruzarComAProducao`): a chave exata, depois sem a versão no fim,
  depois sem a praça, só com as Produções que entraram perto do dia. A claquete que não acha nenhuma não aparece.
- **A tarefa sai** da Semana, do Dia, da Minha pauta, da contagem e do Montar a pauta. A **info** continua presa à
  claquete de antes, no balão; a info da claquete que não casa sai com ela; a do começo da posição, ou depois de uma
  tarefa, fica na posição, como antes. O **aviso** continua na posição e o **recado do dia** continua.
- **O Teable não perde nada.** A tarefa e a claquete sem Produção que já estão na EDICAO_producao ficam lá, só fora da
  tela. Publicar (depois da virada) só apaga do dia as linhas que o n8n gravou e que casam com uma Produção, porque a
  publicação põe as dela no lugar; a tarefa, a claquete sem Produção, a info e o aviso de fora ficam. O resumo do
  administrador continua contando a pauta inteira.
- **O Montar a pauta escolhe claquetes.** A coordenação monta escolhendo as claquetes das Produções perto do dia (as do
  Teable e as que o Trello criou), na lista "Das Produções" da coluna, arrastando para o editor, pelo "+" (para
  "Para distribuir") ou pelo "Pôr em…". Não há linha livre: o servidor recusa a claquete que não casa. A lista não
  mostra as arquivadas nem as que já estão no dia. A info e o aviso continuam como texto: a info que o PROMeiro não
  leria como info (e iria como tarefa) grava com "OBS:" na frente.
- **"N de fora".** O Montar mostra, só para a coordenação, o que o Teable tem no dia e não casa (as tarefas e as
  claquetes sem Produção, com as infos delas), para conferir.

**Consequências.** O colar da planilha só põe no rascunho o que casa; o resto aparece riscado no diálogo e fica de fora
(a planilha é o rascunho de quem a escreveu, e pôr no Montar uma linha que a Pauta esconde só confundiria). Pela mesma
regra, a semana lado a lado não conta como diferença a linha da planilha que não casa. O Repetir não copia mais as
tarefas fixas (copiaria o que a Pauta não mostra). A claquete leva as infos dela quando muda de posição; quando a
pessoa sai do dia, a claquete vai para "Para distribuir" e a info dela sai com a posição. A distribuição automática e
a correção de grafia continuam iguais: as duas trabalham com as claquetes.

Continua a direção da ADR 0006: a unidade é a Produção, e a pauta passa a ser lida a partir dela.
