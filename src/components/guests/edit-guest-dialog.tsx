"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

function preferencesNote(preferences: unknown): string {
  if (preferences && typeof preferences === "object" && "note" in preferences) {
    const note = (preferences as { note?: unknown }).note;
    if (typeof note === "string") return note;
  }
  return "";
}

export function EditGuestDialog({ guest }: { guest: EditableGuest }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setError("Impossibile salvare. Verifica i dati.");
      return;
    }
    router.refresh();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" /> Modifica
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifica scheda ospite</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Nome</Label>
              <Input id="firstName" name="firstName" required defaultValue={guest.firstName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Cognome</Label>
              <Input id="lastName" name="lastName" defaultValue={guest.lastName ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={guest.email ?? ""} />
            </div>
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
            <div className="space-y-1.5">
              <Label>Livello fedeltà</Label>
              <Select name="loyaltyTier" defaultValue={guest.loyaltyTier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEW">Nuovo</SelectItem>
                  <SelectItem value="REGULAR">Abituale</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="AMBASSADOR">Ambassador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="allergies">Allergie</Label>
            <Input id="allergies" name="allergies" placeholder="Es. glutine, crostacei…" defaultValue={guest.allergies ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preferencesNote">Preferenze</Label>
            <Textarea
              id="preferencesNote"
              name="preferencesNote"
              placeholder="Es. preferisce il tavolo in terrazza, ama il vino rosso…"
              defaultValue={preferencesNote(guest.preferences)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="privateNotes">Note riservate</Label>
            <Textarea id="privateNotes" name="privateNotes" defaultValue={guest.privateNotes ?? ""} />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="marketingOptIn"
              name="marketingOptIn"
              type="checkbox"
              defaultChecked={guest.marketingOptIn}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="marketingOptIn">Consenso marketing attivo</Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" variant="gold" disabled={submitting}>
              {submitting ? "Salvataggio…" : "Salva modifiche"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
