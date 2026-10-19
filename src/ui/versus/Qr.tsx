import { useEffect, useState } from 'preact/hooks';

/**
 * The Join link as a QR for the friend's camera app (docs/versus-design.md
 * §2). `uqr` is loaded only here, on the Host's screen, and only its matrix is
 * used: the modules are drawn as one SVG path, a row's run of dark modules at a
 * time. A link of about 250 characters is a 57 × 57 QR at level L.
 */
export function JoinQr({ link }: { link: string }) {
  const [qr, setQr] = useState<{ readonly d: string; readonly size: number } | null>(null);
  useEffect(() => {
    let live = true;
    setQr(null);
    void import('uqr').then(({ encode }) => {
      if (!live) return;
      const { data, size } = encode(link, { ecc: 'L', border: 2 });
      let d = '';
      data.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (!row[x]) continue;
          let run = 1;
          while (row[x + run]) run++;
          d += `M${x} ${y}h${run}v1h-${run}z`;
          x += run;
        }
      });
      setQr({ d, size });
    }).catch((err: unknown) => console.warn('[versus] could not draw the QR', err));
    return () => {
      live = false;
    };
  }, [link]);
  if (!qr) return <div class="qr" aria-hidden="true" />;
  return (
    <svg class="qr" viewBox={`0 0 ${qr.size} ${qr.size}`} shape-rendering="crispEdges" role="img" aria-label="A QR code of the Join link" data-testid="join-qr">
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.d} fill="#000" />
    </svg>
  );
}
