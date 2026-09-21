"use client";

import { useState } from "react";
import Image from "next/image";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import {
  GruppoImpostazioni,
  RigaLibera,
} from "@/components/settings/righe-impostazioni";

/**
 * L'accesso in due passi, dalla parte di chi lo accende.
 *
 * ## Le due cose che questa schermata deve fare bene
 *
 * **1. Non chiudere fuori nessuno.** Si accende in due passi — prima il QR,
 * poi un codice giusto — e i codici di recupero si mostrano **prima** di
 * dichiararlo fatto, con l'avviso che non si rivedranno. Una schermata che
 * accende e saluta lascia chi ha sbagliato a inquadrare senza un modo di
 * rientrare.
 *
 * **2. Dire la verità su dov'è il segreto.** Se questa installazione non ha la
 * chiave di cifratura, il segreto sta nel database in chiaro: lo si scrive,
 * invece di far credere a una protezione che non c'è.
 */
export function DueFattori({
  attivo,
  codiciRimasti,
  segretoInChiaro,
}: {
  attivo: boolean;
  codiciRimasti: number;
  segretoInChiaro: boolean;
}) {
  const [stato, setStato] = useState<{ attivo: boolean; codiciRimasti: number }>({
    attivo,
    codiciRimasti,
  });
  const [avvio, setAvvio] = useState<{ segreto: string; qr: string } | null>(null);
  const [codici, setCodici] = useState<string[] | null>(null);
  const [codice, setCodice] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function chiama(metodo: "POST" | "PUT" | "DELETE", corpo?: unknown) {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch("/api/account/due-fattori", {
        method: metodo,
        headers: { "content-type": "application/json" },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Non ci siamo riusciti."));
      return await res.json();
    } finally {
      setInCorso(false);
    }
  }

  async function inizia() {
    try {
      const d = (await chiama("POST")) as { segreto: string; qr: string };
      setAvvio({ segreto: d.segreto, qr: d.qr });
      setCodici(null);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    }
  }

  async function conferma() {
    try {
      const d = (await chiama("PUT", { codice })) as { codiciRecupero: string[] };
      setCodici(d.codiciRecupero);
      setAvvio(null);
      setCodice("");
      setStato({ attivo: true, codiciRimasti: d.codiciRecupero.length });
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Codice non valido.");
    }
  }

  async function spegni() {
    try {
      await chiama("DELETE", { codice });
      setStato({ attivo: false, codiciRimasti: 0 });
      setCodice("");
      setCodici(null);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Codice non valido.");
    }
  }

  return (
    <GruppoImpostazioni
      titolo="Accesso in due passi"
      descrizione="Oltre alla password, un codice che cambia ogni trenta secondi. Vale solo per il tuo accesso."
    >
      {segretoInChiaro && (
        <RigaLibera>
          <p className="t-nota">
            Su questa installazione manca la chiave di cifratura: il segreto
            viene salvato in chiaro nel database. Funziona, ma è una protezione
            più debole di quella che sembra.
          </p>
        </RigaLibera>
      )}

      {errore && (
        <RigaLibera>
          <p role="alert" className="text-sm text-destructive">
            {errore}
          </p>
        </RigaLibera>
      )}

      {/* I codici di recupero: si vedono **una volta**, e lo si dice. */}
      {codici && (
        <RigaLibera>
          <div className="rounded-md border border-border bg-black/20 p-3">
            <p className="text-sm font-medium">
              Salva questi codici adesso: non si rivedono più.
            </p>
            <p className="t-nota mt-1">
              Ognuno vale per un accesso, se non hai il telefono. Stampali o
              mettili dove tieni le cose importanti.
            </p>
            <ul className="mt-2 grid gap-1 font-mono text-xs sm:grid-cols-2">
              {codici.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="mt-2">
              <CopyButton value={codici.join("\n")} size="sm" variant="outline" />
            </div>
          </div>
        </RigaLibera>
      )}

      {stato.attivo ? (
        <>
          <RigaLibera>
            <p className="text-sm">
              <ShieldCheck className="mr-1.5 inline h-4 w-4 text-verde" aria-hidden="true" />
              Acceso. Codici di recupero rimasti: <strong>{stato.codiciRimasti}</strong>.
            </p>
          </RigaLibera>
          <RigaLibera>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="due-fattori-spegni">Codice per spegnere</Label>
                <Input
                  id="due-fattori-spegni"
                  value={codice}
                  onChange={(e) => setCodice(e.target.value)}
                  inputMode="numeric"
                  placeholder="123456"
                  className="mt-1 w-40 font-mono"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => void spegni()} disabled={inCorso}>
                <ShieldOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Spegni
              </Button>
            </div>
            <p className="t-nota mt-1">
              Serve un codice anche per spegnere: senza, basterebbe un computer
              lasciato aperto per togliere la protezione.
            </p>
          </RigaLibera>
        </>
      ) : avvio ? (
        <>
          <RigaLibera>
            <div className="flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <Image
                src={avvio.qr}
                alt="Codice QR per l'app di autenticazione"
                width={180}
                height={180}
                unoptimized
                className="rounded-md border border-border bg-white p-1"
              />
              <div className="min-w-[12rem] flex-1 space-y-2">
                <p className="text-sm">
                  Inquadralo con l&apos;app di autenticazione (Google
                  Authenticator, Authy, 1Password, quella che usi).
                </p>
                <div>
                  <span className="t-etichetta block">Oppure scrivi questo</span>
                  <code className="break-all font-mono text-xs">{avvio.segreto}</code>
                </div>
                <CopyButton value={avvio.segreto} size="sm" variant="outline" />
              </div>
            </div>
          </RigaLibera>
          <RigaLibera>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="due-fattori-conferma">Il codice che vedi nell&apos;app</Label>
                <Input
                  id="due-fattori-conferma"
                  value={codice}
                  onChange={(e) => setCodice(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="mt-1 w-40 font-mono"
                />
              </div>
              <Button size="sm" onClick={() => void conferma()} disabled={inCorso || !codice}>
                Accendi
              </Button>
            </div>
            <p className="t-nota mt-1">
              Finché non arriva un codice giusto non si accende niente: se
              qualcosa è andato storto, ricomincia e nessuno resta chiuso fuori.
            </p>
          </RigaLibera>
        </>
      ) : (
        <RigaLibera>
          <Button size="sm" onClick={() => void inizia()} disabled={inCorso}>
            <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Accendi l&apos;accesso in due passi
          </Button>
        </RigaLibera>
      )}
    </GruppoImpostazioni>
  );
}
