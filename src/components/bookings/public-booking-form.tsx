"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Loader2, Mail, Phone } from "lucide-react";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6,8}$/;

interface PublicBookingFormProps {
  venueId: string;
  venueName: string;
  embed?: boolean;
  logoUrl?: string;
  primaryColor?: string;
  phone?: string;
  email?: string;
}

export function PublicBookingForm({ venueId, venueName, embed, logoUrl, primaryColor, phone, email }: PublicBookingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const date = formData.get("date") as string;
    const time = formData.get("time") as string;
    const partySize = formData.get("partySize") as string;
    const occasion = formData.get("occasion") as string;
    const notes = formData.get("notes") as string;

    if (!firstName || !email || !phone || !date || !time || !partySize) {
      setError("Compila tutti i campi obbligatori");
      setLoading(false);
      return;
    }

    const startsAt = new Date(`${date}T${time}`);
    if (isNaN(startsAt.getTime())) {
      setError("Data e ora non valide");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          guest: {
            firstName,
            lastName: lastName || null,
            email,
            phone,
          },
          partySize: parseInt(partySize),
          startsAt,
          occasion: occasion && occasion !== "NONE" ? occasion : null,
          notes: notes || null,
          source: "WIDGET",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore durante la prenotazione");
      }

      const booking = await res.json();
      router.push(`/book/confirmation?bookingId=${booking.id}&status=${booking.status}${embed ? "&embed=1" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const buttonStyle =
    primaryColor && HEX_COLOR_RE.test(primaryColor) ? { background: primaryColor } : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {logoUrl && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={venueName} className="h-12 w-auto object-contain" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-800">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Prenotazione presso <strong>{venueName}</strong>
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nome *</Label>
          <Input id="firstName" name="firstName" required placeholder="Mario" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Cognome</Label>
          <Input id="lastName" name="lastName" placeholder="Rossi" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email *</Label>
        <Input id="email" name="email" type="email" required placeholder="mario@example.com" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Telefono *</Label>
        <Input id="phone" name="phone" type="tel" required placeholder="+39 06 1234 5678" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Data *</Label>
          <Input id="date" name="date" type="date" required min={today} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="time">Ora *</Label>
          <Input id="time" name="time" type="time" required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="partySize">Numero di persone *</Label>
          <Select name="partySize" defaultValue="2" required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={n.toString()}>
                  {n} {n === 1 ? "persona" : "persone"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="occasion">Occasione</Label>
          <Select name="occasion" defaultValue="NONE">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Nessuna</SelectItem>
              <SelectItem value="BIRTHDAY">Compleanno</SelectItem>
              <SelectItem value="ANNIVERSARY">Anniversario</SelectItem>
              <SelectItem value="BUSINESS">Riunione di lavoro</SelectItem>
              <SelectItem value="DATE">Cena romantica</SelectItem>
              <SelectItem value="CELEBRATION">Celebrazione</SelectItem>
              <SelectItem value="OTHER">Altro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Note o richieste speciali</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Allergie, intolleranze, esigenze particolari…"
          maxLength={500}
        />
      </div>

      <Button type="submit" variant="gold" disabled={loading} className="w-full" style={buttonStyle}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Elaborazione...
          </>
        ) : (
          "Prenota ora"
        )}
      </Button>

      {(phone || email) && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-sm text-muted-foreground">
          {phone && (
            <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Phone className="h-3.5 w-3.5" /> {phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Mail className="h-3.5 w-3.5" /> {email}
            </a>
          )}
        </div>
      )}
    </form>
  );
}
