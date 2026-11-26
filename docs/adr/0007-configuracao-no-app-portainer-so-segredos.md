# Configuração no app; Portainer só para segredos e infraestrutura

Onde as coisas estão no Trello e no Teable (o quadro, as listas, os campos, as opções, as etiquetas, a base e as
tabelas), as praças e os administradores eram cerca de 70 variáveis do Portainer, a maioria ids opacos: mudar uma lista
era achar o id à mão, colar e refazer o deploy, e o id errado só aparecia quando um card ia para o lugar errado.

Agora isso mora na tela de **Configuração** do app e fica guardado no SQLite do PROMeiro (entra no backup e não depende
do Teable para o app subir). O PROMeiro liga pelo nome e guarda o id; salvar passa pela conferência e vale na hora,
sem reiniciar; toda gravação entra no histórico, com voltar.

No Portainer ficam só os **segredos** (os tokens do Teable e do Trello, o endereço do Postgres, a senha do SFTP, a
chave do Stirling, o token do túnel), a **infraestrutura** (portas, redes, endereços, o Access, os backups, o n8n, o
Stirling, o SFTP, a pasta dos filmes, o ACESSO) e a **chave-mestra** CADASTRO_ADMINS (quem está nela é sempre
administrador, para ninguém se trancar fora).

A migração é gradual: o valor salvo na tela vale; sem ele, vale o Portainer, e na primeira vez a tela começa com os
valores do Portainer. Por isso o exemplo de ambiente e o compose ainda trazem as variáveis que a tela substitui, num
bloco de opcionais ("pode ficar vazia: a Configuração do app guarda"), e a página "Pode apagar do Portainer" diz quais
já têm o valor salvo e podem sair.

Com o Trello ou o Teable fora do ar, a tela mostra o salvo com os nomes da última leitura (guardada no SQLite) e trava
a edição da parte que depende dele: sem ler, nada é conferido, e sem conferir, nada é salvo.

**Consequências:** variável nova que diz onde algo está no Trello ou no Teable vai para a tela, não para o Portainer;
o que fica no Portainer é segredo ou infraestrutura. O n8n continua com os ids escritos nos fluxos dele (a tela só
avisa o que ajustar). Mais de uma instância do PROMeiro compartilhando a configuração não é coberto.
