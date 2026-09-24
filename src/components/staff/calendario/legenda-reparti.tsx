import type { StaffDepartment } from "@prisma/client";
import { FAMIGLIA_REPARTO, FAMIGLIE, ORDINE_REPARTI, PALLINO_LEGENDA, siglaReparto } from "@/components/staff/calendario/famiglie";
import { cn } from "@/lib/utils";

/**
 * La chiave dei colori e delle sigle della vista mese.
 *
 * Stava nella barra laterale, fra i filtri: da 1280 px in giù quella barra è
 * un pannello che si apre con «Filtri», e la chiave spariva proprio dove le
 * sigle SA, CU, BA ne avevano bisogno. Un pannello di filtri serve a cambiare
 * quello che si vede, una legenda a leggerlo: sono due mestieri diversi e non
 * possono stare in un contenitore che si chiude. Quindi sta qui, sotto la
 * barra del mese, sempre in vista da tablet in su.
 *
 * Sul telefono non c'è, ed è voluto: a 390 px la vista mese non mostra
 * nemmeno un blocco alla prima schermata, e una chiave lì spiegherebbe dei
 * colori che non si vedono. Se il mese dal telefono servirà, la legenda
 * arriverà insieme a una vista mese rifatta per quella larghezza.
 *
 * Elenca **solo i reparti che esistono in questo locale**: con tutti e cinque
 * sempre presenti, in un ristorante senza bar e senza direzione due voci
 * parlavano di colori che nel calendario non compaiono mai — e una legenda che
 * descrive cose assenti insegna a non leggerla. Riposo e ferie invece ci sono
 * sempre: sono stati, non reparti, e nel mese si leggono dall'icona, quindi
 * non hanno sigla.
 */
export function LegendaReparti({
  repartiDisponibili,
  className,
}: {
  repartiDisponibili: StaffDepartment[];
  className?: string;
}) {
  const reparti = ORDINE_REPARTI.filter((d) => repartiDisponibili.includes(d)).map((d) => FAMIGLIA_REPARTO[d]);
  const stati = ["riposo", "assenza"] as const;

  return (
    <ul aria-label="Legenda dei reparti" className={cn("flex-wrap items-center gap-x-5 gap-y-1.5 px-1", className)}>
      {reparti.map((f) => (
        <li key={f} className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PALLINO_LEGENDA[f])} aria-hidden="true" />
          <span className="text-[0.7rem] font-medium tracking-wide text-foreground/80" aria-hidden="true">
            {siglaReparto(f)}
          </span>
          <span className="text-xs text-foreground/80">{FAMIGLIE[f].label}</span>
        </li>
      ))}
      {stati.map((f) => (
        <li key={f} className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PALLINO_LEGENDA[f])} aria-hidden="true" />
          <span className="text-xs text-foreground/80">{FAMIGLIE[f].label}</span>
        </li>
      ))}
    </ul>
  );
}
