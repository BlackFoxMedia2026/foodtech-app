"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
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
import { readApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import type { AnteprimaCancellazione } from "@/server/guest-erasure";

/**
 * Cancellare i dati di una persona su sua richiesta.
 *
 * Non si chiede «sei sicuro?». Si mostrano **due elenchi**: cosa sparisce e
 * cosa resta. Il secondo è quello che serve davvero a chi deve decidere, perché
 * la paura di chi preme quel pulsante è di far sparire un mese di incassi — e
 * non succede: le cene servite restano, spariscono i dati della persona.
 *
 * Il motivo è obbligatorio. Fra un anno «anonimizzato» senza contesto non si
 * distingue da un errore, e questo errore non si può correggere.
 */
export function ErasureDialog({ guestId, guestName }: { guestId: string; guestName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [anteprima, setAnteprima] = useState<AnteprimaCancellazione | null>(null);
  const [motivo, setMotivo] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let annullato = false;
    setError(null);
    setAnteprima(null);

    (async () => {
      const res = await fetch(`/api/guests/${guestId}/anonymize`);
      if (annullato) return;
      if (!res.ok) {
        setError(await readApiError(res, "Non siamo riusciti a leggere cosa verrebbe cancellato."));
        return;
      }
      setAnteprima(await res.json());
    })();

    return () => {
      annullato = true;
    };
  }, [open, guestId]);

  async function cancella() {
    setInCorso(true);
    setError(null);
    const res = await fetch(`/api/guests/${guestId}/anonymize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: motivo.trim() }),
    });
    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a cancellare i dati. Riprova."));
      return;
    }
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  const s = anteprima?.sparisce;
  const r = anteprima?.resta;

  /** Le voci con un numero sopra zero: un elenco di zeri non dice niente. */
  const vociSparisce = s
    ? [
        s.contatti > 0 && `${s.contatti === 1 ? "un contatto" : "email e telefono"}`,
        s.noteSuPrenotazioni > 0 &&
          `le note su ${s.noteSuPrenotazioni} ${s.noteSuPrenotazioni === 1 ? "prenotazione" : "prenotazioni"}`,
        s.contattiWifi > 0 &&
          `${s.contattiWifi} ${s.contattiWifi === 1 ? "accesso" : "accessi"} al Wi-Fi, con l'indirizzo IP`,
        s.messaggiInviati > 0 &&
          `il destinatario e il testo di ${s.messaggiInviati} ${s.messaggiInviati === 1 ? "messaggio" : "messaggi"}`,
        s.commentiSondaggi > 0 &&
          `${s.commentiSondaggi} ${s.commentiSondaggi === 1 ? "commento" : "commenti"} nei sondaggi`,
        s.contiConNomeScritto > 0 &&
          `il nome scritto su ${s.contiConNomeScritto} ${s.contiConNomeScritto === 1 ? "conto" : "conti"}`,
      ].filter((v): v is string => typeof v === "string")
    : [];

  const vociResta = r
    ? [
        r.prenotazioni > 0 &&
          `${r.prenotazioni} ${r.prenotazioni === 1 ? "prenotazione" : "prenotazioni"} con i suoi coperti e le sue date`,
        r.contiChiusi > 0 &&
          `${r.contiChiusi} ${r.contiChiusi === 1 ? "conto chiuso" : "conti chiusi"} per ${formatCurrency(r.incassoCents, "EUR")}`,
        r.punti > 0 && `${r.punti} punti fedeltà`,
        r.couponUsati > 0 && `${r.couponUsati} ${r.couponUsati === 1 ? "coupon usato" : "coupon usati"}`,
        r.votiSondaggi > 0 && `${r.votiSondaggi} ${r.votiSondaggi === 1 ? "voto" : "voti"} nei sondaggi`,
      ].filter((v): v is string => typeof v === "string")
    : [];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldOff className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Cancella i dati
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancellare i dati di {guestName}</DialogTitle>
            <DialogDescription>
              Si fa quando la persona lo chiede. Non si può annullare: i dati vengono sovrascritti, non spostati.
            </DialogDescription>
          </DialogHeader>

          {anteprima === null ? (
            error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Guardo cosa c&apos;è…</p>
            )
          ) : anteprima.giaAnonimizzato ? (
            <p className="text-sm text-muted-foreground">
              I dati di questa persona sono già stati cancellati.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                <p className="font-medium">Sparisce per sempre</p>
                {vociSparisce.length === 0 ? (
                  <p className="mt-1">Nome e cognome. Non ci sono altri dati personali su questa scheda.</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>nome e cognome</li>
                    {vociSparisce.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-md border border-sage/40 bg-sage/10 p-3 text-sm">
                {/* È l'elenco che serve a chi decide: i conti non si toccano. */}
                <p className="font-medium">Resta, perché sono i tuoi conti e non i suoi dati</p>
                {vociResta.length === 0 ? (
                  <p className="mt-1">Questa persona non ha ancora prenotazioni o conti.</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {vociResta.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="er-motivo">Perché</Label>
                <Input
                  id="er-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Es. richiesta via email del 7 settembre"
                />
                <p className="t-nota">
                  Resta nel registro con il tuo nome e l&apos;ora. Fra un anno è la sola cosa che distingue una
                  richiesta da un errore.
                </p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={inCorso}>
              Chiudi
            </Button>
            {anteprima && !anteprima.giaAnonimizzato && (
              <Button variant="destructive" onClick={cancella} disabled={inCorso || motivo.trim().length < 3}>
                {inCorso ? "Cancello…" : "Cancella i dati"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
