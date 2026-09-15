"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ExternalLink, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { centesimiDaTesto } from "@/lib/conto-diviso";
import type { StatoStripe } from "@/server/stripe-connect";

/**
 * Collegare Stripe e decidere le regole del pagamento al tavolo.
 *
 * ## Quello che questa schermata dichiara, e perché
 *
 * In cima c'è scritto **dove vanno i soldi**: sul conto del ristorante, non su
 * quello di Tavolo. Non è rassicurazione di cortesia — è la domanda che si fa
 * chiunque stia per collegare il proprio conto corrente a un gestionale, e
 * lasciarla senza risposta è il motivo per cui molti non lo collegano.
 *
 * ## Un interruttore che si rifiuta di accendersi
 *
 * «Pagamento al tavolo» resta spento e non toccabile finché Stripe non accetta
 * incassi. Accenderlo prima creerebbe QR che mandano i clienti contro un
 * errore — e quell'errore lo vedrebbe una persona a cena, non il ristoratore.
 */
export function ImpostazioniPagamenti({
  configurato,
  stato,
  regole,
  tavoliAttivi,
  currency,
  baseUrl,
}: {
  configurato: boolean;
  stato: StatoStripe | null;
  regole: {
    qrPaymentsEnabled: boolean;
    tipsEnabled: boolean;
    tipPresets: number[];
    minPaymentCents: number;
  };
  tavoliAttivi: number;
  currency: string;
  baseUrl: string;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [locale, setLocale] = useState(regole);
  const [minimo, setMinimo] = useState(
    (regole.minPaymentCents / 100).toFixed(2).replace(".", ","),
  );

  async function chiama(corpo: Record<string, unknown>, chiave: string) {
    setInCorso(chiave);
    setErrore(null);
    try {
      const res = await fetch("/api/venue/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        const msg = await readApiError(res, "Non riusciamo a completare l'operazione.");
        throw new Error(
          res.status === 409 && corpo.azione === "regole"
            ? "Collega prima Stripe: senza, il QR manderebbe i clienti contro un errore."
            : msg,
        );
      }
      return await res.json();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Qualcosa è andato storto.");
      return null;
    } finally {
      setInCorso(null);
    }
  }

  async function collega() {
    const esito = await chiama(
      {
        azione: "collega",
        ritornoUrl: `${baseUrl}/settings/pagamenti`,
        riprovaUrl: `${baseUrl}/settings/pagamenti`,
      },
      "collega",
    );
    if (esito?.url) window.location.href = esito.url;
  }

  async function cruscotto() {
    const esito = await chiama({ azione: "cruscotto" }, "cruscotto");
    if (esito?.url) window.open(esito.url, "_blank", "noopener");
  }

  async function salvaRegole(patch: Partial<typeof locale>) {
    const prima = locale;
    setLocale({ ...locale, ...patch });
    const esito = await chiama({ azione: "regole", ...patch }, "regole");
    if (!esito) setLocale(prima);
    else router.refresh();
  }

  /*
    Incassare davvero richiede **due** cose, e vengono da due posti diversi:
    che l'account del locale sia verificato (`stato.puoIncassare`, che riguarda
    il ristorante) e che questa installazione abbia le chiavi Stripe
    (`configurato`, che riguarda la piattaforma).

    Tenerle separate faceva mostrare «Stripe non disponibile» accanto a
    «Pagamento al tavolo attivo» senza che niente lo segnalasse: due riquadri
    che si contraddicevano, e nel mezzo dei clienti a cui il QR non funziona.
  */
  const puoIncassare = configurato && !!stato?.puoIncassare;

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      {errore && (
        <p
          role="alert"
          className="riquadro flex items-start gap-2 border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-soft" aria-hidden="true" />
          {errore}
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/*  Stripe                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-accent-strong" aria-hidden="true" />
              Stripe
            </CardTitle>
            {!configurato ? (
              <Badge tone="neutral">Non disponibile</Badge>
            ) : puoIncassare ? (
              <Badge tone="success">Collegato</Badge>
            ) : stato?.daCompletare ? (
              <Badge tone="warning">Da completare</Badge>
            ) : (
              <Badge tone="neutral">Non collegato</Badge>
            )}
          </div>
          <CardDescription>
            Gli incassi arrivano <strong>direttamente sul conto del ristorante</strong>. Tavolo non
            trattiene il denaro e non conserva nessuna chiave: qui resta solo il codice
            dell&apos;account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {!configurato ? (
            <p className="riquadro p-3 text-sm text-muted-foreground">
              Questa installazione di Tavolo non ha ancora le chiavi Stripe
              (<code className="text-xs">STRIPE_SECRET_KEY</code>). Finché mancano, il pagamento al
              tavolo non si può attivare.
            </p>
          ) : puoIncassare ? (
            <>
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage-strong" aria-hidden="true" />
                Il conto è verificato e accetta pagamenti
                {stato?.puoRicevereBonifici
                  ? ", e i bonifici sono attivi."
                  : ". I bonifici non sono ancora attivi: completa i dati su Stripe."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={cruscotto} disabled={!!inCorso}>
                  {inCorso === "cruscotto" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Apri il cruscotto Stripe
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Dal cruscotto Stripe si vedono incassi e bonifici, e si emettono i rimborsi.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {stato?.daCompletare
                  ? "L'iscrizione è iniziata ma non è finita: Stripe non accetta ancora incassi. Riprendi da dove avevi lasciato."
                  : "Per incassare dal tavolo serve collegare il conto del ristorante. Si fa su Stripe, in pochi minuti: servono i dati dell'attività e l'IBAN."}
              </p>
              <Button type="button" variant="accent" size="sm" onClick={collega} disabled={!!inCorso}>
                {inCorso === "collega" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {stato?.daCompletare ? "Riprendi su Stripe" : "Collega Stripe"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/*  Pagamento al tavolo                                               */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base">Pagamento al tavolo</CardTitle>
          <CardDescription>
            Ogni tavolo può avere un codice QR: chi è seduto lo inquadra, vede il proprio conto e
            paga dal telefono. Il codice si accende tavolo per tavolo, dalla Sala.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/*
            Acceso ma incapace di incassare.

            Non si arriva qui accendendo l'interruttore — l'API lo rifiuta —
            ma ci si arriva **dopo**: le chiavi della piattaforma tolte, o un
            conto Stripe che smette di essere verificato. Il locale continua a
            leggere «attivo» e i suoi clienti trovano un QR che non paga,
            senza che nessuno glielo dica. Quindi lo dice questo riquadro.
          */}
          {locale.qrPaymentsEnabled && !puoIncassare && (
            <p className="riquadro flex items-start gap-2 border-accent/40 bg-accent/15 p-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Il pagamento al tavolo è acceso ma non può
                incassare.</strong>{" "}
                Chi inquadra il QR legge che il locale non accetta pagamenti dal tavolo e viene
                invitato a chiedere il conto. {configurato ? "Completa il collegamento a Stripe" : "Servono le chiavi Stripe di questa installazione"} per riattivarlo.
              </span>
            </p>
          )}

          <div className="flex items-center justify-between gap-3 riquadro p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {locale.qrPaymentsEnabled ? "Attivo" : "Spento"}
              </p>
              <p className="text-xs text-muted-foreground">
                {!puoIncassare
                  ? "Collega Stripe per poterlo accendere."
                  : locale.qrPaymentsEnabled
                    ? tavoliAttivi === 0
                      ? "Nessun tavolo ha ancora il suo codice: accendilo dalla Sala."
                      : `${tavoliAttivi} ${tavoliAttivi === 1 ? "tavolo ha" : "tavoli hanno"} il codice attivo.`
                    : "I codici dei tavoli non funzionano finché questo è spento."}
              </p>
            </div>
            <Switch
              checked={locale.qrPaymentsEnabled}
              disabled={!puoIncassare || inCorso === "regole"}
              onCheckedChange={(v) => salvaRegole({ qrPaymentsEnabled: v })}
              aria-label="Pagamento al tavolo attivo"
            />
          </div>

          <div className="flex items-center justify-between gap-3 riquadro p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Chiedi la mancia</p>
              <p className="text-xs text-muted-foreground">
                Prima di pagare, al cliente viene proposto di lasciare qualcosa al personale. Nessuna
                percentuale è preselezionata.
              </p>
            </div>
            <Switch
              checked={locale.tipsEnabled}
              disabled={inCorso === "regole"}
              onCheckedChange={(v) => salvaRegole({ tipsEnabled: v })}
              aria-label="Chiedi la mancia"
            />
          </div>

          {locale.tipsEnabled && (
            <div className="riquadro space-y-2 p-3">
              <Label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                Percentuali proposte
              </Label>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20].map((p) => {
                  const scelto = locale.tipPresets.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={scelto}
                      disabled={inCorso === "regole"}
                      onClick={() => {
                        const dopo = scelto
                          ? locale.tipPresets.filter((x) => x !== p)
                          : [...locale.tipPresets, p].sort((a, b) => a - b);
                        void salvaRegole({ tipPresets: dopo });
                      }}
                      className={`h-9 rounded-full px-4 text-sm ${
                        scelto ? "bg-accent text-cream" : "border border-border text-muted-foreground"
                      }`}
                    >
                      {p}%
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Senza nessuna percentuale resta solo «importo personalizzato».
              </p>
            </div>
          )}

          <div className="riquadro space-y-2 p-3">
            <Label htmlFor="minimo" className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
              Importo minimo
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="minimo"
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
                onBlur={() => {
                  const c = centesimiDaTesto(minimo);
                  if (c === null || c < 50) {
                    setMinimo((locale.minPaymentCents / 100).toFixed(2).replace(".", ","));
                    return;
                  }
                  if (c !== locale.minPaymentCents) void salvaRegole({ minPaymentCents: c });
                }}
                inputMode="decimal"
                className="max-w-[9rem]"
              />
              <span className="text-sm text-muted-foreground">{currency}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Sotto questa cifra la commissione si mangia il pagamento. Non vale quando il residuo
              del tavolo è più basso: un conto aperto per{" "}
              {formatCurrency(80, currency)} deve poter essere chiuso.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
