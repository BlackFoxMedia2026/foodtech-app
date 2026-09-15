import { CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ETICHETTA_REPUTAZIONE, type LivelloReputazione } from "@/lib/dem-reputazione";
import { cn } from "@/lib/utils";

const TONO: Record<LivelloReputazione, "success" | "success-soft" | "warning" | "danger" | "neutral"> = {
  OTTIMA: "success",
  BUONA: "success-soft",
  DA_CONTROLLARE: "warning",
  A_RISCHIO: "danger",
  SOSPESA: "neutral",
};

/**
 * La reputazione, detta come la direbbe una persona.
 *
 * Non è la console di un fornitore: niente grafici a fasce, niente sigle,
 * niente «sending quota». Un giudizio in una parola, quattro righe che dicono
 * se le cose importanti sono a posto, e due percentuali sotto per chi le sa
 * leggere.
 *
 * Le percentuali stanno **dopo** il giudizio e non prima: «0,3%» non dice a un
 * ristoratore se deve preoccuparsi, «Ottima» sì. Chi vuole il numero lo trova;
 * chi non lo vuole non deve interpretarlo.
 */
export function SchedaReputazione({
  livello,
  messaggio,
  tassoRimbalzi,
  tassoSegnalazioni,
  dominioPronto,
  dkim,
  spf,
  dmarc,
  className,
}: {
  livello: LivelloReputazione;
  messaggio: string;
  tassoRimbalzi: number | null;
  tassoSegnalazioni: number | null;
  dominioPronto: boolean;
  dkim: string;
  spf: string;
  dmarc: string;
  className?: string;
}) {
  return (
    <section className={cn("surface p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="t-etichetta">Reputazione invio</p>
          <p className="text-display mt-1 text-2xl">{ETICHETTA_REPUTAZIONE[livello]}</p>
        </div>
        <Badge tone={TONO[livello]}>{ETICHETTA_REPUTAZIONE[livello]}</Badge>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <Voce etichetta="Dominio" stato={dominioPronto ? "OK" : "PENDING"} valore={dominioPronto ? "Verificato" : "Da completare"} />
        <Voce etichetta="Firma" stato={dkim} valore={dkim === "OK" ? "Attiva" : "Non ancora"} />
        <Voce etichetta="Autorizzazione" stato={spf} valore={spf === "OK" ? "Attiva" : "Non ancora"} />
        <Voce
          etichetta="Regola anti-contraffazione"
          stato={dmarc}
          valore={dmarc === "OK" ? "Attiva" : "Consigliata"}
        />
        {tassoRimbalzi !== null && (
          <Voce
            etichetta="Email non recapitate"
            stato={null}
            valore={`${tassoRimbalzi.toLocaleString("it-IT")}%`}
          />
        )}
        {tassoSegnalazioni !== null && (
          <Voce
            etichetta="Segnalate come spam"
            stato={null}
            valore={`${tassoSegnalazioni.toLocaleString("it-IT")}%`}
          />
        )}
      </dl>

      <p className="t-corpo mt-5 text-muted-foreground">{messaggio}</p>
    </section>
  );
}

function Voce({
  etichetta,
  stato,
  valore,
}: {
  etichetta: string;
  /** `null` quando è un numero e non uno stato: niente icona. */
  stato: string | null;
  valore: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {stato === null ? (
        <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : stato === "OK" ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-strong" aria-hidden="true" />
      ) : stato === "FAILED" ? (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-soft" aria-hidden="true" />
      ) : (
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <dt className="t-nota">{etichetta}</dt>
        <dd className="text-sm tabular-nums">{valore}</dd>
      </div>
    </div>
  );
}
