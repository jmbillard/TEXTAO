/* As Produções de mentira dos testes da Pauta (#199): a Pauta só mostra as claquetes que casam com uma Produção, então
   os testes que olham a Pauta põem, direto no SQLite do PROMeiro, as Produções das claquetes que devem aparecer. Só
   dados inventados. */

type Banco = { prepare: (sql: string) => { run: (...v: unknown[]) => unknown } };

let n = 0;
/**
 * Põe uma Produção por claquete, na etapa pedida (Entrada, sem praça, entrada 3 dias antes de `perto`).
 * @param db o banco do app (abrirBanco), depois do criarApp (a tabela já existe)
 * @param perto o dia (AAAA-MM-DD) perto do qual a Produção entrou
 */
export function porProducoes(db: unknown, claquetes: readonly string[], { perto, etapa = 'entrada', praca = '', card = null }: { perto: string; etapa?: string; praca?: string; card?: string | null }) {
  const entrada = new Date(Date.parse(`${perto}T12:00:00Z`) - 3 * 86_400_000).toISOString();
  const agora = new Date().toISOString();
  const ids: string[] = [];
  for (const claquete of claquetes) {
    const id = `prod-falsa-${++n}`;
    (db as Banco).prepare('INSERT INTO producoes (id, claquete, praca, etapa, entrada_em, card_id, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, claquete, praca, etapa, entrada, card, agora, agora);
    ids.push(id);
  }
  return ids;
}
