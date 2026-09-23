"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readApiError } from "@/lib/api-client";

type Cella = { esito: string | null; applicabile: boolean };
type Fornitore = {
  slug: string;
  nome: string;
  implementazione: string | null;
  certificazione: string;
  inviaComanda: { pronto: boolean; mancano: string[] };
  fase: string;
  matrice: { capacita: string; etichetta: string; celle: Record<string, Cella> }[];
  accessiBeta: { venueId: string; locale: string; slugLocale: string; abilitato: boolean; operazioniFiscali: boolean; da: string; il: string }[];
};

const LIVELLI = ["FIXTURE", "PROVIDER_API", "REAL_POS", "REAL_POS_ITALY"];
const TESTA: Record<string, string> = { FIXTURE: "Fixture", PROVIDER_API: "API", REAL_POS: "POS", REAL_POS_ITALY: "POS IT" };
const CERT: Record<string, string> = { PREVIEW: "Anteprima", API_VERIFIED: "API verificata", POS_VERIFIED: "POS verificato", POS_IT_VERIFIED: "POS italiano verificato" };
const FASI: [string, string][] = [
  ["INTERNAL", "Interna"],
  ["PRIVATE_BETA", "Beta privata"],
  ["PUBLIC_BETA", "Beta pubblica"],
  ["GENERAL_AVAILABILITY", "Disponibile a tutti"],
];
const segno = (c: Cella) => (!c.applicabile ? "–" : c.esito === "PASSED" ? "✓" : c.esito === "FAILED" ? "✗" : c.esito ? "?" : "·");

async function invia(corpo: Record<string, unknown>) {
  const res = await fetch("/api/admin/integrazioni", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  if (!res.ok) throw new Error(await readApiError(res, "Operazione non riuscita."));
}

/** Rilascio e accessi beta, per tutti i fornitori con un adattatore. Le regole le applica il server. */
export function PannelloIntegrazioniAdmin({ fornitori }: { fornitori: Fornitore[] }) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState<Record<string, string>>({});
  const [inCorso, setInCorso] = useState(false);

  async function esegui(corpo: Record<string, unknown>) {
    setInCorso(true);
    setErrore(null);
    try {
      await invia(corpo);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-6">
      {errore && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {errore}
        </p>
      )}
      {fornitori.map((f) => (
        <section key={f.slug} className="riquadro comodo space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="t-titolo-sezione">{f.nome}</h2>
              <p className="t-nota">
                Implementazione: {f.implementazione === "IMPLEMENTED" ? "READY" : "PREVIEW"} · Certificazione: {CERT[f.certificazione] ?? f.certificazione} ·
                «Invia comanda»: {f.inviaComanda.pronto ? "requisiti POS soddisfatti" : `mancano ${f.inviaComanda.mancano.join(", ")}`}
              </p>
            </div>
            <Select value={f.fase} disabled={inCorso} onValueChange={(fase) => void esegui({ azione: "fase", slug: f.slug, fase })}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FASI.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="t-etichetta pr-6 text-left">Capacità</th>
                  {LIVELLI.map((l) => (
                    <th key={l} className="t-etichetta px-3">
                      {TESTA[l]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.matrice.map((r) => (
                  <tr key={r.capacita} className="border-t border-border">
                    <td className="py-1 pr-6">{r.etichetta}</td>
                    {LIVELLI.map((l) => (
                      <td key={l} className="px-3 text-center">
                        {segno(r.celle[l]!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <p className="t-etichetta">Accesso beta</p>
            {f.accessiBeta.length === 0 && <p className="t-nota">Nessun locale.</p>}
            {f.accessiBeta.map((a) => (
              <div key={a.venueId} className="flex flex-wrap items-center gap-4 text-sm">
                <span className="min-w-48">{a.locale}</span>
                <label className="flex items-center gap-2">
                  <Switch checked={a.abilitato} disabled={inCorso} onCheckedChange={(v) => void esegui({ azione: "beta", slug: f.slug, locale: a.venueId, abilitato: v })} />
                  abilitato
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={a.operazioniFiscali}
                    disabled={inCorso || !a.abilitato}
                    onCheckedChange={(v) => void esegui({ azione: "beta", slug: f.slug, locale: a.venueId, abilitato: true, operazioniFiscali: v })}
                  />
                  operazioni con possibile effetto fiscale
                </label>
                <span className="t-nota">
                  da {a.da}, {new Date(a.il).toLocaleDateString("it-IT")}
                </span>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-9 w-72" placeholder="Id o slug del locale" value={nuovo[f.slug] ?? ""} onChange={(e) => setNuovo({ ...nuovo, [f.slug]: e.target.value })} />
              <Button
                size="sm"
                variant="outline"
                disabled={inCorso || !nuovo[f.slug]?.trim()}
                onClick={() => void esegui({ azione: "beta", slug: f.slug, locale: nuovo[f.slug]!.trim(), abilitato: true }).then(() => setNuovo({ ...nuovo, [f.slug]: "" }))}
              >
                Concedi accesso beta
              </Button>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
