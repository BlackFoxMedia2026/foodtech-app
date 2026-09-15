"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/api-client";
import { MAX_LINK, NOME_PIATTAFORMA, PIATTAFORME } from "@/lib/recensioni";
import {
  EsitoSalvataggio,
  GruppoImpostazioni,
  RigaImpostazione,
  RigaLibera,
} from "@/components/settings/righe-impostazioni";
import type { ReviewLinkView } from "@/server/reviews";

type Riga = { id?: string; platform: string; url: string; clic30: number };

/**
 * Dove mandare chi è uscito contento.
 *
 * Non è una pagina di impostazioni fra le altre: è l'ultimo pezzo della catena
 * visita → sondaggio → recensione, cioè il modo in cui un cliente soddisfatto
 * diventa il prossimo cliente. Chi risponde 9 o 10 vede questi bottoni; chi
 * risponde meno non li vede mai, ed è tutto il senso del meccanismo.
 *
 * Accanto a ogni collegamento c'è quante persone ci sono passate negli ultimi
 * trenta giorni. È l'unica cosa che possiamo misurare davvero — se poi la
 * recensione sia stata scritta lo sa solo la piattaforma — e dirlo così evita
 * di far passare un clic per una stella.
 */
export function ReviewLinksSettings({
  initial,
  canManage,
}: {
  initial: ReviewLinkView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [righe, setRighe] = useState<Riga[]>(
    initial.map((l) => ({ id: l.id, platform: l.platform, url: l.url, clic30: l.clic30 })),
  );
  const [salvando, setSalvando] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function aggiorna(i: number, campo: "platform" | "url", valore: string) {
    setRighe(righe.map((r, n) => (n === i ? { ...r, [campo]: valore } : r)));
    setSalvato(false);
  }

  async function salva() {
    setSalvando(true);
    setError(null);
    const res = await fetch("/api/venue/review-links", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        links: righe
          .filter((r) => r.url.trim())
          .map((r) => ({ ...(r.id ? { id: r.id } : {}), platform: r.platform, url: r.url.trim() })),
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a salvare i collegamenti."));
      return;
    }
    const aggiornate: ReviewLinkView[] = await res.json();
    setRighe(aggiornate.map((l) => ({ id: l.id, platform: l.platform, url: l.url, clic30: l.clic30 })));
    setSalvato(true);
    router.refresh();
  }

  return (
    <GruppoImpostazioni
      titolo="Recensioni pubbliche"
      descrizione="Dove mandiamo chi risponde 9 o 10 al «com'è andata?». Chi dà un voto più basso non vede mai questi collegamenti: quella risposta resta fra te e lui."
      azione={
        canManage && (
          <>
            <EsitoSalvataggio salvato={salvato} errore={error} />
            <Button variant="accent" size="sm" onClick={salva} disabled={salvando}>
              {salvando ? "Salvo…" : "Salva"}
            </Button>
          </>
        )
      }
    >
      {righe.length === 0 && (
        <RigaImpostazione
          nome="Nessun collegamento"
          descrizione="Oggi chi è contento riceve solo un grazie. Su Google, il link giusto è quello «Scrivi una recensione» che trovi nel tuo profilo attività."
        />
      )}

      {righe.map((r, i) => (
        <RigaImpostazione
          key={r.id ?? `nuova-${i}`}
          /* Niente `htmlFor`: qui il nome della riga **è** un controllo (la
             tendina della piattaforma), e un `<label>` che ne contiene uno e
             ne indica un altro manda il clic sull'elemento sbagliato. */
          nome={
            <Select
              value={r.platform}
              onValueChange={(v) => aggiorna(i, "platform", v)}
              disabled={!canManage}
            >
              <SelectTrigger id={`piatt-${i}`} className="w-full max-w-[12rem]" aria-label="Piattaforma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIATTAFORME.map((p) => (
                  <SelectItem key={p} value={p}>
                    {NOME_PIATTAFORMA[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          descrizione={
            r.id
              ? r.clic30 === 0
                ? "Nessuno ci è passato negli ultimi 30 giorni"
                : `${r.clic30} ${r.clic30 === 1 ? "persona ci è passata" : "persone ci sono passate"} negli ultimi 30 giorni`
              : undefined
          }
        >
          <Input
            id={`url-${i}`}
            value={r.url}
            inputMode="url"
            disabled={!canManage}
            onChange={(e) => aggiorna(i, "url", e.target.value)}
            placeholder="https://…"
            className="w-full md:w-64"
          />
          {canManage && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Togli il collegamento a ${NOME_PIATTAFORMA[r.platform as keyof typeof NOME_PIATTAFORMA]}`}
              onClick={() => {
                setRighe(righe.filter((_, n) => n !== i));
                setSalvato(false);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </RigaImpostazione>
      ))}

      <RigaLibera className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl t-nota">
          Togliere un collegamento non cancella i passaggi che ha raccolto: restano nei numeri di quel
          periodo. Quattro è il massimo — davanti a sei bottoni una persona contenta non sceglie, chiude.
        </p>
        {canManage && righe.length < MAX_LINK && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRighe([...righe, { platform: "GOOGLE", url: "", clic30: 0 }]);
              setSalvato(false);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi un posto
          </Button>
        )}
      </RigaLibera>
    </GruppoImpostazioni>
  );
}
