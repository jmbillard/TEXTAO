# Protótipo de UI

Gere **várias variações de UI radicalmente diferentes** num único arquivo HTML, apresentado na **moldura** ([`moldura/`](moldura/)): um protótipo navegável por dentro (o usuário clica nele como no app), uma barra fixa no topo com as alternativas, o tema e o aparelho, os três aparelhos (celular, tablet, computador) lado a lado e o tema claro, escuro ou os dois. O usuário alterna entre as variantes, escolhe uma (ou rouba pedaços de cada) e depois joga o resto fora.

Se a pergunta for sobre lógica/estado, e não sobre a aparência de algo, este é o ramo errado. Use [LOGIC.md](LOGIC.md).

## Quando este é o formato certo

- "Como esta página deveria ficar?"
- "Quero ver algumas opções para este dashboard antes de me comprometer."
- "Tente um layout diferente para a tela de configurações."
- Qualquer situação em que o usuário, de outro jeito, passaria um dia escolhendo entre três mockups vagos na cabeça.

## O padrão (decidido pelo usuário, vale para todo protótipo de UI)

- **Sempre na moldura.** O conteúdo não tem barra, faixa nem botão de tema próprios: a barra do topo da moldura é o único seletor. A moldura é a "bancada técnica" (grafite, grade, monoespaçada, ciano) de propósito, para não se confundir com o app.
- **O conteúdo tem o visual do app.** O `montar.mjs` injeta o `src/estilos.css` inteiro e as fontes do app em base64 (inclusive a manuscrita Caveat). Use os tokens (`--papel`, `--tinta`, `--ultra`, `--serifa`…) e as classes do app (`.botao`, `.rotulo`, `.logo-app`…), e encoste a variante no resto do app: cabeçalho de verdade, vizinhos de verdade, densidade de verdade. Uma tela solta no vácuo faz toda variante parecer boa. As classes próprias do protótipo levam o prefixo `pr-`: o conteúdo divide o espaço de nomes com o `estilos.css` (um `.item` do protótipo herda o `.item` do app).
- **Dados fictícios.** Nomes, e-mails `@exemplo.com`, claquetes e listas inventados, plausíveis para o domínio. Nada copiado do Trello, do Teable ou do n8n.
- **As três larguras e os dois temas, sempre.** Celular 390, tablet 820 e computador 1440 px, cada um num iframe da largura real: os `@media` do conteúdo valem como no aparelho. O layout se adapta por media query, nunca por largura fixa. O escuro é o do app (`data-theme`), aplicado pela moldura.
- **Navegável por dentro.** A barra do topo só tem alternativas, tema e aparelho; as telas **não** viram botões. O usuário anda pelo protótipo clicando nele, como no app: todo estado importante tem um caminho clicável a partir da tela inicial (botões, links, menus, linhas de lista do próprio protótipo). Os três aparelhos ficam sincronizados: uma troca de tela num deles vale para todos. O estado que não tem caminho natural ("com erro", "fora do ar", "outra pessoa logada") vira uma **alternativa** ou um **gatilho discreto** no próprio conteúdo (uma nota manuscrita `protótipo: simular …`, em Caveat). O manifesto ainda declara as telas: elas dão a tela inicial (a primeira) e a lista das capturas.
- **Fora do repositório.** O protótipo fica no scratchpad da sessão, numa pasta do assunto (`<scratchpad>/<assunto>/`). No repositório fica só a moldura.

## Processo

### 1. Declare a pergunta e escolha N

Por padrão, **3 alternativas**. Mais de 5 deixa de ser radicalmente diferente e começa a ser ruído, então pare aí. Anote o plano em uma linha num comentário no topo do conteúdo:

> "Três alternativas da tela de Configuração, com os estados calmo, com exceções e conferir."

### 2. Escreva o conteúdo

Copie [`moldura/modelo.html`](moldura/modelo.html) para a pasta do assunto e escreva em cima dele. O contrato com a moldura:

- `<script type="application/json" id="manifesto">` com `nome`, `telas` (`[{ id, rotulo }]`, na ordem em que o usuário vai percorrer) e, quando houver, `alternativas` (`[{ id: 'A', rotulo }]`).
- `Moldura.ao(desenhar)`: `desenhar({ tela, alt, tema, aparelho })` desenha a tela e roda de novo a cada troca na barra. Cada tela parte de um estado conhecido, para sair igual em todo aparelho.
- `Moldura.ir(tela)` leva a outra tela, e os outros aparelhos acompanham. É assim que o protótipo navega: marque cada elemento clicável com `data-ir="<tela>"` e um único ouvinte de clique chama `Moldura.ir` (veja o modelo). Detalhes que não são tela do manifesto (um campo digitado, um toast) podem ficar só no estado local do aparelho clicado.
- `html.captura` está ligada durante as capturas: desligue ali animações e o que mais atrapalhar a foto.
- Todo estado fica em memória (variáveis do script). O conteúdo **não usa** `localStorage`, `sessionStorage`, IndexedDB, cookies, `history`, `location` nem `parent`/`top`: o protótipo é aberto em visualizadores que o servem num iframe com sandbox ou em `srcdoc` (origem opaca), onde essas chamadas lançam `SecurityError` (no WebKit, "The operation is insecure"). Se for inevitável, envolva cada chamada em `try/catch` com alternativa em memória. Tela, alternativa e tema chegam só pela moldura (`Moldura.ao`), que já trata esses casos.

As **telas** são todos os estados que o usuário precisa ver para julgar: o caminho calmo, os menus e modais abertos, o erro, o vazio, o cheio. As **alternativas** discordam sobre a estrutura: layout diferente, hierarquia de informação diferente, affordance principal diferente, e não só cores. Três grades de cards levemente ajustadas não são um protótipo de UI, são papel de parede. Se duas saírem parecidas demais, refaça uma com a orientação explícita "não use uma grade de cards".

### 3. Monte

```sh
node .claude/skills/prototype/moldura/montar.mjs <pasta>/conteudo.html <pasta>/prototipo.html
```

Sai um único HTML autocontido (cerca de 1 MB): dá para mandar ao usuário e abrir com dois cliques, inclusive no celular. Monte de novo a cada mudança no conteúdo ou no `src/estilos.css`.

Antes de capturar, percorra o protótipo clicando, a partir da tela inicial, e confira que chega a todas as telas do manifesto. Uma tela a que só se chega pela URL é uma tela que o usuário não vai ver.

### 4. Capture e confira

```sh
node .claude/skills/prototype/moldura/capturar.cjs <pasta>/prototipo.html <pasta>/capturas --moldura
```

O script usa o Playwright já instalado (`require('playwright')`; nunca `playwright install`) e grava `<aparelho>/<nn>-<tela>[-<alt>]-<tema>.png` para cada tela × alternativa × aparelho × tema, em tamanho real e `deviceScaleFactor` 2, mais a própria moldura em `moldura/` (os três aparelhos, "ambos", um aparelho focado, a moldura num celular). `--telas=`, `--alts=` e `--so-moldura` encurtam a volta enquanto você itera.

A conferência termina quando:

- o script diz **"sem erros e nada vazando"** (erros de JavaScript e elementos que passam da largura do aparelho);
- você abriu (Read) toda captura de celular e de computador, nos dois temas, e as de tablet de cada tela que muda de layout entre 700 e 1000 px, e não há texto cortado, sobreposição, contraste ruim no escuro nem fonte trocada, que o script não pega.

### 5. Entregue

Mande o caminho absoluto do HTML montado e as capturas da moldura. Para apontar um estado, use o hash: `prototipo.html#tela=conferir&alt=B&tema=ambos&foco=celular`. O usuário navega clicando no protótipo. Na moldura: `[` `]` trocam a alternativa, `T` o tema, `0`–`3` o aparelho e `Esc` volta aos três; o `↗` de cada aparelho abre só o conteúdo em outra aba. Num visualizador restrito (sandbox, `srcdoc`) o hash não é atualizado e o `↗` some; o resto funciona em memória. O retorno interessante costuma ser **"quero o cabeçalho da B com a barra lateral da C"**, que é o design que ele de fato quer.

### 6. Registre a resposta

Depois que uma alternativa vencer, registre a resposta (qual alternativa, por quê, e a pergunta que ela resolveu) do jeito que a [SKILL](SKILL.md) descreve, e reescreva a vencedora direito no código real. O protótipo continua no scratchpad.

## Antipadrões

- **Alternativas que só diferem em cor ou texto.** Isso é um ajuste, não um protótipo. Alternativas de verdade discordam sobre a estrutura.
- **Compartilhar código demais entre alternativas.** Um cabeçalho compartilhado tudo bem; um layout compartilhado anula o propósito. Cada alternativa deve ter liberdade para jogar fora o layout.
- **Ligar o protótipo a dados ou serviços reais.** A pergunta é "como isso deveria ficar", não "o backend funciona".
- **Promover o protótipo direto para produção.** O código foi escrito sob as restrições de protótipo (sem testes, tratamento de erros mínimo). Reescreva-o direito quando for incorporá-lo.
