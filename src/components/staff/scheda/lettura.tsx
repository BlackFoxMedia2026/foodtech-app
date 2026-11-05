import type { LucideIcon } from "lucide-react";
import { GIORNI_SETTIMANA } from "@/lib/scheda-dipendente";
import { cn } from "@/lib/utils";

/**
 * I mattoni della scheda **a riposo** (4 novembre 2026).
 *
 * Le linguette Dati personali e Lavoro erano moduli a riposo: etichette in
 * maiuscoletto sopra valori in fila, titoletti con il filo sotto — un foglio
 * Word. Questi mattoni le rendono come le schede ospite: riquadri incavati
 * (`Blocco`), un dischetto verde con l'icona per ogni dato (`Voce`), tessere
 * toccabili per i recapiti (`Contatto`), piccole cifre con l'icona
 * (`Tassello`). Il modulo di modifica resta `CampoModulo` in `sezione.tsx`.
 */

/** Un riquadro incavato col suo titoletto: lo stesso delle schede ospite. */
export function Blocco({
  titolo,
  azione,
  className,
  children,
}: {
  titolo: string;
  azione?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card-sunken/50 p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-muted-foreground">{titolo}</p>
        {azione}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** Il dischetto con l'icona: verde come i calendarini, oro per ciò che chiede attenzione. */
export function Dischetto({ icona: Icona, tinta = "verde" }: { icona: LucideIcon; tinta?: "verde" | "oro" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-cream shadow-[0_5px_12px_rgba(16,43,34,0.18)]",
        tinta === "verde"
          ? "bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)]"
          : "bg-[linear-gradient(160deg,#B8893A_0%,#8A6424_100%)]",
      )}
    >
      <Icona className="h-[18px] w-[18px]" />
    </span>
  );
}

/** Icona, etichetta piccola, valore. Il vuoto si scrive, in tono basso. */
export function Voce({
  icona,
  etichetta,
  nota,
  vuoto = "Non indicato",
  children,
}: {
  icona: LucideIcon;
  etichetta: string;
  /** Una pastiglia accanto al valore: «38 anni», «5 anni». */
  nota?: string;
  vuoto?: string;
  children: React.ReactNode;
}) {
  const manca = children === null || children === undefined || children === "";
  return (
    <div className="flex items-center gap-3">
      <Dischetto icona={icona} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{etichetta}</p>
        <p className={cn("break-words text-base leading-snug", manca ? "text-tertiary-foreground" : "text-foreground")}>
          {manca ? vuoto : children}
          {!manca && nota && <span className="ml-2 rounded-full bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">{nota}</span>}
        </p>
      </div>
    </div>
  );
}

/** Un recapito che si tocca: tutta la tessera è il link. */
export function Contatto({
  icona,
  etichetta,
  valore,
  href,
  vuoto = "Non indicato",
}: {
  icona: LucideIcon;
  etichetta: string;
  valore: string | null;
  href?: string;
  vuoto?: string;
}) {
  const corpo = (
    <>
      <Dischetto icona={icona} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{etichetta}</p>
        <p className={cn("break-all text-base leading-snug", valore ? "text-foreground" : "text-tertiary-foreground")}>{valore || vuoto}</p>
      </div>
    </>
  );
  return valore && href ? (
    <a href={href} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/70 p-2.5 transition-colors hover:border-border-strong hover:bg-card">
      {corpo}
    </a>
  ) : (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-2.5">{corpo}</div>
  );
}

/** Una cifra piccola con la sua icona: per i termini di un contratto. */
export function Tassello({
  icona: Icona,
  etichetta,
  valore,
  nota,
  vuoto = "Non indicato",
}: {
  icona: LucideIcon;
  etichetta: string;
  valore: string | null;
  nota?: string;
  vuoto?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-card-sunken/50 p-3.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icona className="h-3.5 w-3.5 shrink-0 text-accent-strong" aria-hidden="true" /> {etichetta}
      </p>
      <p className={cn("mt-1 break-words text-lg leading-snug", valore ? "text-foreground" : "text-base text-tertiary-foreground")}>
        {valore ?? vuoto}
      </p>
      {nota && valore && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** I sette giorni, da lunedì: pieni quelli lavorativi, vuoti gli altri. */
export function GiorniSettimana({ giorni }: { giorni: number[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Giorni lavorativi">
      {GIORNI_SETTIMANA.map((g) => {
        const lavora = giorni.includes(g.value);
        return (
          <li
            key={g.value}
            title={`${g.label}: ${lavora ? "lavorativo" : "libero"}`}
            className={cn(
              "grid h-10 w-11 place-items-center rounded-lg text-[13px] font-semibold",
              lavora
                ? "bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)] text-cream shadow-[0_4px_10px_rgba(16,43,34,0.18)]"
                : "border border-dashed border-border text-tertiary-foreground",
            )}
          >
            {g.breve}
            <span className="sr-only">{lavora ? " lavorativo" : " libero"}</span>
          </li>
        );
      })}
    </ul>
  );
}
