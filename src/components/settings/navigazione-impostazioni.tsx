"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Building2, CalendarRange, Megaphone, SlidersHorizontal, Users } from "lucide-react";
import { PARTI, type ParteId } from "@/lib/parti-impostazioni";
import { classiVoce } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";
import { useImpostazioni } from "./contesto-impostazioni";

/**
 * Entrare nelle Impostazioni è **un cambio di area**, non una pagina in più.
 *
 * Prima la barra del gestionale restava in alto — otto voci di servizio — e le
 * parti delle Impostazioni erano una seconda fila di pillole sotto il
 * titolo. Due navigazioni contemporanee, e quella di sotto sembrava una fila
 * di filtri: nella grammatica del prodotto una pillola crema in una riga
 * orizzontale è un filtro dappertutto, tranne lì.
 *
 * Adesso al posto delle otto voci compaiono le quattro sezioni, nello stesso
 * contenitore, con la stessa pillola che scorre. La barra è una sola, sempre,
 * e cambia quello che contiene: è il modo in cui si dice «adesso sei
 * altrove» senza scrivere da nessuna parte «adesso sei altrove».
 *
 * A sinistra la via d'uscita. Senza, l'unica strada per tornare al gestionale
 * sarebbe il menu del profilo — cioè la stessa porta da cui si è entrati, che
 * nessuno ricorda.
 */

const SEGNI: Record<ParteId, { icona: React.ComponentType<{ className?: string }>; breve: string }> = {
  locale: { icona: Building2, breve: "Locale" },
  prenotazioni: { icona: CalendarRange, breve: "Prenot." },
  ospiti: { icona: Users, breve: "Ospiti" },
  /* Lo stesso megafono della voce in barra: è la stessa area del prodotto
     vista da due parti, e due simboli diversi la farebbero sembrare due cose. */
  marketing: { icona: Megaphone, breve: "Marketing" },
  sistema: { icona: SlidersHorizontal, breve: "Sistema" },
};

export function NavigazioneImpostazioni() {
  const { attiva, vaiA } = useImpostazioni();
  const pathname = usePathname();
  const riferimenti = useRef(new Map<ParteId, HTMLElement>());
  const [pillola, setPillola] = useState<{ left: number; width: number } | null>(null);
  const [motoRidotto, setMotoRidotto] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMotoRidotto(query.matches);
    const cambia = () => setMotoRidotto(query.matches);
    query.addEventListener("change", cambia);
    return () => query.removeEventListener("change", cambia);
  }, []);

  useLayoutEffect(() => {
    const el = riferimenti.current.get(attiva);
    setPillola(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [attiva, pathname]);

  /*
    Dentro una sottopagina — il brand, il Wi-Fi, i pagamenti, il piano DEM —
    le sezioni non sono in pagina: non c'è niente a cui scorrere, e le voci
    tornano a essere quello che sembrano, link che riportano all'indice.
    `vaiA` lo dice da sé tornando falso, quindi qui non c'è nessun elenco di
    percorsi da tenere aggiornato.
  */
  const nellIndice = pathname === "/settings";

  return (
    <nav
      aria-label="Sezioni delle impostazioni"
      className="hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex"
    >
      <Link
        href="/overview"
        title="Torna al gestionale"
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-cream hover:text-foreground xl:text-sm"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden xl:inline">Gestionale</span>
        <span className="sr-only xl:hidden">Torna al gestionale</span>
      </Link>

      <div className="relative flex items-center gap-1 rounded-full border border-border bg-muted/70 p-1">
        {pillola && (
          <div
            aria-hidden="true"
            className="absolute inset-y-1 z-0 rounded-full bg-cream"
            style={{
              left: pillola.left,
              width: pillola.width,
              transition: motoRidotto ? "none" : "left 260ms ease-in-out, width 260ms ease-in-out",
            }}
          />
        )}

        {PARTI.map((parte) => {
          const { icona: Icona, breve } = SEGNI[parte.id];
          const accesa = nellIndice && parte.id === attiva;
          return (
            <a
              key={parte.id}
              href={`/settings#${parte.id}`}
              title={parte.titolo}
              aria-current={accesa ? "true" : undefined}
              ref={(el) => {
                if (el) riferimenti.current.set(parte.id, el);
                else riferimenti.current.delete(parte.id);
              }}
              onClick={(e) => {
                // Un clic con un modificatore vuole aprire altrove: non è nostro.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                if (vaiA(parte.id)) e.preventDefault();
              }}
              className={classiVoce(accesa)}
            >
              <Icona className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden 2xl:inline">{parte.titolo}</span>
              <span className="2xl:hidden">{breve}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * La stessa barra sul telefono, **dentro la pagina**.
 *
 * In alto non può stare: su telefono la testata non porta voci — la
 * navigazione è la barra in basso — e infilarci quattro pillole vorrebbe dire
 * rifare lì il problema delle due file. Qui sta appiccicata al bordo alto
 * mentre si scorre, scorre di lato invece di andare a capo, ed è l'unico posto
 * della pagina dove lo spazio orizzontale si consuma tutto.
 */
export function BarraImpostazioniMobile() {
  const { attiva, vaiA } = useImpostazioni();
  const riferimenti = useRef(new Map<ParteId, HTMLElement>());

  /* La voce accesa si porta in vista da sé: con quattro pillole su uno
     schermo da 360 px l'ultima sta fuori, e restare accesa fuori campo
     equivale a non esserlo. */
  useLayoutEffect(() => {
    riferimenti.current.get(attiva)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [attiva]);

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:hidden">
      <nav
        aria-label="Sezioni delle impostazioni"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1"
      >
        {PARTI.map((parte) => {
          const accesa = parte.id === attiva;
          return (
            <a
              key={parte.id}
              href={`/settings#${parte.id}`}
              aria-current={accesa ? "true" : undefined}
              ref={(el) => {
                if (el) riferimenti.current.set(parte.id, el);
                else riferimenti.current.delete(parte.id);
              }}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                if (vaiA(parte.id)) e.preventDefault();
              }}
              className={cn(
                "flex min-h-[40px] shrink-0 items-center rounded-full border px-3 text-sm transition-colors",
                accesa
                  ? "border-cream bg-cream font-medium text-clay-ink"
                  : "border-border text-muted-foreground",
              )}
            >
              {parte.titolo}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
