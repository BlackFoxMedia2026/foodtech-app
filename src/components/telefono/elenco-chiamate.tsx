"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarPlus,
  ClipboardCheck,
  UserPlus,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { StatoChiamata } from "@/server/chiamate";
import {
  ESITI_A_MANO,
  NOME_CHI_RISPONDE,
  NOME_ESITO,
  TONO_ESITO,
  esitoDerivato,
  type ChiHaRisposto,
  type EsitoChiamata,
} from "@/lib/voice-esiti";
import { useAvvisi } from "@/components/ui/avvisi";
import { ProponiInsight } from "@/components/telefono/insight";

/**
 * Il telefono del locale: da fare a sinistra, com'è andata a destra.
 *
 * ## Il difetto che questa forma corregge
 *
 * Era una lista sola con un filtro sopra. Cioè: le due domande che si fanno a
 * questa pagina — «chi devo richiamare adesso» e «com'è andato il telefono
 * questo mese» — stavano nello stesso posto, e la prima si trovava solo
 * premendo un pulsante. In servizio quello che si trova premendo non si
 * trova: si guarda lo schermo per due secondi fra due tavoli.
 *
 * Adesso sono due colonne e non due schede. Le schede nascondono il lavoro:
 * chi apre lo storico non vede più la coda, e la coda è la ragione per cui
 * questa pagina esiste.
 *
 * ## Lo storico serve a una domanda sola
 *
 * Quante telefonate diventano prenotazioni. Per questo ogni riga porta il suo
 * **esito** e le righe a cui manca lo chiedono: una chiamata «risposta ·
 * 2m 14s» non dice niente a nessuno.
 *
 * ## Cosa non c'è
 *
 * Nessun pulsante che chiama e nessuna registrazione da riascoltare: il
 * fornitore di oggi non sa fare né l'una né l'altra, e un comando che non
 * esegue è peggio della sua assenza.
 */

type ChiamataVista = {
  id: string;
  telefono: string | null;
  stato: StatoChiamata;
  quando: string;
  durataSecondi: number | null;
  ospite: {
    id: string;
    nome: string;
    blocked: boolean;
    noShowCount: number;
    allergies: string | null;
  } | null;
  prenotazione: {
    id: string;
    reference: string;
    startsAt: string;
    partySize: number;
  } | null;
  esito: EsitoChiamata | null;
  chiHaRisposto: ChiHaRisposto;
  nota: string | null;
  inCoda: boolean;
};

const STATO: Record<
  StatoChiamata,
  { testo: string; icona: typeof Phone; tono: string }
> = {
  RINGING: {
    testo: "sta squillando",
    icona: PhoneIncoming,
    tono: "text-accent-strong",
  },
  ANSWERED: { testo: "in corso", icona: Phone, tono: "text-sage-strong" },
  ENDED: { testo: "risposta", icona: Phone, tono: "text-muted-foreground" },
  MISSED: {
    testo: "nessuna risposta",
    icona: PhoneMissed,
    tono: "text-destructive-soft",
  },
};

function durata(secondi: number | null): string | null {
  if (secondi == null) return null;
  if (secondi < 60) return `${secondi}s`;
  return `${Math.floor(secondi / 60)}m ${secondi % 60}s`;
}

const PERIODI = [
  { giorni: 1, nome: "oggi" },
  { giorni: 7, nome: "7 giorni" },
  { giorni: 30, nome: "30 giorni" },
] as const;

/**
 * Dare un nome a un numero che ha chiamato.
 *
 * Un numero non riconosciuto restava una riga nello storico: si vedeva che
 * qualcuno aveva chiamato e non c'era **niente** da fare. Questo è il gesto
 * che chiude il giro — da qui nasce il contatto, e dalla volta dopo quella
 * persona viene riconosciuta mentre il telefono squilla.
 *
 * Chiede solo il nome: il numero lo sappiamo, e un modulo che lo richiede a
 * chi lo ha davanti sullo schermo è un modulo che fa perdere tempo. Il cognome
 * è facoltativo perché al telefono spesso non lo si chiede.
 */
function DaiUnNome({
  chiamataId,
  numero,
}: {
  chiamataId: string;
  numero: string | null;
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/telefono/chiamate/${chiamataId}/contatto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: nome, lastName: cognome || null }),
    });
    setInCorso(false);
    if (!res.ok) {
      setErrore(
        await readApiError(res, "Non siamo riusciti a salvare il contatto."),
      );
      return;
    }
    setAperto(false);
    setNome("");
    setCognome("");
    router.refresh();
  }

  if (!aperto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAperto(true)}>
        <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Dai un nome
      </Button>
    );
  }

  return (
    <form onSubmit={salva} className="flex flex-wrap items-center gap-2">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome"
        required
        autoFocus
        className="h-8 w-28 text-xs"
        aria-label={`Nome di chi ha chiamato dal ${numero ?? "numero riservato"}`}
      />
      <Input
        value={cognome}
        onChange={(e) => setCognome(e.target.value)}
        placeholder="Cognome"
        className="h-8 w-28 text-xs"
        aria-label="Cognome, facoltativo"
      />
      <Button
        type="submit"
        variant="accent"
        size="sm"
        disabled={inCorso || !nome.trim()}
      >
        {inCorso ? "Salvo…" : "Salva"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAperto(false)}
      >
        Annulla
      </Button>
      {errore && <span className="text-xs text-destructive">{errore}</span>}
    </form>
  );
}

/**
 * Dire com'è finita una telefonata.
 *
 * ## Perché quattro pulsanti e non un elenco a tendina
 *
 * Perché è un gesto che si fa venti volte in una sera, appena riattaccato. Una
 * tendina costa due clic e una lettura; quattro pulsanti ne costano uno. E
 * sono quattro, non undici: gli altri esiti non sono scelte ma **fatti** —
 * «prenotazione presa» lo dice la prenotazione che esiste, «nessuno ha
 * risposto» lo dice il centralino.
 *
 * ## Non obbliga nessuno
 *
 * Si può ignorare, e la chiamata resta senza esito. Un modulo obbligatorio a
 * fine telefonata, in un locale pieno, si compila premendo il primo pulsante:
 * il conto di fine mese sarebbe peggio di nessun conto.
 */
function ComEFinita({ chiamataId }: { chiamataId: string }) {
  const router = useRouter();
  const { mostra, problema } = useAvvisi();
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState(false);

  async function salva(esito: string) {
    setInCorso(true);
    const res = await fetch(`/api/telefono/chiamate/${chiamataId}/esito`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ esito }),
    });
    setInCorso(false);
    if (!res.ok) {
      problema(
        await readApiError(res, "Non siamo riusciti a salvare l'esito."),
      );
      return;
    }
    setAperto(false);
    mostra("Segnato.");
    router.refresh();
  }

  if (!aperto) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAperto(true)}>
        <ClipboardCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {"Com'è finita?"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ESITI_A_MANO.map((e) => (
        <Button
          key={e}
          variant="outline"
          size="sm"
          disabled={inCorso}
          onClick={() => salva(e)}
        >
          {NOME_ESITO[e]}
        </Button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setAperto(false)}>
        Annulla
      </Button>
    </div>
  );
}

export function ElencoChiamateVista({
  elenco,
  solo,
  giorni,
  fuso,
  telefono,
  daFare,
  puoModificareSchede = false,
}: {
  elenco: { chiamate: ChiamataVista[]; totale: number; daRichiamare: number };
  solo: "perse" | "tutte";
  giorni: number;
  fuso: string;
  /**
   * La colonna «Da fare», costruita dalla pagina.
   *
   * Arriva come nodo e non come dati: le due colonne rispondono a due domande
   * diverse e non condividono niente: metterle nello stesso componente
   * vorrebbe dire una sola cosa che ne fa due.
   */
  daFare?: React.ReactNode;
  /**
   * Se chi guarda può scrivere nella scheda di un cliente.
   *
   * Proporre una nota lo può fare chi risponde al telefono; il gesto compare
   * solo a chi può anche portarla a termine, perché un'anteprima che nessuno
   * dei presenti può approvare è un lavoro che resta in sospeso per sempre.
   */
  puoModificareSchede?: boolean;
  /**
   * Il telefono nel browser, quando questo locale ce l'ha e chi guarda può
   * rispondere. Arriva già costruito dalla pagina: così `sip.js` non entra nel
   * codice di chi apre questa pagina solo per guardare chi ha chiamato.
   */
  telefono?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function vai(cambi: Record<string, string | null>) {
    const sp = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(cambi)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  const ora = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuso,
  });
  const giorno = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: fuso,
  });

  return (
    <div className="schermo animate-fade-in gap-4">
      {/* Sopra tutto: se sta squillando, non c'è niente più urgente. */}
      {telefono}

      {/*
        Due colonne da `lg` in su, una sola più sotto.

        Su schermo largo ognuna scorre **dentro di sé** e la pagina non si
        muove: chi richiama non perde di vista la coda mentre guarda lo
        storico. Su tablet in verticale e su telefono le due si impilano e
        scorre il contenitore — due regioni che si dividono un'altezza da
        telefono darebbero due finestrelle da quattro righe, che non servono a
        niente. L'ordine dell'impilamento è quello giusto da sé: prima quello
        che c'è da fare.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-4 lg:overflow-hidden">
        {daFare}

        <section
          aria-label="Storico"
          className="mt-4 flex min-h-0 flex-col gap-2 lg:mt-0 lg:overflow-hidden"
        >
          <div className="fissa flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-semibold">Storico</h2>
            {/* Il filtro «solo le perse» resta, ma non è più il pulsante
            principale: le perse che chiedono un gesto stanno nella colonna
            accanto, con dentro **quante sono**. Qui serve a chi guarda lo
            storico e vuole vedere solo quelle, che è una domanda diversa. */}
            <Button
              variant={solo === "perse" ? "subtle" : "ghost"}
              size="sm"
              onClick={() => vai({ solo: solo === "perse" ? null : "perse" })}
            >
              <PhoneMissed className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Solo perse
            </Button>

            <div className="flex items-center gap-1">
              {PERIODI.map((p) => (
                <Button
                  key={p.giorni}
                  variant={giorni === p.giorni ? "subtle" : "ghost"}
                  size="sm"
                  onClick={() => vai({ giorni: String(p.giorni) })}
                >
                  {p.nome}
                </Button>
              ))}
            </div>
          </div>

          {/* ── l'elenco ───────────────────────────────────────────────────── */}
          {elenco.chiamate.length === 0 ? (
            <EmptyState
              icon={solo === "perse" ? PhoneOff : Phone}
              title={
                solo === "perse"
                  ? "Nessuna chiamata rimasta senza risposta"
                  : "Nessuna chiamata nel periodo"
              }
            >
              {solo === "perse"
                ? "Quando qualcuno chiama e non trova nessuno, compare qui col suo numero: è una prenotazione che sta andando da un'altra parte."
                : "Compaiono qui appena il telefono squilla, con il nome di chi chiama quando lo conosciamo."}
            </EmptyState>
          ) : (
            <ul className="space-y-2 pr-0.5 lg:fill-scroll">
              {elenco.chiamate.map((c) => {
                const s = STATO[c.stato];
                const Icona = s.icona;
                const quando = new Date(c.quando);
                return (
                  <li key={c.id} className="riquadro p-3">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                      <Icona
                        className={`mt-0.5 h-4 w-4 shrink-0 ${s.tono}`}
                        aria-hidden="true"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <span className="truncate text-sm font-medium">
                            {c.ospite?.nome ?? "Non riconosciuto"}
                          </span>
                          <span className="t-nota tabular-nums">
                            {c.telefono ?? "numero riservato"}
                          </span>
                        </p>

                        <p className="mt-0.5 t-nota">
                          {giorno.format(quando)} alle {ora.format(quando)} ·{" "}
                          {s.testo}
                          {durata(c.durataSecondi)
                            ? ` · ${durata(c.durataSecondi)}`
                            : ""}
                          {/* Chi ha risposto si scrive solo quando **non** è
                              una persona: «in sala» su ogni riga sarebbe
                              rumore, «il risponditore» è l'informazione. */}
                          {c.chiHaRisposto === "AI" ||
                          c.chiHaRisposto === "HYBRID"
                            ? ` · ha risposto ${NOME_CHI_RISPONDE[c.chiHaRisposto]}`
                            : ""}
                        </p>

                        {/* Com'è finita: il bollino se lo si sa, la domanda se
                            no. Una riga «risposta · 2m 14s» senza esito non
                            dice niente a nessuno, e il mese non si conta. */}
                        {c.esito && (
                          <p className="mt-1.5">
                            <Badge tone={TONO_ESITO[c.esito]}>
                              {NOME_ESITO[c.esito]}
                            </Badge>
                          </p>
                        )}
                        {c.nota && <p className="mt-1 text-xs">{c.nota}</p>}

                        {/* Le cose che cambiano la telefonata, non tutta la scheda. */}
                        {(c.ospite?.blocked ||
                          (c.ospite?.noShowCount ?? 0) > 0 ||
                          c.ospite?.allergies) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {c.ospite?.blocked && (
                              <Badge tone="danger" className="gap-1">
                                <AlertTriangle
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                Bloccato
                              </Badge>
                            )}
                            {(c.ospite?.noShowCount ?? 0) > 0 && (
                              <Badge
                                tone={
                                  (c.ospite?.noShowCount ?? 0) >= 2
                                    ? "warning"
                                    : "neutral"
                                }
                              >
                                {c.ospite?.noShowCount === 1
                                  ? "1 assenza"
                                  : `${c.ospite?.noShowCount} assenze`}
                              </Badge>
                            )}
                            {c.ospite?.allergies && (
                              <Badge tone="warning">
                                Allergie: {c.ospite.allergies}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ── cosa si può fare ──────────────────────────────── */}
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {c.prenotazione ? (
                          /* Ha già prodotto una prenotazione: non è una chiamata da
                         richiamare, è una chiamata riuscita. Il collegamento
                         alla prenotazione conta più di qualunque pulsante. */
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/bookings/${c.prenotazione.id}`}>
                              Prenotazione del{" "}
                              {giorno.format(new Date(c.prenotazione.startsAt))}
                            </Link>
                          </Button>
                        ) : (
                          c.stato === "MISSED" && (
                            <Button asChild variant="accent" size="sm">
                              <Link
                                href={{
                                  pathname: "/bookings/new",
                                  query: {
                                    ...(c.ospite ? { guest: c.ospite.id } : {}),
                                    ...(c.telefono
                                      ? { phone: c.telefono }
                                      : {}),
                                    /* La chiamata viaggia con il resto: la
                                       prenotazione che nasce si lega a questa
                                       telefonata, che smette di essere «nessuno
                                       ha risposto» e spegne la richiamata in
                                       coda. Senza, lo storico resterebbe a
                                       contare come buttata un'occasione
                                       recuperata. */
                                    chiamata: c.id,
                                    source: "PHONE",
                                  },
                                }}
                              >
                                <CalendarPlus
                                  className="mr-1.5 h-4 w-4"
                                  aria-hidden="true"
                                />
                                Prenota
                              </Link>
                            </Button>
                          )
                        )}
                        {/* La domanda solo dove ha senso: una chiamata finita
                            e senza esito. Su una persa l'esito c'è già
                            («nessuno ha risposto»), e chiederlo vorrebbe dire
                            far ripetere un fatto. */}
                        {c.stato === "ENDED" && !c.esito && (
                          <ComEFinita chiamataId={c.id} />
                        )}
                        {/* Quello che si è scoperto parlando: si scrive qui,
                            appena riattaccato, e diventa una proposta. Solo
                            sulle chiamate a cui qualcuno ha risposto — su una
                            persa non si è scoperto niente. */}
                        {puoModificareSchede &&
                          (c.stato === "ENDED" || c.stato === "ANSWERED") && (
                            <ProponiInsight chiamataId={c.id} />
                          )}
                        {c.ospite ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/guests/${c.ospite.id}`}>
                              La scheda
                            </Link>
                          </Button>
                        ) : (
                          /* Niente nome e un numero che si può salvare: è l'unico
                         punto del prodotto da cui nasce un contatto senza
                         passare da una prenotazione. */
                          c.telefono && (
                            <DaiUnNome chiamataId={c.id} numero={c.telefono} />
                          )
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Il totale in fondo, dove si legge nel momento in cui serve: un tetto
          senza totale è una bugia, e cinquanta righe su duecento chiamate
          sembrano tutte. */}
          {elenco.totale > elenco.chiamate.length && (
            <p className="fissa t-nota">
              {elenco.chiamate.length} di {elenco.totale} chiamate nel periodo.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
