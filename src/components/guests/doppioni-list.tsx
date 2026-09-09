"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Doppione, LatoDoppione } from "@/server/guest-merge";

/**
 * Le coppie da unire, una per riquadro.
 *
 * Due decisioni sono in mano a chi guarda, e l'interfaccia deve renderle
 * entrambe evidenti:
 *
 * 1. **se** sono la stessa persona. Per questo si mostra tutto quello che
 *    distingue le due schede — visite, punti, prenotazioni, note, allergie,
 *    consenso — e non solo i nomi;
 * 2. **quale delle due tenere.** Non è indifferente: la scheda che resta dà
 *    il nome, e il suo identificativo è quello che sopravvive nei link.
 *
 * Non c'è nessuna finestra di conferma, come in tutto il resto del prodotto:
 * il pulsante dice esattamente cosa fa («Tieni questa e unisci l'altra»), e
 * l'esito lo racconta subito dopo. Ma è scritto anche che non si torna
 * indietro, perché è vero.
 */
export function DoppioniList({ doppioni, canManage }: { doppioni: Doppione[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  /**
   * Cosa è stato unito, e cosa si è spostato.
   *
   * Sta **sopra** l'elenco e non dentro la coppia: appena l'unione riesce
   * quella coppia scompare dalle proposte, e la conferma sparirebbe con lei.
   * Provandolo dal vivo il riquadro si svuotava senza dire niente, che è il
   * modo più rapido di far dubitare qualcuno di aver fatto la cosa giusta —
   * su un'operazione che non si torna indietro.
   */
  const [fatte, setFatte] = useState<string[]>([]);

  async function unisci(principale: LatoDoppione, duplicato: LatoDoppione) {
    const chiave = `${principale.id}|${duplicato.id}`;
    setBusy(chiave);
    setErrore(null);
    const res = await fetch("/api/guests/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ principaleId: principale.id, duplicatoId: duplicato.id }),
    });
    setBusy(null);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a unire le due schede."));
      return;
    }
    const esito = (await res.json()) as { spostate: Record<string, number>; punti: number };
    const pezzi = Object.entries(esito.spostate).map(([cosa, n]) => `${n} ${cosa}`);
    setFatte((f) => [
      ...f,
      pezzi.length
        ? `${duplicato.nome} è stata unita a ${principale.nome}: spostati ${pezzi.join(
            ", ",
          )}. Saldo punti: ${esito.punti}.`
        : `${duplicato.nome} è stata unita a ${principale.nome}. Non c'era niente da spostare.`,
    ]);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {errore && (
        <p className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          {errore}
        </p>
      )}

      {fatte.length > 0 && (
        <ul className="space-y-1 rounded-md border border-sage/40 bg-sage/10 p-3 text-sm">
          {fatte.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      )}

      {doppioni.map((d) => {
        const chiaveA = `${d.principale.id}|${d.duplicato.id}`;

        return (
          <Card key={chiaveA}>
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {d.motivo === "email" ? (
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {d.motivo === "email" ? "Stessa email" : "Stesso telefono"}: {d.valore}
              </p>

              <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Scheda lato={d.principale} altro={d.duplicato} />
                    <Scheda lato={d.duplicato} altro={d.principale} />
                  </div>

                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => unisci(d.principale, d.duplicato)}
                      >
                        Tieni {d.principale.nome} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => unisci(d.duplicato, d.principale)}
                      >
                        Tieni {d.duplicato.nome} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <p className="w-full t-nota">
                        La scheda che tieni prende prenotazioni, conti, punti, consensi e messaggi
                        dell&apos;altra; note e allergie si uniscono. L&apos;altra scheda viene cancellata:
                        non si torna indietro.
                      </p>
                    </div>
                  ) : (
                    <p className="t-nota">
                      Unire due schede lo può fare un Manager: cancella una scheda, e non si torna indietro.
                    </p>
                  )}
              </>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Una delle due schede, con quello che ha in più dell'altra evidenziato. */
function Scheda({ lato, altro }: { lato: LatoDoppione; altro: LatoDoppione }) {
  const creata = new Date(lato.creataIl).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="riquadro p-3 text-sm">
      <Link href={`/guests/${lato.id}`} className="font-medium underline-offset-4 hover:underline">
        {lato.nome}
      </Link>
      <p className="text-xs text-muted-foreground">Creata il {creata}</p>

      <ul className="mt-2 space-y-0.5 text-xs">
        <Riga etichetta="Email" valore={lato.email ?? "—"} inPiu={!!lato.email && !altro.email} />
        <Riga etichetta="Telefono" valore={lato.phone ?? "—"} inPiu={!!lato.phone && !altro.phone} />
        <Riga
          etichetta="Visite"
          valore={String(lato.visite)}
          inPiu={lato.visite > altro.visite}
        />
        <Riga etichetta="Prenotazioni" valore={String(lato.prenotazioni)} inPiu={lato.prenotazioni > altro.prenotazioni} />
        <Riga etichetta="Punti" valore={String(lato.punti)} inPiu={lato.punti > altro.punti} />
        <Riga
          etichetta="Note riservate"
          valore={lato.haNote ? "sì" : "no"}
          inPiu={lato.haNote && !altro.haNote}
        />
        <Riga
          etichetta="Allergie"
          valore={lato.haAllergie ? "sì" : "no"}
          inPiu={lato.haAllergie && !altro.haAllergie}
        />
        <Riga
          etichetta="Consenso marketing"
          valore={lato.consensoMarketing ? "sì" : "no"}
          inPiu={lato.consensoMarketing && !altro.consensoMarketing}
        />
      </ul>
    </div>
  );
}

/**
 * Una riga della scheda. Quello che questa scheda ha **e l'altra no** è
 * evidenziato: è l'unica cosa che aiuta davvero a scegliere quale tenere,
 * anche se l'unione non lo perderebbe comunque.
 */
function Riga({ etichetta, valore, inPiu }: { etichetta: string; valore: string; inPiu: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="text-tertiary-foreground">{etichetta}</span>
      <span className={cn("text-right", inPiu ? "font-medium text-foreground" : "text-muted-foreground")}>
        {valore}
      </span>
    </li>
  );
}
