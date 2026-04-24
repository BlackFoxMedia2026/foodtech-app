"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TableOpt = { id: string; label: string; seats: number };

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const date = fd.get("date") as string;
    const time = fd.get("time") as string;

    const payload = {
      guest: {
        firstName: fd.get("firstName"),
        lastName: fd.get("lastName"),
        email: fd.get("email"),
        phone: fd.get("phone"),
      },
      partySize: Number(fd.get("partySize")),
      startsAt: new Date(`${date}T${time}`).toISOString(),
      durationMin: Number(fd.get("durationMin") || 105),
      tableId: (fd.get("tableId") as string) || null,
      source: fd.get("source"),
      occasion: fd.get("occasion") || null,
      notes: fd.get("notes") || null,
    };

    const res = await fetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Impossibile salvare. Verifica i dati.");
      return;
    }
    router.refresh();
    onClose?.();
  }

  const today = new Date().toISOString().slice(0, 10);

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

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="date">Data</Label>
          <Input id="date" name="date" type="date" defaultValue={today} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="time">Ora</Label>
          <Input id="time" name="time" type="time" defaultValue="20:00" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partySize">Persone</Label>
          <Input id="partySize" name="partySize" type="number" min={1} max={50} defaultValue={2} required />
        </div>
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
        <Button type="submit" variant="gold" disabled={submitting}>
          {submitting ? "Salvataggio…" : "Crea prenotazione"}
        </Button>
      </div>
    </form>
  );
}
