"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  Footprints,
  Minus,
  Plus,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { chiedi, ErroreStaff } from "@/lib/staff-fetch";
import { useAvvisi } from "@/components/ui/avvisi";
import type { Idoneita, Proposta, TavoloProposto, Unione } from "@/lib/suggerimento-tavolo";
import type { OspiteDaAccomodare } from "@/server/staff-app/da-accomodare";
import type { TavoloStaff } from "@/server/staff-app/sala";
import { Foglio } from "./foglio";

/**
 * **I due fogli dell'accomodamento** — il §4 del brief, per intero.
 *
 * In sala si lavora in due direzioni, nella stessa serata:
 *
 * - **dall'ospite**: arriva Rossi, e si cerca un tavolo. `FoglioTrovaTavolo`;
 * - **dal tavolo**: il sei è stato appena sparecchiato, e si cerca chi ci
 *   mettere. `FoglioTavoloLibero`.
 *
 * Stanno in un file perché sono un solo oggetto di progettazione — due facce
 * dello stesso gesto — e perché la scrittura che chiamano è una sola rotta.
 * Quello che non condividono è la domanda iniziale, e quella è la ragione per
 * cui sono due fogli e non uno con un interruttore.
 *
 * ## Perché un foglio e non una pagina
 *
 * Accomodare dura quindici secondi e si fa **stando in sala**. Una pagina
 * nuova toglie da sotto gli occhi la mappa dei tavoli, costringe a tornare
 * indietro e perde il posto nello scorrimento; un foglio lascia una striscia
 * di sala visibile sotto, che è il modo di ricordare dove si era. Il
 * componente esisteva già (`foglio.tsx`) e con esso le misure giuste per il
 * pollice e per la barra gestuale di iOS.
 *
 * ## Il tocco singolo e il tocco doppio
 *
 * Il tavolo **consigliato** si accomoda con un tocco: è la strada che si
 * percorre novanta volte su cento, e chiedere una conferma per la scelta che
 * il prodotto stesso ha suggerito è un passaggio che non protegge da niente.
 * Le **alternative** invece si selezionano, e poi si confermano nel piede: in
 * un elenco che si scorre col pollice, un tocco accidentale che sposta
 * quattro persone al tavolo sbagliato si ripara solo andando a scusarsi.
 */

/* -------------------------------------------------------------------------- */
/*  Il vocabolario visivo dell'idoneità                                       */
/* -------------------------------------------------------------------------- */

/**
 * Le classi stanno qui e non accanto al tipo in `lib/suggerimento-tavolo.ts`.
 *
 * È una lezione già pagata in questo progetto: una classe Tailwind scritta in
 * un file di dati che il compilatore non scandisce come template smette di
 * esistere in produzione, **in silenzio**.
 */
const CORNICE_IDONEITA: Record<Idoneita, string> = {
  CONSIGLIATO: "border-accent/60 bg-accent/10",
  DISPONIBILE: "border-border bg-card",
  STRETTO: "border-border bg-card",
  NON_COMPATIBILE: "border-border/60 bg-card opacity-55",
  OCCUPATO: "border-border/60 bg-card opacity-55",
};

const ETICHETTA_IDONEITA: Record<Idoneita, string | null> = {
  CONSIGLIATO: "Consigliato",
  DISPONIBILE: null,
  STRETTO: "Si libera tardi",
  NON_COMPATIBILE: "Non compatibile",
  OCCUPATO: "Occupato",
};

function Riga({
  titolo,
  dettaglio,
  idoneita,
  selezionato,
  onClick,
  disabilitato,
}: {
  titolo: string;
  dettaglio: string;
  idoneita: Idoneita;
  selezionato?: boolean;
  onClick?: () => void;
  disabilitato?: boolean;
}) {
  const etichetta = ETICHETTA_IDONEITA[idoneita];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabilitato}
      aria-pressed={selezionato}
      className={cn(
        "sa-tocco flex min-h-[64px] w-full items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-left",
        CORNICE_IDONEITA[idoneita],
        selezionato && "border-accent ring-1 ring-accent",
        disabilitato && "cursor-default",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="sa-corpo font-medium tabular-nums">{titolo}</p>
        <p className="sa-nota mt-0.5 truncate">{dettaglio}</p>
      </div>
      {etichetta && idoneita !== "CONSIGLIATO" && (
        <span className="sa-nota shrink-0">{etichetta}</span>
      )}
      {selezionato ? (
        <Check className="h-5 w-5 shrink-0 text-accent-strong" aria-hidden="true" />
      ) : onClick ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </button>
  );
}

/**
 * **Un tasto di scelta**: icona, titolo, una riga di contesto.
 *
 * Alto 88 px e larghezza piena. Le scelte erano righe da 64 px in fondo a un
 * foglio alto quanto il suo contenuto, cioè appoggiate sul bordo inferiore
 * dello schermo: si leggevano bene e si premevano con il pollice piegato. Con
 * il foglio a tutto schermo e tasti da 88 px, le tre scelte stanno nella metà
 * alta e ognuna è un bersaglio che non si sbaglia camminando.
 *
 * L'icona non è decorazione: in sala si riconosce la forma prima della
 * parola, ed è la ragione per cui il walk-in ha le impronte — si cerca
 * quella, non la scritta.
 */
function TastoScelta({
  icona: Icona,
  titolo,
  dettaglio,
  tono = "neutro",
  href,
  onClick,
}: {
  icona: React.ComponentType<{ className?: string }>;
  titolo: string;
  dettaglio: string;
  /** `primario` per la scelta che in questo momento è quella giusta. */
  tono?: "neutro" | "primario";
  href?: string;
  onClick?: () => void;
}) {
  const veste = cn(
    "sa-tocco flex min-h-[120px] w-full items-center gap-4 rounded-[18px] border px-4 py-3 text-left",
    tono === "primario" ? "border-accent/60 bg-accent/10" : "border-border bg-card",
  );

  const contenuto = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px]",
          tono === "primario" ? "bg-accent/25 text-accent-strong" : "bg-secondary text-foreground",
        )}
      >
        <Icona className="h-8 w-8" />
      </span>
      <span className="min-w-0 flex-1">
        {/*
          **Niente `truncate` sul titolo.** «Accomoda un ospite» a 390 px
          diventava «Accomoda un osp…»: tre parole tagliate su un tasto alto
          centoventi pixel, cioè spazio sprecato e una frase mutilata insieme.
          Va a capo, che è quello che le frasi fanno.
        */}
        <span className="sa-scheda block">{titolo}</span>
        <span className="sa-nota mt-1 block line-clamp-2">{dettaglio}</span>
      </span>
      <ChevronRight className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );

  return href ? (
    <Link href={href} className={veste}>
      {contenuto}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={veste}>
      {contenuto}
    </button>
  );
}

function Primario({
  children,
  onClick,
  disabilitato,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabilitato?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabilitato}
      className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-cream px-5 text-base font-medium text-clay-ink transition-transform active:scale-[0.99] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/**
 * Il campo del motivo, quando i posti non bastano.
 *
 * Non è una gentilezza burocratica: sedere sei persone a un quattro posti può
 * essere la scelta giusta — si avvicina una sedia — ma deve restare scritto
 * perché a fine serata i coperti non tornino e nessuno sappia perché. È la
 * stessa regola che la piantina del back office applica già
 * (`assignBookingToTable`, `reason_required`), e qui la si chiede *prima* di
 * mandare la richiesta invece di farsela rifiutare.
 */
function CampoMotivo({ valore, onCambia }: { valore: string; onCambia: (v: string) => void }) {
  return (
    <label className="mt-3 block">
      <span className="sa-etichetta">I posti non bastano: scrivi il motivo</span>
      <input
        type="text"
        value={valore}
        onChange={(e) => onCambia(e.target.value)}
        placeholder="Avviciniamo una sedia"
        className="mt-1.5 min-h-[48px] w-full rounded-[12px] border border-border bg-card-sunken px-3 text-base text-foreground placeholder:text-muted-foreground"
      />
    </label>
  );
}

function coperti(n: number): string {
  return n === 1 ? "1 ospite" : `${n} ospiti`;
}

/* -------------------------------------------------------------------------- */
/*  Dall'ospite al tavolo                                                     */
/* -------------------------------------------------------------------------- */

type Scelta = { tableIds: string[]; label: string; posti: number };

/**
 * **Trova tavolo** — si parte da chi aspetta.
 *
 * Quello che si vede, nell'ordine: il tavolo consigliato con la frase che
 * dice perché, le altre opzioni, gli accostamenti, e in fondo — chiusi — i
 * tavoli che non vanno bene. Gli ultimi ci sono perché un elenco che li
 * nasconde sembra rotto a chi sa che quel tavolo esiste.
 */
export function FoglioTrovaTavolo({
  ospite,
  aperto,
  onChiudi,
  onAccomodato,
}: {
  ospite: OspiteDaAccomodare;
  aperto: boolean;
  onChiudi: () => void;
  onAccomodato: (messaggio: string) => void;
}) {
  const avvisi = useAvvisi();
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [scelta, setScelta] = useState<Scelta | null>(null);
  const [motivo, setMotivo] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [mostraTutti, setMostraTutti] = useState(false);

  useEffect(() => {
    if (!aperto) return;
    let vivo = true;
    setProposta(null);
    setErrore(null);
    setScelta(null);
    setMotivo("");
    setMostraTutti(false);

    chiedi<{ proposta: Proposta }>(`/api/staff-app/accoglienza/${ospite.bookingId}/tavoli`)
      .then((r) => vivo && setProposta(r.proposta))
      .catch((e) => {
        if (!vivo) return;
        setErrore(
          e instanceof ErroreStaff ? e.message : "Non riesco a leggere i tavoli della sala.",
        );
      });

    return () => {
      vivo = false;
    };
  }, [aperto, ospite.bookingId]);

  const accomoda = useCallback(
    async (tableIds: string[], etichetta: string, forza: boolean) => {
      if (inCorso) return;
      setInCorso(true);
      try {
        await chiedi(`/api/staff-app/accoglienza/${ospite.bookingId}/accomoda`, {
          metodo: "POST",
          corpo: { tableIds, ...(forza && motivo.trim() ? { motivo: motivo.trim() } : {}) },
        });
        onAccomodato(`${ospite.nome} al tavolo ${etichetta}`);
      } catch (e) {
        avvisi.problema(
          e instanceof ErroreStaff ? e.message : "Non è stato possibile accomodare.",
        );
      } finally {
        setInCorso(false);
      }
    },
    [avvisi, inCorso, motivo, onAccomodato, ospite.bookingId, ospite.nome],
  );

  const migliore = proposta?.migliore ?? null;
  const serveMotivo = (posti: number) => posti < ospite.coperti;

  return (
    <Foglio
      aperto={aperto}
      onChiudi={onChiudi}
      /* A tutto schermo: le opzioni cominciano in alto, dove cade lo sguardo,
         invece di stare appoggiate sul bordo inferiore. */
      altezza="alto"
      titolo={ospite.nome}
      sottotitolo={`${coperti(ospite.coperti)} · prenotato ${ospite.ora}${
        ospite.attesaMin > 0 ? ` · attende da ${ospite.attesaMin} min` : ""
      }`}
      piede={
        scelta ? (
          <>
            {serveMotivo(scelta.posti) && <CampoMotivo valore={motivo} onCambia={setMotivo} />}
            <Primario
              onClick={() => accomoda(scelta.tableIds, scelta.label, serveMotivo(scelta.posti))}
              disabilitato={inCorso || (serveMotivo(scelta.posti) && !motivo.trim())}
            >
              <Check className="h-5 w-5" aria-hidden="true" />
              Conferma · {ospite.nome} al {scelta.label}
            </Primario>
          </>
        ) : null
      }
    >
      {ospite.allergie && (
        /* L'allergia sale in cima e non scende: chi accomoda è la prima
           persona che può dirlo alla cucina. */
        <p className="mb-3 rounded-[12px] bg-destructive/15 px-3 py-2 text-[0.9375rem] font-medium text-destructive-soft">
          Allergie: {ospite.allergie}
        </p>
      )}
      {ospite.nota && <p className="sa-nota mb-3">{ospite.nota}</p>}

      {errore && <p className="sa-corpo text-destructive-soft">{errore}</p>}

      {!proposta && !errore && <p className="sa-nota">Sto guardando la sala…</p>}

      {proposta && (
        <div className="space-y-4">
          {migliore ? (
            <section>
              <h3 className="sa-etichetta pb-1.5">Miglior tavolo</h3>
              <div className="rounded-[16px] border border-accent/60 bg-accent/10 p-3.5">
                <p className="sa-scheda tabular-nums">Tavolo {migliore.label}</p>
                <p className="sa-nota mt-1">{migliore.dettaglio}</p>
                {proposta.motivo && (
                  <p className="mt-2 flex items-start gap-2 text-[0.9375rem] text-accent-strong">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{proposta.motivo}</span>
                  </p>
                )}
                <div className="mt-3">
                  <Primario
                    onClick={() => accomoda([migliore.tableId], migliore.label, false)}
                    disabilitato={inCorso}
                  >
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                    Accomoda qui
                  </Primario>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-[16px] border border-border bg-card-sunken p-3.5">
              <p className="sa-corpo font-medium">Nessun tavolo libero per {coperti(ospite.coperti)}</p>
              <p className="sa-nota mt-1">
                {proposta.unioni.length > 0
                  ? "Si può accostare due tavoli, qui sotto."
                  : "Quando un tavolo si libera compare qui: la sala si aggiorna da sola."}
              </p>
            </section>
          )}

          {(proposta.alternative.length > 0 || proposta.unioni.length > 0) && (
            <section>
              <h3 className="sa-etichetta pb-1.5">Altre opzioni</h3>
              <ul className="space-y-2">
                {proposta.unioni.map((u: Unione) => (
                  <li key={u.tableIds.join("-")}>
                    <Riga
                      titolo={u.label}
                      dettaglio={u.dettaglio}
                      idoneita="DISPONIBILE"
                      selezionato={scelta?.tableIds.join() === u.tableIds.join()}
                      onClick={() =>
                        setScelta({ tableIds: u.tableIds, label: u.label, posti: u.posti })
                      }
                    />
                  </li>
                ))}
                {proposta.alternative.map((t: TavoloProposto) => (
                  <li key={t.tableId}>
                    <Riga
                      titolo={`Tavolo ${t.label}`}
                      dettaglio={t.dettaglio}
                      idoneita={t.idoneita}
                      selezionato={scelta?.tableIds.join() === t.tableId}
                      onClick={() =>
                        setScelta({ tableIds: [t.tableId], label: t.label, posti: t.posti })
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            I tavoli che non vanno bene, chiusi.

            Non spariscono — un cameriere che non trova il due posti
            nell'elenco pensa che l'elenco sia rotto — ma non occupano lo
            schermo sopra le opzioni buone. Aprendoli si possono comunque
            usare, scrivendo il motivo: è una decisione della sala, non nostra.
          */}
          {!mostraTutti ? (
            <button
              type="button"
              onClick={() => setMostraTutti(true)}
              className="sa-nota min-h-[44px] w-full text-left underline decoration-border underline-offset-4"
            >
              Mostra tutti i tavoli della sala
            </button>
          ) : (
            <section>
              <h3 className="sa-etichetta pb-1.5">Tutta la sala</h3>
              <ul className="space-y-2">
                {proposta.tutti
                  .filter((t) => !t.offribile)
                  .map((t) => (
                    <li key={t.tableId}>
                      <Riga
                        titolo={`Tavolo ${t.label}`}
                        dettaglio={t.dettaglio}
                        idoneita={t.idoneita}
                        disabilitato={t.idoneita === "OCCUPATO"}
                        selezionato={scelta?.tableIds.join() === t.tableId}
                        onClick={
                          t.idoneita === "OCCUPATO"
                            ? undefined
                            : () =>
                                setScelta({
                                  tableIds: [t.tableId],
                                  label: t.label,
                                  posti: t.posti,
                                })
                        }
                      />
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Foglio>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dal tavolo all'ospite                                                     */
/* -------------------------------------------------------------------------- */

type VistaTavolo = "azioni" | "chi" | "walkin";

/**
 * **Il tavolo toccato** — il problema principale del brief: «clicchi il
 * tavolo e non succede praticamente nulla».
 *
 * Prima la card era un collegamento al tavolo aperto, e il tavolo aperto di
 * un tavolo libero è una schermata che dice che non c'è nessuno. Adesso su un
 * tavolo libero si apre questo foglio, che offre le tre cose che si fanno
 * davvero: accomodare chi aspetta, registrare un walk-in, andare al tavolo.
 *
 * ## Cosa non c'è, e perché
 *
 * Il brief elenca anche **«Prenota tavolo»**. Non è qui: una prenotazione ha
 * data, ora, durata, nome, telefono e un motore di disponibilità dietro, e
 * comprimerla in un foglio la renderebbe una scorciatoia che sbaglia. Chi
 * prende le prenotazioni lo fa dal back office, con `manage_bookings` — che
 * è un permesso che i camerieri in genere non hanno.
 */
export function FoglioTavoloLibero({
  tavolo,
  inAttesa,
  aperto,
  onChiudi,
  onFatto,
}: {
  tavolo: TavoloStaff;
  /** Quanti aspettano: serve solo a scrivere il numero sull'azione. */
  inAttesa: number;
  aperto: boolean;
  onChiudi: () => void;
  onFatto: (messaggio: string) => void;
}) {
  const avvisi = useAvvisi();
  const [vista, setVista] = useState<VistaTavolo>("azioni");
  const [coda, setCoda] = useState<(OspiteDaAccomodare & { ciStanno: boolean })[] | null>(null);
  const [scelto, setScelto] = useState<OspiteDaAccomodare | null>(null);
  const [motivo, setMotivo] = useState("");
  const [persone, setPersone] = useState(2);
  const [nome, setNome] = useState("");
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    if (aperto) return;
    /* Alla chiusura si torna alle azioni: riaprendo lo stesso tavolo, un
       foglio che si ricorda di essere a metà di un walk-in di ieri sera è un
       foglio che fa premere «indietro». */
    setVista("azioni");
    setScelto(null);
    setMotivo("");
    setNome("");
    setPersone(2);
  }, [aperto]);

  useEffect(() => {
    if (vista !== "chi" || coda) return;
    let vivo = true;
    chiedi<{ ospiti: (OspiteDaAccomodare & { ciStanno: boolean })[] }>(
      `/api/staff-app/tavolo/${tavolo.tableId}/in-attesa`,
    )
      .then((r) => vivo && setCoda(r.ospiti))
      .catch(() => vivo && setCoda([]));
    return () => {
      vivo = false;
    };
  }, [coda, tavolo.tableId, vista]);

  async function agisci(fn: () => Promise<unknown>, messaggio: string) {
    if (inCorso) return;
    setInCorso(true);
    try {
      await fn();
      onFatto(messaggio);
    } catch (e) {
      avvisi.problema(e instanceof ErroreStaff ? e.message : "Non è stato possibile completare.");
    } finally {
      setInCorso(false);
    }
  }

  const serveMotivo = !!scelto && scelto.coperti > tavolo.posti;

  return (
    <Foglio
      aperto={aperto}
      onChiudi={onChiudi}
      altezza="alto"
      titolo={`Tavolo ${tavolo.label}`}
      sottotitolo={[
        tavolo.posti === 1 ? "1 posto" : `${tavolo.posti} posti`,
        "Libero",
        tavolo.roomName,
      ]
        .filter(Boolean)
        .join(" · ")}
      piede={
        vista === "chi" && scelto ? (
          <>
            {serveMotivo && <CampoMotivo valore={motivo} onCambia={setMotivo} />}
            <Primario
              disabilitato={inCorso || (serveMotivo && !motivo.trim())}
              onClick={() =>
                agisci(
                  () =>
                    chiedi(`/api/staff-app/accoglienza/${scelto.bookingId}/accomoda`, {
                      metodo: "POST",
                      corpo: {
                        tableIds: [tavolo.tableId],
                        ...(serveMotivo && motivo.trim() ? { motivo: motivo.trim() } : {}),
                      },
                    }),
                  `${scelto.nome} al tavolo ${tavolo.label}`,
                )
              }
            >
              <Check className="h-5 w-5" aria-hidden="true" />
              Conferma · {scelto.nome} al {tavolo.label}
            </Primario>
          </>
        ) : vista === "walkin" ? (
          <Primario
            disabilitato={inCorso}
            onClick={() =>
              agisci(
                () =>
                  chiedi("/api/staff-app/walk-in", {
                    metodo: "POST",
                    corpo: {
                      partySize: persone,
                      tableId: tavolo.tableId,
                      nome: nome.trim() || null,
                    },
                  }),
                `Walk-in di ${coperti(persone)} al tavolo ${tavolo.label}`,
              )
            }
          >
            <Check className="h-5 w-5" aria-hidden="true" />
            Accomoda al {tavolo.label}
          </Primario>
        ) : null
      }
    >
      {vista === "azioni" && (
        <ul className="space-y-2.5">
          <li>
            <TastoScelta
              icona={UserCheck}
              titolo="Accomoda un ospite"
              dettaglio={
                inAttesa === 0
                  ? "Nessuno in attesa in questo momento"
                  : inAttesa === 1
                    ? "1 persona in attesa"
                    : `${inAttesa} persone in attesa`
              }
              /* Primario **solo se qualcuno aspetta davvero**: evidenziare
                 un'azione che apre su un elenco vuoto è una promessa che il
                 tocco successivo non mantiene. */
              tono={inAttesa > 0 ? "primario" : "neutro"}
              onClick={() => setVista("chi")}
            />
          </li>
          <li>
            <TastoScelta
              icona={Footprints}
              titolo="Walk-in"
              dettaglio="Chi entra senza prenotazione"
              tono={inAttesa === 0 ? "primario" : "neutro"}
              onClick={() => setVista("walkin")}
            />
          </li>
          <li>
            <TastoScelta
              icona={ClipboardList}
              titolo="Visualizza tavolo"
              dettaglio="Comande, note, conto"
              href={`/staff-app/tavolo/${tavolo.tableId}`}
            />
          </li>
        </ul>
      )}

      {vista === "chi" && (
        <>
          <h3 className="sa-etichetta pb-1.5">Chi vuoi accomodare?</h3>
          {coda === null && <p className="sa-nota">Sto leggendo la coda…</p>}
          {coda?.length === 0 && (
            <div className="rounded-[16px] border border-border bg-card-sunken p-3.5">
              <p className="sa-corpo font-medium">Nessuno in attesa</p>
              <p className="sa-nota mt-1">
                Un ospite compare qui quando viene segnato arrivato, da qui o dal back office. Per
                chi entra senza prenotazione c&apos;è il walk-in.
              </p>
            </div>
          )}
          {coda && coda.length > 0 && (
            <ul className="space-y-2">
              {coda.map((o) => (
                <li key={o.bookingId}>
                  <Riga
                    titolo={o.nome}
                    dettaglio={`${coperti(o.coperti)} · ${o.ora}${
                      o.ciStanno ? "" : ` · più di ${tavolo.posti} posti`
                    }`}
                    idoneita={o.ciStanno ? "DISPONIBILE" : "NON_COMPATIBILE"}
                    selezionato={scelto?.bookingId === o.bookingId}
                    onClick={() => setScelto(o)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {vista === "walkin" && (
        <>
          <h3 className="sa-etichetta pb-1.5">Quante persone</h3>
          {/*
            Il contatore, e non un campo numerico: si preme con il pollice
            mentre si accompagna qualcuno, e la tastiera numerica di iOS su un
            campo da due cifre copre metà schermo per niente.
          */}
          <div className="flex items-center justify-center gap-5 rounded-[16px] border border-border bg-card-sunken py-4">
            <button
              type="button"
              aria-label="Una persona in meno"
              onClick={() => setPersone((n) => Math.max(1, n - 1))}
              className="sa-tocco flex h-12 w-12 items-center justify-center rounded-full border border-border-strong"
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="sa-numero w-12 text-center tabular-nums" aria-live="polite">
              {persone}
            </span>
            <button
              type="button"
              aria-label="Una persona in più"
              onClick={() => setPersone((n) => Math.min(50, n + 1))}
              className="sa-tocco flex h-12 w-12 items-center justify-center rounded-full border border-border-strong"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {persone > tavolo.posti && (
            <p className="sa-nota mt-2 text-accent-strong">
              Il tavolo ha {tavolo.posti} posti: servirà un motivo scritto, o un tavolo più grande.
            </p>
          )}

          {/* Il nome è facoltativo, e si vede che lo è: un walk-in senza nome
              è normale, e un campo obbligatorio qui costa una domanda in più a
              qualcuno che sta in piedi. */}
          <label className="mt-3 block">
            <span className="sa-etichetta">Nome (facoltativo)</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Come chiamarli in sala"
              className="mt-1.5 min-h-[48px] w-full rounded-[12px] border border-border bg-card-sunken px-3 text-base text-foreground placeholder:text-muted-foreground"
            />
          </label>

          <p className="sa-nota mt-3 flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              La durata la propone la misura del locale, come per una prenotazione: il tavolo
              risulterà occupato per il tempo giusto anche per chi guarda la sala dal computer.
            </span>
          </p>
        </>
      )}
    </Foglio>
  );
}

/* -------------------------------------------------------------------------- */
/*  Il walk-in che parte da nessun tavolo                                     */
/* -------------------------------------------------------------------------- */

/**
 * **Walk-in senza un tavolo in mente**: prima quante persone, poi dove.
 *
 * È l'altro ordine in cui succede — due persone entrano e si guarda cosa c'è
 * — e usa lo stesso giudizio dei tavoli degli ospiti arrivati, quindi
 * consiglia lo stesso tavolo che consiglierebbe per una prenotazione da due.
 */
export function FoglioWalkIn({
  aperto,
  onChiudi,
  onFatto,
}: {
  aperto: boolean;
  onChiudi: () => void;
  onFatto: (messaggio: string) => void;
}) {
  const avvisi = useAvvisi();
  const [persone, setPersone] = useState(2);
  const [nome, setNome] = useState("");
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [scelto, setScelto] = useState<TavoloProposto | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    if (!aperto) {
      setProposta(null);
      setScelto(null);
      setPersone(2);
      setNome("");
      return;
    }
    let vivo = true;
    setProposta(null);
    setScelto(null);
    chiedi<{ proposta: Proposta }>(`/api/staff-app/walk-in?coperti=${persone}`)
      .then((r) => vivo && setProposta(r.proposta))
      .catch(() => vivo && setProposta(null));
    return () => {
      vivo = false;
    };
  }, [aperto, persone]);

  const offribili = proposta ? [proposta.migliore, ...proposta.alternative].filter(Boolean) : [];

  async function conferma(tavolo: TavoloProposto) {
    if (inCorso) return;
    setInCorso(true);
    try {
      await chiedi("/api/staff-app/walk-in", {
        metodo: "POST",
        corpo: { partySize: persone, tableId: tavolo.tableId, nome: nome.trim() || null },
      });
      onFatto(`Walk-in di ${coperti(persone)} al tavolo ${tavolo.label}`);
    } catch (e) {
      avvisi.problema(e instanceof ErroreStaff ? e.message : "Non è stato possibile accomodare.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Foglio
      aperto={aperto}
      onChiudi={onChiudi}
      altezza="alto"
      titolo="Walk-in"
      sottotitolo="Chi entra senza prenotazione"
      piede={
        scelto ? (
          <Primario disabilitato={inCorso} onClick={() => conferma(scelto)}>
            <Check className="h-5 w-5" aria-hidden="true" />
            Accomoda al {scelto.label}
          </Primario>
        ) : null
      }
    >
      <h3 className="sa-etichetta pb-1.5">Quante persone</h3>
      <div className="flex items-center justify-center gap-5 rounded-[16px] border border-border bg-card-sunken py-4">
        <button
          type="button"
          aria-label="Una persona in meno"
          onClick={() => setPersone((n) => Math.max(1, n - 1))}
          className="sa-tocco flex h-12 w-12 items-center justify-center rounded-full border border-border-strong"
        >
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="sa-numero w-12 text-center tabular-nums" aria-live="polite">
          {persone}
        </span>
        <button
          type="button"
          aria-label="Una persona in più"
          onClick={() => setPersone((n) => Math.min(50, n + 1))}
          className="sa-tocco flex h-12 w-12 items-center justify-center rounded-full border border-border-strong"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <label className="mt-3 block">
        <span className="sa-etichetta">Nome (facoltativo)</span>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Come chiamarli in sala"
          className="mt-1.5 min-h-[48px] w-full rounded-[12px] border border-border bg-card-sunken px-3 text-base text-foreground placeholder:text-muted-foreground"
        />
      </label>

      <h3 className="sa-etichetta pb-1.5 pt-4">Tavoli disponibili</h3>
      {!proposta && <p className="sa-nota">Sto guardando la sala…</p>}
      {proposta && offribili.length === 0 && (
        <div className="rounded-[16px] border border-border bg-card-sunken p-3.5">
          <p className="sa-corpo font-medium">Nessun tavolo per {coperti(persone)}</p>
          <p className="sa-nota mt-1">
            {proposta.unioni.length > 0
              ? `Si possono accostare ${proposta.unioni[0].label}: si fa dal foglio dell'ospite.`
              : "Appena un tavolo si libera compare qui."}
          </p>
        </div>
      )}
      {offribili.length > 0 && (
        <ul className="space-y-2">
          {offribili.map((t) => (
            <li key={t!.tableId}>
              <Riga
                titolo={`Tavolo ${t!.label}`}
                dettaglio={t!.dettaglio}
                idoneita={t!.idoneita}
                selezionato={scelto?.tableId === t!.tableId}
                onClick={() => setScelto(t!)}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="sa-nota mt-3 flex items-start gap-2">
        <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Senza un nome non si crea nessuna scheda cliente: «Tavolo 7, due persone» nel CRM è
          rumore, e il CRM è il posto dove i nomi devono valere.
        </span>
      </p>
    </Foglio>
  );
}
