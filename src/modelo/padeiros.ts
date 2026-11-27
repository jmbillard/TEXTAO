/* A chave do Padeiro (#137): as regras sem rede. A sugestão de designer da aba Padeiros sai da sigla que o Padeiro
   mandou (a que vai no nome dos projetos: um nome, um apelido, as iniciais ou o usuário do computador) e do usuário do
   computador, comparados com os designers cadastrados. */
import { nomeComparavel } from './ligarPeloNome.ts';

export interface DesignerCadastrado {
  registro: string;
  nome: string;
  email?: string;
}

const junto = (s: string) => nomeComparavel(s).replace(/ /g, '');

/** As formas do designer que uma sigla pode ter: o nome inteiro, o primeiro nome, as iniciais, a inicial com o
    sobrenome e o e-mail antes do @. Tudo sem acento, maiúsculo e sem espaços. */
function formasDo(d: DesignerCadastrado): string[] {
  const palavras = nomeComparavel(d.nome).split(' ').filter(Boolean);
  if (!palavras.length) return [];
  const ultimo = palavras[palavras.length - 1];
  const doEmail = junto(String(d.email ?? '').split('@')[0]);
  return [palavras.join(''), palavras[0], palavras.map((p) => p[0]).join(''), palavras[0][0] + ultimo, doEmail].filter((f) => f.length >= 2);
}

/**
 * O designer que a sigla (ou o usuário do computador) indica: só quando é um só; com dois que servem, ou nenhum, null
 * (o administrador escolhe).
 */
export function designerSugerido<D extends DesignerCadastrado>(sigla: string, usuario: string, designers: D[]): D | null {
  const procuradas = [junto(sigla), junto(usuario)].filter((p) => p.length >= 2);
  if (!procuradas.length) return null;
  const servem = designers.filter((d) => formasDo(d).some((f) => procuradas.includes(f)));
  return servem.length === 1 ? servem[0] : null;
}
