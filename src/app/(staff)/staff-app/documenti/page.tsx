import { cn } from "@/lib/utils";
import { getContestoStaff } from "@/lib/staff-auth";
import { documentiDi } from "@/server/staff-app/documenti";
import { TestataSezione } from "@/components/staff-app/testata-staff";

export const dynamic = "force-dynamic";

/**
 * **Documenti e scadenze** — §32.
 *
 * Contratto, visita medica, corsi sicurezza, HACCP, attestati: quello per cui
 * un ristorante prende una multa e per cui una persona resta a casa. Il
 * calcolo è `costruisciScadenze`, lo stesso della scheda del back office — se
 * dicessero due cose diverse sulla stessa visita medica, uno dei due starebbe
 * lavorando su un dato sbagliato e non si saprebbe quale.
 *
 * Le voci **mancanti** restano in elenco («Nessuna visita registrata»): è
 * precisamente l'informazione per cui si apre questa pagina, e nasconderla
 * perché non ha una data mostrerebbe una schermata che sembra a posto.
 *
 * Non si carica niente da qui. Un certificato medico lo registra chi lo
 * riceve, e un allegato caricato dal dipendente finirebbe in una casella che
 * nessuno guarda.
 */
export default async function DocumentiPage() {
  const ctx = await getContestoStaff("view_own_documents");
  const scadenze = await documentiDi(ctx.venueId, ctx.persona.waiterId);

  return (
    <div className="schermo">
      <TestataSezione titolo="Documenti" sottotitolo="Contratto, visita medica, formazione" />

      <div className="fill-scroll px-4 pb-4">
        {scadenze.length === 0 ? (
          <div className="riquadro tratteggiato comodo">
            <p className="t-titolo-scheda">Niente registrato</p>
            <p className="t-nota mt-1">
              Non risultano contratto, visita medica o corsi a tuo nome. Parlane con un
              responsabile.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {scadenze.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "rounded-lg border p-3",
                  s.scaduto
                    ? "border-destructive/50 bg-destructive/10"
                    : s.inScadenza
                      ? "border-accent/60 bg-accent/10"
                      : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.titolo}</p>
                    <p className="t-nota mt-0.5">{s.dettaglio}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium",
                      s.scaduto
                        ? "text-destructive-soft"
                        : s.inScadenza
                          ? "text-accent-strong"
                          : "text-muted-foreground",
                    )}
                  >
                    {s.quando}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
