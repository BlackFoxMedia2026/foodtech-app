"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  PhoneMissed,
  PhoneOutgoing,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { useAvvisi } from "@/components/ui/avvisi";

/**
 * Le cose che il telefono chiede di fare adesso.
 *
 * ## Perché sta in cima e non dietro un filtro
 *
 * Perché è l'unica parte di questa pagina che si guarda durante il servizio.
 * Lo storico risponde a «cosa è successo» e lo si apre una volta al mese;
 * questo risponde a «chi devo richiamare», e in una sera si torna a guardarlo
 * venti volte. Un filtro da premere, in servizio, non lo preme nessuno.
 *
 * ## Due liste, due gesti diversi
 *
 * - **in coda**: qualcuno ha già deciso che quella persona va richiamata. Qui
 *   il lavoro è telefonare, e poi dire com'è andata.
 * - **nessuno ha deciso**: chiamate perse che nessuno ha guardato. Qui il
 *   lavoro è **decidere**: la richiamo, o lascio perdere.
 *
 * Tenerle insieme farebbe sembrare la decisione un lavoro, e allora non la
 * prenderebbe nessuno: le perse resterebbero là in fondo a crescere.
 *
 * ## Quello che non c'è, e non per dimenticanza
 *
 * **Non c'è un pulsante che chiama.** Il centralino di oggi non sa fare
 * chiamate uscenti, e un pulsante «Richiama» che non compone il numero è la
 * cosa peggiore che questa schermata possa contenere: lo si premerebbe con il
 * cliente in mano. Il numero sta scritto grande, si legge e si compone dal
 * telefono del locale; qui si segna com'è andata.
 */

type RichiamataVista = {
  id: string;
  numero: string;
  ospite: { id: string; nome: string } | null;
  callId: string | null;
  tentativi: number;
  nota: string | null;
  creata: string;
  inRitardo: boolean;
};

type PersaVista = {
  id: string;
  telefono: string | null;
  quando: string;
  ospite: {
    id: string;
    nome: string;
    blocked: boolean;
    noShowCount: number;
  } | null;
};

export function DaFare({
  richiamate,
  perse,
  fuso,
  interrotte,
  risposte,
  approvazioni,
}: {
  richiamate: RichiamataVista[];
  perse: PersaVista[];
  fuso: string;
  /**
   * Le telefonate finite a meta.
   *
   * Stanno in questa colonna perche una di quelle persone voleva un tavolo e
   * **non sa se l'ha avuto**: se il link non e partito, e una telefonata da
   * fare. Arriva come nodo, costruito dalla pagina, come le altre.
   */
  interrotte?: React.ReactNode;
  /**
   * Le risposte pronte, costruite dalla pagina.
   *
   * Stanno **sotto le cose da fare e non in un'altra pagina** perché il
   * momento in cui servono è lo stesso: qualcuno è in linea. Arriva come nodo
   * perché non c'entra niente con la coda — è solo il posto dove chi risponde
   * sta già guardando.
   */
  risposte?: React.ReactNode;
  /**
   * Le informazioni proposte, da approvare.
   *
   * Stanno in questa colonna perché sono una cosa **da fare**, e chi le fa sta
   * già guardando qui. Sopra le risposte pronte, che invece si consultano: una
   * decisione viene prima di una consultazione.
   */
  approvazioni?: React.ReactNode;
}) {
  const quando = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuso,
  });

  const niente = richiamate.length === 0 && perse.length === 0 && !interrotte;

  return (
    /* `aria-label` e non solo il titolo: una `section` senza nome non viene
       annunciata come regione, e chi naviga con la tastiera o con un lettore
       di schermo non può saltarci dentro. */
    <section
      aria-label="Da fare"
      className="flex min-h-0 flex-col gap-2 lg:overflow-hidden"
    >
      <header className="fissa flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">Da fare</h2>
        {!niente && (
          <span className="t-nota tabular-nums">
            {richiamate.length + perse.length}
          </span>
        )}
      </header>

      {niente ? (
        /* Il vuoto è una buona notizia e lo dice: non è una schermata
           incompleta, è un telefono a posto. */
        <p className="riquadro fissa p-3 t-nota">
          Nessuno da richiamare. Le chiamate senza risposta compaiono qui appena
          arrivano.
        </p>
      ) : (
        <ul className="space-y-2 pr-0.5 lg:fill-scroll">
          {richiamate.map((r) => (
            <RigaRichiamata key={r.id} r={r} quando={quando} />
          ))}
          {perse.map((p) => (
            <RigaPersa key={p.id} p={p} quando={quando} />
          ))}
        </ul>
      )}

      {/* Le interrotte dopo la coda e le perse, prima delle approvazioni: sono
          telefonate da fare, e vengono dopo quelle che qualcuno ha gia chiesto
          di richiamare. */}
      {interrotte}
      {approvazioni}
      {risposte}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function RigaRichiamata({
  r,
  quando,
}: {
  r: RichiamataVista;
  quando: Intl.DateTimeFormat;
}) {
  const router = useRouter();
  const { mostra, problema } = useAvvisi();
  const [inCorso, setInCorso] = useState(false);

  async function agisci(corpo: Record<string, unknown>, fatto: string) {
    setInCorso(true);
    const res = await fetch(`/api/telefono/richiamate/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setInCorso(false);
    if (!res.ok) {
      problema(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    mostra(fatto);
    router.refresh();
  }

  return (
    <li className="riquadro p-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <PhoneOutgoing
          className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-medium">
              {r.ospite?.nome ?? "Non riconosciuto"}
            </span>
            {/* Il numero grande e selezionabile: è quello che si compone. */}
            <span className="select-all text-sm tabular-nums">{r.numero}</span>
          </p>
          <p className="mt-0.5 t-nota">
            in coda da {quando.format(new Date(r.creata))}
            {r.tentativi > 0 &&
              ` · ${r.tentativi === 1 ? "un tentativo" : `${r.tentativi} tentativi`}`}
          </p>
          {r.nota && <p className="mt-1 text-xs">{r.nota}</p>}
          {r.inRitardo && (
            <Badge tone="warning" className="mt-1.5">
              oltre il momento buono
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button asChild variant="accent" size="sm">
            <Link
              href={{
                pathname: "/bookings/new",
                query: {
                  ...(r.ospite ? { guest: r.ospite.id } : {}),
                  ...(r.callId ? { chiamata: r.callId } : {}),
                  phone: r.numero,
                },
              }}
            >
              <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Prenota
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={inCorso}
            onClick={() => agisci({ come: "DONE" }, "Richiamata chiusa.")}
          >
            <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Fatta
          </Button>
          {/* «Ho provato»: resta in coda e il contatore sale. Senza questo o si
              chiude mentendo, o il collega riprova fra cinque minuti. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={inCorso}
            onClick={() =>
              agisci({ tentativo: true }, "Segnato: non risponde.")
            }
          >
            Non risponde
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={inCorso}
            onClick={() =>
              agisci({ come: "IGNORED" }, "Non la richiamiamo più.")
            }
          >
            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Lascia perdere
          </Button>
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function RigaPersa({
  p,
  quando,
}: {
  p: PersaVista;
  quando: Intl.DateTimeFormat;
}) {
  const router = useRouter();
  const { mostra, problema } = useAvvisi();
  const [inCorso, setInCorso] = useState(false);

  async function inCoda() {
    setInCorso(true);
    const res = await fetch("/api/telefono/richiamate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chiamataId: p.id }),
    });
    setInCorso(false);
    if (!res.ok) {
      problema(
        await readApiError(res, "Non siamo riusciti a metterla in coda."),
      );
      return;
    }
    mostra("In coda da richiamare.");
    router.refresh();
  }

  async function lasciaPerdere() {
    setInCorso(true);
    /* Una persa che si lascia perdere diventa una richiamata **già chiusa**:
       così la decisione resta scritta, con chi l'ha presa e quando, e quella
       riga non torna a chiedere attenzione domani. Chiuderla senza aprirla
       vorrebbe dire non aver mai deciso niente. */
    const apri = await fetch("/api/telefono/richiamate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chiamataId: p.id }),
    });
    if (!apri.ok) {
      setInCorso(false);
      problema(await readApiError(apri, "Non siamo riusciti a salvare."));
      return;
    }
    const { id } = (await apri.json()) as { id: string };
    const chiudi = await fetch(`/api/telefono/richiamate/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ come: "IGNORED" }),
    });
    setInCorso(false);
    if (!chiudi.ok) {
      problema(await readApiError(chiudi, "Non siamo riusciti a salvare."));
      return;
    }
    mostra("Non la richiamiamo.");
    router.refresh();
  }

  return (
    <li className="riquadro p-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <PhoneMissed
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive-soft"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-medium">
              {p.ospite?.nome ?? "Non riconosciuto"}
            </span>
            <span className="select-all text-sm tabular-nums">
              {p.telefono ?? "numero riservato"}
            </span>
          </p>
          <p className="mt-0.5 t-nota">
            {quando.format(new Date(p.quando))} · nessuno ha risposto
          </p>
          {(p.ospite?.blocked || (p.ospite?.noShowCount ?? 0) > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {p.ospite?.blocked && (
                <Badge tone="danger" className="gap-1">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Bloccato
                </Badge>
              )}
              {(p.ospite?.noShowCount ?? 0) > 0 && (
                <Badge
                  tone={
                    (p.ospite?.noShowCount ?? 0) >= 2 ? "warning" : "neutral"
                  }
                >
                  {p.ospite?.noShowCount === 1
                    ? "1 assenza"
                    : `${p.ospite?.noShowCount} assenze`}
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {/* Il numero riservato non si richiama: il pulsante non c'è, invece
              di comparire e rispondere che non si può. */}
          {p.telefono && (
            <Button
              variant="accent"
              size="sm"
              disabled={inCorso}
              onClick={inCoda}
            >
              <PhoneOutgoing className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Da richiamare
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link
              href={{
                pathname: "/bookings/new",
                query: {
                  ...(p.ospite ? { guest: p.ospite.id } : {}),
                  ...(p.telefono ? { phone: p.telefono } : {}),
                  chiamata: p.id,
                },
              }}
            >
              <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Prenota
            </Link>
          </Button>
          {p.telefono && (
            <Button
              variant="ghost"
              size="sm"
              disabled={inCorso}
              onClick={lasciaPerdere}
            >
              <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Lascia perdere
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
