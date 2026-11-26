# Protótipo de UI

Gere **várias variações de UI radicalmente diferentes** num único arquivo HTML, apresentado na **moldura** ([`moldura/`](moldura/)): um protótipo que é **o app rodando** (o usuário clica nele como no app, e ele se comporta como o app), uma barra fixa no topo com as alternativas, o tema e o aparelho, os três aparelhos (celular, tablet, computador) lado a lado e o tema claro, escuro ou os dois. O usuário alterna entre as variantes, escolhe uma (ou rouba pedaços de cada) e depois joga o resto fora.

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
- **Um app rodando, não uma sequência de telas.** A barra do topo só tem alternativas, tema e aparelho; as telas **não** viram botões. O usuário anda pelo protótipo clicando nele, e ele se comporta como o app: o menu abre ali mesmo, a escolha troca só a região que muda, com a transição do app, e o resto da página (o topo, o scroll, o que estava aberto, o que foi digitado) continua vivo. Todo estado importante tem um caminho clicável a partir da tela inicial. Os três aparelhos ficam sincronizados na **tela**: o aparelho clicado anima como o app, os outros acompanham em silêncio (sem animar, sem piscar). O estado que não tem caminho natural ("com erro", "fora do ar", "outra pessoa logada") vira uma **alternativa** ou um **gatilho discreto** no próprio conteúdo (uma nota manuscrita `protótipo: simular …`, em Caveat).
- **Estado local × tela.** **Tela** é uma rota do app (a Fila, o Redator, um roteiro aberto): passa por `Moldura.ir` e os três aparelhos vão juntos. Todo o resto é **estado local** do conteúdo (um menu ou balão aberto, um filtro, a exibição escolhida, um campo digitado, uma seção expandida, a caixinha de desfazer, o item em foco): muda uma variável e `Moldura.desenhar()`, fica só no aparelho clicado e **nunca** passa por `Moldura.ir`. Na dúvida: se o app mudaria o endereço, é tela; se não, é estado local.
- **Nada de redesenhar a página inteira.** Nada de `innerHTML` da página, nem de "zerar o estado e desenhar tudo" a cada clique: é isso que faz cada clique parecer uma tela nova (o `.pagina` do app toca o `surgir` de novo, o topo é recriado, o foco e o scroll se perdem). A página é dividida em **partes** (`data-parte`) que o runtime morfa: só o que mudou é tocado.
- **As transições do app.** Use as do `src/estilos.css`, não invente: trocar de tela anima só o corpo (`m-surgir`, o `surgir` da `.pagina`); menus e painéis abrem com o `abrir` que as classes do app já têm (`.menu`, `.perfil-painel`); o que entra ou sai de uma lista abre ou fecha a vaga (`Moldura.vaga`, as `vaga-*` de `ui/vagas.tsx`; mais de 12 de uma vez não animam); um valor que troca no lugar esmaece (`m-trocar`); a caixinha preta de desfazer é a `.desfazer` do app (`surgir`).
- **Fora do repositório.** O protótipo fica no scratchpad da sessão, numa pasta do assunto (`<scratchpad>/<assunto>/`). No repositório fica só a moldura.

## Processo

### 1. Declare a pergunta e escolha N

Por padrão, **3 alternativas**. Mais de 5 deixa de ser radicalmente diferente e começa a ser ruído, então pare aí. Anote o plano em uma linha num comentário no topo do conteúdo:

> "Três alternativas da tela de Configuração, com os estados calmo, com exceções e conferir."

### 2. Escreva o conteúdo

Copie [`moldura/modelo.html`](moldura/modelo.html) para a pasta do assunto e escreva em cima dele. O contrato com a moldura (o [`runtime.js`](moldura/runtime.js) explica cada peça):

- `<script type="application/json" id="manifesto">` com `nome`, `telas` (`[{ id, rotulo }]`: as **rotas** do app; a primeira é a inicial), `cenas` quando houver (`[{ id, tela, rotulo }]`: uma tela com um estado local já preparado, como o menu aberto, só para o hash e as capturas; um clique nunca vira cena) e `alternativas` quando houver (`[{ id: 'A', rotulo }]`).
- **Partes.** `Moldura.partes({ topo: () => html, corpo: () => html, … })` registra as regiões (`<div data-parte="corpo">`). `Moldura.desenhar()` redesenha as partes **morfando** o DOM: o mesmo nó continua o mesmo nó, então foco, cursor, texto digitado, scroll interno e transições de CSS sobrevivem. Numa lista que muda, dê `data-chave` a cada item (ou use `Moldura.vaga(chave, html, 'li'|'div')`, que ainda abre e fecha a vaga como o app).
- **Roteador.** `Moldura.tela` é a tela atual; uma tela pode levar um parâmetro depois da barra (`roteiro/r3`). `Moldura.ir(tela)` troca a tela neste aparelho na hora e leva os outros junto. `Moldura.ao('tela', (nova, anterior, como) => …)` roda no começo (`anterior` nulo, `como.inicio`) e a cada troca: feche ali os menus da página, aplique `como.cena` se vier, chame `Moldura.desenhar()` e, só se `!como.silencioso`, `Moldura.animar(corpo, 'm-surgir')`. `Moldura.ao('alt', …)` idem para a alternativa da barra.
- Um único ouvinte de clique no documento decide: estado local → muda a variável e `Moldura.desenhar()`; trocar de tela → `Moldura.ir`. Clicar fora e `Esc` fecham o que estiver aberto, como no app.
- `html.captura` está ligada durante as capturas: o runtime já não anima nada ali; desligue o que mais atrapalhar a foto.
- Todo estado fica em memória (variáveis do script). O conteúdo **não usa** `localStorage`, `sessionStorage`, IndexedDB, cookies, `history`, `location` nem `parent`/`top`: o protótipo é aberto em visualizadores que o servem num iframe com sandbox ou em `srcdoc` (origem opaca), onde essas chamadas lançam `SecurityError` (no WebKit, "The operation is insecure"). "Lembrado por pessoa" num protótipo é um objeto em memória por pessoa. Tela, alternativa e tema chegam só pela moldura, que já trata esses casos e nunca recarrega um iframe por causa de um clique.

As **telas e cenas** juntas são todos os estados que o usuário precisa ver para julgar: o caminho calmo, os menus e modais abertos (cenas), o erro, o vazio, o cheio. As **alternativas** discordam sobre a estrutura: layout diferente, hierarquia de informação diferente, affordance principal diferente, e não só cores. Três grades de cards levemente ajustadas não são um protótipo de UI, são papel de parede. Se duas saírem parecidas demais, refaça uma com a orientação explícita "não use uma grade de cards".

### 3. Monte

```sh
node .claude/skills/prototype/moldura/montar.mjs <pasta>/conteudo.html <pasta>/prototipo.html
```

Sai um único HTML autocontido (cerca de 1 MB): dá para mandar ao usuário e abrir com dois cliques, inclusive no celular. Monte de novo a cada mudança no conteúdo ou no `src/estilos.css`.

Antes de capturar, percorra o protótipo clicando, a partir da tela inicial, e confira que chega a todas as telas e cenas do manifesto. Uma tela a que só se chega pela URL é uma tela que o usuário não vai ver. Confira também que é um app: abrir um menu não troca o topo, trocar de tela não pisca os outros aparelhos e um campo digitado não perde o foco.

### 4. Capture e confira

```sh
node .claude/skills/prototype/moldura/capturar.cjs <pasta>/prototipo.html <pasta>/capturas --moldura
```

O script usa o Playwright já instalado (`require('playwright')`; nunca `playwright install`) e grava `<aparelho>/<nn>-<tela ou cena>[-<alt>]-<tema>.png` para cada tela e cena × alternativa × aparelho × tema, em tamanho real e `deviceScaleFactor` 2, mais a própria moldura em `moldura/` (os três aparelhos, "ambos", um aparelho focado, a moldura num celular). `--telas=`, `--alts=` e `--so-moldura` encurtam a volta enquanto você itera.

A conferência termina quando:

- o script diz **"sem erros e nada vazando"** (erros de JavaScript e elementos que passam da largura do aparelho);
- você abriu (Read) toda captura de celular e de computador, nos dois temas, e as de tablet de cada tela que muda de layout entre 700 e 1000 px, e não há texto cortado, sobreposição, contraste ruim no escuro nem fonte trocada, que o script não pega.

### 5. Entregue

Mande o caminho absoluto do HTML montado e as capturas da moldura. Para apontar um estado, use o hash: `prototipo.html#tela=redator&cena=de-quem&tema=ambos&foco=celular`. O usuário navega clicando no protótipo. Na moldura: `[` `]` trocam a alternativa, `T` o tema, `0`–`3` o aparelho e `Esc` volta aos três; o `↗` de cada aparelho abre só o conteúdo em outra aba. Num visualizador restrito (sandbox, `srcdoc`) o hash não é atualizado e o `↗` some; o resto funciona em memória. O retorno interessante costuma ser **"quero o cabeçalho da B com a barra lateral da C"**, que é o design que ele de fato quer.

### 6. Registre a resposta

Depois que uma alternativa vencer, registre a resposta (qual alternativa, por quê, e a pergunta que ela resolveu) do jeito que a [SKILL](SKILL.md) descreve, e reescreva a vencedora direito no código real. O protótipo continua no scratchpad.

## Antipadrões

- **Uma tela por clique.** Abrir um menu, um balão ou uma seção com `Moldura.ir`, ou redesenhar a página inteira a cada clique: o protótipo vira uma sequência de slides e deixa de mostrar o app.

- **Alternativas que só diferem em cor ou texto.** Isso é um ajuste, não um protótipo. Alternativas de verdade discordam sobre a estrutura.
- **Compartilhar código demais entre alternativas.** Um cabeçalho compartilhado tudo bem; um layout compartilhado anula o propósito. Cada alternativa deve ter liberdade para jogar fora o layout.
- **Ligar o protótipo a dados ou serviços reais.** A pergunta é "como isso deveria ficar", não "o backend funciona".
- **Promover o protótipo direto para produção.** O código foi escrito sob as restrições de protótipo (sem testes, tratamento de erros mínimo). Reescreva-o direito quando for incorporá-lo.
