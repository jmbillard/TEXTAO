import { armazenamento, parametrosDoPerfil } from './armazenamento';

/* Fila ao vivo: o servidor avisa quando um roteiro chega, muda ou sai, e quem mais está com a fila aberta. */

export type EventoFila =
  | { tipo: 'criado' | 'alterado' | 'apagado'; id: string; por: string }
  | { tipo: 'presenca'; pessoas: { nome: string; email: string }[] }
  /** Quem está com um roteiro aberto agora. Lista vazia: ninguém mais. */
  | { tipo: 'no-roteiro'; id: string; pessoas: { nome: string; email: string }[] }
  /** Ponteiro do mouse de quem está na fila; `saiu` quando ele deixa a tela. */
  | { tipo: 'ponteiro'; por: string; nome: string; ancora?: string; fx?: number; fy?: number; cursor?: string; saiu?: boolean }
  /** Alguém trocou a cor de destaque no perfil ('' = voltou para a sorteada). */
  | { tipo: 'cor'; por: string; cor: string }
  /** A conexão voltou depois de cair: pode ter perdido avisos, então vale recarregar. */
  | { tipo: 'reconectou' };

export interface Fila {
  parar: () => void;
  /** Manda um aviso meu para quem está na fila (o ponteiro do mouse). Fora do ar, não faz nada. */
  enviar: (dado: object) => void;
}

export function ouvirFila(aoReceber: (e: EventoFila) => void): Fila {
  if (armazenamento.tipo !== 'servidor' || typeof WebSocket === 'undefined') return { parar: () => {}, enviar: () => {} };
  let ws: WebSocket | null = null;
  let parar = false;
  let espera = 1000;
  let caiu = false;
  let prazo: ReturnType<typeof setTimeout> | undefined;

  const abrir = () => {
    const params = new URLSearchParams(parametrosDoPerfil()).toString();
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/eventos${params ? `?${params}` : ''}`);
    ws.onopen = () => {
      espera = 1000;
      if (caiu) aoReceber({ tipo: 'reconectou' });
      caiu = false;
    };
    ws.onmessage = (m) => {
      try {
        aoReceber(JSON.parse(String(m.data)) as EventoFila);
      } catch {
        /* aviso ilegível: ignora */
      }
    };
    ws.onclose = () => {
      if (parar) return;
      caiu = true;
      prazo = setTimeout(abrir, espera);
      espera = Math.min(espera * 2, 30_000);
    };
  };
  abrir();
  return {
    parar: () => {
      parar = true;
      clearTimeout(prazo);
      ws?.close();
    },
    enviar: (dado) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(dado));
    },
  };
}
