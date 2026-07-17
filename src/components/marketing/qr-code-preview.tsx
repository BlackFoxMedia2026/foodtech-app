"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "qr-code"
  );
}

/**
 * Il PNG è generato interamente lato client dall'URL di destinazione: è puro
 * calcolo deterministico, non serve nessuna chiamata server né storage
 * dell'immagine (si ricalcola sempre al volo, a differenza di un upload).
 */
export function QrCodePreview({ name, value, size = 160 }: { name: string; value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded-md border border-border bg-secondary"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt={`QR code per ${name}`}
        width={size}
        height={size}
        className="rounded-md border border-border bg-white p-2"
      />
      <a
        href={dataUrl}
        download={`foodtech-qr-${slugify(name)}.png`}
        className="block text-center text-xs text-muted-foreground underline"
      >
        Scarica QR code
      </a>
    </div>
  );
}
