"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Check, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

/**
 * Le trattative per un evento, e i tre gesti che le muovono.
 *
 * ## Perché il preventivo si scrive **dentro la riga**
 *
 * Perché è un gesto da mezzo minuto — un totale, un prezzo a testa, due righe
 * di menu — e una pagina di dettaglio per farlo vorrebbe dire due clic per
 * andare e due per tornare, su una coda che si smaltisce a cinque richieste
 * per volta. La riga si apre dove sta, e quando si chiude la coda è ancora
 * lì.
 *
 * ## Perché «persa» chiede il motivo, e non si può saltare
 *
 * Perché «perse: dodici» non insegna niente a nessuno, e «otto perse per il
 * prezzo» cambia il listino degli eventi. È l'unico numero di questa pagina
 * che può far guadagnare qualcosa, e un campo facoltativo lo riempirebbe
 * nessuno.
 *
 * ## Perché i giorni fermi sono in evidenza
 *
 * Perché chi chiede un preventivo per quaranta persone lo chiede a tre
 * ristoranti lo stesso pomeriggio: il numero che conta non è quando è
 * arrivata, è **da quanto aspetta**.
 */

export type Trattativa = {
  id: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  persone: number;
  quando: string | null;
  quandoTesto: string | null;
  tipo: string | null;
  stato: "NUOVA" | "PREVENTIVO" | "ACCETTATA" | "PERSA";
  budgetCents: number | null;
  preventivoCents: number | null;
  perPersonaCents: number | null;
  menuConcordato: string | null;
  note: string | null;
  motivo: string | null;
  bookingId: string | null;
  giorniFerma: number;
};

const ETICHETTE: Record<Trattativa["stato"], { testo: string; tono: "info" | "warning" | "success" | "neutral" }> = {
  NUOVA: { testo: "Da guardare", tono: "warning" },
  PREVENTIVO: { testo: "Preventivo mandato", tono: "info" },
  ACCETTATA: { testo: "Accettata", tono: "success" },
  PERSA: { testo: "Persa", tono: "neutral" },
};

export function Trattative({
  iniziali,
  valuta,
  canManage,
}: {
  iniziali: Trattativa[];
  valuta: string;
  canManage: boolean;
}) {
  const [aperta, setAperta] = useState<string | null>(null);
  /*
    La conferma sta **qui** e non nella riga, perche la riga sparisce.

    Accettare o perdere toglie la trattativa dalla coda — e giusto: questa
    pagina mostra il lavoro da fare, non un archivio. Ma una riga che svanisce
    senza dire niente lascia chi ha premuto a chiedersi se ha funzionato, e a
    premere di nuovo.
  */
  const [fatto, setFatto] = useState<{ testo: string; bookingId?: string } | null>(null);

  const conferma = fatto && (
    <p
      role="status"
      className="riquadro border border-emerald-600/40 bg-emerald-600/5 p-3 text-sm"
    >
      {fatto.testo}{" "}
      {fatto.bookingId && (
        <Link href={`/bookings/${fatto.bookingId}`} className="underline">
          Apri la prenotazione
        </Link>
      )}
    </p>
  );

  if (iniziali.length === 0) {
    return (
      <div className="space-y-2">
        {conferma}
        <p className="surface riquadro p-6 text-center text-sm text-muted-foreground">
          Nessuna richiesta aperta. Quando qualcuno chiede un preventivo per un gruppo — al telefono
          o dal risponditore — compare qui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conferma}
      <ul className="space-y-2">
        {iniziali.map((t) => (
          <li key={t.id} className="surface riquadro p-4">
            <Riga
              t={t}
              valuta={valuta}
              canManage={canManage}
              aperta={aperta === t.id}
              apri={() => setAperta(aperta === t.id ? null : t.id)}
              fatta={setFatto}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Riga({
  t,
  valuta,
  canManage,
  aperta,
  apri,
  fatta,
}: {
  t: Trattativa;
  valuta: string;
  canManage: boolean;
  aperta: boolean;
  apri: () => void;
  /** Da chiamare quando la trattativa esce dalla coda: la riga sparisce. */
  fatta: (esito: { testo: string; bookingId?: string }) => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [totale, setTotale] = useState(t.preventivoCents ? String(t.preventivoCents / 100) : "");
  const [aTesta, setATesta] = useState(t.perPersonaCents ? String(t.perPersonaCents / 100) : "");
  const [menu, setMenu] = useState(t.menuConcordato ?? "");
  const [giorno, setGiorno] = useState(t.quando ? t.quando.slice(0, 16) : "");
  const [motivo, setMotivo] = useState("");
  const [chiedeMotivo, setChiedeMotivo] = useState(false);

  const etichetta = ETICHETTE[t.stato];
  const chiusa = t.stato === "ACCETTATA" || t.stato === "PERSA";

  async function manda(corpo: Record<string, unknown>) {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/eventi/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Non siamo riusciti a salvare."));

      /* Le due azioni che **togliono** la riga dalla coda lasciano una frase
         al posto suo: senza, chi ha premuto vede svanire tutto e ripreme. */
      if (corpo.azione === "accetta") {
        const dati = (await res.json()) as { bookingId?: string };
        fatta({
          testo: `${t.nome}: accettata, ${t.persone} persone in agenda.`,
          ...(dati.bookingId ? { bookingId: dati.bookingId } : {}),
        });
      } else if (corpo.azione === "persa") {
        fatta({ testo: `${t.nome}: segnata come persa.` });
      }
      router.refresh();
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    } finally {
      setInCorso(false);
    }
  }

  const centesimi = (testo: string): number | null => {
    const pulito = testo.replace(",", ".").trim();
    if (!pulito) return null;
    const n = Number(pulito);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-display text-lg leading-none">{t.nome}</span>
            <Badge tone={etichetta.tono}>{etichetta.testo}</Badge>
            {/* Da quanto aspetta, non quando è arrivata: è il numero che dice
                se questa trattativa è già persa. */}
            {!chiusa && t.giorniFerma >= 1 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                ferma da {t.giorniFerma} {t.giorniFerma === 1 ? "giorno" : "giorni"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t.persone} persone
            {t.tipo ? ` · ${t.tipo}` : ""}
            {t.quando
              ? ` · ${new Date(t.quando).toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" })}`
              : t.quandoTesto
                ? ` · ${t.quandoTesto}`
                : " · data da decidere"}
          </p>
          <p className="text-sm text-muted-foreground">
            {t.telefono ?? t.email ?? "nessun contatto"}
            {t.budgetCents ? ` · budget dichiarato ${formatCurrency(t.budgetCents, valuta)}` : ""}
          </p>
          {t.note && <p className="text-sm">{t.note}</p>}
          {t.preventivoCents !== null && (
            <p className="text-sm">
              Preventivo: <strong>{formatCurrency(t.preventivoCents, valuta)}</strong>
              {t.perPersonaCents ? ` · ${formatCurrency(t.perPersonaCents, valuta)} a testa` : ""}
            </p>
          )}
          {t.menuConcordato && <p className="text-sm text-muted-foreground">{t.menuConcordato}</p>}
          {t.motivo && <p className="text-sm text-muted-foreground">Persa: {t.motivo}</p>}
          {t.bookingId && (
            <Link href={`/bookings/${t.bookingId}`} className="text-sm underline">
              Apri la prenotazione
            </Link>
          )}
        </div>

        {!chiusa && canManage && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={apri} className="tocco-comodo">
              {aperta ? "Chiudi" : t.stato === "NUOVA" ? "Fai il preventivo" : "Modifica"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={inCorso}
              onClick={() => setChiedeMotivo(!chiedeMotivo)}
              className="tocco-comodo"
            >
              <X className="h-4 w-4" /> Persa
            </Button>
          </div>
        )}
      </div>

      {errore && <p className="text-sm text-destructive">{errore}</p>}

      {chiedeMotivo && !chiusa && (
        <div className="riquadro border border-border/60 p-3">
          <Label htmlFor={`motivo-${t.id}`}>Perché è andata persa?</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            <Input
              id={`motivo-${t.id}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="troppo caro, hanno scelto un altro posto…"
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={inCorso || !motivo.trim()}
              onClick={() => void manda({ azione: "persa", motivo })}
              className="tocco-comodo"
            >
              Segna persa
            </Button>
          </div>
          {/* Il motivo non è facoltativo, e la frase dice perché: senza,
              «perse: dodici» è l'unico numero che resta, e non serve. */}
          <p className="mt-1 text-xs text-muted-foreground">
            Serve per sapere cosa cambiare: è l&apos;unico numero di questa pagina che può far
            guadagnare qualcosa.
          </p>
        </div>
      )}

      {aperta && !chiusa && (
        <div className="riquadro space-y-3 border border-border/60 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`totale-${t.id}`}>Totale</Label>
              <Input
                id={`totale-${t.id}`}
                value={totale}
                onChange={(e) => setTotale(e.target.value)}
                inputMode="decimal"
                placeholder="1800"
              />
            </div>
            <div>
              <Label htmlFor={`atesta-${t.id}`}>A testa</Label>
              <Input
                id={`atesta-${t.id}`}
                value={aTesta}
                onChange={(e) => setATesta(e.target.value)}
                inputMode="decimal"
                placeholder="45"
              />
            </div>
            <div>
              <Label htmlFor={`giorno-${t.id}`}>Giorno e ora</Label>
              <Input
                id={`giorno-${t.id}`}
                type="datetime-local"
                value={giorno}
                onChange={(e) => setGiorno(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor={`menu-${t.id}`}>Menu concordato</Label>
            <Input
              id={`menu-${t.id}`}
              value={menu}
              onChange={(e) => setMenu(e.target.value)}
              placeholder="Antipasto misto, due primi, dolce, acqua e vino della casa"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={inCorso}
              onClick={() =>
                void manda({
                  azione: "preventivo",
                  preventivoCents: centesimi(totale),
                  perPersonaCents: centesimi(aTesta),
                  menuConcordato: menu,
                  ...(giorno ? { quando: new Date(giorno).toISOString() } : {}),
                })
              }
              className="tocco-comodo"
            >
              Salva il preventivo
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={inCorso || !giorno}
              onClick={() =>
                void manda({
                  azione: "accetta",
                  quando: new Date(giorno).toISOString(),
                  preventivoCents: centesimi(totale),
                })
              }
              className="tocco-comodo"
            >
              <Check className="h-4 w-4" /> Accetta e metti in agenda
            </Button>
          </div>
          {/* Il pulsante si può premere solo con una data, e la frase dice
              perché: una prenotazione senza quando non è una prenotazione. */}
          {!giorno && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarPlus className="h-3 w-3" />
              Per accettare serve il giorno: è quello che finisce in agenda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
