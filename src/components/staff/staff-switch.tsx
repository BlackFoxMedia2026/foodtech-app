"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Le due facce dello Staff, in un interruttore.
 *
 * Erano due linguette accanto a un titolo «Staff», in cima alla pagina. Il
 * titolo diceva una cosa che la barra di navigazione diceva già (la voce
 * «Staff» è accesa lì sopra), e le linguette sembravano una sezione dentro una
 * sezione. Qui sono quello che sono davvero: **un interruttore fra due modi di
 * guardare le stesse persone** — l'elenco e il calendario — e sta dove stanno
 * gli altri comandi che cambiano cosa si vede, cioè nella colonna di sinistra.
 *
 * Restano due indirizzi veri e non due stati, perché «mandami il link dei
 * turni di sabato» deve continuare a funzionare. Il giorno scelto viaggia
 * nell'indirizzo, così passando da una vista all'altra non si torna a oggi;
 * i filtri viaggiano in `sessionStorage` (vedi `useFiltriStaff`).
 */
export function StaffSwitch({
  vista,
  giorno,
  className,
}: {
  vista: "persone" | "turni" | "richieste";
  giorno?: string;
  className?: string;
}) {
  const coda = giorno ? `?g=${giorno}` : "";
  const voci = [
    { chiave: "persone" as const, label: "Persone", href: `/staff${coda}` },
    { chiave: "turni" as const, label: "Turni", href: `/staff/turni${coda}` },
    /* Le richieste stanno qui e non in un menu: si guardano **prima** di
       scrivere i turni, e una pagina raggiungibile solo dall'indirizzo è una
       pagina che nessuno apre. */
    { chiave: "richieste" as const, label: "Richieste", href: "/staff/richieste" },
  ];

  return (
    <nav
      aria-label="Vista dello staff"
      className={cn("flex items-center gap-0.5 rounded-full border border-border/60 bg-cream/[0.04] p-0.5", className)}
    >
      {voci.map((v) => {
        const attiva = v.chiave === vista;
        return (
          <Link
            key={v.chiave}
            href={v.href}
            scroll={false}
            aria-current={attiva ? "page" : undefined}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-center text-xs font-medium transition-colors",
              attiva ? "bg-cream text-clay-ink" : "text-muted-foreground hover:bg-cream/10 hover:text-foreground",
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
