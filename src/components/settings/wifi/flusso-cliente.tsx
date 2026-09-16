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
    <ol
      className={cn(
        // Su telefono due colonne: quattro riquadri in fila diventerebbero
        // quattro colonne da 80 px con le parole spezzate a metà.
        "grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-0",
        className,
      )}
    >
      {PASSI.map((passo, i) => (
        <li key={passo.titolo} className="flex items-center gap-2 md:flex-1">
          <div className="riquadro comodo flex min-w-0 flex-1 flex-col items-center gap-2 bg-card/40 p-3 text-center md:gap-2.5">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent-strong md:h-10 md:w-10"
              aria-hidden="true"
            >
              <passo.icona className="h-4 w-4 md:h-[18px] md:w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium leading-tight md:text-sm">{passo.titolo}</p>
              <p className="mt-0.5 t-nota leading-tight">{passo.nota}</p>
            </div>
          </div>
          {/* Il trattino fra un passo e l'altro c'è solo dove i quattro
              riquadri stanno davvero in fila: in griglia due per due
              punterebbe dal primo al secondo e dal terzo al quarto, cioè
              racconterebbe un ordine che non è quello. */}
          {i < PASSI.length - 1 && (
            <span className="hidden h-px w-3 shrink-0 bg-border md:block lg:w-5" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}
