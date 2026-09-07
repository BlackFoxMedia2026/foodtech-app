"use client";

import { useState } from "react";
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
      durationMin: Number(fd.get("durationMin") || 105),
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
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Nome</Label>
          <Input id="firstName" name="firstName" required placeholder="Lorenzo" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Cognome</Label>
          <Input id="lastName" name="lastName" placeholder="Ferri" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="ospite@email.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefono</Label>
          <Input id="phone" name="phone" placeholder="+39 …" />
        </div>
      </div>

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

      <div className="rounded-md border border-border p-3">
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
              <AlertTriangle className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
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
          <Input id="durationMin" name="durationMin" type="number" min={15} max={480} defaultValue={105} />
        </div>
      </div>

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
