"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [inCambio, avvia] = useTransition();
  // La voce cliccata si accende subito: la vista di prima resta a schermo
  // finché la nuova non è pronta (niente scheletro fra una vista e l'altra,
  // vedi `staff/loading.tsx`), e senza questo il clic sembrerebbe ignorato.
  const [scelta, setScelta] = useState<typeof vista | null>(null);
  const accesa = inCambio && scelta ? scelta : vista;
  const coda = giorno ? `?g=${giorno}` : "";
  const voci = [
    { chiave: "persone" as const, label: "Persone", href: `/staff${coda}` },
    { chiave: "turni" as const, label: "Turni", href: `/staff/turni${coda}` },
    /* Le richieste stanno qui e non in un menu: si guardano **prima** di
       scrivere i turni, e una pagina raggiungibile solo dall'indirizzo è una
       pagina che nessuno apre. */
    { chiave: "richieste" as const, label: "Richieste", href: `/staff/richieste${coda}` },
  ];

  return (
    <nav
      aria-label="Vista dello staff"
      className={cn("flex items-center gap-0.5 rounded-full border border-border/60 bg-veil-4 p-0.5", className)}
    >
      {voci.map((v) => {
        const attiva = v.chiave === accesa;
        return (
          <Link
            key={v.chiave}
            href={v.href}
            scroll={false}
            onClick={(e) => {
              // Ctrl/⌘-clic e clic centrale aprono una scheda nuova: quelli
              // restano al browser.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              if (v.chiave === vista) return;
              setScelta(v.chiave);
              avvia(() => router.push(v.href, { scroll: false }));
            }}
            aria-current={v.chiave === vista ? "page" : undefined}
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 text-center text-sm font-medium transition-colors md:block md:min-h-0 md:py-1.5 md:text-xs",
              attiva ? "bg-segment text-segment-ink" : "text-muted-foreground hover:bg-veil-10 hover:text-foreground",
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
