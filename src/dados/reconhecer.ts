import { exportar, pendencias } from '../modelo/exportar';
import { acharPrograma } from '../modelo/vocabularios';
import { armazenamento, atualizarVocabulario, roteiroDa } from './armazenamento';

/** Depois de uma key nova: os roteiros da fila sem atração que agora são dessa atração ganham ela (e as pendências
    são refeitas). O roteiro aberto no editor (pular) fica com o editor. Usa o mesmo reconhecimento da importação, então vale a praça do Rio na frente. Devolve quantos. */
export async function reconhecerNaFila(nome: string, pular?: string): Promise<number> {
  let n = 0;
  try {
    await atualizarVocabulario();
    for (const r of await armazenamento.listar()) {
      if (r.id === pular || r.meta.programa || !r.podeEditar || !r.meta.claquete) continue;
      if (acharPrograma(r.meta.claquete)?.nome !== nome) continue;
      const completo = roteiroDa(await armazenamento.ler(r.id));
      if (!completo) continue;
      const novo = { ...completo, meta: { ...completo.meta, programa: nome } };
      novo.meta.revisar = pendencias(exportar(novo));
      await armazenamento.salvar(novo, undefined, true);
      n++;
    }
  } catch {
    /* reconhecer é um bônus: o cadastro já foi feito */
  }
  return n;
}
