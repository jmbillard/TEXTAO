# PROMeiro

Editor de roteiros de chamadas do Promo. Substitui o Word na escrita, padroniza as marcações e entrega, no fim, um roteiro limpo com metadados e a lista de artes.

Importar, editar e exportar acontecem no navegador. Os roteiros ficam guardados de duas formas, conforme onde o app roda:

- **Com o servidor (container):** num banco SQLite, ligados ao e-mail de quem escreveu, com histórico de versões.
- **Como site estático (Cloudflare Pages, por exemplo):** no próprio navegador (IndexedDB), sem conta nem histórico.

## Rodar

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` gera o site estático em `dist/`. Para conferir o build localmente: `npm run preview`.

Para desenvolver com o servidor, rode em outro terminal (porta 8787, com perfil local liberado; o `npm run dev` já encaminha `/api` para ele):

```bash
npm run servidor
```

### Cloudflare Pages

Conecte o repositório em **Workers & Pages → Create → Pages** com:

- Build command: `npm run build`
- Build output directory: `dist`

Nesse modo não há servidor: cada pessoa guarda os roteiros no próprio navegador.

### Docker / Portainer

O repositório traz `Dockerfile` e `docker-compose.yml`. O container entrega o site e guarda os roteiros em SQLite, no volume `roteirista-dados`.

No Portainer: **Stacks → Add stack → Repository**, com a URL deste repositório, a branch e o caminho `docker-compose.yml`. Para mudar a porta (padrão 8080), adicione a variável de ambiente `PORTA` na stack. Depois do deploy, o app fica em `http://IP-DO-SERVIDOR:8080`.

Na linha de comando:

```bash
docker compose up -d --build
```

Variáveis da stack: o modelo completo, em blocos e comentado, está em [`stack.env.exemplo`](stack.env.exemplo).
Todas são opcionais; vazia, aquela parte fica desligada, e o log da partida diz o que falta.

| Bloco | Variáveis | Para quê |
|---|---|---|
| Acesso | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `PERFIL_LOCAL`, `ACESSO`, `PROMEIRO_URL` | Login pelo Cloudflare Access, modo sem login (demonstração), quem vê o quê e o endereço público |
| Servidor | `PORTA`, `BACKUPS`, `REDE_TEABLE`, `REDE_N8N`, `REDIS_URL` | Porta publicada, backups diários, redes Docker do Teable e do n8n (onde está o Stirling-PDF) e cache da fila ao vivo |
| Teable: API | `TEABLE_URL`, `TEABLE_TOKEN`, `TEABLE_ATRACOES`, `TEABLE_CADASTRO`, `TEABLE_REDATORES`, `TEABLE_EDITORES`, `TEABLE_KEY_EDITORES`, `TEABLE_PAUTA`, `TEABLE_ARTE_PRODUCAO` | Atrações, redatores e editores para reconhecer os roteiros, os cadastros e o registro de cada envio. Um token só, que lê e grava |
| Teable: Postgres | `TEABLE_PG_URL`, `TEABLE_PG_ESQUEMA`, `TEABLE_PG_*` | Consultas só de leitura: pauta da edição, duplicados, editor, atração, prioridade, sessões de filmes e o andamento dos cards na fila (status, designers e entrega da `ARTE_producao`, que o n8n sincroniza com o Trello) |
| Cadastros | `CADASTRO_ADMINS` | Quem pode remover cadastros |
| Trello | `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_LISTA` e `TRELLO_LISTA_SP/_RJ/_G5/_INTER` (entradas por praça; RJ e G5 podem repetir), `TRELLO_SAIDA_*`, `TRELLO_CAMPO*`, `TRELLO_PRACAS`, `TRELLO_PRIORIDADE_ALTA` | Envio do roteiro como card. Sem chave, token e ao menos uma entrada, o envio fica desligado |
| OneDrive | `SFTP_HOST`, `SFTP_USUARIO`, `SFTP_SENHA` | Cópia do arquivo original |
| Túnel | `COMPOSE_PROFILES=tunel`, `TUNNEL_TOKEN` | Subir um cloudflared junto |

Com o Teable configurado, a atração é reconhecida pela chave da claquete e os campos de redator e editor sugerem os nomes cadastrados.
A última leitura boa do Teable (atrações, redatores, editores e a pauta recente) fica numa cópia no banco do app: com o Teable ou o Postgres dele fora do ar, inclusive logo depois de reiniciar o container, o app segue com essa cópia e avisa no log desde quando ela é.
Nomes de campo diferentes do padrão (`TEABLE_CAMPO_*`), a pasta do OneDrive (`SFTP_PASTA`) e a porta do SFTP (`SFTP_PORTA`): acrescente a linha no `environment` do compose.

**Dados e backup.** O banco é `/dados/roteirista.db`. Uma vez por dia o servidor grava uma cópia em `/dados/backup/roteirista-AAAA-MM-DD.db`. Mantenha o volume em disco local (SQLite não combina com pasta de rede) e copie a pasta `backup` para outro lugar de tempos em tempos. Para restaurar, pare o container e ponha a cópia no lugar de `roteirista.db`.

**Quem vê o quê.** Cada pessoa vê só os próprios roteiros. No editor, o botão de acesso deixa o dono escolher, pessoa por pessoa (na lista de quem já entrou na plataforma), entre **sem acesso**, **pode ver** e **pode editar**. Há também **Só eu** (100% privado) e **Todos podem ver**. Só o dono muda o acesso, apaga o roteiro e vê o histórico. Quem só vê pode exportar ou **duplicar para editar** a própria cópia.

**Edição simultânea.** Quem pode editar escreve junto, ao mesmo tempo: o texto e o cabeçalho aparecem para todos em tempo real, cada pessoa com seu cursor e sua cor, e o topo mostra quem está no roteiro. Funciona por uma conexão WebSocket em `/api/colab/<id>`, que passa pelo túnel do Cloudflare sem configuração extra. Quem só vê acompanha ao vivo, mas o servidor descarta qualquer alteração que venha dela. Ao mudar o acesso, os convidados são reconectados e conferidos de novo.

**Linha do tempo.** O controle deslizante no rodapé do editor percorre as edições da sessão: para trás desfaz, para frente refaz até o ponto atual. Vale para o texto do roteiro (os campos do cabeçalho não entram) e recomeça quando a página é recarregada; para voltar mais longe, use o histórico. Só aparece em roteiro individual; quando o roteiro é compartilhado com alguém, o controle some e fica o desfazer comum do teclado.

**Histórico.** O servidor guarda uma versão ao criar, a cada 5 minutos de edição e sempre que o roteiro é exportado ou restaurado. Só o dono vê e restaura versões.

Sem `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`, o servidor confia no e-mail que o Cloudflare Access envia no cabeçalho. Isso só é seguro se ninguém alcança o container sem passar pelo túnel; nesse caso, não publique a porta fora da sua rede.

### Login pelo Cloudflare Access (túnel)

O app não tem tela de login: quem controla a entrada é o Cloudflare Access, na frente do site. Quando alguém entra por ele, o app lê o nome e o e-mail da pessoa (em `/cdn-cgi/access/get-identity`) e assina os roteiros com eles. Sem o Access, a pessoa se identifica num perfil local, que não é controle de acesso.

1. **Túnel.** No Zero Trust, em **Networks → Tunnels**, adicione um *public hostname* (ex.: `roteiros.seudominio.com`) apontando para `http://promeiro:80` se o cloudflared estiver na mesma rede Docker, ou para `http://IP-DO-SERVIDOR:8080`. Sem cloudflared rodando, use o serviço `tunel` deste compose: defina `COMPOSE_PROFILES=tunel` e `TUNNEL_TOKEN` nas variáveis da stack.
2. **Access.** Em **Access → Applications → Add → Self-hosted**, use o mesmo hostname, sem caminho, e crie uma política *Allow* com os e-mails (ou o domínio) liberados.
3. **Microsoft 365, quando a TI liberar.** Em **Settings → Authentication → Login methods**, adicione *Microsoft Entra ID* com os dados do aplicativo registrado pela TI e selecione esse método na aplicação do Access. Nada muda no app.

Copie o **AUD Tag** da aplicação e o domínio da equipe para `ACCESS_AUD` e `ACCESS_TEAM_DOMAIN` na stack.

No app, toda a identidade passa por `src/dados/identidade.ts`; no servidor, por `identificar` em `servidor/app.mjs`. Cada roteiro guarda `criadoPor` e `alteradoPor` (nome e e-mail), que também saem no `.json`.

## Como funciona

1. **Trazer do Word.** Arraste um `.docx`, `.rtf`, `.pdf` ou `.txt` (ou um `.json` exportado daqui). O app lê sublinhado, marca-texto, cor e tabelas, monta o cabeçalho e só pergunta o que não dá para saber sozinho (o que significa um marca-texto, por exemplo).
2. **Escrever.** Texto corrido ou duas colunas (Ilustração | Áudio, Instruções | Texto). CAIXA ALTA é locução; uma linha que começa com origem e timecode é sonora. Nada disso muda o que foi digitado, só a aparência.
3. **Marcar.** Selecione e use o botão direito, a barra que aparece sobre a seleção ou o atalho:

   | Marcação | Atalho | Sai em |
   |---|---|---|
   | Arte (sublinhado) | Ctrl/⌘ U | `artes[]` |
   | Orientação para a edição | Ctrl/⌘ Shift 1 | `orientacoes.edicao` |
   | Orientação para o locutor | Ctrl/⌘ Shift 2 | `orientacoes.locutor` |
   | Sonoplastia | Ctrl/⌘ Shift 3 | `orientacoes.sonoplastia` |
   | Pode cortar | Ctrl/⌘ Shift 4 | `trechosCortaveis[]` |
   | Nota de produção | Ctrl/⌘ Shift 5 | `orientacoes.producao` |
   | Comentário (não é lido) | Ctrl/⌘ Shift M | `comentarios[]` |

   Cada arte tem um tipo: rodapé/GC, tela cheia, lettering em alpha, logo, versão, selo ou outro. O app sugere o tipo e marca como "sugerido" até alguém confirmar.
4. **Exportar.** Roteiro em Word (padronizado, com a lista de artes no fim), dados em `.json`, lista de artes para colar, ou impressão/PDF.

## PDF do card

O PDF anexado ao card é sempre o roteiro **como chegou**: nada da revisão entra nele. O que a revisão corrige (artes
excluídas, editor, atração…) vai no checklist, na descrição e nos campos do card.

- Arquivo que já é PDF: vai como veio.
- Word e RTF, com `STIRLING_URL`: convertidos pelo Stirling-PDF (LibreOffice), idênticos ao original.
- Sem o Stirling (ou se ele falhar): o PDF sai do **texto do arquivo original**, guardado na importação trecho a
  trecho, com o sublinhado exatamente como o redator deixou (nem mais, nem menos; até o de link ou de orientação),
  sem a lista de artes no fim. A diagramação é a do PROMeiro; o conteúdo e o sublinhado, os do original.
- Roteiros guardados antes disso: a primeira versão do histórico (o que foi importado).

## Acervo de artes

O que cada atração já tem pronto, para não produzir de novo. Liga com `TEABLE_ACERVO` (o ID da tabela, para gravar) e
`TEABLE_PG_ACERVO` (o nome dela no Postgres, para ler); sem elas, nada muda.

Tabela **ARTES_acervo** no Teable, uma linha por arte:

| Campo | Tipo | |
|---|---|---|
| `arte` | texto | "HOJE" |
| `key` | fórmula | a arte sem acento, caixa e pontuação (fórmula abaixo); o PROMeiro compara por ela |
| `tipo` | seleção | lettering, rodapé, cartão…; preenchido à mão ou por script, nunca pelo PROMeiro |
| `atracao` | vínculo → atrações | a arte é da atração, de qualquer praça |
| `claquete` | vínculo → ARTE_producao | o card (a claquete) em que foi pedida |
| `filme` | texto | só nas sessões de filme: a key do título e o ano ("RIVAIS 2024"); o PROMeiro grava |

Fórmula do `key` (a mesma regra do app: sem acento, maiúsculas, o que não é letra ou número vira espaço):

```
TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(UPPER({arte}),"[ÁÃÂÄÀáãâäà]","A"),"[ÉÊËẼÈéêëẽè]","E"),"[ÍÏÎĨÌíïîĩì]","I"),"[ÓÔÕÖÒóôõöò]","O"),"[ÜÚÛÙŨüúûùũ]","U"),"[Çç]","C"),"[Ññ]","N"),"[^A-Z0-9]+"," "))
```

E uma coluna de texto **`artes_existentes`** na ARTE_producao, com as artes de cada envio que já existiam.

- **Na chegada**, as artes do roteiro que estão no acervo da atração são contadas ("Já existem: N") e o roteiro
  espera a revisão.
- **Na revisão**, a que já existe tem o número apagado na lista; a claquete e o tipo de onde veio aparecem ao passar o
  mouse. Quem revisa confere no servidor e, se achar, exclui a arte com o × (Ctrl+Z desfaz). O que sobra vai para o
  checklist.
- **Sessões de filme**: o pacote gráfico é do filme, não da sessão. Pela sessão e pelo dia de exibição, o log do bot
  (`TEABLE_PG_LOG_BOT`) diz qual é o filme (key e ano); o que ele já tem pronto é tudo o que está nos checklists das
  prévias dele, em qualquer sessão, usado ou não, mais as artes das claquetes dele que já saíram (gravadas com `filme`).
  Mesmo título com outro ano é outro filme.
- **Quando o card sai** (status FINALIZADO ou entregue), as artes novas dele entram no acervo da atração.
- **Pacote gráfico novo**: em Cadastros, na atração, "novo pacote" apaga do acervo todas as artes dela (só
  `CADASTRO_ADMINS`).
- **O histórico**: `node scripts/acervo-historico.mjs --desde AAAA-MM-DD` mostra o que entraria; com `--gravar`,
  grava (com as mesmas variáveis do servidor).

## Formato de dados (`.json`, versão 1.0)

O JSON Schema está em `src/modelo/schema.ts`. Resumo:

```jsonc
{
  "schemaVersion": "1.0",
  "exportadoEm": "2026-10-27T14:32:00.000Z",
  "roteiro": { "id", "titulo", "programa", "tipoPrograma", "dataExibicao", "capitulo", "edicao", "praca",
               "redator", "locutor", "selo", "duracaoAlvoSeg", "duracaoModo", "duracaoEstimadaSeg",
               "versoes", "layout", "status", "revisao", "atualizadoEm" },
  "artes": [{ "id", "ordem", "texto", "subtipo", "subtipoNome", "grupoVersoes", "observacao", "conferida",
              "contexto": { "coluna", "trechoAnterior", "trechoPosterior" }, "status" }],
  "orientacoes": { "edicao": [], "locutor": [], "sonoplastia": [], "producao": [] },
  "comentarios": [],
  "trechosCortaveis": [],
  "sonoras": [{ "ordem", "origem", "origemOriginal", "bloco", "timecodeEntrada", "timecodeOriginal",
                "personagem", "descricaoImagem", "fala" }],
  "texto": { "completo", "locucao", "markdown" },
  "blocos": { }  // documento completo do editor; é o que reabre o roteiro
}
```

Os IDs de roteiro, artes e etiquetas são estáveis: exportar de novo atualiza, não duplica.

## Organização do código

| Pasta | O que tem |
|---|---|
| `src/importar` | Leitura de `.docx` (XML via JSZip), `.rtf` (cp1252), `.pdf` (pdf.js, com OCR para página digitalizada em `ocr.ts`) e `.txt`, e a interpretação: cabeçalho, artes, etiquetas, perguntas |
| `src/modelo` | Tipos, vocabulários, reconhecimento de sonoras, exportação para o JSON e o JSON Schema |
| `src/editor` | Extensões do Tiptap: marcas de arte e etiqueta, colunas, atalhos, reconhecimento visual |
| `src/ui` | Telas (biblioteca, importação, editor), ícones e exportação para Word |
| `src/dados` | Persistência e identidade. A interface `Armazenamento` tem duas implementações: servidor e navegador |
| `servidor` | API, arquivos estáticos e edição simultânea em Node, com SQLite (`node:sqlite`), `ws` e Yjs |
| `tests` | Testes do importador com os 5 roteiros reais e do servidor (privacidade, permissões, edição simultânea, versões, backup) |

Os leitores de RTF e de PDF foram adaptados do extrator do app de upload de roteiros.

## Decisões registradas

- **Sublinhado é arte.** Só o que está sublinhado vira arte. "Encerra logo Encontro" sem sublinhado vira orientação para a edição.
- **Uma arte por versão.** `AMANHÃ/HOJE` sublinhado vira duas artes, ligadas por `grupoVersoes`. Vale na importação e ao marcar no editor.
- **O texto não é reescrito.** Sonoras, cortes (`//`) e marcas (`/edit/`, `/enx/`, `+`) são reconhecidos pelo que está escrito; apagar ou mudar o texto desfaz o reconhecimento.
- **Cabeçalho sai do corpo.** `LOC:`, `SELO`, `FECHAR COM 30''`, `REDATORA:`, a linha de título e a legenda "Em vermelho se precisar cortar" viram campos e deixam o texto. A tela de importação lista tudo o que foi movido.
- **Data de exibição.** Vale a da linha de título (ou do nome do arquivo). Uma data solta no cabeçalho é tratada como data de redação e só fornece o ano.
- **Redator.** Vem de `REDATORA:` no texto ou do autor do arquivo. Se o arquivo não traz autor (RTF, TXT), vale o início do e-mail de quem importou (`joao.silva`).
- **PDF.** O PDF não guarda estrutura, só o desenho da página; o app a reconstrói. Sublinhado é todo traço horizontal fino logo abaixo de uma palavra (ou anotação de sublinhado). Colunas vêm das bordas verticais da tabela ou, sem bordas, de várias linhas começando no mesmo ponto. Marca-texto é a faixa colorida atrás do texto. Negrito vem do nome da fonte. A cor do texto (o vermelho de "pode cortar") não é lida. Quando houver o `.docx`, ele é sempre a melhor origem.
- **PDF digitalizado (OCR).** Página que é só imagem é lida por reconhecimento de texto (Tesseract, em português), no próprio navegador: nada sai do computador. Sublinhado, bordas de tabela e marca-texto são achados nos pixels da imagem e passam pelas mesmas regras do PDF comum. O motor (uns 5 MB) é servido pelo próprio app, copiado para `public/ocr` no build (`scripts/preparar-ocr.mjs`), e só é baixado quando aparece o primeiro PDF digitalizado. Roteiro lido assim sempre entra na fila para revisar, até alguém marcar "Conferido" no editor.
- **Vermelho.** Com a legenda no roteiro, vira "pode cortar" sem perguntar. Sem a legenda, o app pergunta.
- **Uma etiqueta por trecho; arte convive com etiqueta.** Etiquetar por cima troca a anterior.
- **Negrito** só é mantido nas falas das sonoras. Locução fica em texto limpo.
- **Tempo estimado.** Locução a 2,6 palavras por segundo e falas a 3 (constantes em `src/modelo/exportar.ts`). É uma referência, com 10% de folga antes de avisar.
- **Quebra manual é parágrafo.** No Word, muita gente separa as linhas com Shift+Enter. Na importação, cada linha vira um parágrafo.
- **"LOC:" e "OFF Fulano:" no corpo** marcam uma linha de locução, mesmo em minúsculas. No cabeçalho, "LOC: NOME" (curto, sem pontuação) é o locutor.
- **Pedido de arte não é locução.** Linhas como "LETTERING: …", "(Arte: …)", "(logo JH)", "Fecha com logo …" e "Passagem//" viram orientação para a edição e ficam fora do texto lido.
- **Sublinhado que é caminho de rede ou link** não vira arte; "Ilustrar com imagens de…" sublinhado vira orientação para a edição.
- **Colunas sem título.** Sem a linha ILUSTRAÇÃO | ÁUDIO, o app confere de que lado está o texto falado e, se for o esquerdo, troca as colunas para o padrão.
- **Mais de uma chamada no mesmo arquivo** (plano A e plano B, por exemplo): o cabeçalho vale o da primeira e o texto entra todo no mesmo roteiro. Separar em roteiros diferentes ainda é manual.
- **Tudo a partir de "DECUPAGEM"** fica de fora, como no app de upload.
- **Fixtures.** Os roteiros em `tests/fixtures` são reais, com o contato da produção e o caminho de rede trocados por valores fictícios.

## Fora desta etapa

Envio para n8n/Trello, uso offline como app instalado (PWA), tela de Configurações para editar os vocabulários (hoje em `src/modelo/vocabularios.ts`), troca de voz, prévia por versão e modos locutor/Motion.
