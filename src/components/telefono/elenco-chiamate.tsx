"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarPlus,
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

/**
 * Chi ha chiamato, e chi non ha trovato nessuno.
 *
 * ## La cosa per cui questa pagina esiste
 *
 * **Le chiamate perse.** Una persona che ha telefonato a un ristorante e non
 * ha trovato nessuno è una prenotazione che sta andando da un'altra parte, e
 * finché quel numero non è scritto da qualche parte non si può richiamare.
 * Tutto il resto dello storico è contorno: si guarda una volta al mese.
 *
 * Per questo il filtro «da richiamare» non è una casella in mezzo ad altre, è
 * un pulsante con dentro **quante sono**: se sono zero non c'è niente da fare,
 * e il pulsante lo dice senza aprire niente.
 *
 * ## Cosa non c'è
 *
 * Non si risponde dal browser e non si riascolta niente. Sarebbero due
 * pulsanti spenti con un cartello «in arrivo», cioè una promessa messa dentro
 * lo strumento di lavoro di qualcuno.
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

export function ElencoChiamateVista({
  elenco,
  solo,
  giorni,
  fuso,
  telefono,
}: {
  elenco: { chiamate: ChiamataVista[]; totale: number; daRichiamare: number };
  solo: "perse" | "tutte";
  giorni: number;
  fuso: string;
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

      {/* ── i comandi ──────────────────────────────────────────────────── */}
      <div className="fissa flex flex-wrap items-center gap-2">
        {/* Il filtro che conta, col numero dentro: se è zero non c'è niente
            da fare, e si vede senza premere. */}
        <Button
          variant={solo === "perse" ? "accent" : "outline"}
          size="sm"
          onClick={() => vai({ solo: solo === "perse" ? null : "perse" })}
        >
          <PhoneMissed className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Da richiamare
          <span className="ml-1.5 tabular-nums">{elenco.daRichiamare}</span>
        </Button>

        <div className="ml-auto flex items-center gap-1">
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
        <ul className="fill-scroll space-y-2 pr-0.5">
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
                    </p>

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
                                ...(c.telefono ? { phone: c.telefono } : {}),
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
                    {c.ospite ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/guests/${c.ospite.id}`}>La scheda</Link>
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
    </div>
  );
}
