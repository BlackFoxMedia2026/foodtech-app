"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";

const IMPORTI = [50, 100, 150, 200];

/**
 * Emettere una gift card.
 *
 * L'unica cosa obbligatoria è **l'importo**, perché è l'unica che il locale ha
 * davvero incassato. Nome, dedica e mittente sono quello che rende un regalo un
 * regalo, ma una carta venduta di corsa al bancone alle 23 non deve fermarsi
 * perché non si sa il nome di chi la riceverà.
 *
 * Il codice non si chiede: lo generiamo leggibile, con lo stesso alfabeto dei
 * coupon — nessuna O che sembra uno zero — perché una gift card si detta al
 * telefono e si stampa su un cartoncino.
 */
export function GiftCardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [importo, setImporto] = useState("100");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salva() {
    setInCorso(true);
    setError(null);

    const res = await fetch("/api/gift-cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        initialCents: Math.round(Number(importo.replace(",", ".")) * 100),
        recipientName: recipientName.trim() || null,
        recipientEmail: recipientEmail.trim() || null,
        senderName: senderName.trim() || null,
        message: message.trim() || null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    });

    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a creare la gift card."));
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova gift card</DialogTitle>
          <DialogDescription>
            Il codice lo generiamo noi, leggibile al telefono. Serve solo l&apos;importo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-importo">Importo in euro</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="g-importo"
                inputMode="decimal"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                className="w-28"
              />
              {IMPORTI.map((v) => (
                <Button key={v} type="button" variant="outline" size="sm" onClick={() => setImporto(String(v))}>
                  {v} €
                </Button>
              ))}
            </div>
            <p className="t-nota">
              È la cifra che hai incassato vendendola, e quella che il cliente potrà spendere — anche in più volte.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-dest">Per chi è</Label>
              <Input
                id="g-dest"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Facoltativo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-mitt">Da parte di</Label>
              <Input
                id="g-mitt"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Facoltativo"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-email">Email del destinatario</Label>
            <Input
              id="g-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Facoltativa"
            />
            <p className="t-nota">
              Se è l&apos;indirizzo di un cliente che già conosciamo, l&apos;automazione «gift card ferma» potrà
              ricordargli il credito quando resta lì troppo a lungo. L&apos;invio della gift card per email non è
              attivo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-dedica">Dedica</Label>
            <Textarea
              id="g-dedica"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="Buon compleanno, ci vediamo a cena"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-scadenza">Scade il</Label>
            <Input
              id="g-scadenza"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-44"
            />
            <p className="t-nota">
              Lasciandolo vuoto non scade. È il denaro di chi l&apos;ha comprata: una scadenza si mette solo se il
              locale ha deciso di metterla.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Annulla
          </Button>
          <Button variant="accent" onClick={salva} disabled={inCorso || !importo.trim()}>
            {inCorso ? "Creo…" : "Crea la gift card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
