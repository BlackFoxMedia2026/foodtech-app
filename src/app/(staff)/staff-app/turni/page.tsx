import { getContestoStaff } from "@/lib/staff-auth";
import { turniNelPeriodo } from "@/server/staff-app/turno";
import { dateKeyInVenue } from "@/lib/venue-time";
import { intervalloLeggibile } from "@/lib/turni";
import { cn } from "@/lib/utils";
import { TestataSezione } from "@/components/staff-app/testata-staff";

export const dynamic = "force-dynamic";

/**
 * **I turni** — §30.
 *
 * Vista iniziale semplice: i prossimi quattordici giorni, uno per riga, con i
 * riposi che occupano la loro casella invece di essere un buco. È la
 * differenza che rende leggibile un calendario di turni — un giorno senza riga
 * è «non ancora pianificato», e non è la stessa cosa di «riposo».
 *
 * Il mese fa da intestazione di gruppo e non da titolo della pagina: un turno
 * che sta a cavallo di due mesi è normale, e un calendario mensile
 * costringerebbe a girare pagina per vedere il turno di dopodomani.
 */
const ETICHETTA: Record<string, string> = {
  REST: "Riposo",
  VACATION: "Ferie",
  LEAVE: "Permesso",
  SICK_LEAVE: "Malattia",
  UNAVAILABLE: "Non disponibile",
};

export default async function TurniPage() {
  const ctx = await getContestoStaff("view_own_shifts");
  const oggi = dateKeyInVenue(new Date(), ctx.timezone);
  const giorni = await turniNelPeriodo(ctx.venueId, ctx.persona.waiterId, oggi, 21);

  let meseMostrato = "";

  return (
    <div className="schermo">
      <TestataSezione titolo="Turni" sottotitolo="Le prossime tre settimane" />

      <ul className="fill-scroll px-4 pb-4">
        {giorni.map(({ giorno, turno }) => {
          const data = new Date(`${giorno}T12:00:00.000Z`);
          const mese = new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "UTC" }).format(data);
          const nuovoMese = mese !== meseMostrato;
          if (nuovoMese) meseMostrato = mese;

          const lavora = turno?.kind === "WORK";
          const oggiStesso = giorno === oggi;

          return (
            <li key={giorno}>
              {nuovoMese && (
                <h2 className="t-etichetta pb-1.5 pt-4 first:pt-0">{mese}</h2>
              )}
              <div
                className={cn(
                  "flex min-h-[60px] items-center gap-3 border-b border-border py-2.5",
                  oggiStesso && "border-l-2 border-l-accent pl-3",
                )}
              >
                <div className="w-14 shrink-0">
                  <p className="t-nota uppercase">
                    {new Intl.DateTimeFormat("it-IT", { weekday: "short", timeZone: "UTC" }).format(data)}
                  </p>
                  <p className="font-display text-xl leading-none tabular-nums">
                    {new Intl.DateTimeFormat("it-IT", { day: "numeric", timeZone: "UTC" }).format(data)}
                  </p>
                </div>

                <div className="min-w-0 flex-1">
                  {!turno ? (
                    <p className="t-nota">Non ancora pianificato</p>
                  ) : lavora && turno.inizioMinuti !== null && turno.fineMinuti !== null ? (
                    <>
                      <p className="t-dato text-base">
                        {intervalloLeggibile(turno.inizioMinuti, turno.fineMinuti)}
                      </p>
                      <p className="t-nota truncate">
                        {[turno.servizio, turno.department?.toLowerCase(), turno.note]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </>
                  ) : (
                    <p className="t-corpo text-muted-foreground">
                      {ETICHETTA[turno.kind] ?? "Non in servizio"}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
