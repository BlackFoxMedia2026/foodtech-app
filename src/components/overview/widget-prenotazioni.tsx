"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { NotificaPrenotazione } from "@/components/overview/notifica-prenotazione";
import { OggiAGruppi } from "@/components/overview/oggi-a-gruppi";
import { useVenueTimezone } from "@/components/shell/venue-time-provider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  annullaAzione,
  avviaAzione,
  azioneScaduta,
  contaPrenotazioni,
  dataEstesa,
  testoAvviso,
  type AzioneInSospeso,
  type AzioneNuova,
  type PrenotazioneRiquadro,
} from "@/lib/prenotazioni-nuove";

type Scheda = "nuove" | "oggi";

/** Quanto dura l'uscita della card verso destra: è quella del CSS. */
const USCITA_MS = 300;

type Avviso = { testo: string; annullabile: string | null };

/**
 * «Prenotazioni»: le nuove da gestire e la giornata, in due schede.
 *
 * Sostituisce «Prenotazioni di oggi», la linea del tempo a carosello. Le
 * nuove sono tutte visibili, in un elenco che scorre dentro il riquadro;
 * confermarne, rifiutarne o vederne una la fa uscire, e per cinque secondi un
 * avviso offre «Annulla». In quei cinque secondi la richiesta **non è ancora
 * partita** (vedi `ATTESA_ANNULLA_MS`).
 */
export function WidgetPrenotazioni({
  nuove,
  oggi,
  puoGestire,
}: {
  nuove: PrenotazioneRiquadro[];
  oggi: PrenotazioneRiquadro[];
  puoGestire: boolean;
}) {
  const router = useRouter();
  const fuso = useVenueTimezone();
  const [scheda, setScheda] = useState<Scheda>("nuove");
  const [adesso, setAdesso] = useState(() => new Date());

  /* Le card gestite in questa sessione: escono subito, prima che il server lo
     confermi, e restano fuori anche dopo il `refresh`. */
  const [uscenti, setUscenti] = useState<Set<string>>(() => new Set());
  const [nascoste, setNascoste] = useState<Set<string>>(() => new Set());
  const [avviso, setAvviso] = useState<Avviso | null>(null);

  /* L'azione in sospeso sta in un riferimento: la leggono il timer e
     `pagehide`, che non devono vedere uno stato di qualche giro fa. */
  const sospesa = useRef<AzioneInSospeso | null>(null);
  const timer = useRef<number | null>(null);
  /** Le uscite in corso: «Annulla» dentro i 300 ms deve fermare anche quelle. */
  const uscite = useRef(new Map<string, number>());
  const titoloElenco = useRef<HTMLHeadingElement>(null);

  // Il «· 11 min fa» resta vero senza ricaricare la pagina.
  useEffect(() => {
    const t = window.setInterval(() => setAdesso(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const mostra = useCallback((id: string) => {
    const t = uscite.current.get(id);
    if (t) window.clearTimeout(t);
    uscite.current.delete(id);
    setUscenti((s) => togli(s, id));
    setNascoste((s) => togli(s, id));
  }, []);

  const invia = useCallback(
    async (a: AzioneInSospeso, keepalive = false) => {
      try {
        const r = await fetch(`/api/bookings/${a.id}/gestisci`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ azione: a.azione }),
          keepalive,
        });
        // 409: l'ha già gestita un collega. La card resta fuori: non c'è
        // più niente da fare, e il `refresh` mostra com'è adesso.
        if (!r.ok && r.status !== 409) throw new Error(String(r.status));
        router.refresh();
      } catch {
        mostra(a.id);
        setAvviso({ testo: `Non è stato possibile salvare: ${a.nome} è di nuovo qui`, annullabile: null });
      }
    },
    [mostra, router],
  );

  const programma = useCallback(
    (a: AzioneInSospeso | null) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      if (!a) return;
      timer.current = window.setTimeout(() => {
        const r = azioneScaduta(sospesa.current, Date.now());
        sospesa.current = r.inSospeso;
        if (r.daInviare) {
          setAvviso((v) => (v?.annullabile === r.daInviare!.id ? null : v));
          void invia(r.daInviare);
        }
      }, Math.max(0, a.parteAlle - Date.now()));
    },
    [invia],
  );

  /* Chi chiude la pagina dentro i cinque secondi non perde il gesto: parte
     adesso, con `keepalive` perché sopravviva alla pagina. */
  useEffect(() => {
    const parti = () => {
      if (sospesa.current) {
        void invia(sospesa.current, true);
        sospesa.current = null;
      }
    };
    window.addEventListener("pagehide", parti);
    return () => {
      window.removeEventListener("pagehide", parti);
      parti();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [invia]);

  function agisci(p: PrenotazioneRiquadro, azione: AzioneNuova) {
    const r = avviaAzione(sospesa.current, { id: p.id, nome: p.nome, azione }, Date.now());
    sospesa.current = r.inSospeso;
    if (r.daInviare) void invia(r.daInviare);
    programma(r.inSospeso);

    setUscenti((s) => aggiungi(s, p.id));
    const sparisci = senzaMovimento() ? 0 : USCITA_MS;
    uscite.current.set(
      p.id,
      window.setTimeout(() => {
        uscite.current.delete(p.id);
        setNascoste((s) => aggiungi(s, p.id));
      }, sparisci),
    );
    setAvviso({ testo: testoAvviso(r.inSospeso), annullabile: p.id });
    // Il bottone premuto sta per sparire: il fuoco va in un posto che resta.
    titoloElenco.current?.focus();
  }

  function annulla(id: string) {
    const r = annullaAzione(sospesa.current, id);
    sospesa.current = r.inSospeso;
    programma(r.inSospeso);
    if (r.ripristina) mostra(r.ripristina);
    setAvviso(null);
  }

  // Un avviso senza «Annulla» (un errore) se ne va da solo.
  useEffect(() => {
    if (!avviso || avviso.annullabile) return;
    const t = window.setTimeout(() => setAvviso(null), 5_000);
    return () => window.clearTimeout(t);
  }, [avviso]);

  const elenco = nuove.filter((p) => !nascoste.has(p.id));
  const daGestire = elenco.filter((p) => !uscenti.has(p.id)).length;

  return (
    <TooltipProvider delayDuration={300}>
      <section
        aria-labelledby="riquadro-prenotazioni"
        className="vetro-ios flex min-w-0 flex-col md:min-h-0"
      >
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h2 id="riquadro-prenotazioni" className="vi-titolo">
              Prenotazioni
            </h2>
            <p className="vi-sottotitolo" suppressHydrationWarning>
              {dataEstesa(adesso, fuso)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="segmenti-ios" data-scelto={scheda === "oggi" ? "1" : "0"} role="group" aria-label="Quali prenotazioni">
              <span className="segmenti-ios-cursore" aria-hidden="true" />
              <button
                type="button"
                className="segmenti-ios-voce"
                aria-pressed={scheda === "nuove"}
                aria-controls="scheda-prenotazioni"
                onClick={() => setScheda("nuove")}
              >
                Nuove
                {daGestire > 0 && (
                  <span className="segmenti-ios-badge vi-cifre" aria-label={`${daGestire} da gestire`}>
                    {daGestire}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="segmenti-ios-voce"
                aria-pressed={scheda === "oggi"}
                aria-controls="scheda-prenotazioni"
                onClick={() => setScheda("oggi")}
              >
                Oggi
                <span className="segmenti-ios-conta vi-cifre" aria-label={`${oggi.length} oggi`}>
                  {oggi.length}
                </span>
              </button>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/bookings"
                  className="tondo-ios tondo-ios-44 tondo-ios-vetro"
                  aria-label="Apri il calendario delle prenotazioni"
                >
                  <CalendarDays className="h-5 w-5" strokeWidth={2} />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Calendario</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Solo l'elenco scorre: la testata resta dov'è. */}
        <div id="scheda-prenotazioni" className="vi-scorre -mx-2 mt-5 flex min-h-0 flex-1 flex-col px-2 md:overflow-y-auto">
          {scheda === "nuove" ? (
            <>
              <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
                <h3 ref={titoloElenco} tabIndex={-1} className="vi-titolo-sezione outline-none">
                  Da gestire
                </h3>
                {daGestire > 0 && <span className="vi-nota vi-cifre">{contaPrenotazioni(daGestire)}</span>}
              </div>

              {elenco.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                  <p className="vi-titolo-sezione">Tutto a posto</p>
                  <p className="vi-sottotitolo">Nessuna nuova prenotazione.</p>
                </div>
              ) : (
                <ul className="vi-elenco">
                  {elenco.map((p) => (
                    <NotificaPrenotazione
                      key={p.id}
                      p={p}
                      adesso={adesso}
                      fuso={fuso}
                      uscente={uscenti.has(p.id)}
                      puoGestire={puoGestire}
                      onAzione={(azione) => agisci(p, azione)}
                    />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="pb-2 pt-1">
              <OggiAGruppi prenotazioni={oggi} fuso={fuso} />
            </div>
          )}
        </div>

        {/* La regione viva c'è sempre, anche vuota: un `role="status"` che
            compare insieme al suo testo molti lettori di schermo non lo
            annunciano. */}
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center"
        >
          {avviso && (
            <div className="capsula-ios pointer-events-auto">
              <span className="capsula-ios-testo">{avviso.testo}</span>
              {avviso.annullabile ? (
                <button
                  type="button"
                  className="capsula-ios-azione"
                  onClick={() => annulla(avviso.annullabile!)}
                >
                  Annulla
                </button>
              ) : (
                <span className="w-3.5" />
              )}
            </div>
          )}
        </div>
      </section>
    </TooltipProvider>
  );
}

function aggiungi(s: Set<string>, id: string) {
  const n = new Set(s);
  n.add(id);
  return n;
}

function togli(s: Set<string>, id: string) {
  if (!s.has(id)) return s;
  const n = new Set(s);
  n.delete(id);
  return n;
}

function senzaMovimento() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
