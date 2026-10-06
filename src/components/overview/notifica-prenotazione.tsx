"use client";

import { CalendarDays, Check, Eye, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  daQuanto,
  etichettaAzione,
  persone,
  pillaNuova,
  quandoArriva,
  type AzioneNuova,
  type PrenotazioneRiquadro,
} from "@/lib/prenotazioni-nuove";
import { cn } from "@/lib/utils";

/**
 * Una prenotazione da gestire, come una notifica: chi, quando, quanti, e a
 * destra i gesti. Quella in attesa ha Rifiuta e Conferma; quella che un
 * collega ha già confermato ha solo l'occhio, «l'ho vista».
 */
export function NotificaPrenotazione({
  p,
  adesso,
  fuso,
  uscente,
  puoGestire,
  onAzione,
}: {
  p: PrenotazioneRiquadro;
  adesso: Date;
  fuso: string;
  uscente: boolean;
  puoGestire: boolean;
  onAzione: (azione: AzioneNuova) => void;
}) {
  const pilla = pillaNuova(p);
  const quando = quandoArriva(new Date(p.startsAt), adesso, fuso);

  return (
    <li className="vi-notifica vetro-ios-scheda" data-uscente={uscente} aria-hidden={uscente || undefined}>
      <div className="flex items-center gap-2.5">
        <span className="vi-icona-app" aria-hidden="true">
          <CalendarDays className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <p className="min-w-0 flex-1 truncate">
          <span className="vi-etichetta-app">Nuova prenotazione</span>{" "}
          {/* Il tempo relativo cambia fra il server e il browser: è giusto
              che il browser vinca. */}
          <span className="vi-quando" suppressHydrationWarning>
            · {daQuanto(new Date(p.createdAt), adesso)}
          </span>
        </p>
        <span className="pillola-ios" data-tono={pilla.tipo}>
          {pilla.parola}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="vi-nome">{p.nome}</p>
          <p className="vi-dettaglio">
            {quando.prefisso} <strong>{quando.ora}</strong> · {persone(p.partySize)}
          </p>
        </div>

        {puoGestire && (
          <div className="flex shrink-0 items-center gap-3">
            {pilla.tipo === "da-confermare" ? (
              <>
                <BottoneAzione
                  azione="rifiuta"
                  nome={p.nome}
                  suggerimento="Rifiuta"
                  className="tondo-ios-vetro"
                  onClick={() => onAzione("rifiuta")}
                  disabled={uscente}
                >
                  <X className="h-5 w-5" style={{ color: "var(--vi-rosso)" }} strokeWidth={2.4} />
                </BottoneAzione>
                <BottoneAzione
                  azione="conferma"
                  nome={p.nome}
                  suggerimento="Conferma"
                  className="tondo-ios-pieno"
                  onClick={() => onAzione("conferma")}
                  disabled={uscente}
                >
                  <Check className="h-[22px] w-[22px]" strokeWidth={2.6} />
                </BottoneAzione>
              </>
            ) : (
              <BottoneAzione
                azione="vista"
                nome={p.nome}
                suggerimento="Segna come vista"
                className="tondo-ios-vetro"
                onClick={() => onAzione("vista")}
                disabled={uscente}
              >
                <Eye className="h-5 w-5" strokeWidth={2.2} />
              </BottoneAzione>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function BottoneAzione({
  azione,
  nome,
  suggerimento,
  className,
  onClick,
  disabled,
  children,
}: {
  azione: AzioneNuova;
  nome: string;
  suggerimento: string;
  className: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn("tondo-ios tondo-ios-52", className)}
          aria-label={etichettaAzione(azione, nome)}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{suggerimento}</TooltipContent>
    </Tooltip>
  );
}
