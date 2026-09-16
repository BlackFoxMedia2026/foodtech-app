"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AtSign,
  Check,
  ChevronLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Phone,
  Smartphone,
  UserRound,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BrandImageField } from "@/components/settings/brand-image-field";
import { ColorField } from "@/components/settings/color-field";
import { salvaPortaleWifi } from "@/lib/wifi-portale-api";
import { cn } from "@/lib/utils";
import { AnteprimaPortale } from "./anteprima-portale";
import { GuidaRouter } from "./guida-router";

/**
 * La configurazione del portale, in quattro passi.
 *
 * ## Perché non è più un modulo unico
 *
 * Prima era una pagina con otto campi tutti aperti insieme — rete, password,
 * benvenuto, informativa, redirect, sconto — e chi la apriva doveva decidere
 * da solo cosa fosse obbligatorio, in che ordine, e se alla fine la cosa fosse
 * accesa o no. Sono quattro domande diverse fatte contemporaneamente: *quale
 * rete*, *cosa legge il cliente*, *cosa gli chiedo*, *lo accendo*. Una per
 * schermata si risponde; tutte insieme si rimanda.
 *
 * ## Le tre regole che questo componente rispetta
 *
 * **Si salva una volta sola, alla fine.** Un salvataggio a ogni passo
 * spegnerebbe il portale di un locale che sta solo cambiando il testo di
 * benvenuto: la pagina pubblica esiste finché la configurazione è completa, e
 * a metà procedura non lo è mai.
 *
 * **L'anteprima non è una decorazione.** È l'unico posto dove si vede cosa
 * riceve il cliente, e cambia mentre si scrive: su scrivania sta accanto ai
 * campi, sul telefono si apre a richiesta — affiancarle su 390 px vorrebbe
 * dire due colonne da 180, e nessuna delle due si legge.
 *
 * **Le spiegazioni tecniche stanno chiuse.** «Tavolo non apre la rete, quello
 * lo fa il router» era la prima riga della pagina: vera, e detta a qualcuno
 * che stava ancora cercando dove scrivere il nome della sua rete. Adesso sta
 * dentro «Come funziona, tecnicamente» e nell'ultimo passo, dove diventa
 * un'istruzione invece di un avvertimento.
 */

export type ConfigPortale = {
  networkName: string;
  password: string;
  welcome: string;
  legal: string;
  accent: string;
  logoUrl: string;
  redirectUrl: string;
  askEmail: boolean;
  askPhone: boolean;
  askMarketing: boolean;
  couponEnabled: boolean;
  couponPercent: number;
  couponDays: number;
};

const PASSI = [
  { id: "rete", label: "La tua rete" },
  { id: "pagina", label: "Pagina cliente" },
  { id: "dati", label: "Raccolta dati" },
  { id: "attiva", label: "Attiva" },
];

const BENVENUTO_ESEMPIO =
  "Benvenuto da noi 👋 Lascia i tuoi dati per ricevere la password del Wi-Fi.";

/** Un'informativa di partenza: da leggere e correggere, non da lasciare così. */
function informativaDiPartenza(venueName: string) {
  return (
    `I dati che lasci servono a darti la password della rete e, solo se lo scegli, ` +
    `a informarti sulle iniziative di ${venueName}. Li conserva ${venueName}, che non li cede a terzi. ` +
    `Puoi chiederne la cancellazione in qualsiasi momento scrivendo al locale.`
  );
}

/* -------------------------------------------------------------------------- */
/*  I pezzi ricorrenti                                                        */
/* -------------------------------------------------------------------------- */

/** Il titolo di un passo: la domanda, e sotto la riga che la spiega. */
function TestaPasso({ titolo, sottotitolo }: { titolo: string; sottotitolo: string }) {
  return (
    <header className="space-y-1">
      <h2 className="text-display text-xl md:text-2xl">{titolo}</h2>
      <p className="max-w-xl text-sm text-muted-foreground">{sottotitolo}</p>
    </header>
  );
}

/**
 * Un campo che si accende: icona, nome, una riga di senso, interruttore.
 *
 * Non è una tabella e non è una lista di spunte: sono tre decisioni, e ognuna
 * ha una conseguenza sul numero di persone che arrivano in fondo al modulo.
 * Quella conseguenza sta scritta accanto all'interruttore, non in una nota in
 * fondo alla pagina.
 */
function CartaCampo({
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
  /** Il campo c'è sempre e non si spegne: si dice, non si finge un comando. */
  bloccato?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "riquadro comodo flex items-center gap-3 transition-colors",
        attivo ? "border-accent/40 bg-accent/[0.07]" : "bg-card/30",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
          attivo ? "border-accent/40 bg-accent/15 text-accent-strong" : "border-border text-muted-foreground",
        )}
        aria-hidden="true"
      >
        <Icona className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{nome}</p>
        <p className="t-nota">{nota}</p>
      </div>
      {bloccato ? (
        <span className="shrink-0 text-xs text-muted-foreground">sempre</span>
      ) : (
        <Switch
          checked={attivo}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={`Chiedi ${nome.toLowerCase()}`}
        />
      )}
    </div>
  );
}

/** Una riga del riepilogo finale. */
function RigaRiepilogo({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border py-2.5 last:border-0">
      <span className="t-etichetta">{nome}</span>
      <span className="min-w-0 break-words text-right text-sm">{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  La procedura                                                              */
/* -------------------------------------------------------------------------- */

export function WizardPortale({
  iniziale,
  venueName,
  venueLogoUrl,
  portaleUrl,
  eraAttivo,
}: {
  iniziale: ConfigPortale;
  venueName: string;
  /** Il logo del brand: è quello che il portale mostra se non ne ha uno suo. */
  venueLogoUrl: string | null;
  portaleUrl: string;
  /** Se il portale era già acceso, l'ultimo passo salva invece di attivare. */
  eraAttivo: boolean;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState(0);
  const [piuLontano, setPiuLontano] = useState(eraAttivo ? PASSI.length - 1 : 0);
  const [c, setC] = useState<ConfigPortale>(iniziale);
  const [vediPassword, setVediPassword] = useState(false);
  const [anteprimaAperta, setAnteprimaAperta] = useState(false);
  const [informativaAperta, setInformativaAperta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  const tocca = <K extends keyof ConfigPortale>(k: K, v: ConfigPortale[K]) =>
    setC((prec) => ({ ...prec, [k]: v }));

  const modificato = useMemo(
    () => (Object.keys(c) as (keyof ConfigPortale)[]).some((k) => c[k] !== iniziale[k]),
    [c, iniziale],
  );

  const reteCompleta = !!c.networkName.trim() && !!c.password.trim();
  const unRecapito = c.askEmail || c.askPhone;

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

  function vaiA(i: number) {
    setPasso(i);
    setPiuLontano((f) => Math.max(f, i));
  }

  function esci() {
    if (modificato && !window.confirm("Esci senza salvare? Le modifiche di questa procedura vanno perse."))
      return;
    router.push("/settings/wifi");
  }

  async function salva() {
    setSalvando(true);
    setErrore(null);
    try {
      await salvaPortaleWifi({
        networkName: c.networkName.trim() || null,
        password: c.password.trim() || null,
        welcome: c.welcome.trim() || null,
        legal: c.legal.trim() || null,
        accent: c.accent.trim() || null,
        logoUrl: c.logoUrl.trim() || null,
        redirectUrl: c.redirectUrl.trim() || null,
        couponEnabled: c.couponEnabled,
        couponPercent: c.couponPercent,
        couponDays: c.couponDays,
        askEmail: c.askEmail,
        askPhone: c.askPhone,
        askMarketing: c.askMarketing,
        attivo: true,
      });
      setFatto(true);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non siamo riusciti a salvare. Riprova.");
    } finally {
      setSalvando(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Fatto                                                                 */
  /* ---------------------------------------------------------------------- */

  if (fatto) {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-8 text-center">
        <span
          className="mx-auto grid h-16 w-16 conferma-spunta place-items-center rounded-full border border-sage/50 bg-sage/20 text-sage-strong"
          aria-hidden="true"
        >
          <Check className="h-8 w-8" />
        </span>
        <div className="space-y-1">
          <h2 className="text-display text-2xl">Portale Wi-Fi attivo</h2>
          <p className="text-sm text-muted-foreground">
            La pagina è online sulla rete «{c.networkName.trim()}». Chi la apre lascia un contatto e riceve la
            password.
          </p>
        </div>

        <div className="riquadro comodo flex flex-wrap items-center justify-center gap-2 text-sm">
          <code className="min-w-0 break-all font-mono text-xs">{portaleUrl}</code>
          <CopyButton value={portaleUrl} variant="ghost" size="sm" />
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="accent">
            <Link href="/settings/wifi">Vai al pannello</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={portaleUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Apri il portale
            </a>
          </Button>
        </div>

        <p className="t-nota">
          Manca un passaggio solo, e non è qui: collegare il portale alla rete ospiti del router. Le istruzioni
          sono nel pannello.
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  I quattro passi                                                       */
  /* ---------------------------------------------------------------------- */

  const avantiBloccato = (passo === 0 && !reteCompleta) || (passo === 2 && !unRecapito);

  return (
    <div className="schermo gap-4">
      {/* La testata segue la stessa colonna del contenuto: uno stepper largo
          1900 px sopra un passo largo 900 sarebbe la cosa più vistosa della
          schermata, e lo stepper dice soltanto dove sei. */}
      <header className="fissa mx-auto w-full max-w-4xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={esci}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Portale Wi-Fi
          </Button>
          {eraAttivo && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-sage-strong" aria-hidden="true" />
              Il portale resta attivo finché non salvi
            </span>
          )}
        </div>
        <Stepper
          steps={PASSI}
          currentStepIndex={passo}
          furthestStepIndex={piuLontano}
          onStepClick={vaiA}
        />
        {/* Sul telefono lo stepper resta quattro pallini senza parole — quattro
            etichette a 390 px sono quattro righe di puntini. Dove si è si dice
            qui, in una riga sola. */}
        <p className="t-nota sm:hidden">
          Passo {passo + 1} di {PASSI.length} · {PASSI[passo].label}
        </p>
      </header>

      <div className="fill-scroll pr-0.5">
        <div className="mx-auto max-w-4xl space-y-6 pb-2">
          {/* ---------------------------------------------------------- */}
          {/*  1. La tua rete                                            */}
          {/* ---------------------------------------------------------- */}
          {passo === 0 && (
            <section className="space-y-5">
              <TestaPasso
                titolo="Quale rete useranno i tuoi clienti?"
                sottotitolo="Inserisci i dati della rete Wi-Fi dedicata agli ospiti: sono quelli che il portale consegnerà a chi lascia un contatto."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="w-rete">Nome della rete</Label>
                  <Input
                    id="w-rete"
                    value={c.networkName}
                    onChange={(e) => tocca("networkName", e.target.value)}
                    placeholder="Es. Aurora-Ospiti"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-pass">Password del Wi-Fi</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="w-pass"
                      // `text` quando è scoperta: un campo password mostrato
                      // con `type="text"` è l'unico modo perché il gestore
                      // delle password del browser non lo riempia da solo con
                      // quella del gestionale.
                      type={vediPassword ? "text" : "password"}
                      value={c.password}
                      onChange={(e) => tocca("password", e.target.value)}
                      placeholder="La password della rete ospiti"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setVediPassword((v) => !v)}
                      aria-label={vediPassword ? "Nascondi la password" : "Mostra la password"}
                    >
                      {vediPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <CopyButton
                      value={c.password}
                      variant="ghost"
                      size="icon"
                      soloIcona
                      aria-label="Copia la password"
                      disabled={!c.password.trim()}
                    />
                  </div>
                </div>
              </div>

              <p className="flex items-start gap-2 t-nota">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Usa la rete dedicata agli ospiti, non quella di cassa, POS e dispositivi del locale: questa
                password la vede chiunque compili il modulo.
              </p>

              {/* Il come funziona, chiuso. Chi lo apre lo cerca; chi non lo
                  cerca non deve leggerlo per scrivere il nome della rete. */}
              <details className="riquadro comodo group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                  Come funziona, tecnicamente
                  <span className="t-nota transition-transform group-open:rotate-180" aria-hidden="true">
                    ▾
                  </span>
                </summary>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>
                    Tavolo non apre la rete e non collega il telefono: quello lo fa il router del locale. Quello
                    che fa il portale è lo <strong>scambio</strong> — un contatto in cambio del nome della rete e
                    della password, che la persona poi inserisce fra le reti del telefono.
                  </p>
                  <p>
                    Funziona così in qualunque locale, senza toccare nessun apparato. Se il tuo router sa aprire
                    una pagina di accesso, si può fare in modo che il portale si apra da solo: è l&apos;ultimo
                    passaggio, e si configura dopo.
                  </p>
                  <p>
                    La password viene salvata cifrata e viene mostrata solo a chi ha completato il modulo: al
                    browser non arriva prima.
                  </p>
                </div>
              </details>
            </section>
          )}

          {/* ---------------------------------------------------------- */}
          {/*  2. Pagina cliente                                         */}
          {/* ---------------------------------------------------------- */}
          {passo === 1 && (
            <section className="space-y-5">
              <TestaPasso
                titolo="Personalizza la pagina che vedranno i clienti"
                sottotitolo="Due righe di benvenuto, il tuo logo, il colore del pulsante. Tutto il resto della pagina è già pronto."
              />

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="w-benvenuto">Messaggio di benvenuto</Label>
                      <span className="t-nota tabular-nums">{c.welcome.length}/500</span>
                    </div>
                    <Textarea
                      id="w-benvenuto"
                      value={c.welcome}
                      onChange={(e) => tocca("welcome", e.target.value.slice(0, 500))}
                      rows={3}
                      placeholder={BENVENUTO_ESEMPIO}
                    />
                    {!c.welcome.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => tocca("welcome", BENVENUTO_ESEMPIO)}
                      >
                        Usa il testo d&apos;esempio
                      </Button>
                    )}
                  </div>

                  {/* L'etichetta del campo immagine è in linea di suo: qui
                      deve stare sopra il pulsante come tutte le altre della
                      procedura, altrimenti «Logo del locale» e «Carica»
                      finiscono sulla stessa riga. */}
                  <div className="space-y-1.5 [&_label]:block">
                    <BrandImageField
                      label="Logo del locale"
                      value={c.logoUrl}
                      onChange={(url) => tocca("logoUrl", url)}
                    />
                    <p className="t-nota">
                      Senza logo il portale usa quello del brand del locale, se c&apos;è.
                    </p>
                  </div>

                  <ColorField
                    label="Colore del pulsante"
                    value={c.accent}
                    onChange={(hex) => tocca("accent", hex)}
                    placeholder="#AF6648"
                    portaTesto
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="lg:hidden"
                    onClick={() => setAnteprimaAperta(true)}
                  >
                    <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Anteprima
                  </Button>
                </div>

                {/* Su scrivania l'anteprima sta ferma accanto ai campi: si
                    scrive e si guarda cosa cambia, senza aprire niente. */}
                <div className="hidden lg:block">
                  <AnteprimaPortale dati={datiAnteprima} className="sticky top-0" />
                </div>
              </div>
            </section>
          )}

          {/* ---------------------------------------------------------- */}
          {/*  3. Raccolta dati                                          */}
          {/* ---------------------------------------------------------- */}
          {passo === 2 && (
            <section className="space-y-5">
              <TestaPasso
                titolo="Quali informazioni vuoi chiedere?"
                sottotitolo="Scegli solo ciò che ti serve: meno campi significa più persone che completano l'accesso."
              />

              <div className="grid gap-3 md:grid-cols-3">
                <CartaCampo
                  icona={UserRound}
                  nome="Nome"
                  nota="Senza, un contatto non è una persona"
                  attivo
                  bloccato
                />
                <CartaCampo
                  icona={AtSign}
                  nome="Email"
                  nota="Serve per scrivere a chi dà il consenso"
                  attivo={c.askEmail}
                  onChange={(v) => tocca("askEmail", v)}
                  // L'ultimo recapito acceso non si spegne: un modulo senza
                  // nessun recapito raccoglie nomi che non servono a niente.
                  disabled={c.askEmail && !c.askPhone}
                />
                <CartaCampo
                  icona={Phone}
                  nome="Telefono"
                  nota="Più recapiti, meno moduli completati"
                  attivo={c.askPhone}
                  onChange={(v) => tocca("askPhone", v)}
                  disabled={c.askPhone && !c.askEmail}
                />
              </div>

              {!unRecapito && (
                <p className="text-sm text-destructive-soft">
                  Tieni acceso almeno un recapito: senza, resteresti con dei nomi e nessun modo di ricontattarli.
                </p>
              )}

              <div className="riquadro comodo space-y-4">
                <div>
                  <h3 className="t-titolo-scheda">Privacy e consensi</h3>
                  <p className="t-nota">Cosa legge il cliente prima di lasciarti i suoi dati.</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Informativa sui dati</p>
                    <p className="t-nota line-clamp-1">
                      {c.legal.trim() || "Non ancora scritta: compare sotto la spunta obbligatoria."}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setInformativaAperta(true)}>
                    {c.legal.trim() ? "Modifica" : "Scrivi"}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Consenso necessario per il servizio</p>
                    <p className="t-nota">Obbligatorio e sempre presente: senza, non si raccoglie niente.</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-sage-strong">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> attivo
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Consenso al marketing</p>
                    <p className="t-nota max-w-xl">
                      Se attivo, il cliente sceglie a parte se ricevere le comunicazioni del locale. È una spunta
                      separata e non preselezionata: chi la salta si collega comunque.
                    </p>
                  </div>
                  <Switch
                    checked={c.askMarketing}
                    onCheckedChange={(v) => tocca("askMarketing", v)}
                    aria-label="Chiedi il consenso al marketing"
                  />
                </div>
              </div>
            </section>
          )}

          {/* ---------------------------------------------------------- */}
          {/*  4. Attiva                                                 */}
          {/* ---------------------------------------------------------- */}
          {passo === 3 && (
            <section className="space-y-5">
              <div className="space-y-3 text-center">
                <span
                  className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-accent/40 bg-accent/10 text-accent-strong"
                  aria-hidden="true"
                >
                  <Wifi className="h-6 w-6" />
                </span>
                <div className="space-y-1">
                  <h2 className="text-display text-2xl">Il tuo portale Wi-Fi è pronto</h2>
                  <p className="text-sm text-muted-foreground">
                    Controlla il riepilogo: da qui in poi basta accenderlo.
                  </p>
                </div>
              </div>

              {/* `items-start`: senza, il riepilogo si allunga fino all'altezza
                  del telefono accanto e diventa un riquadro mezzo vuoto. */}
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="riquadro comodo">
                  <RigaRiepilogo nome="Rete">{c.networkName.trim() || "—"}</RigaRiepilogo>
                  <RigaRiepilogo nome="Password">
                    <span className="font-mono">{c.password.trim() ? "••••••••" : "—"}</span>
                  </RigaRiepilogo>
                  <RigaRiepilogo nome="Dati raccolti">
                    {["Nome", c.askEmail && "Email", c.askPhone && "Telefono"].filter(Boolean).join(" + ")}
                  </RigaRiepilogo>
                  <RigaRiepilogo nome="Marketing">
                    {c.askMarketing ? "consenso facoltativo attivo" : "non richiesto"}
                  </RigaRiepilogo>
                  <RigaRiepilogo nome="Informativa">
                    {c.legal.trim() ? "scritta" : "non ancora scritta"}
                  </RigaRiepilogo>
                  <RigaRiepilogo nome="Portale">
                    <span className="break-all font-mono text-xs">{portaleUrl}</span>
                  </RigaRiepilogo>
                </div>

                <AnteprimaPortale dati={datiAnteprima} className="hidden lg:block" />
              </div>

              {/* Come ci arrivano i clienti, in due righe.
                  Non è «l'ultimo passaggio» e non è un avvertimento: il
                  portale è finito comunque. Il QR sta per primo perché
                  funziona con qualunque apparato — e qui resta una frase, non
                  un link: uscire da questa schermata prima di «Attiva
                  portale» butterebbe via i quattro passi appena fatti. */}
              <div className="riquadro comodo space-y-2 border-accent/30 bg-accent/[0.06]">
                <h3 className="t-titolo-scheda">Come ci arriveranno i tuoi clienti</h3>
                <p className="text-sm text-muted-foreground">
                  Con un <strong>QR sul tavolo</strong>, che funziona con qualsiasi router e si stampa dal
                  pannello. Oppure <strong>dal router</strong>, che apre il portale da solo a chi si attacca
                  alla rete ospiti — se il tuo apparato lo sa fare.
                </p>
                <GuidaRouter portaleUrl={portaleUrl} etichetta="Come si collega al router" conLinkQr={false} />
              </div>

              {errore && <p className="text-center text-sm text-destructive-soft">{errore}</p>}
              {!reteCompleta && (
                <p className="text-center t-nota">
                  Manca il nome della rete o la password: torna al primo passo.
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Le azioni restano in fondo e ferme, come nei pannelli — **anche
          l'ultima**: «Attiva portale» in coda a un riepilogo lungo finiva sotto
          la piega, cioè l'unica cosa che questa schermata serve a far fare era
          la sola che non si vedeva. */}
      <div className="fissa mx-auto flex w-full max-w-4xl items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (passo === 0 ? esci() : setPasso(passo - 1))}
        >
          {passo === 0 ? "Annulla" : "Indietro"}
        </Button>

        {passo < PASSI.length - 1 ? (
          <Button type="button" variant="accent" onClick={() => vaiA(passo + 1)} disabled={avantiBloccato}>
            Continua
          </Button>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAnteprimaAperta(true)}>
              <Smartphone className="h-4 w-4" aria-hidden="true" /> Apri anteprima
            </Button>
            <Button type="button" variant="accent" onClick={salva} disabled={salvando || !reteCompleta}>
              {salvando ? "Salvo…" : eraAttivo ? "Salva le modifiche" : "Attiva portale"}
            </Button>
          </div>
        )}
      </div>

      {/* L'anteprima a richiesta: sul telefono è l'unico modo di vederla, su
          scrivania è la versione in grande. */}
      <Dialog open={anteprimaAperta} onOpenChange={setAnteprimaAperta}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cosa vede il cliente</DialogTitle>
          </DialogHeader>
          <AnteprimaPortale dati={datiAnteprima} />
        </DialogContent>
      </Dialog>

      {/* L'informativa: testo lungo, e quindi in una schermata sua. Nel flusso
          principale resta una riga con «Modifica». */}
      <Dialog open={informativaAperta} onOpenChange={setInformativaAperta}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Informativa sui dati</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Compare sotto la spunta obbligatoria del portale. Chi tratta i dati, per cosa, per quanto tempo e
            come si chiede la cancellazione.
          </p>
          <Textarea
            value={c.legal}
            onChange={(e) => tocca("legal", e.target.value.slice(0, 2000))}
            rows={8}
            placeholder="Chi tratta i dati, per cosa, per quanto tempo e come si chiede la cancellazione."
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => tocca("legal", informativaDiPartenza(venueName))}
            >
              Parti da un testo di base
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={() => setInformativaAperta(false)}>
              Fatto
            </Button>
          </div>
          <p className="t-nota">
            Il testo di base è un punto di partenza da correggere, non un documento legale pronto: il
            responsabile dei dati è il locale.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
