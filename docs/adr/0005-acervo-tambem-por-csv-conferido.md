# O acervo também se alimenta por CSV conferido no PROMeiro

Até aqui o acervo crescia por dois caminhos: o envio dos roteiros (as artes novas e as ✓ entram quando o card sai,
ADR 0003) e cargas feitas à mão por fora, com scripts. A atração com anos de artes prontas na pasta de output e quase
nada no acervo fazia o PROMeiro pedir de novo o que já existia.

Agora há um terceiro caminho, dentro do PROMeiro: na ficha da atração (Cadastros › Atrações), um administrador importa
o CSV exportado da pasta de output (`nome;caminho;criado em`). O servidor converte cada arquivo numa arte (o prefixo
"SIGLA - " é o tipo) e a classifica contra o acervo da atração com a mesma chave da arte do envio; a pessoa confere
antes de gravar. Ao gravar, o PROMeiro relê o acervo, cria as artes novas e dá o tipo às que estavam sem, pela API do
Teable.

Com isso, o tipo da arte passa a ser gravado também pelo PROMeiro, e não só à mão. Para o campo de seleção não ganhar
opções por engano, o tipo é sempre conferido contra as opções do campo antes de gravar: o que não é opção é recusado
e nada é gravado. Só a atração de acervo próprio importa; a de acervo do filme e a sem acervo, não.

Na conferência, o nome parecido com um do acervo pergunta de que lado está o erro. Quando o erro está no acervo, a
gravação renomeia a mesma linha (o mesmo id), em vez de criar outra e deixar a errada; a resposta do gravar devolve o
nome antigo de cada linha renomeada. O gravar recebe o CSV e as escolhas de quem conferiu e classifica de novo contra o
acervo relido: com decisão pendente, nada é gravado.
