import { useEffect, useRef } from 'react';
import QRCodeLib from 'qrcode';

export function QRCode({ value, size = 180, className, dark = '#0f1d4d' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && value) QRCodeLib.toCanvas(ref.current, value, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark, light: '#ffffff' } });
  }, [value, size, dark]);
  return <canvas ref={ref} className={className} style={{ width: size, height: size }} aria-label="QR code" />;
}
