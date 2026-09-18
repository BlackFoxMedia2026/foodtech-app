"use client";

import Link from "next/link";
import { PhoneMissed, PhoneOutgoing } from "lucide-react";
import { useTelefonoVivo } from "@/components/telefono/voice-globale";

/**
 * Cosa il telefono chiede al servizio di adesso.
 *
 * ## Cosa **non** è
 *
 * Non è lo storico, non sono i conteggi della giornata, non è il riquadro della
 * chiamata — quello vive nel guscio e compare su qualunque pagina, compresa
 * questa. Il Servizio non diventa un call center.
 *
 * Sono le due righe che riguardano il servizio in corso: qualcuno ha chiamato e
 * non ha trovato nessuno, qualcuno va richiamato. Entrambe chiedono un gesto
 * **adesso**, ed è l'unico criterio per stare in questa schermata.
 *
 * Quando non c'è niente da fare non c'è: non è vuoto, non c'è. Una riga che
 * dice «0 chiamate perse» occupa lo spazio di una che chiede qualcosa.
 */
export function RiepilogoTelefono() {
  const stato = useTelefonoVivo();
  if (stato.azioni === 0) return null;

  return (
    <Link
      href="/telefono"
      className="fissa riquadro flex flex-wrap items-center gap-x-4 gap-y-1 border-accent/40 bg-accent/10 px-3 py-2 transition-colors hover:bg-accent/15"
    >
      {stato.perseDaGestire > 0 && (
        <span className="flex items-center gap-1.5 text-sm">
          <PhoneMissed
            className="h-3.5 w-3.5 text-destructive-soft"
            aria-hidden="true"
          />
          <strong className="tabular-nums">{stato.perseDaGestire}</strong>
          {stato.perseDaGestire === 1
            ? "chiamata senza risposta"
            : "chiamate senza risposta"}
        </span>
      )}
      {stato.richiamateAperte > 0 && (
        <span className="flex items-center gap-1.5 text-sm">
          <PhoneOutgoing
            className="h-3.5 w-3.5 text-accent-strong"
            aria-hidden="true"
          />
          <strong className="tabular-nums">{stato.richiamateAperte}</strong>
          {stato.richiamateAperte === 1 ? "da richiamare" : "da richiamare"}
        </span>
      )}
      <span className="ml-auto t-nota">Apri il Telefono</span>
    </Link>
  );
}
