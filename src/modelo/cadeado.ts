/**
 * O cadeado da revisão (#188): na revisão o texto fica como chegou, para qualquer roteiro; o cadeado destrava a edição
 * do texto para quem pode editar, só para quem o abriu e só enquanto está no roteiro (ao sair, volta a travar).
 *
 * Por que só para quem abriu, e não para a sala toda: o cadeado protege cada pessoa de mexer no texto sem querer.
 * Destravar para todos tiraria essa proteção de quem está na sala sem ter pedido. A mudança em si chega a todos pela
 * sala ao vivo, e o que vale para quem edita continua decidido no servidor (quem só lê não altera o documento).
 */
export function cadeadoNaRevisao({ podeEditar, celular }: { podeEditar: boolean; celular: boolean }): boolean {
  // no celular o texto é só de leitura nesta leva: o cadeado fica de fora
  return podeEditar && !celular;
}
