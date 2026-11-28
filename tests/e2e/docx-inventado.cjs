// Um roteiro inventado em .docx, para os e2e e as capturas do começar de fora (#195): a atração, a data, o locutor e os
// trechos são fictícios. Montado na hora com a biblioteca `docx` (a mesma da exportação), sublinhado como no Word.
const { Document, Packer, Paragraph, TextRun } = require('docx');

const p = (...runs) => new Paragraph({ children: runs.map((r) => (typeof r === 'string' ? new TextRun(r) : new TextRun(r))) });
const u = (text) => ({ text, underline: {} });

/** O .docx do "Desafio da Brasa": o cabeçalho, a arte inteira, a arte na frase, a sonora, a trilha e a edição. */
async function docxInventado() {
  const doc = new Document({
    creator: 'Redação fictícia',
    sections: [
      {
        children: [
          p('LOCUTOR: TIAGO'),
          p("DURAÇÃO: 30''"),
          p(''),
          p(u('DESAFIO DA BRASA')),
          p('NESTE SÁBADO, ', u('OITO CHURRASQUEIROS'), ' DISPUTAM O TÍTULO DO SUL.'),
          p('Dona Zélia, de Pelotas: Aqui ninguém leva carne crua para casa.'),
          p('((plim plim))'),
          p('QUEM SEGURA O FOGO ATÉ O FIM?'),
          p('(Encerra logo Desafio da Brasa)'),
          p(u('SÁBADO, DEPOIS DO JORNAL')),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

module.exports = { docxInventado, NOME_DO_INVENTADO: 'Desafio_Brasa_14_11.docx' };
