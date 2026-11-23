# A ARTE_producao só recebe claquetes de roteiro; card de filme vive na exibição

A ARTE_producao é a produção que nasce de um roteiro com claquete própria. Os cards de filme (prévia, FilmeBOT,
Sessão Natal, Ano Novo) não entram nela: o registro de cada card de filme é a **exibição** (tabela `exibicoes`, com o
`card_ID` e as artes do card), e o andamento (etiquetas, membros, concluído) a fila lê direto do card no Trello.
Decidido em 23/11/2026, quando os 41 cards de filme que tinham entrado foram tirados (backup guardado).

**Consequências**: o fluxo CARDS v10 do n8n não grava produção; o PROMO: DB não acompanha card de filme; o acervo
do filme é registrado pelo servidor do PROMeiro (de 10 em 10 min), pelos cards que saíram.
