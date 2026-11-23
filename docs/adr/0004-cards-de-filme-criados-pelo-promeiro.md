# Os cards de filme são criados pelo PROMeiro; o n8n só lê a prévia

A aba Filmes substitui o FilmeBOT. O n8n continua com a leitura de cada página da prévia por IA (título, ano,
sessão, data, inédito), mas a conferência com o banco (título sem artigos, candidatos nos ambíguos, card que já
existe, artes já existentes), a criação do card no Trello e a gravação no Teable (exibição com as artes, filme novo,
ano, pôster no cadastro) passam a ser do PROMeiro, como já acontece com os cards de roteiro.

Assim o envio de filmes e o de roteiros ficam no mesmo lugar, testados juntos, e a regra do card não se divide entre
dois sistemas. O caminho de envio do fluxo CARDS no n8n fica parado como reserva, sem ser chamado pela aba.
