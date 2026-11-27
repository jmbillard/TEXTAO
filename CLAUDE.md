# PROMeiro (TEXTAO)

A ferramenta da equipe de arte da Globo Promo: recebe os roteiros, revisa as artes e manda para produção no Trello,
com o registro no Teable (base PROMeiro). Tudo em pt-BR: textos, comentários, commits e documentos.

## O agente da conversa é o gestor do projeto

Quem conversa com o usuário **gerencia**: pergunta, decide a ordem, registra as decisões e responde. O trabalho que
muda código ou dados vai para um **subagente** novo, um ticket por vez na ordem dos bloqueios, com um briefing
completo; o gestor confere o que voltou antes de seguir e continua livre para a conversa. Consultas rápidas e
respostas ficam com o gestor. Ao delegar ou conferir, siga `docs/agents/gestao.md`.

## Regras de UI

- Nada de "unha": nenhum item, cartão, linha ou bloco leva faixa colorida na borda esquerda (`border-left` grosso, `box-shadow: inset Npx 0 0`, `border-inline-start`); o estado vai numa bolinha ou etiqueta, no fundo levemente tingido ou no texto.

## Skills dos agentes (Agent skills)

As skills do Matt Pocock, traduzidas para pt-BR, ficam em `.claude/skills/` (veja `.claude/skills/README.md`).
O fluxo do dia a dia: `/grill-with-docs` (interrogatório + glossário) → `/to-spec` → `/to-tickets` → `/implement`.

### Rastreador de issues

As issues e specs ficam nas Issues do GitHub (`jmbillard/TEXTAO`). Veja `docs/agents/issue-tracker.md`.

### Rótulos de triagem

Os cinco papéis da triagem em pt-BR (`precisa-triagem`, `precisa-info`, `pronto-para-agente`, `pronto-para-humano`,
`wontfix`). Veja `docs/agents/triage-labels.md`.

### Documentos de domínio

Contexto único: `GLOSSARY.md` e `docs/adr/` na raiz. Veja `docs/agents/domain.md`.
