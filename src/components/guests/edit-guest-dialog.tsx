"use client";

import { useState } from "react";
import { readApiError } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { notaPreferenze } from "@/lib/cosa-sapere";

type LoyaltyTier = "NEW" | "REGULAR" | "VIP" | "AMBASSADOR";

interface EditableGuest {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthday: Date | null;
  loyaltyTier: LoyaltyTier;
  allergies: string | null;
  privateNotes: string | null;
  marketingOptIn: boolean;
  preferences: unknown;
}



/**
 * Il modale di modifica, con o senza il suo pulsante.
 *
 * Nella testata della scheda il pulsante non è più suo: «Modifica profilo» è
 * la chiamata principale della pagina e sta nel gruppo di azioni a destra,
 * insieme al menu. Quindi il modale accetta `open`/`onOpenChange` e, quando
 * qualcuno glieli passa, smette di disegnarsi un pulsante per conto proprio —
 * altrimenti resta autonomo come prima.
 */
export function EditGuestDialog({
  guest,
  open: openEsterno,
  onOpenChange,
}: {
  guest: EditableGuest;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [openInterno, setOpenInterno] = useState(false);
  const controllato = openEsterno !== undefined;
  const open = controllato ? openEsterno : openInterno;
  const setOpen = controllato ? (v: boolean) => onOpenChange?.(v) : setOpenInterno;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const note = (fd.get("preferencesNote") as string) ?? "";

    const payload = {
      firstName: fd.get("firstName"),
      lastName: (fd.get("lastName") as string) || null,
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      birthday: (fd.get("birthday") as string) || null,
      loyaltyTier: fd.get("loyaltyTier"),
      allergies: (fd.get("allergies") as string) || null,
      privateNotes: (fd.get("privateNotes") as string) || null,
      marketingOptIn: fd.get("marketingOptIn") === "on",
      preferences: note ? { note } : null,
    };

    const res = await fetch(`/api/guests/${guest.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(await readApiError(res, "Impossibile salvare. Verifica i dati."));
      return;
    }
    router.refresh();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controllato && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4" /> Modifica
          </Button>
        </DialogTrigger>
      )}
      {/*
        In una colonna sola gli undici campi facevano un modale più alto dello
        schermo: le azioni finivano sotto la piega e si salvava alla cieca, dopo
        aver scrollato. Su due colonne l'altezza si dimezza e lo spazio laterale,
        che c'era già, smette di essere margine vuoto. I dati di contatto stanno
        da una parte, quello che serve sapere a tavola dall'altra.
      */}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Modifica scheda ospite</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} method="post" className="space-y-5">
          <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
            {/* ── Chi è ─────────────────────────────────────────────────── */}
            <div className="space-y-3.5">
              <p className="t-etichetta">Anagrafica</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Nome</Label>
                  <Input id="firstName" name="firstName" required defaultValue={guest.firstName} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Cognome</Label>
                  <Input id="lastName" name="lastName" defaultValue={guest.lastName ?? ""} />
                </div>
              </div>

              {/* L'email va a tutta larghezza: in mezza colonna un indirizzo
                  vero si taglia già dopo il nome. */}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={guest.email ?? ""} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefono</Label>
                  <Input id="phone" name="phone" defaultValue={guest.phone ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="birthday">Data di nascita</Label>
                  <Input
                    id="birthday"
                    name="birthday"
                    type="date"
                    defaultValue={guest.birthday ? guest.birthday.toISOString().slice(0, 10) : ""}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="loyaltyTier">Livello fedeltà</Label>
                <Select name="loyaltyTier" defaultValue={guest.loyaltyTier}>
                  <SelectTrigger id="loyaltyTier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEW">Nuovo</SelectItem>
                    <SelectItem value="REGULAR">Abituale</SelectItem>
                    <SelectItem value="VIP">VIP</SelectItem>
                    <SelectItem value="AMBASSADOR">Ambassador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Il consenso sta con i recapiti: è il permesso di usarli. */}
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  id="marketingOptIn"
                  name="marketingOptIn"
                  type="checkbox"
                  defaultChecked={guest.marketingOptIn}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="marketingOptIn">Consenso marketing attivo</Label>
              </div>
            </div>

            {/* ── Cosa sapere ───────────────────────────────────────────── */}
            <div className="space-y-3.5">
              <p className="t-etichetta">Cosa sapere</p>

              <div className="space-y-1.5">
                <Label htmlFor="allergies">Allergie</Label>
                <Input id="allergies" name="allergies" placeholder="Es. glutine, crostacei…" defaultValue={guest.allergies ?? ""} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preferencesNote">Preferenze</Label>
                <Textarea
                  id="preferencesNote"
                  name="preferencesNote"
                  className="min-h-[96px]"
                  placeholder="Es. preferisce il tavolo in terrazza, ama il vino rosso…"
                  defaultValue={notaPreferenze(guest.preferences) ?? ""}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="privateNotes">Note riservate</Label>
                <Textarea
                  id="privateNotes"
                  name="privateNotes"
                  className="min-h-[96px]"
                  placeholder="Visibili solo allo staff"
                  defaultValue={guest.privateNotes ?? ""}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" variant="accent" disabled={submitting}>
              {submitting ? "Salvataggio…" : "Salva modifiche"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
