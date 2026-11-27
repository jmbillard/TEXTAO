/* A prévia de filmes que chega por e-mail (#157): o n8n pega o PDF da prévia no e-mail da programação e manda para
   POST /api/publico/filmes/previa, com o FILMES_PREVIA_TOKEN (veja o README). Aqui só se confere o pedido; quem guarda
   é a aba Filmes (filmes.receberPorEmail), e quem prepara (as páginas úteis, os pôsteres) é o navegador da primeira
   pessoa que abrir a prévia, pelo mesmo caminho da subida à mão. */

/** O endereço da prévia, embaixo de /api/publico/ (fora do login: o n8n não passa pelo Cloudflare Access). */
export const ROTA_DA_PREVIA = '/api/publico/filmes/previa';
/** O corpo do pedido: as prévias de hoje têm uns 2 MB; 30 MB é folga de sobra. */
export const LIMITE_DA_PREVIA = 30 * 1_048_576;

const erro = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });

/**
 * O pedido do n8n conferido: um multipart/form-data com o campo `pdf` (o arquivo, com o nome dele) e o campo opcional
 * `chegou_em` (a hora em que o e-mail chegou, ISO). Lança (400) o que não é uma prévia em PDF.
 * @param corpo os bytes do pedido; tipo o content-type dele
 * @returns { nome, pdf: Buffer, chegouEm: ISO | null }
 */
export async function previaDoPedido(corpo, tipo) {
  if (!/^multipart\/form-data\b/i.test(String(tipo ?? ''))) throw erro('O pedido é um multipart/form-data com o PDF no campo "pdf".');
  let form;
  try {
    form = await new Request('http://promeiro/', { method: 'POST', headers: { 'content-type': String(tipo) }, body: corpo }).formData();
  } catch {
    throw erro('O multipart veio quebrado.');
  }
  const arquivo = form.get('pdf');
  if (!arquivo || typeof arquivo === 'string') throw erro('Falta o PDF da prévia (o campo "pdf", com o arquivo).');
  const pdf = Buffer.from(await arquivo.arrayBuffer());
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw erro('O arquivo não é um PDF.');
  const nome = String(arquivo.name || '').replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'previa.pdf';
  const quando = form.get('chegou_em');
  let chegouEm = null;
  if (typeof quando === 'string' && quando.trim()) {
    const ms = Date.parse(quando.trim());
    if (Number.isNaN(ms)) throw erro('A hora em que o e-mail chegou (chegou_em) não é uma data ISO.');
    chegouEm = new Date(ms).toISOString();
  }
  return { nome, pdf, chegouEm };
}

/** O link da aba Filmes, para o aviso do n8n (vazio sem o PROMEIRO_URL). */
export const linkDaAbaFilmes = (env) => {
  const base = String(env.PROMEIRO_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/#/filmes` : '';
};
