"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlotPicker } from "@/components/bookings/slot-picker";
import { AlertCircle, Loader2, Mail, Phone } from "lucide-react";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6,8}$/;

/**
 * Oltre questo numero, un tavolo non si prenota da un modulo.
 *
 * Dodici persone sono il punto in cui una prenotazione smette di essere una
 * prenotazione e diventa un'organizzazione: due tavoli uniti, un menu
 * concordato, a volte una sala. Farla passare da qui vorrebbe dire prendere
 * un impegno che il locale non ha ancora visto, e la telefonata la si fa
 * comunque — solo dopo, e di corsa.
 */
const GRUPPO_GRANDE = 12;

interface PublicBookingFormProps {
  venueId: string;
  venueName: string;
  embed?: boolean;
  logoUrl?: string;
  primaryColor?: string;
  phone?: string;
  email?: string;
  /** La campagna che ha portato qui questa persona, se ce n'è una. */
  campaignId?: string;
}

export function PublicBookingForm({
  venueId,
  venueName,
  embed,
  logoUrl,
  primaryColor,
  phone,
  email,
  campaignId,
}: PublicBookingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data e coperti pilotano gli orari proponibili, quindi vivono nello stato.
  const [date, setDate] = useState("");
  const [partySize, setPartySize] = useState(2);
  /** Vero quando il gruppo è troppo grande per il modulo. */
  const [gruppoGrande, setGruppoGrande] = useState(false);
  /** Istante ISO scelto: arriva dal server e torna indietro identico. */
  const [startsAt, setStartsAt] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const occasion = formData.get("occasion") as string;
    const notes = formData.get("notes") as string;

    if (!firstName || !email || !phone || !date) {
      setError("Compila tutti i campi obbligatori");
      setLoading(false);
      return;
    }

    if (!startsAt) {
      setError("Scegli un orario fra quelli disponibili");
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
          partySize,
          startsAt,
          occasion: occasion && occasion !== "NONE" ? occasion : null,
          notes: notes || null,
          source: "WIDGET",
          ...(campaignId ? { campaignId } : {}),
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
    <form onSubmit={handleSubmit} method="post" className="space-y-6">
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
          <Label htmlFor="date">Data *</Label>
          <Input
            id="date"
            name="date"
            type="date"
            required
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {/* Il campo data nativo si mostra nel formato della lingua del
              browser: a un cliente italiano appariva `mm/dd/yyyy`, e chi
              scrive 07/09 pensando al 7 settembre prenotava il 9 luglio.
              Il campo resta (funziona e si usa col calendario del telefono),
              ma sotto c'è scritta la data per esteso, senza ambiguità. */}
          {date && (
            <p className="text-xs text-muted-foreground">
              {new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="partySize">Numero di persone *</Label>
          <Select
            name="partySize"
            value={gruppoGrande ? "tanti" : String(partySize)}
            onValueChange={(v) => {
              if (v === "tanti") {
                setGruppoGrande(true);
                setStartsAt(null);
                return;
              }
              setGruppoGrande(false);
              setPartySize(Number(v));
            }}
            required
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: GRUPPO_GRANDE }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={n.toString()}>
                  {n} {n === 1 ? "persona" : "persone"}
                </SelectItem>
              ))}
              <SelectItem value="tanti">Più di {GRUPPO_GRANDE}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {gruppoGrande ? (
        /* Un gruppo grande non si prenota da un modulo: si organizza. Invece
           di far compilare tutto per poi scrivere «vi richiamiamo», la strada
           giusta si dice subito — ed è un numero di telefono, non un errore. */
        <div className="space-y-2 rounded-md border border-accent/30 bg-accent/10 p-4 text-sm">
          <p className="font-medium">Per più di {GRUPPO_GRANDE} persone parliamone.</p>
          <p>
            Un tavolo così si prepara: due tavoli uniti, a volte un menu concordato. Chiamaci e lo
            organizziamo insieme — è più veloce di questo modulo.
          </p>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex min-h-[44px] items-center gap-2 font-medium underline underline-offset-4"
            >
              <Phone className="h-4 w-4" aria-hidden="true" /> {phone}
            </a>
          )}
          {!phone && email && (
            <a
              href={`mailto:${email}`}
              className="inline-flex min-h-[44px] items-center gap-2 font-medium underline underline-offset-4"
            >
              <Mail className="h-4 w-4" aria-hidden="true" /> {email}
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Orario *</Label>
          <SlotPicker
            venueId={venueId}
            date={date}
            partySize={partySize}
            value={startsAt}
            onChange={setStartsAt}
          />
        </div>
      )}

      {!gruppoGrande && (
      <>
      {/* I dati personali vengono dopo la disponibilità, non prima.
          Chiedere nome, email e telefono a chi non sa ancora se c'è un tavolo
          è il modo più rapido di far abbandonare il modulo — e di riempire il
          CRM di indirizzi inventati. */}
      <div className="border-t border-border pt-5">
        <p className="text-sm font-medium">I tuoi dati</p>
        <p className="text-xs text-muted-foreground">Servono a confermarti il tavolo.</p>
      </div>

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

      <div className="space-y-2">
        <Label htmlFor="notes">Note o richieste speciali</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Allergie, intolleranze, esigenze particolari…"
          maxLength={500}
        />
      </div>

      <Button type="submit" variant="accent" disabled={loading} className="w-full" style={buttonStyle}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Elaborazione...
          </>
        ) : (
          "Prenota ora"
        )}
      </Button>
      </>
      )}

      {/* Quando il riquadro del gruppo grande mostra già il numero, la riga
          dei contatti in fondo lo ripeterebbe a due centimetri di distanza. */}
      {!gruppoGrande && (phone || email) && (
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
