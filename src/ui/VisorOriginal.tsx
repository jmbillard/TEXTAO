/* O roteiro como chegou: .docx no visualizador do Word (no navegador, sem passar pelo servidor), PDF no visor de PDF.
   O resto (RTF, texto colado) cai na reserva. */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { baixarOriginal } from '../dados/armazenamento';
import { VisorPdf } from './VisorPdf';

const VisorDocx = lazy(() => import('./VisorDocx'));

export const ehDocx = (nome?: string) => /\.docx$/i.test(nome ?? '');
export const ehPdf = (nome?: string) => /\.pdf$/i.test(nome ?? '');

export function VisorOriginal({ id, nome, artes, reserva, anotacao, lado, circular }: {
  id: string;
  nome?: string;
  artes: string[];
  reserva?: React.ReactNode;
  anotacao?: string;
  lado?: 'esquerda' | 'direita';
  circular?: boolean;
}) {
  const [docx, setDocx] = useState<Uint8Array | null>(null);
  const [estado, setEstado] = useState<'lendo' | 'pronto' | 'erro'>('lendo');
  useEffect(() => {
    if (!ehDocx(nome)) return;
    let vivo = true;
    setEstado('lendo');
    baixarOriginal(id)
      .then((b) => b.arrayBuffer())
      .then((a) => vivo && (setDocx(new Uint8Array(a)), setEstado('pronto')))
      .catch(() => vivo && setEstado('erro'));
    return () => {
      vivo = false;
    };
  }, [id, nome]);
  const pdf = useCallback(() => baixarOriginal(id).then((b) => b.arrayBuffer()), [id]);

  if (ehPdf(nome)) return <VisorPdf carregar={pdf} rotulo="Original" reserva={reserva} anotacao={anotacao} lado={lado} circular={circular} />;
  if (!ehDocx(nome)) return <>{reserva ?? <p className="suave visor-aviso">Este roteiro não tem o arquivo original em Word ou PDF.</p>}</>;
  const aviso = <p className="suave visor-aviso">Abrindo o original…</p>;
  if (estado === 'erro') return <>{reserva ?? <p className="suave visor-aviso">Não consegui abrir o original.</p>}</>;
  return (
    <div className="visor-original">
      {anotacao && estado === 'pronto' && (
        <span className={`anotacao-folha ${lado ?? 'esquerda'} ${circular ? 'circulada' : ''}`}>
          {anotacao}
          {circular && (
            <svg viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true">
              <path d="M50 9 C 30 2, 6 9, 6 23 C 6 37, 30 42, 46 38 C 62 33, 62 12, 44 7 C 34 4, 22 5, 15 9" />
            </svg>
          )}
        </span>
      )}
      {docx ? (
        <Suspense fallback={aviso}>
          <VisorDocx dados={docx} artes={artes} />
        </Suspense>
      ) : (
        aviso
      )}
    </div>
  );
}
