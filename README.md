# Roteirista

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

Variáveis da stack (todas opcionais):

| Variável | Para quê |
|---|---|
| `PORTA` | Porta publicada no servidor (padrão 8080) |
| `ACCESS_TEAM_DOMAIN` | Ex.: `minhaequipe.cloudflareaccess.com`. Com `ACCESS_AUD`, o servidor confere a assinatura do Cloudflare Access em cada pedido |
| `ACCESS_AUD` | *Application Audience (AUD) Tag* da aplicação do Access |
| `PERFIL_LOCAL` | `1` libera o uso sem login: cada pessoa informa nome e e-mail no app. Só para demonstração, porque qualquer um pode informar qualquer e-mail |
| `BACKUPS` | Quantos backups diários manter (padrão 14) |
| `COMPOSE_PROFILES`, `TUNNEL_TOKEN` | `tunel` + o token, para subir um cloudflared junto |

**Dados e backup.** O banco é `/dados/roteirista.db`. Uma vez por dia o servidor grava uma cópia em `/dados/backup/roteirista-AAAA-MM-DD.db`. Mantenha o volume em disco local (SQLite não combina com pasta de rede) e copie a pasta `backup` para outro lugar de tempos em tempos. Para restaurar, pare o container e ponha a cópia no lugar de `roteirista.db`.

**Quem vê o quê.** Cada pessoa vê só os próprios roteiros. No editor, o botão de acesso deixa o dono escolher, pessoa por pessoa (na lista de quem já entrou na plataforma), entre **sem acesso**, **pode ver** e **pode editar**. Há também **Só eu** (100% privado) e **Todos podem ver**. Só o dono muda o acesso, apaga o roteiro e vê o histórico. Quem só vê pode exportar ou **duplicar para editar** a própria cópia.

**Edição simultânea.** Quem pode editar escreve junto, ao mesmo tempo: o texto e o cabeçalho aparecem para todos em tempo real, cada pessoa com seu cursor e sua cor, e o topo mostra quem está no roteiro. Funciona por uma conexão WebSocket em `/api/colab/<id>`, que passa pelo túnel do Cloudflare sem configuração extra. Quem só vê acompanha ao vivo, mas o servidor descarta qualquer alteração que venha dela. Ao mudar o acesso, os convidados são reconectados e conferidos de novo.

**Linha do tempo.** O controle deslizante no rodapé do editor percorre as edições da sessão: para trás desfaz, para frente refaz até o ponto atual. Vale para o texto do roteiro (os campos do cabeçalho não entram) e recomeça quando a página é recarregada; para voltar mais longe, use o histórico. Só aparece em roteiro individual; quando o roteiro é compartilhado com alguém, o controle some e fica o desfazer comum do teclado.

**Histórico.** O servidor guarda uma versão ao criar, a cada 5 minutos de edição e sempre que o roteiro é exportado ou restaurado. Só o dono vê e restaura versões.

Sem `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`, o servidor confia no e-mail que o Cloudflare Access envia no cabeçalho. Isso só é seguro se ninguém alcança o container sem passar pelo túnel; nesse caso, não publique a porta fora da sua rede.

### Login pelo Cloudflare Access (túnel)

O app não tem tela de login: quem controla a entrada é o Cloudflare Access, na frente do site. Quando alguém entra por ele, o app lê o nome e o e-mail da pessoa (em `/cdn-cgi/access/get-identity`) e assina os roteiros com eles. Sem o Access, a pessoa se identifica num perfil local, que não é controle de acesso.

1. **Túnel.** No Zero Trust, em **Networks → Tunnels**, adicione um *public hostname* (ex.: `roteiros.seudominio.com`) apontando para `http://roteirista:80` se o cloudflared estiver na mesma rede Docker, ou para `http://IP-DO-SERVIDOR:8080`. Sem cloudflared rodando, use o serviço `tunel` deste compose: defina `COMPOSE_PROFILES=tunel` e `TUNNEL_TOKEN` nas variáveis da stack.
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
| `src/importar` | Leitura de `.docx` (XML via JSZip), `.rtf` (cp1252), `.pdf` (pdf.js) e `.txt`, e a interpretação: cabeçalho, artes, etiquetas, perguntas |
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
- **PDF.** O PDF não guarda estrutura, só o desenho da página; o app a reconstrói. Sublinhado é todo traço horizontal fino logo abaixo de uma palavra (ou anotação de sublinhado). Colunas vêm das bordas verticais da tabela ou, sem bordas, de várias linhas começando no mesmo ponto. Marca-texto é a faixa colorida atrás do texto. Negrito vem do nome da fonte. A cor do texto (o vermelho de "pode cortar") não é lida, e PDF digitalizado (imagem) também não. Quando houver o `.docx`, ele é sempre a melhor origem.
- **Vermelho.** Com a legenda no roteiro, vira "pode cortar" sem perguntar. Sem a legenda, o app pergunta.
- **Uma etiqueta por trecho; arte convive com etiqueta.** Etiquetar por cima troca a anterior.
- **Negrito** só é mantido nas falas das sonoras. Locução fica em texto limpo.
- **Tempo estimado.** Locução a 2,6 palavras por segundo e falas a 3 (constantes em `src/modelo/exportar.ts`). É uma referência, com 10% de folga antes de avisar.
- **Tudo a partir de "DECUPAGEM"** fica de fora, como no app de upload.
- **Fixtures.** Os roteiros em `tests/fixtures` são reais, com o contato da produção e o caminho de rede trocados por valores fictícios.

## Fora desta etapa

Envio para n8n/Trello, uso offline como app instalado (PWA), tela de Configurações para editar os vocabulários (hoje em `src/modelo/vocabularios.ts`), troca de voz, prévia por versão e modos locutor/Motion.
