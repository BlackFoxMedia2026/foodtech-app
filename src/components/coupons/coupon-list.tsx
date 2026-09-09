"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pause, Play, Plus, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { readApiError } from "@/lib/api-client";
import { MOTIVO_NON_VALIDO, type CouponView } from "@/server/coupons";
import { CouponDialog } from "@/components/coupons/coupon-dialog";

const CATEGORIA: Record<string, string> = {
  GENERIC: "Generico",
  BIRTHDAY: "Compleanno",
  WINBACK: "Recupero",
  EVENT: "Evento",
  NEW_CUSTOMER: "Nuovo cliente",
  WIFI: "Wi-Fi",
  REFERRAL: "Passaparola",
  STAFF: "Personale",
};

/**
 * I coupon del locale.
 *
 * Ogni riga risponde a una domanda sola: **questo coupon vale adesso?** Se non
 * vale, c'è scritto perché — in pausa, scaduto, esaurito — invece di uno stato
 * da interpretare. Il codice si copia con un tocco, perché il gesto vero è
 * dettarlo o incollarlo in una campagna.
 */
/** Una parola sola per lo stato, che è quello che entra in un'etichetta. */
const ETICHETTA_STATO: Partial<Record<CouponView["stato"], string>> = {
  paused: "In pausa",
  archived: "Archiviato",
  not_yet_valid: "Non ancora",
  expired: "Scaduto",
  exhausted: "Esaurito",
  wrong_day: "Non oggi",
  below_min_spend: "Sotto il minimo",
};

export function CouponList({ items, canEdit }: { items: CouponView[]; canEdit: boolean }) {
  const router = useRouter();
  const [nuovo, setNuovo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cambiaStato(id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED") {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/coupons/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a cambiare lo stato del coupon."));
      return;
    }
    router.refresh();
  }

  return (
    <>
      <header className="fissa flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing / Coupon</p>
          <h1 className="text-display text-3xl">Coupon</h1>
          <p className="text-sm text-muted-foreground">
            Si usano al tavolo, dalla scheda della prenotazione in Servizio.
          </p>
        </div>
        {canEdit && (
          <Button variant="accent" onClick={() => setNuovo(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuovo coupon
          </Button>
        )}
      </header>

      {error && <p className="fissa mt-4 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <div className="fill mt-6">
          <EmptyState
            icon={Ticket}
            title="Nessun coupon"
            action={
              canEdit ? (
                <Button variant="accent" onClick={() => setNuovo(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Crea il primo
                </Button>
              ) : undefined
            }
          >
            Uno sconto di benvenuto, un omaggio di compleanno, qualcosa per chi non torna da un po&apos;: qui si
            creano i codici, e al tavolo si segnano come usati.
          </EmptyState>
        </div>
      ) : (
        /*
          Righe, non schede.

          Nove coupon in schede grandi facevano 2.192 px di scorrimento per
          dire nove volte le stesse sei cose: nome, tipo, valore, codice,
          utilizzi, stato. Ogni scheda era alta 450 px e metà era spazio.

          Una riga porta le sei cose in una battuta e le condizioni — minimo di
          conto, giorni, scadenza, riservato a — nella riga sotto, in grigio:
          sono il motivo per cui un coupon **non** vale oggi, quindi non
          possono sparire, ma non sono la cosa che si cerca arrivando qui.
        */
        <ul className="fill-scroll riquadro mt-4 divide-y divide-border">
          {items.map((c) => {
            const attivo = c.stato === "usabile";
            const condizioni = [
              // Corto perché sta su ogni riga: «Massimo 1 volta per cliente»
              // ripetuto undici volte diventa arredamento.
              `${c.maxPerGuest} per cliente`,
              c.minSpendCents != null &&
                `da ${(c.minSpendCents / 100).toLocaleString("it-IT", {
                  style: "currency",
                  currency: "EUR",
                })} di conto`,
              (c.validWeekdays ?? []).length > 0 &&
                `solo ${(c.validWeekdays ?? [])
                  .map((g) => ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][g])
                  .join(", ")}`,
              c.validUntil &&
                `fino al ${new Intl.DateTimeFormat("it-IT", {
                  day: "numeric",
                  month: "long",
                }).format(new Date(c.validUntil))}`,
              c.guestName && `riservato a ${c.guestName}`,
              c.description,
            ].filter(Boolean) as string[];

            return (
              /*
                Da `md` è una griglia e non un flex che va a capo: con le
                colonne libere «15% di sconto» cadeva a un'ascissa diversa su
                ogni riga, e undici righe disallineate si leggono una per una
                invece di per colonna. Sotto `md` le parti si impilano.
              */
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 md:grid md:grid-cols-[minmax(0,1fr)_8rem_14rem_9rem_5.5rem_auto] md:items-center md:gap-x-3"
              >
                <div className="min-w-0 flex-1 basis-full md:basis-auto">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="t-titolo-scheda">{c.name}</span>
                    <span className="t-etichetta">{CATEGORIA[c.category] ?? c.category}</span>
                  </p>
                  <p className="t-nota">{condizioni.join(" · ")}</p>
                </div>

                {/* Il valore: è la ragione per cui esiste il coupon, e resta
                    nel colore dell'accento come sulla scheda di prima. */}
                <span className="t-corpo shrink-0 text-accent">{c.descrizione}</span>

                <span className="flex shrink-0 items-center gap-1">
                  <code className="whitespace-nowrap rounded-md bg-current/10 px-2 py-0.5 font-mono text-xs tracking-wider">
                    {c.code}
                  </code>
                  <CopyButton
                    value={c.code}
                    variant="ghost"
                    size="sm"
                    aria-label={`Copia il codice ${c.code}`}
                  />
                </span>

                <span className="t-dato shrink-0 text-muted-foreground">
                  {c.usi} {c.usi === 1 ? "uso" : "usi"}
                  {c.restanti != null
                    ? ` · ${c.restanti} ${c.restanti === 1 ? "rimasta" : "rimaste"}`
                    : " · senza tetto"}
                </span>

                {/* «Non valido» su un coupon che vale solo il martedì, letto
                    di lunedì, sembra un difetto: non lo è, e la parola giusta
                    è un'altra. Il perché sta nel suggerimento, così la riga
                    resta una riga. */}
                <Badge
                  tone={attivo ? "success" : "neutral"}
                  className="shrink-0"
                  title={
                    attivo
                      ? undefined
                      : MOTIVO_NON_VALIDO[c.stato as keyof typeof MOTIVO_NON_VALIDO]
                  }
                >
                  {attivo ? "Valido" : ETICHETTA_STATO[c.stato] ?? "Non valido"}
                </Badge>

                {canEdit && (
                  <span className="flex shrink-0 items-center gap-1">
                    {c.status === "PAUSED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === c.id}
                        onClick={() => void cambiaStato(c.id, "ACTIVE")}
                        aria-label={`Riattiva ${c.name}`}
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" /> Riattiva
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === c.id}
                        onClick={() => void cambiaStato(c.id, "PAUSED")}
                        aria-label={`Metti in pausa ${c.name}`}
                      >
                        <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pausa
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === c.id}
                      onClick={() => void cambiaStato(c.id, "ARCHIVED")}
                      aria-label={`Archivia ${c.name}`}
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only md:not-sr-only">Archivia</span>
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="fissa mt-6 text-xs text-tertiary-foreground">
        Un coupon archiviato non si usa più ma resta negli utilizzi già fatti: la storia di uno sconto non si
        cancella. Gli utilizzi si possono annullare, uno per uno, dal tavolo.
      </p>

      {nuovo && <CouponDialog open onOpenChange={(v) => !v && setNuovo(false)} />}
    </>
  );
}
