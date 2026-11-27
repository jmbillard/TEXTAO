/* Ligar pessoa e cadastro pelo e-mail (#106), nos Cadastros: o e-mail na linha do redator ou do editor (o
   administrador edita à mão) e a sugestão "É Fulana, dos redatores?" no alto da lista. */
import { useEffect, useRef, useState } from 'react';
import type { SugestaoDeEmail } from '../dados/armazenamento';
import { iniciais } from '../dados/colaboracao';
import './emailDoCadastro.css';

/** "Fulana, dos redatores" / "Fulano, dos editores": o cadastro na pergunta e na caixinha, sem gênero. */
export const quemNoCadastro = (tipo: SugestaoDeEmail['tipo'], nome: string) => `${nome}, dos ${tipo}`;

/** A sugestão no alto da lista: quem entrou, a pergunta e as duas respostas. */
export function SugestaoDeEmailNaLista({ s, simE, naoE }: { s: SugestaoDeEmail; simE: () => void; naoE: () => void }) {
  const pergunta = `É ${quemNoCadastro(s.tipo, s.nome)}?`;
  return (
    <div className="sugestao-email" role="group" aria-label={pergunta}>
      <span className="perfil-avatar">{iniciais(s.usuario)}</span>
      <p>
        <b>{s.email}</b> já entrou no PROMeiro como {s.usuario}, sem cadastro com este e-mail.
      </p>
      <p className="pergunta-sugestao">{pergunta}</p>
      <div className="acoes-sugestao">
        <button type="button" className="botao primario" onClick={simE}>É</button>
        <button type="button" className="botao" onClick={naoE}>Não é</button>
      </div>
    </div>
  );
}

/** O e-mail na linha do cadastro. O administrador clica para editar: Enter (ou sair do campo) grava, Esc desiste. */
export function EmailNaLinha({ email, pode, salvar }: { email: string; pode: boolean; salvar: (email: string) => Promise<boolean> }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(email);
  const [gravando, setGravando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  // o Esc desiste: o campo que some não grava ao perder o foco
  const desistiu = useRef(false);
  // o campo travado enquanto grava perde o foco: o blur que vem do Enter não grava de novo
  const ocupado = useRef(false);
  useEffect(() => {
    if (editando) (desistiu.current = false, campo.current?.focus());
  }, [editando]);
  if (!pode) return email ? <span className="email-cad">{email}</span> : null;
  if (!editando)
    return (
      <button type="button" className={`email-cad editar ${email ? '' : 'falta'}`} title="Editar o e-mail do login" onClick={() => (setValor(email), setEditando(true))}>
        {email || 'sem e-mail'}
      </button>
    );
  const gravar = async () => {
    if (ocupado.current || desistiu.current) return;
    if (valor.trim().toLowerCase() === email) return setEditando(false);
    ocupado.current = true;
    setGravando(true);
    const ok = await salvar(valor);
    ocupado.current = false;
    setGravando(false);
    if (ok) setEditando(false);
  };
  return (
    <input
      ref={campo}
      className="entrada-email-cad"
      type="email"
      aria-label="E-mail do login"
      placeholder="o e-mail do login"
      value={valor}
      disabled={gravando}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => void gravar()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.preventDefault(), void gravar());
        if (e.key === 'Escape') (e.preventDefault(), (desistiu.current = true), setEditando(false));
      }}
    />
  );
}

/**
 * O papel de coordenação (#123) na linha do editor que tem e-mail: o administrador marca e desmarca com um clique
 * (vale pelo e-mail do login); os outros só veem a marca, quando há.
 */
export function CoordenacaoNaLinha({ nome, email, marcada, pode, mudar }: { nome: string; email: string; marcada: boolean; pode: boolean; mudar: (marcar: boolean) => void }) {
  if (!email || (!pode && !marcada)) return null;
  if (!pode) return <span className="coordenacao-cad marcada">coordenação</span>;
  return (
    <button
      type="button"
      className={`coordenacao-cad${marcada ? ' marcada' : ''}`}
      aria-pressed={marcada}
      title={marcada ? `Tirar ${nome} da coordenação` : `${nome} é da coordenação: monta a pauta`}
      onClick={() => mudar(!marcada)}
    >
      {marcada ? 'coordenação' : '+ coordenação'}
    </button>
  );
}
