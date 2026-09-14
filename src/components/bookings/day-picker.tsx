"use client";

import { useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useVenueToday } from "@/components/shell/venue-time-provider";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ALTEZZA, BottoneOggi } from "@/components/bookings/barra-prenotazioni";
import { cn } from "@/lib/utils";

/**
 * Che giorno sto guardando: la capsula, e «Oggi» accanto.
 *
 * Prima erano tre cose affiancate che dicevano due volte la stessa data — il
 * campo nativo («14/09/2026»), l'etichetta lunga («lunedì 14 settembre») e le
 * frecce — e dentro la stessa capsula c'era anche «Oggi», che sembrava la
 * terza freccia del gruppo.
 *
 * Adesso la capsula contiene **soltanto** la navigazione del giorno: freccia,
 * data, freccia. La data si scrive una volta, nella forma che serve a chi
 * lavora — il giorno della settimana, che è ciò che distingue un martedì da un
 * sabato. Il campo nativo resta, è lui che apre il calendario e che la
 * tastiera raggiunge, ma è trasparente sopra l'etichetta: così il selettore di
 * sistema continua a funzionare senza stampare una seconda data.
 *
 * «Oggi» è fuori, in tono minore: è una scorciatoia, non una decisione.
 */
export function DayPicker({ value }: { value: string }) {
  const today = useVenueToday();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const campo = useRef<HTMLInputElement>(null);

  function go(day: string) {
    const sp = new URLSearchParams(search);
    sp.set("day", day);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function shift(delta: number) {
    const d = new Date(value);
    d.setDate(d.getDate() + delta);
    go(d.toISOString().slice(0, 10));
  }

  const giorno = new Date(value);
  const eOggi = value === today;
  /* L'anno si scrive solo quando non è quello corrente: su una pagina che si
     usa per la sera di oggi, «2026» è una parola che non fa cambiare niente a
     nessuno. Quando invece si guarda il capodanno dell'anno prossimo, serve. */
  const annoDiverso = giorno.getFullYear() !== new Date(today).getFullYear();
  const formato: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    ...(annoDiverso ? { year: "numeric" as const } : {}),
  };
  const etichetta = giorno.toLocaleDateString("it-IT", { weekday: "long", ...formato });
  /*
    Sotto 1440 px il giorno della settimana si abbrevia — «mer 24 settembre».

    Non è il font a scendere: quello resta a 15 px ovunque. È la sola parola
    della barra che si può accorciare senza perdere l'informazione, e accorciarla
    tiene tutta la riga su una riga anche su un portatile da tredici pollici con
    un mercoledì (la parola più lunga della settimana costa cinquanta pixel più
    di «lun»). Senza, la barra andava a capo e il ritmo dei tre gruppi spariva.
  */
  const etichettaCorta = giorno.toLocaleDateString("it-IT", { weekday: "short", ...formato });

  return (
    <div className="flex shrink-0 items-center gap-2 min-[1280px]:gap-2.5 min-[1440px]:gap-3">
      <div
        className={cn(
          ALTEZZA,
          "flex items-center gap-1 rounded-full border border-border/70 bg-card/70 px-1",
        )}
      >
        <Freccia verso="indietro" onClick={() => shift(-1)} />

        {/*
          L'etichetta e il campo sono lo stesso bersaglio: il campo nativo sta
          sopra, trasparente, e prende il clic. `showPicker()` dove c'è (Chrome,
          Safari 16+, Firefox 101+) apre il calendario anche quando il clic cade
          sul testo invece che sull'icona nativa, che qui è invisibile.
        */}
        <span className="relative flex h-9 items-center rounded-full px-1.5 transition-colors hover:bg-cream/[0.06] focus-within:ring-2 focus-within:ring-ring lg:h-10 min-[1500px]:px-2.5">
          {/*
            La data è il testo più pesante della barra dopo la chiamata
            all'azione: è la domanda a cui questa pagina risponde per prima.
          */}
          <span className="whitespace-nowrap text-[0.9375rem] font-semibold first-letter:uppercase min-[1440px]:text-base min-[1500px]:text-[1.0625rem]">
            <span className="min-[1440px]:hidden">{etichettaCorta}</span>
            <span className="hidden min-[1440px]:inline">{etichetta}</span>
          </span>
          <input
            ref={campo}
            type="date"
            value={value}
            aria-label="Scegli la data"
            onChange={(e) => e.target.value && go(e.target.value)}
            onClick={() => {
              try {
                campo.current?.showPicker?.();
              } catch {
                /* Alcuni browser rifiutano `showPicker` fuori da un gesto che
                   riconoscono: il campo è comunque sotto il dito, e il selettore
                   nativo si apre da solo. */
              }
            }}
            className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
          />
        </span>

        <Freccia verso="avanti" onClick={() => shift(1)} />
      </div>

      <BottoneOggi attivo={eOggi} onClick={() => go(today)} />
    </div>
  );
}

/** La freccia in un dischetto: bersaglio tondo, nessun bagliore. */
function Freccia({ verso, onClick }: { verso: "indietro" | "avanti"; onClick: () => void }) {
  const Icona = verso === "indietro" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={verso === "indietro" ? "Giorno precedente" : "Giorno successivo"}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/60 bg-secondary/40 text-muted-foreground transition-colors lg:h-10 lg:w-10",
        "hover:border-border-strong/70 hover:bg-secondary/70 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Icona className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}
