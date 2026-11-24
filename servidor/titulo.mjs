/* A chave do título de um filme para achá-lo no banco, a mesma da conferência do fluxo de filmes no n8n:
   sem o sufixo de episódios, "&" como "E", sem acento, em maiúsculas, sem os artigos (palavras inteiras)
   e só com letras e números. "Kong: Ilha da Caveira" e "Kong - A Ilha da Caveira" dão KONGILHADACAVEIRA. */

const ARTIGOS = /\b(A|O|AS|OS|UM|UMA|UNS|UMAS|THE)\b/g;

export const chaveDoTitulo = (titulo) =>
  String(titulo ?? '')
    .replace(/[\s(–-]+EPIS[ÓO]DIOS?\b.*$/i, '')
    .replaceAll('&', ' E ')
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replaceAll(ARTIGOS, '')
    .replaceAll(/[^A-Z0-9]/g, '');
