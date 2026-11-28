import { useEffect, useState } from 'react';
import { armazenamento } from '../dados/armazenamento';
import type { Pessoa } from '../modelo/tipos';
import { Icone, Selo } from './icones';

export type Convite = { email: string; editar: boolean };

/** Os textos do painel: o da revisão (todos veem, só edita quem o dono escolher) e o do Roteiro escrito no PROMeiro
    (#189: visível para a equipe ou fechado, com convidados que leem ou escrevem). */
const TEXTOS = {
  revisao: {
    so: ['Só eu', '100% privado: ninguém mais vê'],
    todos: ['Todos podem ver', 'Qualquer colega lê; só edita quem você escolher'],
    nao: (publico: boolean) => (publico ? 'Só vê' : 'Sem acesso'),
    ver: 'Pode ver',
    editar: 'Pode editar',
    pe: 'Quem edita escreve junto com você, ao mesmo tempo. Só você muda o acesso e apaga o roteiro.',
  },
  escrito: {
    so: ['Fechado', 'Só você e quem você convidar'],
    todos: ['Visível para a equipe', 'A equipe lê; a coordenação também escreve'],
    nao: (publico: boolean) => (publico ? 'Só lê' : 'Sem acesso'),
    ver: 'Pode ler',
    editar: 'Pode escrever',
    pe: 'Quem você convida para escrever escreve no roteiro com você. Só você muda quem vê e apaga o roteiro.',
  },
} as const;

/**
 * Quem tem acesso a um roteiro (o painel do botão de visibilidade): o modo (fechado ou de todos) e as pessoas, cada uma
 * sem acesso, lendo ou escrevendo. O mesmo na revisão e na escrita (#189); `escrito` troca só os textos para os do
 * Roteiro escrito no PROMeiro. O ✓ marca o modo escolhido, nunca um estado (em --ultra).
 */
export function Compartilhar({ publico, pessoas, mudar, escrito = false }: { publico: boolean; pessoas: Convite[]; mudar: (todos: boolean, lista: Convite[]) => void; escrito?: boolean }) {
  const [usuarios, setUsuarios] = useState<Pessoa[] | null>(null);
  const [busca, setBusca] = useState('');
  useEffect(() => {
    armazenamento.usuarios().then(setUsuarios, () => setUsuarios([]));
  }, []);
  const t = TEXTOS[escrito ? 'escrito' : 'revisao'];

  const papel = (email: string) => pessoas.find((p) => p.email === email);
  const definir = (email: string, valor: 'nao' | 'ver' | 'editar') =>
    mudar(publico, [...pessoas.filter((p) => p.email !== email), ...(valor === 'nao' ? [] : [{ email, editar: valor === 'editar' }])]);
  const termo = busca.trim().toLowerCase();
  // quem já foi escolhido aparece mesmo que não esteja mais na lista
  const lista = [...(usuarios ?? []), ...pessoas.filter((p) => !(usuarios ?? []).some((u) => u.email === p.email)).map((p) => ({ nome: p.email.split('@')[0], email: p.email }))]
    .filter((u) => !termo || `${u.nome} ${u.email}`.toLowerCase().includes(termo));
  // na revisão, "Só eu" é sem ninguém; no escrito, "Fechado" é só não ser de todos (os convidados continuam)
  const fechado = escrito ? !publico : !publico && !pessoas.length;

  return (
    <div className="painel-compartilhar" role="dialog" aria-label="Quem tem acesso a este roteiro">
      <div className="rotulo">Quem tem acesso</div>
      <div className="modos">
        <button className="modo" role="switch" aria-checked={fechado} onClick={() => mudar(false, escrito ? pessoas : [])}>
          <Selo nome="cadeado" />
          <span className="menu-texto"><strong>{t.so[0]}</strong><small>{t.so[1]}</small></span>
          <span className="modo-marca">{fechado && <Icone nome="certo" tam={12} traco={3} />}</span>
        </button>
        <button className="modo" role="switch" aria-checked={publico} onClick={() => mudar(escrito ? true : !publico, pessoas)}>
          <Selo nome="olho" />
          <span className="menu-texto"><strong>{t.todos[0]}</strong><small>{t.todos[1]}</small></span>
          <span className="modo-marca">{publico && <Icone nome="certo" tam={12} traco={3} />}</span>
        </button>
      </div>
      <div className="quem">
        <div className="rotulo">{escrito ? 'Convidados' : 'Pessoas'}</div>
        {(usuarios?.length ?? 0) > 6 && <input className="popover-obs" placeholder="Buscar pessoa" aria-label="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />}
        <ul>
          {lista.map((u) => {
            const p = papel(u.email);
            const valor = p ? (p.editar ? 'editar' : 'ver') : 'nao';
            return (
              <li key={u.email} className={p ? 'com-acesso' : ''}>
                <span className="quem-pessoa">
                  <span className="quem-nome">{u.nome}</span>
                  <span className="suave pequeno">{u.email}</span>
                </span>
                <select className="quem-papel" data-valor={valor} value={valor} aria-label={`Acesso de ${u.nome}`} onChange={(e) => definir(u.email, e.target.value as 'nao' | 'ver' | 'editar')}>
                  <option value="nao">{t.nao(publico)}</option>
                  {!publico && <option value="ver">{t.ver}</option>}
                  <option value="editar">{t.editar}</option>
                </select>
              </li>
            );
          })}
        </ul>
        {usuarios && !lista.length && <p className="suave pequeno">{termo ? 'Ninguém com esse nome.' : 'Ainda não há outras pessoas por aqui. Elas aparecem depois do primeiro acesso.'}</p>}
      </div>
      <p className="suave pequeno">{t.pe}</p>
    </div>
  );
}
