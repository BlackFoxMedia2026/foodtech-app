"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TitoloPagina } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

type Venue = { id: string; name: string; city: string | null };

/**
 * Il marchio del locale e — accanto — **il titolo della pagina**.
 *
 * Il titolo stava in cima al contenuto, uguale su ogni schermata, e costava
 * una riga proprio dove serve di più: su Servizio, fra titolo, riquadri e
 * avvisi, la prima colonna operativa cominciava sotto la piega. Qui invece lo
 * spazio c'è già — la testata è alta 64 px e a sinistra c'era solo un
 * quadratino da 36.
 *
 * Quando si tocca il marchio, il titolo **scivola via** e al suo posto arriva
 * la scelta del locale: è lo stesso posto, quindi non ci sono due cose che si
 * contendono l'angolo, e chi sta scegliendo il locale non ha bisogno di
 * leggere in che pagina si trova.
 */
export function VenueSwitcher({
  venues,
  activeId,
  titolo,
}: {
  venues: Venue[];
  activeId: string;
  /** Il titolo della pagina aperta, per intero e abbreviato. Manca sulle
   * schermate che non ne hanno uno fisso (l'onboarding, una pagina d'errore):
   * lì resta solo il marchio. */
  titolo?: TitoloPagina | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      // While the venue dropdown itself is open, its items render in a portal
      // outside `wrapperRef` — a click there must not be treated as "outside".
      if (selectOpen) return;
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, selectOpen]);

  function pick(id: string) {
    start(async () => {
      await fetch("/api/tenant/venue", {
        method: "POST",
        body: JSON.stringify({ venueId: id }),
        headers: { "content-type": "application/json" },
      });
      router.refresh();
    });
  }

  const attivo = venues.find((v) => v.id === activeId);

  return (
    <div ref={wrapperRef} className="flex min-w-0 items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Seleziona locale"
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
        onClick={() => setOpen(true)}
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-brown-dark text-ink ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          reducedMotion ? "transition-none" : "transition-[width,opacity] duration-[400ms]",
          open ? "h-9 w-0 opacity-0 pointer-events-none" : "h-9 w-9 opacity-100",
        )}
      >
        <span className="font-display text-sm font-semibold">T</span>
      </button>

      <button
        type="button"
        aria-label="Comprimi selettore ristorante"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
        className={cn(
          "flex shrink-0 items-center gap-1 overflow-hidden text-muted-foreground ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          reducedMotion ? "transition-none" : "transition-[width,opacity,margin-right] duration-[400ms]",
          open ? "mr-1 w-5 opacity-100" : "mr-0 w-0 opacity-0 pointer-events-none",
        )}
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        <span className="h-5 w-px shrink-0 bg-foreground/30" aria-hidden="true" />
      </button>

      <div
        className={cn(
          "overflow-hidden ease-[cubic-bezier(0.16,1,0.3,1)]",
          reducedMotion ? "transition-none" : "transition-[width,opacity] duration-[400ms]",
          open ? "w-40 opacity-100" : "w-0 opacity-0",
        )}
      >
        <div
          className={cn(
            "w-40 ease-[cubic-bezier(0.16,1,0.3,1)]",
            reducedMotion ? "transition-none" : "transition-[opacity,transform] duration-300",
            open ? "translate-x-0 opacity-100 delay-100" : "-translate-x-2 opacity-0 delay-0",
          )}
        >
          <Select value={activeId} onValueChange={pick} disabled={pending} onOpenChange={setSelectOpen}>
            <SelectTrigger className="h-9 w-40 rounded-lg border-border bg-transparent px-2.5">
              <div className="flex min-w-0 items-center gap-1.5 truncate">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {venues.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{v.name}</span>
                    {v.city && <span className="text-xs text-muted-foreground">{v.city}</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/*
        Il titolo occupa il posto che il selettore lascia libero.

        Si comprime con `max-width` e non con `width` perché la parola cambia
        da pagina a pagina — «Servizio» e «Nuova prenotazione» non misurano
        uguale — e una larghezza fissa avrebbe tagliato la seconda o lasciato
        un buco dopo la prima. Resta nell'albero anche da chiuso: è
        l'intestazione della pagina, e chi naviga con lo schermo letto ad alta
        voce deve sentirla comunque.
      */}
      {titolo && (
        <div
          className={cn(
            "flex min-w-0 items-center overflow-hidden ease-[cubic-bezier(0.16,1,0.3,1)]",
            reducedMotion ? "transition-none" : "transition-[max-width,opacity] duration-[400ms]",
            open ? "max-w-0 opacity-0" : "max-w-[22rem] opacity-100",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 items-baseline gap-2 pl-3 ease-[cubic-bezier(0.16,1,0.3,1)]",
              reducedMotion ? "transition-none" : "transition-transform duration-[400ms]",
              open ? "-translate-x-2" : "translate-x-0",
            )}
          >
            {/* Un gradino più piccolo sul telefono: «Prenotazioni» a 18 px
                finisce nei puntini fra il marchio e le quattro icone a
                destra, e un titolo troncato è peggio di un titolo piccolo. */}
            <h1 className="truncate text-base font-semibold leading-none sm:text-lg">
              <span className="sm:hidden">{titolo.breve}</span>
              <span className="hidden sm:inline">{titolo.lungo}</span>
            </h1>
            {/* Il nome del locale: la «T» dice il prodotto, non dice quale
                ristorante si sta guardando. Sparisce dove lo spazio finisce —
                sotto i 1280 px la fila delle voci ha la precedenza, e sopra
                ha un tetto: un nome di locale lungo non deve costare una voce
                in barra. */}
            {attivo && (
              <span className="t-etichetta hidden max-w-[10rem] truncate xl:inline" title={attivo.name}>
                {attivo.name}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
