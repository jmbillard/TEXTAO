# Gestão: delegar e conferir

O gestor é o agente que conversa com o usuário. Ele delega a implementação a subagentes e confere cada entrega. O
subagente começa do zero: o briefing é tudo o que ele sabe.

## Antes de delegar

- **O pedido tem ticket.** O que o usuário pediu vira issue (`/to-spec` e `/to-tickets` para trabalho grande, uma
  issue direta para um ajuste) ou entra numa que já existe. Decisão de domínio vai para o `GLOSSARY.md` ou para um
  ADR na hora (skill `domain-modeling`).
- **Um por vez.** Siga a ordem dos bloqueios. Só rode em paralelo quando o usuário pedir.

## O briefing

Cada briefing traz, nesta ordem:

1. **O ticket**: o número e como ler (`gh api repos/jmbillard/TEXTAO/issues/<n> --jq .body`), a spec-mãe e um resumo
   de duas ou três linhas com os critérios de aceitação.
2. **Leituras**: `CLAUDE.md`, `GLOSSARY.md`, os ADRs da área.
3. **O que já existe**: os commits e os arquivos dos tickets anteriores de que este depende, e o que pode ser
   reaproveitado (para não duplicar).
4. **O que o usuário aprovou e recusou**, quando o ticket mexe em algo já discutido (tela, regra, texto), com as
   palavras dele. É o que mais se perde entre sessões.
5. **A costura combinada** para os testes (a que a spec fixou) e o ambiente para conferir na tela quando há UI.
6. **As cercas**:
   - o repositório é público: nenhum ID real, nome de pessoa ou endereço de webhook; o que é real vira variável de
     ambiente vazia em `stack.env.exemplo` e `docker-compose.yml`;
   - n8n, Teable e Trello de verdade: só leitura;
   - issues: o subagente não comenta nem fecha.
7. **Como trabalhar**: skill `tdd`; `npx tsc --noEmit -p .` e os testes do arquivo com frequência, `npx vitest run`
   inteiro no fim; skill `code-review` desde o HEAD de partida; commit em pt-BR com o rodapé de autoria e push na
   branch da sessão.
8. **O relatório**: os SHAs, cada critério atendido, o número de testes, os achados da revisão, as decisões tomadas
   por conta própria, as variáveis novas e as capturas de tela.

## Ao receber a entrega

A entrega está conferida quando:

- **o repositório está limpo** e o remoto tem os commits (`git status`, `git ls-remote`);
- **a suíte inteira e a checagem de tipos estão verdes**;
- **o diff não tem dado real**: procure IDs do Trello (24 caracteres hexadecimais), IDs do Teable (`tbl…`, `fld…`,
  `rec…`), nomes de servidor e endereços de webhook;
- **as capturas batem com o que o usuário aprovou**, quando há tela. Um desvio pequeno o gestor corrige e commita;
  um grande volta para o subagente.

Depois, conte ao usuário: o que entrou, as decisões que o subagente tomou sozinho (para ele confirmar), as
pendências e as variáveis novas. Feche a issue com um comentário que aponta os commits só quando o usuário tiver
autorizado.
