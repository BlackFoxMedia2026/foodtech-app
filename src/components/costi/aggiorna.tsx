"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * «Aggiorna», e da quando sono fermi i numeri.
 *
 * Il ricalcolo vero lo fa il cron ogni venti minuti; questo pulsante lo chiede
 * per un cliente solo, adesso. Il rinfresco automatico è a sessanta secondi e
 * **non ricalcola**: rilegge la pagina. La differenza conta — un ricalcolo
 * ogni minuto per ogni Super Admin con la scheda aperta sarebbe una lettura
 * del ledger al minuto, per tutto il giorno.
 */
export function Aggiorna({ aggiornatoIl, venueId }: { aggiornatoIl: Date | string; venueId?: string }) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [ricalcolo, setRicalcolo] = useState(false);
  const quando = typeof aggiornatoIl === "string" ? new Date(aggiornatoIl) : aggiornatoIl;

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);

  async function ricalcola() {
    if (!venueId) return avvia(() => router.refresh());
    setRicalcolo(true);
    try {
      await fetch(`/api/admin/costi/${venueId}?ricalcola=1`, { cache: "no-store" });
      router.refresh();
    } finally {
      setRicalcolo(false);
    }
  }

  const leggibile =
    quando.getTime() === 0
      ? "mai"
      : new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(quando);

  return (
    <div className="flex items-center gap-3">
      <span className="t-nota">Ultimo aggiornamento: {leggibile}</span>
      <Button variant="outline" size="sm" onClick={ricalcola} disabled={ricalcolo || inCorso}>
        {ricalcolo ? "Aggiorno…" : "Aggiorna"}
      </Button>
    </div>
  );
}
