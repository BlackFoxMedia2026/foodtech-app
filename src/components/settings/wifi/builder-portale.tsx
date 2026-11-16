"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Eye,
  EyeOff,
  KeyRound,
  Palette,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BrandImageField } from "@/components/settings/brand-image-field";
import { ColorField } from "@/components/settings/color-field";
import { salvaPortaleWifi, type PortaleWifiPayload } from "@/lib/wifi-portale-api";
import { cn } from "@/lib/utils";
import { AnteprimaPortale } from "./anteprima-portale";
import { CompilaRete } from "./compila-rete";
import type { ConfigPortale } from "./wizard-portale";

/**
 * Il builder del portale: le schede a sinistra, il telefono a destra.
 *
 * ## Perché non è più dietro «Gestisci»
 *
 * Il portale acceso si ritocca, non si riconfigura: si cambia il benvenuto
 * per l'estate, si prova un altro colore, si accende lo sconto. Rifare i
 * quattro passi della procedura per cambiare una riga di testo voleva dire
 * uscire dalla pagina, scorrere tre schermate e tornare. Adesso si scrive qui
 * e il telefono accanto cambia mentre si scrive. La procedura resta per la
 * prima volta, quando non c'è niente da ritoccare.
 *
 * ## Si salva solo quello che è cambiato
 *
 * Il salvataggio manda **i soli campi toccati**: la password non riparte se
 * non la si è riscritta, e uno sconto acceso non rispedisce il nome della
 * rete. Finché non c'è niente da salvare, la barra in fondo non chiede niente.
 */

const SCHEDE = [
  { id: "aspetto", nome: "Aspetto", icona: Palette },
  { id: "domande", nome: "Cosa chiedi", icona: UserRound },
  { id: "dopo", nome: "Dopo l'accesso", icona: Sparkles },
  { id: "rete", nome: "Rete", icona: KeyRound },
] as const;

type Scheda = (typeof SCHEDE)[number]["id"];

const BENVENUTO_ESEMPIO = "Benvenuto da noi 👋 Lascia i tuoi dati per ricevere la password del Wi-Fi.";

/** I colori della casa, da toccare con un dito: il campo esadecimale resta sotto. */
const TINTE = ["#C9A96A", "#AF6648", "#2C5545", "#8A9F60", "#1D3227", "#F2E7D0"];

function informativaDiPartenza(venueName: string) {
  return (
    `I dati che lasci servono a darti la password della rete e, solo se lo scegli, ` +
    `a informarti sulle iniziative di ${venueName}. Li conserva ${venueName}, che non li cede a terzi. ` +
    `Puoi chiederne la cancellazione in qualsiasi momento scrivendo al locale.`
  );
}

/** Una riga che si accende: dischetto, nome, una riga di senso, interruttore. */
function Interruttore({
  icona: Icona,
  nome,
  nota,
  attivo,
  onChange,
  bloccato = false,
  disabled = false,
}: {
  icona: typeof UserRound;
  nome: string;
  nota: string;
  attivo: boolean;
  onChange?: (v: boolean) => void;
  bloccato?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors",
          attivo
            ? "bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_rgba(16,32,26,0.5)]"
            : "bg-[#c9a96a]/15 text-accent-strong/70",
        )}
        aria-hidden="true"
      >
        <Icona className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-card-foreground">{nome}</p>
        <p className="t-nota">{nota}</p>
      </div>
      {bloccato ? (
        <span className="shrink-0 rounded-full bg-veil-6 px-2.5 py-1 text-xs text-muted-foreground">sempre</span>
      ) : (
        <Switch checked={attivo} onCheckedChange={onChange} disabled={disabled} aria-label={nome} />
      )}
    </div>
  );
}

export function BuilderPortale({
  iniziale,
  venueName,
  venueLogoUrl,
}: {
  iniziale: ConfigPortale;
  venueName: string;
  venueLogoUrl: string | null;
}) {
  const router = useRouter();
  const [scheda, setScheda] = useState<Scheda>("aspetto");
  const [base, setBase] = useState<ConfigPortale>(iniziale);
  const [c, setC] = useState<ConfigPortale>(iniziale);
  const [vediPassword, setVediPassword] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  const tocca = <K extends keyof ConfigPortale>(k: K, v: ConfigPortale[K]) => {
    setSalvato(false);
    setC((prec) => ({ ...prec, [k]: v }));
  };

  const cambiati = useMemo(
    () => (Object.keys(c) as (keyof ConfigPortale)[]).filter((k) => c[k] !== base[k]),
    [c, base],
  );
  const unRecapito = c.askEmail || c.askPhone;
  const reteCompleta = !!c.networkName.trim() && !!c.password.trim();
  const bloccato = !unRecapito || !reteCompleta;

  const datiAnteprima = {
    venueName,
    logoUrl: c.logoUrl.trim() || venueLogoUrl,
    accent: c.accent.trim() || null,
    welcome: c.welcome,
    legal: c.legal,
    chiediEmail: c.askEmail,
    chiediTelefono: c.askPhone,
    chiediMarketing: c.askMarketing,
    conCoupon: c.couponEnabled,
  };

  async function salva() {
    setSalvando(true);
    setErrore(null);
    const testo = (v: string) => v.trim() || null;
    const payload: PortaleWifiPayload = {};
    for (const k of cambiati) {
      const v = c[k];
      // I testi vuoti diventano `null`: «nessun benvenuto» non è la stringa vuota.
      (payload as Record<string, unknown>)[k] = typeof v === "string" ? testo(v) : v;
    }
    try {
      await salvaPortaleWifi(payload);
      setBase(c);
      setSalvato(true);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non siamo riusciti a salvare. Riprova.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── Le schede ─────────────────────────────────────────────────── */}
      <div className="surface flex min-w-0 flex-col">
        <header className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 md:px-6">
          <div>
            <h2 className="t-titolo-scheda">Personalizza il portale</h2>
            {/* «Nell'anteprima» e non «nel telefono accanto»: su telefono l'anteprima sta sotto. */}
            <p className="t-nota">Quello che scrivi qui compare nell&apos;anteprima, mentre lo scrivi.</p>
          </div>
        </header>

        <nav
          // Su telefono le quattro parti stanno in due righe: in fila
          // scorrevano di lato e «Dopo l'accesso» e «Rete» restavano fuori vista.
          className="mx-5 mt-4 grid grid-cols-2 gap-1 rounded-[1.375rem] bg-card-sunken/80 p-1 shadow-[inset_0_1px_2px_rgba(60,45,20,0.08)] sm:flex sm:overflow-x-auto sm:rounded-full md:mx-6"
          role="tablist"
          aria-label="Parti del portale"
        >
          {SCHEDE.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={scheda === s.id}
              onClick={() => setScheda(s.id)}
              className={cn(
                "inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors sm:h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                scheda === s.id
                  ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(60,45,20,0.12),0_2px_8px_-4px_rgba(60,45,20,0.18)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Su telefono, in mezza riga, l'icona spingeva «Dopo l'accesso» fuori dalla capsula. */}
              <s.icona className="hidden h-4 w-4 sm:block" aria-hidden="true" />
              {s.nome}
            </button>
          ))}
        </nav>

        <div className="space-y-5 px-5 py-5 md:px-6" role="tabpanel">
          {/* ── Aspetto ── */}
          {scheda === "aspetto" && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="b-benvenuto">Messaggio di benvenuto</Label>
                  <span className="t-nota tabular-nums">{c.welcome.length}/500</span>
                </div>
                <Textarea
                  id="b-benvenuto"
                  value={c.welcome}
                  onChange={(e) => tocca("welcome", e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder={BENVENUTO_ESEMPIO}
                />
                {!c.welcome.trim() && (
                  <button
                    type="button"
                    onClick={() => tocca("welcome", BENVENUTO_ESEMPIO)}
                    className="text-sm text-accent-strong underline underline-offset-2"
                  >
                    Usa il testo d&apos;esempio
                  </button>
                )}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5 [&_label]:block">
                  <BrandImageField
                    label="Logo"
                    value={c.logoUrl}
                    onChange={(url) => tocca("logoUrl", url)}
                  />
                  <p className="t-nota">Senza, il portale usa quello del brand del locale.</p>
                </div>

                <div className="space-y-2.5">
                  <p className="text-sm font-medium">Colore del pulsante</p>
                  <div className="flex flex-wrap gap-2">
                    {TINTE.map((t) => {
                      const scelta = c.accent.trim().toUpperCase() === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => tocca("accent", t)}
                          aria-label={`Usa ${t}`}
                          aria-pressed={scelta}
                          className={cn(
                            "h-9 w-9 rounded-full border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_6px_-2px_rgba(60,45,20,0.35)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            scelta && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                          )}
                          style={{ backgroundColor: t }}
                        />
                      );
                    })}
                  </div>
                  <ColorField
                    label="Oppure un colore tuo"
                    value={c.accent}
                    onChange={(hex) => tocca("accent", hex)}
                    placeholder="#AF6648"
                    portaTesto
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Cosa chiedi ── */}
          {scheda === "domande" && (
            <>
              <div className="divide-y divide-border/70">
                <Interruttore
                  icona={UserRound}
                  nome="Nome"
                  nota="Senza, un contatto non è una persona"
                  attivo
                  bloccato
                />
                <Interruttore
                  icona={AtSign}
                  nome="Email"
                  nota="Serve per scrivere a chi dà il consenso"
                  attivo={c.askEmail}
                  onChange={(v) => tocca("askEmail", v)}
                  // L'ultimo recapito acceso non si spegne: un modulo senza
                  // nessun recapito raccoglie nomi che non servono a niente.
                  disabled={c.askEmail && !c.askPhone}
                />
                <Interruttore
                  icona={Phone}
                  nome="Telefono"
                  nota="Più recapiti, meno moduli completati"
                  attivo={c.askPhone}
                  onChange={(v) => tocca("askPhone", v)}
                  disabled={c.askPhone && !c.askEmail}
                />
                <Interruttore
                  icona={ShieldCheck}
                  nome="Consenso al marketing"
                  nota="Una spunta a parte, non preselezionata: chi la salta si collega comunque"
                  attivo={c.askMarketing}
                  onChange={(v) => tocca("askMarketing", v)}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="b-informativa">Informativa sui dati</Label>
                  {!c.legal.trim() && (
                    <button
                      type="button"
                      onClick={() => tocca("legal", informativaDiPartenza(venueName))}
                      className="text-sm text-accent-strong underline underline-offset-2"
                    >
                      Parti da un testo di base
                    </button>
                  )}
                </div>
                <Textarea
                  id="b-informativa"
                  value={c.legal}
                  onChange={(e) => tocca("legal", e.target.value.slice(0, 2000))}
                  rows={4}
                  placeholder="Chi tratta i dati, per cosa, per quanto tempo e come si chiede la cancellazione."
                />
                <p className="t-nota">
                  Compare sotto la spunta obbligatoria. Il testo di base va corretto: il responsabile dei dati è
                  il locale.
                </p>
              </div>
            </>
          )}

          {/* ── Dopo l'accesso ── */}
          {scheda === "dopo" && (
            <>
              <div className="rounded-2xl border border-[#c9a96a]/35 bg-[#c9a96a]/[0.08] p-4">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-card-foreground">Uno sconto per tornare</p>
                    <p className="t-nota">
                      Chi si collega riceve un coupon personale. È il modo più diretto di trasformare un contatto
                      in un cliente.
                    </p>
                  </div>
                  <Switch
                    checked={c.couponEnabled}
                    onCheckedChange={(v) => tocca("couponEnabled", v)}
                    aria-label="Sconto per chi si collega"
                  />
                </div>
                {c.couponEnabled && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-sm">
                    <div className="space-y-1.5">
                      <Label htmlFor="b-perc">Sconto</Label>
                      <div className="relative">
                        <Input
                          id="b-perc"
                          type="number"
                          min={1}
                          max={100}
                          value={c.couponPercent}
                          onChange={(e) => tocca("couponPercent", Number(e.target.value) || 0)}
                          className="pr-8"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="b-giorni">Vale per</Label>
                      <div className="relative">
                        <Input
                          id="b-giorni"
                          type="number"
                          min={1}
                          max={365}
                          value={c.couponDays}
                          onChange={(e) => tocca("couponDays", Number(e.target.value) || 0)}
                          className="pr-14"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          giorni
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="b-redirect">Dopo il collegamento, apri</Label>
                <Input
                  id="b-redirect"
                  type="url"
                  value={c.redirectUrl}
                  onChange={(e) => tocca("redirectUrl", e.target.value)}
                  placeholder="https://il-tuo-sito.it/menu"
                />
                <p className="t-nota">Il menu, il sito, una pagina social. Vuoto: resta la pagina con la password.</p>
              </div>
            </>
          )}

          {/* ── Rete ── */}
          {scheda === "rete" && (
            <>
              <CompilaRete
                onCompila={(r) => {
                  // Una rete nuova senza password (dalla scansione): la vecchia
                  // password non le appartiene, e il cursore va dove si scrive.
                  // Il rinvio lascia al dialogo il tempo di chiudersi, che
                  // altrimenti riporta il focus sul pulsante.
                  if (r.password === null && r.ssid !== c.networkName) tocca("password", "");
                  tocca("networkName", r.ssid);
                  if (r.password !== null) tocca("password", r.password);
                  else setTimeout(() => document.getElementById("b-pass")?.focus(), 50);
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="b-rete">Nome della rete</Label>
                  <Input
                    id="b-rete"
                    value={c.networkName}
                    onChange={(e) => tocca("networkName", e.target.value)}
                    placeholder="Es. Aurora-Ospiti"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-pass">Password</Label>
                  <div className="relative">
                    <Input
                      id="b-pass"
                      type={vediPassword ? "text" : "password"}
                      value={c.password}
                      onChange={(e) => tocca("password", e.target.value)}
                      autoComplete="off"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setVediPassword((v) => !v)}
                      aria-label={vediPassword ? "Nascondi la password" : "Mostra la password"}
                      className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-veil-6 hover:text-foreground"
                    >
                      {vediPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <p className="t-nota">
                Usa la rete dedicata agli ospiti, non quella di cassa e POS: questa password la vede chiunque
                compili il modulo. Si mostra solo dopo il modulo, e nel database sta cifrata.
              </p>
            </>
          )}
        </div>

        {/* ── La barra del salvataggio ── */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-5 py-3.5 md:px-6">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {errore ? (
              <span className="text-destructive-soft">{errore}</span>
            ) : !unRecapito ? (
              <span className="text-destructive-soft">Tieni acceso almeno un recapito, email o telefono.</span>
            ) : !reteCompleta ? (
              <span className="text-destructive-soft">Servono il nome della rete e la password.</span>
            ) : cambiati.length > 0 ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                {cambiati.length === 1 ? "Una modifica da salvare" : `${cambiati.length} modifiche da salvare`}
              </span>
            ) : salvato ? (
              "Salvato: il portale è già aggiornato."
            ) : (
              "Tutto salvato."
            )}
          </p>
          <div className="flex gap-2">
            {cambiati.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-full px-4"
                onClick={() => {
                  setC(base);
                  setErrore(null);
                }}
              >
                Annulla
              </Button>
            )}
            <Button
              type="button"
              className="h-10 rounded-full px-5"
              onClick={salva}
              disabled={salvando || cambiati.length === 0 || bloccato}
            >
              {salvando ? "Salvo…" : "Salva le modifiche"}
            </Button>
          </div>
        </footer>
      </div>

      {/* ── Il telefono ───────────────────────────────────────────────── */}
      {/* Su un palco dorato e fermo mentre la pagina scorre: è il risultato,
          e deve restare sotto gli occhi mentre si cambia una scheda. */}
      <aside className="surface sticky top-0 overflow-hidden px-5 pb-5 pt-4">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_45%,rgba(201,169,106,0.22),transparent_70%)]"
          aria-hidden="true"
        />
        <p className="relative mb-3 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-accent-strong">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          Anteprima dal vivo
        </p>
        <AnteprimaPortale dati={datiAnteprima} className="relative max-w-[290px]" />
      </aside>
    </section>
  );
}
