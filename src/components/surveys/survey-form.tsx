"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { SurveyView } from "@/server/surveys";

/**
 * Una domanda sola, e due strade diverse dopo la risposta.
 *
 * Il commento non si chiede prima del punteggio: chi è contento lo darebbe
 * comunque, chi è insoddisfatto se ne va davanti a un modulo. Prima il numero
 * — un tocco — poi, in base a quello, la strada giusta: a chi è contento si
 * propone la recensione pubblica, a chi non lo è si chiede cosa non è andato,
 * **in privato**. Ed è il motivo per cui il meccanismo esiste: intercettare
 * chi è uscito male prima che lo scriva altrove.
 */
export function SurveyForm({ survey }: { survey: SurveyView }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esito, setEsito] = useState<{
    sentiment: "PROMOTER" | "PASSIVE" | "DETRACTOR";
    reviewLinks: { href: string; nome: string }[];
    message: string;
  } | null>(null);

  async function invia(punteggio: number, commento?: string) {
    setInCorso(true);
    setError(null);
    const res = await fetch("/api/public/survey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: survey.token, score: punteggio, comment: commento ?? null }),
    });
    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a registrare la tua risposta. Riprova."));
      return;
    }
    setEsito(await res.json());
  }

  if (survey.alreadyAnswered && !esito) {
    return (
      <div className="surface riquadro p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-sage" aria-hidden="true" />
        <h1 className="mt-3 text-display text-2xl">Abbiamo già la tua risposta</h1>
        <p className="mt-2 text-sm text-muted-foreground">Grazie per il tempo che ci hai dedicato.</p>
      </div>
    );
  }

  // Risposta registrata: da qui in poi le due strade.
  if (esito) {
    return (
      <div className="surface riquadro p-6">
        <CheckCircle2 className="h-8 w-8 text-sage" aria-hidden="true" />
        <h1 className="mt-3 text-display text-2xl">{esito.message}</h1>

        {esito.sentiment === "PROMOTER" && esito.reviewLinks.length > 0 && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Se ti va, scriverlo dove lo leggono gli altri ci aiuta più di quanto immagini.
            </p>
            {/* Il primo è quello che conta: gli altri restano disponibili ma
                non si contendono l'attenzione con lo stesso peso. */}
            <div className="mt-4 space-y-2">
              {esito.reviewLinks.map((l, i) => (
                <Button
                  key={l.href}
                  asChild
                  variant={i === 0 ? "accent" : "outline"}
                  className="w-full"
                >
                  <a href={l.href} target="_blank" rel="noopener noreferrer">
                    {esito.reviewLinks.length === 1 ? "Lascia una recensione pubblica" : `Scrivila su ${l.nome}`}
                    <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              ))}
            </div>
          </>
        )}

        {esito.sentiment !== "PROMOTER" && (
          <p className="mt-4 text-sm text-muted-foreground">
            {survey.venueName} riceve la tua risposta adesso. Se hai lasciato un commento, lo legge una
            persona — non un archivio.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="surface riquadro p-6">
      <p className="t-etichetta">{survey.venueName}</p>
      <h1 className="mt-1 text-display text-2xl">
        {survey.guestName ? `Ciao ${survey.guestName}` : "Com'è andata?"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Quanto ci consiglieresti a un amico? Un tocco, e hai finito.
      </p>

      <div className="mt-5">
        <div className="flex items-center justify-between text-[11px] text-tertiary-foreground">
          <span>per niente</span>
          <span>moltissimo</span>
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-1.5 sm:grid-cols-11">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} su 10`}
              aria-pressed={score === n}
              disabled={inCorso}
              onClick={() => {
                setScore(n);
                // Nove e dieci non hanno bisogno di altro: si registra subito e
                // si propone la recensione. Sotto, si chiede cosa non è andato.
                if (n >= 9) void invia(n);
              }}
              className={cn(
                "flex min-h-[44px] items-center justify-center rounded-md border text-sm font-medium transition-colors",
                score === n
                  ? "border-cream bg-cream text-clay-ink"
                  : "border-border text-muted-foreground hover:bg-current/10",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {score != null && score < 9 && (
        <form
          className="mt-5 space-y-3"
          method="post"
          onSubmit={(e) => {
            e.preventDefault();
            void invia(score, comment);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="commento">Cosa possiamo fare meglio?</Label>
            <Textarea
              id="commento"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Dicci quello che ti va. Lo legge una persona."
            />
          </div>
          <Button type="submit" variant="accent" className="w-full" disabled={inCorso}>
            {inCorso ? "Un istante…" : "Invia"}
          </Button>
          <p className="text-center t-nota">
            Questa risposta resta fra te e {survey.venueName}.
          </p>
        </form>
      )}

      {score != null && score >= 9 && inCorso && (
        <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Star className="h-4 w-4 animate-pulse" aria-hidden="true" />
          Grazie, un istante…
        </p>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
