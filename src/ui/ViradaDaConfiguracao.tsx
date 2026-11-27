import { useState } from 'react';
import { mudarAVirada, type ViradaDaPauta } from '../dados/armazenamento';
import { Icone } from './icones';
import './viradaDaConfiguracao.css';

/* A seção "Pauta no Teable" da Configuração (#134): a chave da virada, que só o administrador aciona. Desligada (o
   padrão), publicar fica no PROMeiro e a Pauta junta a do Teable com a publicada; ligada, publicar grava o dia na pauta
   da edição do Teable, e no dia gravado vale o publicado. Ligar pede a confirmação de que o fluxo do n8n que lê a
   planilha já foi desativado (o passo a passo está no README). Vale na hora e entra no histórico. No celular, só
   consulta. */

interface Props {
  virada: ViradaDaPauta;
  podeMudar: boolean;
  mudou: (v: ViradaDaPauta) => void;
}

export function ChaveDaVirada({ virada, podeMudar, mudou }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [mudando, setMudando] = useState(false);
  const [erro, setErro] = useState('');
  const mudar = async (ligada: boolean) => {
    setMudando(true);
    setErro('');
    try {
      mudou(await mudarAVirada(ligada));
      setConfirmando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setMudando(false);
    }
  };
  return (
    <>
      <p className={`cfg-virada-estado ${virada.ligada ? 'ligada' : ''}`} role="status">
        <span className="cfg-virada-bolinha" aria-hidden />
        {virada.ligada ? 'Ligada: publicar grava o dia na pauta da edição do Teable, e na Pauta vale o publicado.' : 'Desligada: publicar fica no PROMeiro, e a pauta do Teable continua vindo da planilha (pelo n8n).'}
      </p>
      {!virada.tabela && <p className="cfg-virada-falta">A tabela da pauta da edição (EDICAO_producao) não foi achada na base do Teable: sem ela, não dá para ligar.</p>}
      {podeMudar &&
        (confirmando ? (
          <div className="cfg-virada-confirma" role="group" aria-label="Confirmar a virada">
            <p>
              <Icone nome="atencao" tam={14} /> Antes de ligar, desative no n8n o fluxo que lê a planilha da edição (PROMO: ESTEIRA PÓS - EDITORES). Com os dois ligados, um desfaz o que o outro grava.
            </p>
            <div className="cfg-virada-botoes">
              <button type="button" className="botao primario" disabled={mudando} onClick={() => void mudar(true)}>
                {mudando ? 'Ligando…' : 'Já desativei: ligar'}
              </button>
              <button type="button" className="botao" disabled={mudando} onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : virada.ligada ? (
          <button type="button" className="botao" disabled={mudando} onClick={() => void mudar(false)}>
            {mudando ? 'Desligando…' : 'Desligar a gravação no Teable'}
          </button>
        ) : (
          <button type="button" className="botao" disabled={!virada.tabela} onClick={() => setConfirmando(true)}>
            Ligar a gravação no Teable…
          </button>
        ))}
      {erro && (
        <p className="cfg-virada-erro" role="alert">
          {erro}
        </p>
      )}
    </>
  );
}
