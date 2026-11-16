import { Check, KeyRound, Smartphone, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cosa succede a chi si collega, in quattro figure.
 *
 * Sta in cima alla pagina e prima della configurazione perché è la sola cosa
 * che un ristoratore deve capire per decidere se questa funzione gli serve:
 * **il cliente apre una pagina, lascia un contatto, riceve la password.** La
 * versione precedente lo spiegava in un paragrafo che cominciava con «Tavolo
 * non apre la rete — quello lo fa il tuo router», cioè apriva la funzione
 * dichiarando quello che non fa.
 *
 * Quattro passi e non tre: l'ultimo — «si collega» — è quello che avviene
 * fuori da qui, sulle impostazioni Wi-Fi del telefono, ed è anche il motivo
 * per cui a noi tocca solo lo scambio. Dirlo in una figura costa meno di un
 * paragrafo e si guarda in un secondo.
 */

const PASSI = [
  { icona: Smartphone, titolo: "Apre il portale", nota: "dal telefono, appena entrato" },
  { icona: UserRound, titolo: "Lascia i suoi dati", nota: "nome e un recapito" },
  { icona: KeyRound, titolo: "Riceve la password", nota: "subito, in pagina" },
  { icona: Check, titolo: "Si collega", nota: "alla rete del locale" },
] as const;

export function FlussoCliente({ className }: { className?: string }) {
  return (
    // Una sola lastra, non quattro riquadri: è un percorso, e i passi si
    // leggono come tappe di una stessa linea. Su telefono due per riga, e la
    // linea che li unisce sparisce — racconterebbe un ordine che non è quello.
    <ol
      className={cn(
        "surface grid grid-cols-2 gap-x-3 gap-y-5 px-4 py-5 md:grid-cols-4 md:gap-0 md:px-2",
        className,
      )}
    >
      {PASSI.map((passo, i) => (
        <li key={passo.titolo} className="relative flex flex-col items-center gap-2.5 text-center md:px-3">
          {i < PASSI.length - 1 && (
            <span
              className="absolute left-[calc(50%+1.75rem)] right-[calc(-50%+1.75rem)] top-5 hidden border-t border-dashed border-[#c9a96a]/60 md:block"
              aria-hidden="true"
            />
          )}
          <span
            className={cn(
              "relative grid h-10 w-10 shrink-0 place-items-center rounded-full",
              i === PASSI.length - 1
                ? "bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_rgba(16,32,26,0.5)]"
                : "bg-[#c9a96a]/20 text-accent-strong",
            )}
            aria-hidden="true"
          >
            <passo.icona className="h-[18px] w-[18px]" />
            <span className="absolute -right-1 -top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-card text-[10px] font-semibold tabular-nums text-accent-strong shadow-[0_1px_3px_rgba(60,45,20,0.25)]">
              {i + 1}
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-card-foreground">{passo.titolo}</p>
            <p className="mt-0.5 t-nota leading-tight">{passo.nota}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
