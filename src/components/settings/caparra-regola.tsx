"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { GruppoImpostazioni, RigaLibera } from "@/components/settings/righe-impostazioni";

/**
 * La regola della caparra.
 *
 * ## Perché quattro campi e non uno
 *
 * Perché «chiedi una caparra» da solo non è una regola: un ristorante la chiede
 * **dai gruppi in su** (sotto, l'attrito costa più del no-show che evita), con
 * un importo che dipende da quante persone o fisso, e con un tempo entro cui si
 * annulla senza perderla — che è la parte che il cliente legge e che decide se
 * accetta.
 *
 * ## Perché non si accende senza un importo
 *
 * Perché una caparra accesa che non chiede niente è un interruttore che non fa
 * niente: chi l'ha acceso crede di essere protetto dai no-show e non lo è. Il
 * server rifiuta, e questa schermata lo dice prima.
 *
 * ## Cosa NON fa, e si vede
 *
 * Non annulla niente da sola. Una prenotazione con la caparra non pagata resta
 * lì e lo dichiara: disdire la cena di qualcuno perché un orologio è scaduto è
 * la funzione peggiore che questo prodotto potrebbe avere.
 */
export function CaparraRegola({
  iniziale,
  pagamentiPronti,
  canManage,
}: {
  iniziale: {
    attiva: boolean;
    daPersone: number;
    perPersonaCents: number | null;
    fissaCents: number | null;
    oreAnnulloGratis: number;
  };
  /** Se il locale ha collegato i pagamenti: senza, la caparra non si incassa. */
  pagamentiPronti: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [attiva, setAttiva] = useState(iniziale.attiva);
  const [daPersone, setDaPersone] = useState(String(iniziale.daPersone));
  const [aTesta, setATesta] = useState(
    iniziale.perPersonaCents ? String(iniziale.perPersonaCents / 100) : "",
  );
  const [fissa, setFissa] = useState(iniziale.fissaCents ? String(iniziale.fissaCents / 100) : "");
  const [ore, setOre] = useState(String(iniziale.oreAnnulloGratis));
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  const centesimi = (testo: string): number | null => {
    const pulito = testo.replace(",", ".").trim();
    if (!pulito) return null;
    const n = Number(pulito);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };

  async function salva(prossimaAttiva = attiva) {
    setInCorso(true);
    setErrore(null);
    setSalvato(false);
    try {
      const res = await fetch("/api/venue/caparra", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attiva: prossimaAttiva,
          daPersone: Number(daPersone) || 1,
          perPersonaCents: centesimi(aTesta),
          fissaCents: centesimi(fissa),
          oreAnnulloGratis: Number(ore) || 0,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Non siamo riusciti a salvare."));
      setAttiva(prossimaAttiva);
      setSalvato(true);
      router.refresh();
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <GruppoImpostazioni
      titolo="Caparra"
      descrizione="Contro i no-show: dai gruppi in su si chiede un anticipo, e chi disdice in tempo lo riprende."
    >
      <RigaLibera>
        <div className="space-y-3">
          <div className="riquadro flex items-center justify-between gap-3 p-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">Chiedi una caparra</p>
              <p className="text-xs text-muted-foreground">
                Da accesa, una prenotazione sopra la soglia nasce con una caparra da pagare: il
                tavolo è tenuto e l&apos;agenda dice che il denaro non è ancora arrivato. Il link si
                manda al cliente.
              </p>
              {!pagamentiPronti && (
                <p className="text-xs text-muted-foreground">
                  I pagamenti non sono ancora collegati:{" "}
                  <Link href="/settings/pagamenti" className="underline">
                    collega Stripe
                  </Link>{" "}
                  o la caparra non si potrà incassare.
                </p>
              )}
            </div>
            <Switch
              checked={attiva}
              disabled={!canManage || inCorso}
              onCheckedChange={(v) => void salva(v)}
              aria-label="Chiedi una caparra"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="caparra-da">Da quante persone</Label>
              <Input
                id="caparra-da"
                value={daPersone}
                onChange={(e) => setDaPersone(e.target.value)}
                inputMode="numeric"
                disabled={!canManage}
              />
              {/* La soglia ha una ragione, e si dice: sotto, la caparra fa
                  andare il cliente altrove. */}
              <p className="mt-1 text-xs text-muted-foreground">
                Sotto questa soglia non si chiede: per un tavolo da due, pagare prima di venire fa
                andare altrove.
              </p>
            </div>
            <div>
              <Label htmlFor="caparra-ore">Si annulla gratis fino a (ore prima)</Label>
              <Input
                id="caparra-ore"
                value={ore}
                onChange={(e) => setOre(e.target.value)}
                inputMode="numeric"
                disabled={!canManage}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                È la regola che il cliente legge. Restituire la caparra resta un gesto tuo: nessun
                orologio muove il denaro di qualcuno.
              </p>
            </div>
            <div>
              <Label htmlFor="caparra-atesta">Quanto a testa</Label>
              <Input
                id="caparra-atesta"
                value={aTesta}
                onChange={(e) => setATesta(e.target.value)}
                inputMode="decimal"
                placeholder="10"
                disabled={!canManage || !!fissa.trim()}
              />
            </div>
            <div>
              <Label htmlFor="caparra-fissa">Oppure quanto in tutto</Label>
              <Input
                id="caparra-fissa"
                value={fissa}
                onChange={(e) => setFissa(e.target.value)}
                inputMode="decimal"
                placeholder="150"
                disabled={!canManage || !!aTesta.trim()}
              />
            </div>
          </div>
          {/* Uno dei due, e i campi si spengono a vicenda: due numeri per lo
              stesso importo sono un'occasione di dirne uno sbagliato. */}
          <p className="text-xs text-muted-foreground">
            Uno dei due: a testa <strong>oppure</strong> in tutto.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canManage || inCorso}
              onClick={() => void salva()}
              className="tocco-comodo"
            >
              {inCorso ? "Un istante…" : "Salva la regola"}
            </Button>
            {salvato && <span className="text-sm text-muted-foreground">Salvata.</span>}
          </div>

          {errore && <p className="text-sm text-destructive">{errore}</p>}
        </div>
      </RigaLibera>
    </GruppoImpostazioni>
  );
}
