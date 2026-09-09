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
        <div className="fill-scroll mt-6 grid gap-4 pr-0.5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const attivo = c.stato === "usabile";
            return (
              <Card key={c.id} className="flex flex-col">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* «Non valido» su un coupon che vale solo il martedì,
                        letto di lunedì, sembra un difetto: non lo è, e la
                        parola giusta è un'altra. */}
                    <Badge tone={attivo ? "success" : "neutral"}>
                      {attivo ? "Valido" : ETICHETTA_STATO[c.stato] ?? "Non valido"}
                    </Badge>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {CATEGORIA[c.category] ?? c.category}
                    </span>
                  </div>
                  <CardTitle>{c.name}</CardTitle>
                  <p className="text-sm text-accent">{c.descrizione}</p>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <code className="rounded-md bg-current/10 px-2 py-1 font-mono text-sm tracking-wider">
                      {c.code}
                    </code>
                    <CopyButton value={c.code} variant="ghost" size="sm" aria-label={`Copia il codice ${c.code}`} />
                  </div>

                  {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}

                  {!attivo && (
                    <p className="text-xs text-amber-700">{MOTIVO_NON_VALIDO[c.stato as keyof typeof MOTIVO_NON_VALIDO]}</p>
                  )}

                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    <li>
                      Usato {c.usi} {c.usi === 1 ? "volta" : "volte"}
                      {c.restanti != null ? ` · ${c.restanti} ${c.restanti === 1 ? "rimasta" : "rimaste"}` : " · senza tetto"}
                    </li>
                    <li>
                      Massimo {c.maxPerGuest} {c.maxPerGuest === 1 ? "volta" : "volte"} per cliente
                      {c.minSpendCents != null &&
                        ` · da ${(c.minSpendCents / 100).toLocaleString("it-IT", {
                          style: "currency",
                          currency: "EUR",
                        })} di conto`}
                      {(c.validWeekdays ?? []).length > 0 &&
                        ` · solo ${(c.validWeekdays ?? [])
                          .map((g) => ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][g])
                          .join(", ")}`}
                    </li>
                    {c.validUntil && (
                      <li>
                        Valido fino al{" "}
                        {new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(
                          new Date(c.validUntil),
                        )}
                      </li>
                    )}
                    {c.guestName && <li>Riservato a {c.guestName}</li>}
                  </ul>

                  {canEdit && (
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      {c.status === "PAUSED" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === c.id}
                          onClick={() => void cambiaStato(c.id, "ACTIVE")}
                        >
                          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Riattiva
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === c.id}
                          onClick={() => void cambiaStato(c.id, "PAUSED")}
                        >
                          <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Metti in pausa
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === c.id}
                        onClick={() => void cambiaStato(c.id, "ARCHIVED")}
                        aria-label={`Archivia ${c.name}`}
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archivia
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="fissa mt-6 text-xs text-tertiary-foreground">
        Un coupon archiviato non si usa più ma resta negli utilizzi già fatti: la storia di uno sconto non si
        cancella. Gli utilizzi si possono annullare, uno per uno, dal tavolo.
      </p>

      {nuovo && <CouponDialog open onOpenChange={(v) => !v && setNuovo(false)} />}
    </>
  );
}
