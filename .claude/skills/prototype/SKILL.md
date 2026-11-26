---
name: prototype
description: Monta um protótipo descartável para responder a uma pergunta de design. Use quando o usuário quiser conferir se um modelo de estado ou uma lógica parece certa, ou explorar como uma UI deveria ficar.
---

# Protótipo

Um protótipo é **código descartável que responde a uma pergunta**. A pergunta decide o formato.

## Escolha um ramo

Identifique qual pergunta está sendo respondida, usando o prompt do usuário, o código ao redor, ou perguntando se o usuário estiver por perto:

- **"Essa lógica / esse modelo de estado parece certo?"** → [LOGIC.md](LOGIC.md). Monte um único arquivo HTML compartilhável (botões de uso livre mais roteiros guiados em abas) que leve a máquina de estados por casos difíceis de raciocinar no papel, e que alguém que não é desenvolvedor consiga conduzir.
- **"Como isso deveria ficar?"** → [UI.md](UI.md). Gere várias variações de UI radicalmente diferentes num único arquivo HTML apresentado na **moldura** ([`moldura/`](moldura/)): telas e alternativas numa barra fixa no topo, celular, tablet e computador lado a lado, claro e escuro.

Os dois ramos produzem artefatos muito diferentes, então errar aqui desperdiça o protótipo inteiro. Se a pergunta for de fato ambígua e o usuário não estiver acessível, vá pelo ramo que combina melhor com o código ao redor (um módulo de backend → lógica; uma página ou componente → UI) e declare a suposição no topo do protótipo.

## Regras que valem para os dois

1. **Descartável desde o primeiro dia, e marcado claramente como tal.** O protótipo mora no scratchpad da sessão, numa pasta com o nome do assunto, fora do repositório, e diz no topo que é um rascunho com dados fictícios.
2. **Trivial de rodar.** Um único arquivo HTML autocontido (fontes e estilos embutidos) que o usuário abre com dois cliques, inclusive no celular. Nada de pensar para iniciá-lo.
3. **Sem persistência por padrão.** O estado vive em memória. A persistência é o que o protótipo está _verificando_, não algo de que ele deva depender. Se a pergunta envolver explicitamente um banco de dados, use um banco de rascunho ou um arquivo local com um nome claro do tipo "PROTÓTIPO, pode apagar".
4. **Pule o acabamento.** Sem testes, sem tratamento de erros além do que torna o protótipo _executável_, sem abstrações. A ideia é aprender algo rápido.
5. **Mostre o estado.** Depois de cada ação (lógica) ou a cada troca de variante (UI), imprima ou renderize todo o estado relevante para que o usuário veja o que mudou.
6. **Registre ao terminar.** Incorpore ao código real qualquer decisão validada e registre a resposta (o veredito e a pergunta que ele resolveu) na issue ou no commit. O protótipo em si não entra no repositório: a decisão é o que fica.
