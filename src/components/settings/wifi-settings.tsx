"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Info, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";

/**
 * La configurazione del portale Wi-Fi.
 *
 * In cima c'è scritto cosa fa e cosa **non** fa: Tavolo non apre la rete —
 * quello lo fa il router del locale. Lo scambio è la password in cambio del
 * contatto, e funziona in qualunque locale senza toccare nessun apparato.
 *
 * Il portale resta chiuso finché non ci sono nome della rete **e** password:
 * senza, la pagina pubblica raccoglierebbe indirizzi email senza dare niente
 * in cambio.
 */
export function WifiSettings({
  iniziale,
  portaleUrl,
  canManage,
}: {
  iniziale: {
    networkName: string | null;
    password: string | null;
    welcome: string | null;
    legal: string | null;
    accent: string | null;
    redirectUrl: string | null;
    couponEnabled: boolean;
    couponPercent: number;
    couponDays: number;
    attivo: boolean;
  };
  portaleUrl: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [networkName, setNetworkName] = useState(iniziale.networkName ?? "");
  const [password, setPassword] = useState(iniziale.password ?? "");
  const [welcome, setWelcome] = useState(iniziale.welcome ?? "");
  const [legal, setLegal] = useState(iniziale.legal ?? "");
  const [redirectUrl, setRedirectUrl] = useState(iniziale.redirectUrl ?? "");
  const [couponEnabled, setCouponEnabled] = useState(iniziale.couponEnabled);
  const [couponPercent, setCouponPercent] = useState(String(iniziale.couponPercent));
  const [couponDays, setCouponDays] = useState(String(iniziale.couponDays));
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  const completo = !!networkName.trim() && !!password.trim();

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setError(null);
    setSalvato(false);

    const res = await fetch("/api/venue/wifi", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        networkName: networkName.trim() || null,
        password: password.trim() || null,
        welcome: welcome.trim() || null,
        legal: legal.trim() || null,
        redirectUrl: redirectUrl.trim() || null,
        couponEnabled,
        couponPercent: Number(couponPercent) || 10,
        couponDays: Number(couponDays) || 30,
      }),
    });
    setSalvando(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a salvare. Riprova."));
      return;
    }
    setSalvato(true);
    router.refresh();
  }

  return (
    <form onSubmit={salva} method="post" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-accent" aria-hidden="true" /> La rete
          </CardTitle>
          <CardDescription>
            Chi si collega lascia un contatto e riceve la password. Tavolo non apre la rete — quello lo fa il tuo
            router: quello che fa è lo scambio, e funziona senza toccare nessun apparato.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="w-rete">Nome della rete</Label>
              <Input
                id="w-rete"
                value={networkName}
                onChange={(e) => setNetworkName(e.target.value)}
                placeholder="Es. Aurora-Ospiti"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-pass">Password</Label>
              <Input
                id="w-pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="La password della rete ospiti"
                disabled={!canManage}
              />
            </div>
          </div>

          <p className="flex items-start gap-2 t-nota">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {/* Va detto, non nascosto: questa password la vede chiunque
                compili il modulo. È la rete ospiti, non quella della cassa. */}
            Metti la password della <strong>rete ospiti</strong>, quella che daresti a voce a chi entra: la vede
            chiunque compili il modulo. Non usare la rete a cui è collegata la cassa.
          </p>

          {!completo && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Finché mancano nome della rete e password il portale resta chiuso, e la pagina pubblica non esiste.
              Meglio così: un modulo che chiede l&apos;email senza dare niente in cambio fa scrivere alla gente
              indirizzi finti.
            </p>
          )}

          {iniziale.attivo && (
            <div className="flex flex-wrap items-center gap-2 riquadro p-3 text-sm">
              <span className="text-muted-foreground">Indirizzo del portale:</span>
              <code className="break-all font-mono text-xs">{portaleUrl}</code>
              <CopyButton value={portaleUrl} variant="ghost" size="sm" aria-label="Copia l'indirizzo del portale" />
              <Button asChild variant="ghost" size="sm">
                <a href={portaleUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Apri
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cosa legge il cliente</CardTitle>
          <CardDescription>Due righe di benvenuto e l&apos;informativa sui dati.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="w-benvenuto">Benvenuto</Label>
            <Textarea
              id="w-benvenuto"
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              rows={2}
              placeholder="Benvenuto da noi. Collegati alla rete e resta quanto vuoi."
              disabled={!canManage}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-legale">Informativa sui dati</Label>
            <Textarea
              id="w-legale"
              value={legal}
              onChange={(e) => setLegal(e.target.value)}
              rows={3}
              placeholder="Chi tratta i dati, per cosa, per quanto tempo e come si chiede la cancellazione."
              disabled={!canManage}
            />
            <p className="t-nota">
              Compare sotto la spunta obbligatoria. Il consenso al marketing è una spunta a parte e non è
              preselezionata: un consenso preso di nascosto dentro un&apos;altra spunta non è un consenso.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-redirect">Dove mandarlo dopo</Label>
            <Input
              id="w-redirect"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              placeholder="https://… (facoltativo)"
              disabled={!canManage}
            />
            <p className="t-nota">
              Il tuo sito, la carta, o l&apos;indirizzo con cui il tuo router sblocca la navigazione.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uno sconto per chi si collega</CardTitle>
          <CardDescription>
            Un codice personale, valido una volta sola, per far tornare chi è passato una volta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3 text-sm" htmlFor="w-coupon">
            <input
              id="w-coupon"
              type="checkbox"
              checked={couponEnabled}
              onChange={(e) => setCouponEnabled(e.target.checked)}
              disabled={!canManage}
              className="h-5 w-5 rounded border-border"
            />
            <span>Regala uno sconto a chi si collega</span>
          </label>

          {couponEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-perc">Percentuale di sconto</Label>
                <Input
                  id="w-perc"
                  inputMode="numeric"
                  value={couponPercent}
                  onChange={(e) => setCouponPercent(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-24"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-giorni">Valido per (giorni)</Label>
                <Input
                  id="w-giorni"
                  inputMode="numeric"
                  value={couponDays}
                  onChange={(e) => setCouponDays(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-24"
                  disabled={!canManage}
                />
              </div>
            </div>
          )}

          <p className="t-nota">
            Il codice è <strong>intestato alla persona</strong> e vale una volta: un codice condiviso si gira agli
            amici e diventa uno sconto che non hai deciso tu. I codici e il loro utilizzo si vedono in{" "}
            <Link href="/marketing/coupons" className="underline">
              Coupon
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {salvato && !error && <p className="text-sm text-sage">Salvato.</p>}

      {canManage && (
        <Button type="submit" variant="accent" disabled={salvando}>
          {salvando ? "Salvo…" : "Salva"}
        </Button>
      )}
    </form>
  );
}
