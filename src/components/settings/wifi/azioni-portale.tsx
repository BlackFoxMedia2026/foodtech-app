"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, HelpCircle, Pause, Play, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { salvaPortaleWifi, type PortaleWifiPayload } from "@/lib/wifi-portale-api";
import { cn, formatDate } from "@/lib/utils";
import { GuidaRouter } from "./guida-router";

/**
 * I comandi della fascia verde: quelli che cambiano **una cosa sola**.
 *
 * La pagina del portale è diventata operativa: in cima la fascia con lo stato
 * e i gesti di tutti i giorni (aprirlo, stampare il QR, collegarlo al router,
 * sospenderlo per una sera), sotto il percorso del cliente, e in fondo il
 * builder con il telefono accanto. Prima i gesti stavano in due carte a metà
 * pagina — «Come i clienti arrivano al portale» e «Impostazioni avanzate» — e
 * la fascia di stato aveva un solo pulsante, «Gestisci», che portava fuori.
 *
 * Ognuno manda **solo il proprio campo** (vedi `setPortale`: ciò che non
 * arriva non si tocca). Un interruttore che per cambiare sé stesso rispedisce
 * anche la password è un modo per perderla.
 */

function useSalvataggio() {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(payload: PortaleWifiPayload) {
    setInCorso(true);
    setErrore(null);
    try {
      await salvaPortaleWifi(payload);
      router.refresh();
      return true;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non siamo riusciti a salvare. Riprova.");
      return false;
    } finally {
      setInCorso(false);
    }
  }

  return { salva, inCorso, errore };
}

/**
 * I tre gesti accanto ad «Apri il portale»: il QR, il router, la pausa.
 *
 * Il QR viene prima perché funziona con qualunque apparato; il router dopo,
 * perché dipende da quello che il locale ha in casa. La pausa è un'icona sola
 * in fondo: si usa di rado, e non deve stare alla pari dei due che portano
 * clienti al portale.
 */
export function ComandiPortale({
  portaleUrl,
  attivo,
  canManage,
}: {
  portaleUrl: string;
  attivo: boolean;
  canManage: boolean;
}) {
  const { salva, inCorso, errore } = useSalvataggio();

  return (
    <>
      <Button asChild variant="ghost" className="comando-su-verde h-11 rounded-full px-4">
        <Link href="/marketing/qr-codes/nuovo?tipo=CUSTOM">
          <QrCode className="h-4 w-4" aria-hidden="true" />
          Crea il QR
        </Link>
      </Button>
      <GuidaRouter
        portaleUrl={portaleUrl}
        etichetta="Collega al router"
        className="comando-su-verde h-11"
      />
      {canManage && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={inCorso}
          onClick={() => salva({ attivo: !attivo })}
          className={cn("h-11 w-11 rounded-full", attivo ? "comando-su-verde" : "comando-crema")}
          aria-label={attivo ? "Sospendi il portale" : "Riaccendi il portale"}
          title={attivo ? "Sospendi il portale" : "Riaccendi il portale"}
        >
          {attivo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
      )}
      {errore && <p className="w-full text-sm text-[#f3b7a6]">{errore}</p>}
    </>
  );
}

/**
 * Il router, in una riga sotto il nome della rete.
 *
 * Dal router non arriva **nessun segnale**: non possiamo sapere se il portale
 * sia davvero la sua pagina di accesso, e non facciamo finta. La spunta la
 * mette il locale, con la sua data, e si può togliere.
 */
export function StatoRouter({ collegatoIl, canManage }: { collegatoIl: Date | null; canManage: boolean }) {
  const { salva, inCorso } = useSalvataggio();
  const collegato = collegatoIl != null;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {collegato ? (
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-[#9fd4a8]" aria-hidden="true" />
          Router collegato, dichiarato il {formatDate(collegatoIl!)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-[#ddc38f]" aria-hidden="true" />
          Router da verificare
        </span>
      )}
      {canManage && (
        <button
          type="button"
          disabled={inCorso}
          onClick={() => salva({ routerCollegato: !collegato })}
          className="underline decoration-[#f7f3ea]/40 underline-offset-2 hover:text-[#f7f3ea] disabled:opacity-50"
        >
          {collegato ? "non è più collegato" : "l'ho collegato"}
        </button>
      )}
    </span>
  );
}
