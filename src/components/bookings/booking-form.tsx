"use client";

import { useEffect, useRef, useState } from "react";
import { useVenueToday } from "@/components/shell/venue-time-provider";
import { readApiError } from "@/lib/api-client";
import { SlotPicker } from "@/components/bookings/slot-picker";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Etichetta } from "@/components/ui/etichetta";
import { formatDate } from "@/lib/utils";
import type { OspiteRiconosciuto } from "@/server/guest-match";

type TableOpt = { id: string; label: string; seats: number };

/**
 * Il form che usa lo staff, di solito al telefono con il cliente in linea.
 *
 * Fino a oggi aveva un campo ora libero: il widget pubblico proponeva solo gli
 * orari accettabili (da luglio), qui invece il conflitto si scopriva dopo aver
 * premuto "Crea prenotazione" e ricevuto un 409 — con il cliente in attesa.
 * Ora gli orari sono gli stessi che vede un cliente sul sito.
 *
 * E resta la via d'uscita: quando il locale **decide** di accettare comunque —
 * un tavolo condiviso, un gruppo sistemato a mano, un cliente che non si dice
 * no — si forza, ma con un motivo scritto che finisce nel registro. Il codice
 * per farlo (`skipAvailabilityCheck`) era predisposto da luglio e non aveva
 * interfaccia: senza motivo obbligatorio sarebbe diventata la scorciatoia per
 * saltare sempre il controllo.
 */
export function BookingForm({
  tables,
  onClose,
}: {
  tables: TableOpt[];
  onClose?: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [slot, setSlot] = useState<string | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [manualTime, setManualTime] = useState("20:00");

  /**
   * La durata proposta, e da dove viene.
   *
   * Il campo partiva da 105 minuti per tutti. Adesso il locale sa quanto si
   * sta a tavola qui — per gruppi come questo, in questa fascia, in un giorno
   * come questo — e la propone già scritta con la frase che spiega su cosa
   * poggia. **Proposta, non imposta**: appena qualcuno la cambia a mano non
   * si sovrascrive più, perché chi è al telefono può sapere che quella
   * tavolata festeggia una laurea, e una statistica no.
   */
  const [durata, setDurata] = useState(105);
  const [durataNota, setDurataNota] = useState<string | null>(null);
  const [durataToccata, setDurataToccata] = useState(false);

  /*
    Il riconoscimento dell'ospite.

    Si aspetta mezzo secondo dall'ultima cifra invece di chiedere a ogni tasto:
    un numero italiano sono dieci cifre, e dieci richieste per una risposta
    sola sono nove buttate. E si comincia a chiedere da sei cifre: sotto, la
    domanda non ha abbastanza informazione per avere una risposta utile.
  */
  const [telefono, setTelefono] = useState("");
  const [riconosciuto, setRiconosciuto] = useState<OspiteRiconosciuto | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const cifre = telefono.replace(/\D/g, "");
    if (cifre.length < 6) {
      setRiconosciuto(null);
      return;
    }
    let annullato = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/guests/riconosci?phone=${encodeURIComponent(telefono)}`);
        if (annullato || !res.ok) return;
        const { ospite } = (await res.json()) as { ospite: OspiteRiconosciuto | null };
        if (!annullato) setRiconosciuto(ospite);
      } catch {
        // Una richiesta che non torna non deve fare niente di visibile: il
        // riconoscimento è un aiuto, non un passaggio obbligato del modulo.
      }
    }, 500);
    return () => {
      annullato = true;
      clearTimeout(t);
    };
  }, [telefono]);

  /** Riempie nome e cognome dalla scheda trovata, senza toccare il resto. */
  function usaOspite() {
    if (!riconosciuto) return;
    const form = formRef.current;
    if (!form) return;
    const [nome, ...resto] = riconosciuto.nome.split(" ");
    const campo = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
    const primo = campo("firstName");
    const secondo = campo("lastName");
    if (primo) primo.value = nome ?? "";
    if (secondo) secondo.value = resto.join(" ");
    primo?.focus();
  }

  const quando = forceOpen ? (date && manualTime ? `${date}T${manualTime}` : null) : slot;

  useEffect(() => {
    if (durataToccata || !quando) return;
    const istante = new Date(quando);
    if (Number.isNaN(istante.getTime())) return;

    let vivo = true;
    const params = new URLSearchParams({
      partySize: String(partySize),
      startsAt: istante.toISOString(),
    });
    fetch(`/api/bookings/durata?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return;
        setDurata(d.durataMin);
        setDurataNota(d.spiegazione);
      })
      .catch(() => {
        // Se non arriva, resta il valore che c'è: una proposta mancata non
        // deve impedire di prenotare.
      });
    return () => {
      vivo = false;
    };
  }, [quando, partySize, durataToccata]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    // Senza forzatura l'orario è uno di quelli proposti (già un istante
    // assoluto); forzando è quello scritto a mano.
    const startsAt = forceOpen
      ? new Date(`${date}T${manualTime}`).toISOString()
      : slot;

    if (!startsAt) {
      setSubmitting(false);
      setError("Scegli un orario fra quelli disponibili.");
      return;
    }

    const payload = {
      guest: {
        firstName: fd.get("firstName"),
        lastName: fd.get("lastName"),
        email: fd.get("email"),
        phone: fd.get("phone"),
      },
      partySize,
      startsAt,
      durationMin: Number(fd.get("durationMin") || durata),
      tableId: (fd.get("tableId") as string) || null,
      source: fd.get("source"),
      occasion: fd.get("occasion") || null,
      notes: fd.get("notes") || null,
      ...(forceOpen ? { force: { reason: forceReason.trim() } } : {}),
    };

    const res = await fetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);
    if (!res.ok) {
      // Il server spiega già perché ha rifiutato — locale chiuso, servizio pieno,
      // tavolo occupato. Mostrarlo tale e quale è più utile di un messaggio generico.
      setError(await readApiError(res, "Non siamo riusciti a salvare la prenotazione. Riprova."));
      return;
    }
    router.refresh();
    onClose?.();
  }

  const today = useVenueToday();
  const giorno = date || today;

  return (
    <form ref={formRef} onSubmit={onSubmit} method="post" className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Nome</Label>
          <Input id="firstName" name="firstName" required placeholder="Lorenzo" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Cognome</Label>
          <Input id="lastName" name="lastName" placeholder="Ferri" />
        </div>
        {/* Il telefono prende la riga intera: al telefono è il campo più
            importante dopo il nome, e da quando l'email è nel secondo livello
            questa metà era un buco. */}
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="phone">Telefono</Label>
          <Input
            id="phone"
            name="phone"
            placeholder="+39 …"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </div>
      </div>

      {/*
        «Questa persona la conosciamo già?»

        Compare **solo** quando c'è una corrispondenza. Non si scrive «nessun
        cliente trovato» mentre qualcuno sta ancora digitando: sarebbe una
        smentita a ogni cifra, per una domanda che non è stata fatta.

        Le tre cose che porta — VIP, allergie, assenze — sono quelle che
        cambiano la risposta a «avete un tavolo sabato?», e prima si scoprivano
        aprendo la scheda dell'ospite, cioè quasi mai.

        Non serve a evitare i doppioni: quelli il server li evita già, perché
        riusa la scheda che c'è. Serve a non chiedere quello che il locale sa
        già, e a saperlo mentre si decide.
      */}
      {riconosciuto && (
        <div className="riquadro comodo space-y-2 border-accent/40 bg-accent/5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{riconosciuto.nome}</p>
            <p className="t-nota">
              {riconosciuto.visite} {riconosciuto.visite === 1 ? "visita" : "visite"}
              {riconosciuto.ultimaVisita && ` · ultima il ${formatDate(riconosciuto.ultimaVisita)}`}
            </p>
          </div>

          {/* I segnali prima, il tag dopo: un'allergia e due assenze cambiano
              come si accoglie questa persona adesso, «VIP» dice come la vede
              il locale. Erano tre pillole uguali in fila. */}
          <div className="flex flex-wrap items-center gap-2">
            {riconosciuto.allergie && (
              <Etichetta linguaggio="segnale" icona={AlertTriangle}>
                {riconosciuto.allergie}
              </Etichetta>
            )}
            {riconosciuto.assenze > 0 && (
              <Etichetta linguaggio="segnale" icona={AlertTriangle}>
                {riconosciuto.assenze} {riconosciuto.assenze === 1 ? "assenza" : "assenze"}
              </Etichetta>
            )}
            {(riconosciuto.livello === "VIP" || riconosciuto.livello === "AMBASSADOR") && (
              <Etichetta linguaggio="manuale">
                {riconosciuto.livello === "AMBASSADOR" ? "Ambassador" : "VIP"}
              </Etichetta>
            )}
          </div>

          {/*
            «Usa questi dati» non è obbligatorio: se la persona al telefono dà
            un cognome diverso o una email nuova, si scrive quella e il server
            riconosce comunque la scheda dal telefono. Il pulsante serve a
            **non digitare**, non a vincolare.
          */}
          <Button type="button" variant="outline" size="sm" onClick={usaOspite}>
            Usa questi dati
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="date">Data</Label>
          <Input
            id="date"
            name="date"
            type="date"
            value={giorno}
            onChange={(e) => {
              setDate(e.target.value);
              setSlot(null);
            }}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partySize">Persone</Label>
          <Input
            id="partySize"
            name="partySize"
            type="number"
            min={1}
            max={50}
            value={partySize}
            onChange={(e) => {
              setPartySize(Math.min(50, Math.max(1, Number(e.target.value) || 1)));
              setSlot(null);
            }}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Orario</Label>
        {forceOpen ? (
          <div className="space-y-1.5">
            <Input
              id="time"
              type="time"
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Con la forzatura attiva l&apos;orario è libero: il controllo di disponibilità non viene
              eseguito.
            </p>
          </div>
        ) : (
          <SlotPicker date={giorno} partySize={partySize} value={slot} onChange={setSlot} />
        )}
      </div>

      <div className="riquadro p-3">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={forceOpen}
            onChange={(e) => {
              setForceOpen(e.target.checked);
              if (!e.target.checked) setForceReason("");
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-current"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-accent-strong" aria-hidden="true" />
              Accetta comunque, oltre i limiti
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Salta il controllo su orari, capienza e tavolo. Serve un motivo, e resta scritto nel
              registro con il tuo nome.
            </span>
          </span>
        </label>

        {forceOpen && (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="forceReason">Motivo della forzatura</Label>
            <Input
              id="forceReason"
              value={forceReason}
              onChange={(e) => setForceReason(e.target.value)}
              placeholder="Es. tavolo condiviso concordato col cliente"
              required
            />
          </div>
        )}
      </div>

      {/*
        Il secondo livello.

        Al telefono servono cinque cose — nome, telefono, quando, quanti — e
        se ne vedevano nove: l'audit visivo ha stimato 20-30 secondi contro i
        10 possibili, e trenta secondi con un cliente in linea sono lunghi.
        Email, tavolo, durata, fonte, occasione e note **non spariscono**: si
        aprono, e restano dentro lo stesso `<form>` — quindi si inviano
        comunque, aperte o chiuse.

        `<details>` e non uno stato React: funziona senza JavaScript, con la
        tastiera, e il browser ricorda l'apertura durante la compilazione.
        Chi prende cinque prenotazioni di fila lo apre una volta e resta
        aperto.
      */}
      <details className="riquadro">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium">
          Altri dettagli
          <span className="ml-2 font-normal text-tertiary-foreground">
            email, tavolo, durata, fonte, occasione, note
          </span>
        </summary>

        <div className="space-y-5 border-t border-border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="ospite@email.com" />
        <p className="t-nota">
          Serve solo per la conferma scritta e il promemoria: al telefono il numero basta.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tavolo</Label>
          <Select name="tableId">
            <SelectTrigger>
              <SelectValue placeholder="Assegna in seguito" />
            </SelectTrigger>
            <SelectContent>
              {tables.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label} · {t.seats} posti
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="durationMin">Durata (min)</Label>
          <Input
            id="durationMin"
            name="durationMin"
            type="number"
            min={15}
            max={480}
            value={durata}
            onChange={(e) => {
              setDurataToccata(true);
              setDurata(Number(e.target.value));
            }}
          />
        </div>
      </div>

      {durataNota && !durataToccata && (
        <p className="t-nota">Durata proposta: {durataNota}</p>
      )}
      {durataToccata && (
        <p className="t-nota">
          Durata scelta a mano: resta questa, la misura del locale non la corregge.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Fonte</Label>
          <Select name="source" defaultValue="PHONE">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PHONE">Telefono</SelectItem>
              <SelectItem value="WIDGET">Sito</SelectItem>
              <SelectItem value="WALK_IN">Walk-in</SelectItem>
              <SelectItem value="GOOGLE">Google</SelectItem>
              <SelectItem value="SOCIAL">Social</SelectItem>
              <SelectItem value="CONCIERGE">Concierge</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Occasione</Label>
          <Select name="occasion">
            <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BIRTHDAY">Compleanno</SelectItem>
              <SelectItem value="ANNIVERSARY">Anniversario</SelectItem>
              <SelectItem value="BUSINESS">Lavoro</SelectItem>
              <SelectItem value="DATE">Romantica</SelectItem>
              <SelectItem value="CELEBRATION">Celebrazione</SelectItem>
              <SelectItem value="OTHER">Altro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Note</Label>
        <Textarea id="notes" name="notes" placeholder="Allergie, preferenze, richieste speciali…" />
      </div>
        </div>
      </details>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
        )}
        <Button
          type="submit"
          variant="accent"
          disabled={
            submitting || (forceOpen ? forceReason.trim().length < 3 : !slot)
          }
        >
          {submitting ? "Salvataggio…" : forceOpen ? "Forza e crea" : "Crea prenotazione"}
        </Button>
      </div>
    </form>
  );
}
