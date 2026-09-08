"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Gift, Info, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { readApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { type GiftCardView } from "@/server/gift-cards";
import { GiftCardDialog } from "@/components/gift-cards/gift-card-dialog";

/**
 * Le gift card del locale.
 *
 * Ogni riga risponde a **quanto resta su questa carta**, che è la sola domanda
 * che si fa chi ha il cliente davanti. Il codice si copia con un tocco, perché
 * il gesto vero è dettarlo o incollarlo in un messaggio.
 *
 * In cima c'è un numero che nessun gestionale mostra volentieri: il totale
 * ancora da spendere. Non è un incasso, è un **debito** — cene già pagate e non
 * ancora servite — e chiamarlo col suo nome è la differenza fra sapere come va
 * il locale e credere di avere in cassa dei soldi che sono già di qualcun altro.
 */
/** Una parola sola per lo stato, che è quello che entra in un’etichetta. */
const ETICHETTA_STATO: Record<Exclude<GiftCardView["stato"], "usabile">, string> = {
  cancelled: "Annullata",
  not_paid: "Da pagare",
  expired: "Scaduta",
  exhausted: "Usata tutta",
};

export function GiftCardList({
  items,
  canIssue,
  currency,
}: {
  items: GiftCardView[];
  canIssue: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [nuova, setNuova] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const euro = (c: number) => formatCurrency(c, currency);
  const vive = items.filter((c) => c.stato === "usabile");
  const daSpendere = vive.reduce((s, c) => s + c.residuoCents, 0);
  const vendute = items.reduce((s, c) => s + c.initialCents, 0);
  const usate = items.reduce((s, c) => s + c.spesoCents, 0);

  async function annulla(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/gift-cards/${id}/cancel`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad annullare la gift card."));
      return;
    }
    router.refresh();
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing / Gift card</p>
          <h1 className="text-display text-3xl">Gift card</h1>
          <p className="text-sm text-muted-foreground">
            Cene già pagate. Si scalano dal conto al tavolo, anche in più volte.
          </p>
        </div>
        {canIssue && (
          <Button variant="accent" onClick={() => setNuova(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Nuova gift card
          </Button>
        )}
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="riquadro p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ancora da spendere</p>
            <p className="mt-1 text-display text-2xl tabular-nums">{euro(daSpendere)}</p>
            <p className="text-xs text-muted-foreground">
              su {vive.length} {vive.length === 1 ? "carta valida" : "carte valide"}
            </p>
          </div>
          <div className="riquadro p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Vendute in tutto</p>
            <p className="mt-1 text-display text-2xl tabular-nums">{euro(vendute)}</p>
            <p className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "carta" : "carte"}
            </p>
          </div>
          <div className="riquadro p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Già usate</p>
            <p className="mt-1 text-display text-2xl tabular-nums text-accent">{euro(usate)}</p>
            <p className="text-xs text-muted-foreground">scalate dai conti</p>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {/* Chiamare le cose col loro nome: questo denaro è già entrato, la
              cena no. Metterlo fra gli incassi del mese sarebbe contarlo due
              volte, la seconda quando le persone verranno a mangiare. */}I {euro(daSpendere)} ancora da spendere non
          sono un incasso: sono cene già pagate e non ancora servite. L&apos;incasso arriva quando qualcuno si siede.
        </p>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState icon={Gift} title="Nessuna gift card">
              Una gift card è una cena pagata in anticipo: si vende al bancone, si regala, e chi la riceve la usa
              quando vuole. {canIssue ? "Creane una: serve solo l’importo." : ""}
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span className="font-mono">{c.code}</span>
                    <CopyButton value={c.code} variant="ghost" size="sm" aria-label={`Copia il codice ${c.code}`} />
                    {c.stato === "usabile" ? (
                      <Badge tone="success">Valida</Badge>
                    ) : (
                      <Badge tone="neutral" className="text-muted-foreground">
                        {ETICHETTA_STATO[c.stato]}
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {c.recipientName ? `Per ${c.recipientName}` : "Senza destinatario"}
                    {c.senderName ? ` · da ${c.senderName}` : ""}
                    {c.expiresAt
                      ? ` · scade il ${new Date(c.expiresAt).toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-display text-2xl tabular-nums">{euro(c.residuoCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.spesoCents > 0 ? `di ${euro(c.initialCents)}` : "da spendere"}
                  </p>
                </div>
              </CardHeader>
              {(c.message || c.utilizzi > 0 || (canIssue && c.stato === "usabile")) && (
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
                  <div className="min-w-0 text-sm text-muted-foreground">
                    {c.message && <p>«{c.message}»</p>}
                    {c.utilizzi > 0 && (
                      <p className="text-xs">
                        {c.utilizzi === 1 ? "Usata una volta" : `Usata ${c.utilizzi} volte`} · {euro(c.spesoCents)}{" "}
                        scalati
                      </p>
                    )}
                  </div>
                  {canIssue && c.stato === "usabile" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === c.id}
                      onClick={() => annulla(c.id)}
                    >
                      <Ban className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      {busy === c.id ? "Annullo…" : "Annulla"}
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <GiftCardDialog open={nuova} onOpenChange={setNuova} />
    </>
  );
}
