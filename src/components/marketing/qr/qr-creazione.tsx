"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QrCodeSalvato } from "@/lib/qr-codes-api";
import { QrEditor } from "./qr-editor";
import { QrFatto } from "./qr-fatto";
import type { BozzaQr, ContestoQr } from "./bozza";

/**
 * I due momenti di una creazione: si disegna, e poi si porta via.
 *
 * Stanno nello stesso indirizzo di proposito. Fossero due pagine, il ritorno
 * indietro dal «pronto» tornerebbe a un editor vuoto — e chi preme «indietro»
 * dopo aver salvato sta cercando il codice che ha appena fatto, non un modulo
 * da rifare.
 */
export function QrCreazione({
  bozzaIniziale,
  ctx,
  id,
}: {
  bozzaIniziale: BozzaQr;
  ctx: ContestoQr;
  id?: string;
}) {
  const router = useRouter();
  const [fatti, setFatti] = useState<QrCodeSalvato[] | null>(null);

  const allElenco = () => router.push("/marketing/qr-codes");

  if (fatti && fatti.length > 0) {
    return <QrFatto salvati={fatti} onFine={allElenco} />;
  }

  return (
    <QrEditor
      bozzaIniziale={bozzaIniziale}
      ctx={ctx}
      id={id}
      onSalvato={setFatti}
      onAnnulla={allElenco}
    />
  );
}
