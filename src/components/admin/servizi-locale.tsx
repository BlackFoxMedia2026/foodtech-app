"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";
import { FUNZIONI_CENTRALINO, NOME_FUNZIONE_CENTRALINO } from "@/lib/licenza-centralino";

/**
 * Accendere il centralino a un locale, da qui.
 *
 * Prima si faceva emettendo una chiave firmata da un secondo gestionale e
 * incollandola in Tavolo: sei gesti in due applicazioni, con un codice da
 * copiare in mezzo. Per un cliente della nostra installazione era un giro
 * inutile — il database è nostro, e chi accende siamo noi.
 *
 * ## Le funzioni si scelgono, e «nessuna scelta» vuol dire tutte
 *
 * Come nella chiave: un elenco vuoto non è un servizio senza funzioni, è un
 * servizio **completo**. Così accendere a qualcuno è un clic, e limitare è una
 * decisione che si prende solo quando serve.
 *
 * ## La nota non è un vezzo
 *
 * «Prova di due settimane», «non ha pagato giugno»: è la risposta alla domanda
 * che si fa guardando questa schermata dopo un mese — *perché a questo sì e a
 * quello no?* — e senza un posto dove scriverla, la risposta sta nella testa
 * di chi ha premuto il pulsante.
 */
export function ServiziLocale({
  venueId,
  attivo,
  funzioni,
  nota,
}: {
  venueId: string;
  attivo: boolean;
  funzioni: string[];
  nota: string | null;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [scelte, setScelte] = useState<string[]>(funzioni);
  const [testo, setTesto] = useState(nota ?? "");
  const [aperto, setAperto] = useState(false);

  async function salva(prossimo: boolean) {
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/admin/servizi/${venueId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        servizio: "CENTRALINO",
        attivo: prossimo,
        funzioni: scelte,
        nota: testo.trim(),
      }),
    });
    setInCorso(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    setAperto(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={attivo ? "outline" : "accent"}
          size="sm"
          disabled={inCorso}
          onClick={() => salva(!attivo)}
        >
          {inCorso ? "Salvo…" : attivo ? "Spegni il centralino" : "Accendi il centralino"}
        </Button>
        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          className="t-nota underline transition-colors hover:text-foreground"
        >
          {aperto ? "Chiudi" : "Funzioni e nota"}
        </button>
      </div>

      {aperto && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-2">
            {FUNZIONI_CENTRALINO.map((f) => {
              const presa = scelte.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() =>
                    setScelte((prima) =>
                      prima.includes(f) ? prima.filter((x) => x !== f) : [...prima, f],
                    )
                  }
                  aria-pressed={presa}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    presa
                      ? "border-accent-strong/50 bg-accent-strong/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {NOME_FUNZIONE_CENTRALINO[f]}
                </button>
              );
            })}
          </div>
          <p className="t-nota">
            Nessuna scelta = tutte.
          </p>
          <Input
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Perché: «prova di due settimane», «non ha pagato giugno»"
            maxLength={300}
          />
          <Button variant="outline" size="sm" disabled={inCorso} onClick={() => salva(attivo)}>
            {inCorso ? "Salvo…" : "Salva funzioni e nota"}
          </Button>
        </div>
      )}

      {errore && <p className="text-xs text-destructive-soft">{errore}</p>}
    </div>
  );
}
