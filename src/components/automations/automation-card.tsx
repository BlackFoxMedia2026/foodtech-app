"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cake,
  CreditCard,
  Gift,
  Info,
  type LucideIcon,
  Mail,
  Minus,
  Plus,
  Power,
  Repeat2,
  Undo2,
} from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { accorda } from "@/lib/accordo";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { type AutomationStyle, emailAutomazione } from "@/lib/automazioni-email";
import { StileEmail } from "@/components/automations/stile-email";
import type { AutomationView } from "@/server/automations/engine";
import type { AutomationCoupon, AutomationKey } from "@/server/automations/catalogue";

type TipoOmaggio = AutomationCoupon["kind"];

/** Un'icona per automazione: si riconoscono prima di leggere il nome. */
const ICONA: Record<AutomationKey, LucideIcon> = {
  compleanno: Cake,
  non_torna: Undo2,
  invito_ritorno: Repeat2,
  gift_card_ferma: CreditCard,
};

/** Accanto al numero, nella finestra: di cosa sono quei giorni. */
const UNITA: Record<AutomationKey, string> = {
  compleanno: "prima del compleanno",
  non_torna: "di silenzio",
  invito_ritorno: "dopo la prima visita",
  gift_card_ferma: "dall'emissione",
};

function descriviOmaggio(c: AutomationCoupon | null): string | null {
  if (!c) return null;
  switch (c.kind) {
    case "PERCENT":
      return `Sconto del ${c.value ?? 0}%`;
    case "FIXED":
      return `Sconto di ${((c.value ?? 0) / 100).toLocaleString("it-IT")} €`;
    case "FREE_ITEM":
      return c.freeItem ? `In omaggio: ${c.freeItem}` : "Qualcosa in omaggio";
    case "MENU_OFFER":
      return c.freeItem ? `Offerta: ${c.freeItem}` : "Offerta dedicata";
  }
}

/** Cosa fa, in una frase sola, con il numero dentro. */
function frase(key: AutomationKey, g: number): string {
  const giorni = `${g} ${accorda(["giorno", "giorni"], g)}`;
  switch (key) {
    case "compleanno":
      return `Manda gli auguri ${giorni} prima del compleanno, con l'invito a festeggiare da voi.`;
    case "non_torna":
      return `Scrive a chi veniva e non torna da ${giorni}, per invitarlo di nuovo.`;
    case "invito_ritorno":
      return `${giorni.charAt(0).toUpperCase()}${giorni.slice(1)} dopo la prima visita, invita a tornare chi non ha ancora prenotato.`;
    case "gift_card_ferma":
      return `Ricorda il credito a chi ha una gift card non usata da ${giorni}.`;
  }
}

/** Nella conferma, quando oggi non scriverebbe a nessuno: perché, detto per ognuna. */
function quandoParte(key: AutomationKey): string {
  switch (key) {
    case "compleanno":
      return "È normale: partirà da sola quando si avvicina il compleanno di qualcuno.";
    case "non_torna":
      return "È normale: partirà da sola quando qualcuno smette di venire da abbastanza tempo.";
    case "invito_ritorno":
      return "È normale: partirà da sola dopo la prima visita di un nuovo ospite.";
    case "gift_card_ferma":
      return "È normale: partirà da sola quando una gift card resta ferma abbastanza a lungo.";
  }
}

/**
 * Un messaggio automatico, come una riga: cosa fa e un solo comando.
 *
 * Spento, il comando in evidenza è **«Attiva»**, ed è l'unica cosa colorata
 * della riga: chi arriva qui senza sapere niente sa dove mettere le mani.
 * Acceso, al suo posto c'è l'interruttore verde con lo stato. «Modifica»
 * apre la finestra del messaggio: anteprima a sinistra, campi a destra.
 *
 * Accendere chiede conferma, e la conferma dice **a quante persone
 * scriverebbe oggi**, con qualche nome: chi accende delega a una macchina il
 * diritto di scrivere ai suoi clienti, e il numero va letto prima, non
 * scoperto dopo.
 */
export function AutomationCard({
  automation: a,
  canEdit,
  venueName,
  emailAttiva,
  brand,
}: {
  automation: AutomationView;
  canEdit: boolean;
  venueName: string;
  /** Senza email un'automazione accesa aspetta: lo stato non deve sembrare pronto. */
  emailAttiva: boolean;
  /** Logo, colore e telefono del locale: servono allo stile e all'anteprima. */
  brand: Brand;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<null | "switch" | "prova">(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);
  const [conferma, setConferma] = useState(false);

  const Icona = ICONA[a.key];
  const omaggio = descriviOmaggio(a.coupon);

  async function accendi(v: boolean) {
    setInCorso("switch");
    setErrore(null);
    setEsito(null);
    const res = await fetch(`/api/automations/${a.key}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: v }),
    });
    setInCorso(null);
    setConferma(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    router.refresh();
  }

  async function prova() {
    setInCorso("prova");
    setErrore(null);
    setEsito(null);
    const res = await fetch(`/api/automations/${a.key}/test`, { method: "POST" });
    setInCorso(null);
    if (!res.ok) {
      setErrore(await readApiError(res, "La prova non è partita."));
      return;
    }
    const { to } = await res.json();
    setEsito(`Prova inviata a ${to}.`);
  }

  return (
    <article
      className={cn(
        "surface grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-[1.25rem] p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-[1fr_auto] lg:items-start",
        a.active && "ring-1 ring-sage-deep/30",
      )}
    >
      <span
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center self-start rounded-full transition-colors sm:self-center lg:self-start",
          a.active
            ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_14px_-6px_rgba(16,32,26,0.5)]"
            : "bg-[#c9a96a]/20 text-accent-strong",
        )}
        aria-hidden="true"
      >
        <Icona className="h-5 w-5" />
      </span>

      <div className="min-w-0">
        <h2 className="text-display text-xl leading-tight text-card-foreground">{a.name}</h2>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{frase(a.key, a.giorni)}</p>
        {/* Una riga di stato sola, e solo quando dice qualcosa. */}
        {(a.active || omaggio) && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tertiary-foreground">
            {a.active && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 font-medium",
                  emailAttiva ? "text-sage-strong" : "text-accent-strong",
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", emailAttiva ? "bg-sage-deep" : "bg-[#c9a96a]")}
                  aria-hidden="true"
                />
                {!emailAttiva
                  ? "In attesa dell'email"
                  : a.inviatiUltimi30 > 0
                    ? `${a.inviatiUltimi30} ${accorda(["messaggio", "messaggi"], a.inviatiUltimi30)} nell'ultimo mese`
                    : "Nessun invio finora"}
              </span>
            )}
            {omaggio && (
              <span className="inline-flex items-center gap-1">
                <Gift className="h-3.5 w-3.5 text-accent-strong" aria-hidden="true" />
                {omaggio}
              </span>
            )}
          </p>
        )}
        {errore && !aperto && <p className="mt-2 text-sm text-destructive">{errore}</p>}
      </div>

      {/* ── I comandi: uno in evidenza, l'altro accanto ──────────────────── */}
      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 lg:col-span-2">
        <Button
          variant="ghost"
          className="h-10 rounded-full px-4 text-muted-foreground"
          onClick={() => setAperto(true)}
        >
          {canEdit ? "Modifica" : "Dettagli"}
        </Button>
        {a.active ? (
          // L'interruttore da solo è alto venti pixel: l'etichetta è parte
          // del bersaglio, e il bersaglio è alto 44.
          <label
            htmlFor={`interruttore-${a.key}`}
            className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-full border border-sage-deep/25 bg-sage py-1 pl-4 pr-2"
          >
            <span className="text-sm font-medium text-sage-strong">Accesa</span>
            <Switch
              id={`interruttore-${a.key}`}
              checked
              disabled={!canEdit || inCorso !== null}
              aria-label={`Spegni ${a.name}`}
              onCheckedChange={() => accendi(false)}
            />
          </label>
        ) : (
          canEdit && (
            <Button
              variant="accent"
              className="h-11 px-6"
              disabled={inCorso !== null}
              onClick={() => setConferma(true)}
            >
              <Power className="h-4 w-4" aria-hidden="true" />
              Attiva
            </Button>
          )
        )}
      </div>

      {/* ── La conferma: a chi scriverebbe, prima di accendere ─────────── */}
      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Attivare «{a.name}»?</DialogTitle>
            <DialogDescription>{frase(a.key, a.giorni)}</DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-[#c9a96a]/10 p-4 ring-1 ring-inset ring-[#c9a96a]/25">
            <p className="text-sm font-medium text-card-foreground">
              {a.toccherebbeOggi === 0
                ? "Oggi non scriverebbe a nessuno."
                : `Oggi scriverebbe a ${a.toccherebbeOggi} ${accorda(["persona", "persone"], a.toccherebbeOggi)}.`}
            </p>
            {a.esempi.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {a.esempi.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium text-card-foreground">{e.nome}</span> · {e.reason}
                  </li>
                ))}
                {a.toccherebbeOggi > a.esempi.length && (
                  <li className="text-xs">e altre {a.toccherebbeOggi - a.esempi.length}</li>
                )}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{quandoParte(a.key)}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" className="rounded-full" onClick={() => setConferma(false)}>
              Annulla
            </Button>
            <Button variant="accent" disabled={inCorso !== null} onClick={() => accendi(true)}>
              {inCorso === "switch" ? "Un istante…" : "Attiva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {aperto && (
        <FinestraMessaggio
          automation={a}
          canEdit={canEdit}
          venueName={venueName}
          brand={brand}
          onChiudi={() => setAperto(false)}
          onProva={prova}
          provaInCorso={inCorso === "prova"}
          esitoProva={esito}
          erroreProva={errore}
        />
      )}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* La finestra del messaggio                                                  */
/* -------------------------------------------------------------------------- */

/** La parte dell'email che il campo con il fuoco sta cambiando. */
type Parte = "oggetto" | "testo" | "omaggio" | "pulsante";

export type Brand = { logoUrl: string | null; colore: string | null; telefono: string | null };

type Vista = "scrivi" | "stile" | "anteprima";

/**
 * La modifica di un'automazione è la modifica **di un'email**: quindi si
 * apre come una finestra (non un pannello laterale), con l'email a sinistra
 * così come la riceve l'ospite e i campi a destra.
 *
 * Il locale scrive un paragrafo, ma l'ospite riceve un'email intera — saluto,
 * pulsante, firma — e il paragrafo si giudica solo lì dentro. Il campo con il
 * fuoco accende la sua parte nell'anteprima: si vede subito cosa si sta
 * cambiando.
 *
 * È una modale e non un `Pannello` per la regola di `ui/pannello.tsx`:
 * è un'azione concentrata, che si finisce (Salva) o si annulla.
 *
 * Sul telefono la finestra è il foglio dal basso di `DialogContent`, e le due
 * colonne diventano due viste, «Scrivi» e «Anteprima», una alla volta.
 *
 * L'anteprima ricalca il modello di `server/automations/engine.ts`; il codice
 * dell'omaggio è finto, quello vero nasce all'invio.
 */
function FinestraMessaggio({
  automation: a,
  canEdit,
  venueName,
  brand,
  onChiudi,
  onProva,
  provaInCorso,
  esitoProva,
  erroreProva,
}: {
  automation: AutomationView;
  canEdit: boolean;
  venueName: string;
  brand: Brand;
  onChiudi: () => void;
  onProva: () => void;
  provaInCorso: boolean;
  esitoProva: string | null;
  erroreProva: string | null;
}) {
  const router = useRouter();
  const [giorni, setGiorni] = useState(String(a.giorni));
  const [subject, setSubject] = useState(a.subject);
  const [intro, setIntro] = useState(a.intro);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("scrivi");
  const [stile, setStile] = useState<AutomationStyle>(a.stile);
  const [evidenza, setEvidenza] = useState<Parte | null>(null);

  // L'omaggio: assente finché il locale non lo mette.
  const [conOmaggio, setConOmaggio] = useState(!!a.coupon);
  const [tipo, setTipo] = useState<TipoOmaggio>(a.coupon?.kind ?? "PERCENT");
  const [valore, setValore] = useState(
    a.coupon?.kind === "FIXED" ? String((a.coupon.value ?? 0) / 100) : String(a.coupon?.value ?? 10),
  );
  const [cosa, setCosa] = useState(a.coupon?.freeItem ?? "");
  const [giorniValidita, setGiorniValidita] = useState(String(a.coupon?.giorniValidita ?? 30));

  const conValore = tipo === "PERCENT" || tipo === "FIXED";
  const conOggetto = tipo === "FREE_ITEM" || tipo === "MENU_OFFER";
  const Icona = ICONA[a.key];

  /** L'omaggio come lo aspetta il server, o `null` per toglierlo. */
  function omaggioDaSalvare(): AutomationCoupon | null {
    if (!conOmaggio) return null;
    return {
      kind: tipo,
      ...(conValore
        ? { value: tipo === "PERCENT" ? Number(valore) : Math.round(Number(valore.replace(",", ".")) * 100) }
        : {}),
      ...(conOggetto ? { freeItem: cosa.trim() } : {}),
      giorniValidita: Number(giorniValidita) || 30,
    };
  }

  const modificato =
    giorni !== String(a.giorni) ||
    subject !== a.subject ||
    intro !== a.intro ||
    JSON.stringify(stile) !== JSON.stringify(a.stile) ||
    JSON.stringify(omaggioDaSalvare()) !== JSON.stringify(a.coupon ?? null);

  const n = Number(giorni) || 0;
  function sposta(delta: number) {
    const prossimo = Math.min(a.knob.max, Math.max(a.knob.min, (Number(giorni) || a.knob.min) + delta));
    setGiorni(String(prossimo));
  }

  /** Chiudere non deve buttare via in silenzio un testo appena scritto. */
  function chiudi() {
    if (modificato && !window.confirm("Chiudere senza salvare? Le modifiche andranno perse.")) return;
    onChiudi();
  }

  async function salva() {
    setSalvando(true);
    setErrore(null);
    const res = await fetch(`/api/automations/${a.key}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        giorni: Number(giorni),
        subject,
        intro,
        coupon: omaggioDaSalvare(),
        stile: { ...stile, pulsante: stile.pulsante.trim() || a.stile.pulsante },
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    router.refresh();
    onChiudi();
  }

  const anteprimaOmaggio = descriviOmaggio(omaggioDaSalvare());
  // L'anteprima è l'HTML che parte davvero, con un ospite e un codice finti.
  const html = emailAutomazione({
    guestName: "Giulia",
    venueName,
    intro: intro || "…",
    url: "#",
    venuePhone: brand.telefono,
    coupon: anteprimaOmaggio
      ? {
          code: "GIULIA-7K2Q",
          descrizione: anteprimaOmaggio,
          validUntil: new Date(Date.now() + (Number(giorniValidita) || 30) * 86_400_000),
        }
      : null,
    unsubscribeUrl: "#",
    stile,
    logoUrl: brand.logoUrl,
    origine: typeof window === "undefined" ? "" : window.location.origin,
  });
  // Sulla scrivania l'anteprima è sempre a sinistra: «anteprima» vale solo
  // sul telefono, e lì la colonna dei campi mostra «Scrivi».
  const colonna = vista === "stile" ? "stile" : "scrivi";
  const messaggio = errore ?? erroreProva ?? esitoProva;

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) chiudi();
      }}
    >
      <DialogContent className="gap-0 p-0 md:h-[min(52rem,calc(100dvh-2rem))] md:max-w-[min(72rem,calc(100vw-2rem))] md:grid-rows-[auto_minmax(0,1fr)_auto] md:overflow-hidden">
        {/* ── Testa: di che email si tratta ─────────────────────────────── */}
        <DialogHeader className="border-b border-border px-5 pb-4 pt-1 md:px-6 md:pb-3.5 md:pr-14 md:pt-4">
          <div className="flex items-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_14px_-6px_rgba(16,32,26,0.5)]"
              aria-hidden="true"
            >
              <Icona className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-strong">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                Email automatica
              </p>
              <DialogTitle className="mt-1 text-xl leading-tight text-card-foreground">{a.name}</DialogTitle>
              <DialogDescription className="mt-0.5 leading-snug [@media(max-height:760px)]:sr-only">{frase(a.key, n || a.giorni)}</DialogDescription>
            </div>
          </div>

          {/* Sotto i 1024 px le colonne sono tre viste: affiancate, sul tablet
              l'email e i campi avevano 350 px a testa. Su uno schermo basso
              la frase sotto il titolo si toglie (resta per i lettori di schermo). */}
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-[#c9a96a]/15 p-1 lg:hidden">
            {(["scrivi", "stile", "anteprima"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={vista === v}
                onClick={() => setVista(v)}
                className={cn(
                  "h-9 rounded-full text-sm font-medium transition-colors",
                  vista === v ? "bg-card text-card-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {v === "scrivi" ? "Scrivi" : v === "stile" ? "Stile" : "Anteprima"}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="md:min-h-0 md:overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:overflow-hidden">
          {/* ── Sinistra: l'email come la riceve l'ospite ──────────────── */}
          <section
            aria-label="Anteprima dell'email"
            className={cn(
              "min-h-full bg-[#efe6d6]/70 px-4 py-5 md:px-8 md:py-7 lg:overflow-y-auto lg:border-r lg:border-border",
              vista !== "anteprima" && "max-lg:hidden",
            )}
          >
            <p className="t-nota mx-auto mb-3 max-w-[34rem]">Così la riceve l&apos;ospite</p>
            <AnteprimaEmail venueName={venueName} subject={subject} html={html} evidenza={evidenza} />
          </section>

          {/* ── Destra: cosa si può cambiare ───────────────────────────── */}
          <div
            className={cn(
              // Niente spazio sopra: il primo elemento visibile prende già il suo
              // margine da `space-y-6` (le linguette, nascoste sotto lg, contano).
              "space-y-6 px-5 pb-5 md:px-6 md:pb-6 lg:overflow-y-auto",
              vista === "anteprima" && "max-lg:hidden",
            )}
          >
            {/* Sulla scrivania: cosa dice, e come appare. Ferme in cima mentre
                la colonna scorre: prima se ne andavano con il primo campo. */}
            <div className="sticky top-0 z-10 -mx-6 hidden bg-[color:var(--card-fill)] px-6 pb-3 pt-5 shadow-[0_8px_12px_-12px_rgba(60,40,15,0.35)] lg:block">
            <div
              role="tablist"
              aria-label="Cosa modificare"
              className="grid grid-cols-2 gap-1 rounded-full bg-[#c9a96a]/15 p-1"
            >
              {(["scrivi", "stile"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={colonna === v}
                  onClick={() => setVista(v)}
                  className={cn(
                    "h-9 rounded-full text-sm font-medium transition-colors",
                    colonna === v ? "bg-card text-card-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {v === "scrivi" ? "Contenuto" : "Stile"}
                </button>
              ))}
            </div>
            </div>

            {colonna === "stile" ? (
              <StileEmail
                stile={stile}
                onChange={setStile}
                coloreLocale={brand.colore}
                logoUrl={brand.logoUrl}
                disabled={!canEdit}
                onFocusPulsante={() => setEvidenza("pulsante")}
                onBlurPulsante={() => setEvidenza(null)}
              />
            ) : (
            <>
            <p className="flex gap-2.5 rounded-xl bg-[#c9a96a]/10 p-3 text-sm leading-snug text-muted-foreground ring-1 ring-inset ring-[#c9a96a]/25">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
              {a.why}
            </p>

            {/* Quando parte */}
            <section className="space-y-2.5">
              <h3 className="t-titolo-scheda text-card-foreground">Quando parte</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-full border border-border bg-card p-1">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[#c9a96a]/15 hover:text-foreground disabled:opacity-40"
                    onClick={() => sposta(-1)}
                    disabled={!canEdit || n <= a.knob.min}
                    aria-label="Un giorno in meno"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <Input
                    id={`giorni-${a.key}`}
                    type="number"
                    inputMode="numeric"
                    min={a.knob.min}
                    max={a.knob.max}
                    value={giorni}
                    disabled={!canEdit}
                    onChange={(e) => setGiorni(e.target.value)}
                    aria-label={a.knob.label}
                    className="h-9 w-14 border-0 bg-transparent p-0 text-center text-lg font-semibold tabular-nums shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[#c9a96a]/15 hover:text-foreground disabled:opacity-40"
                    onClick={() => sposta(1)}
                    disabled={!canEdit || n >= a.knob.max}
                    aria-label="Un giorno in più"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <span className="text-sm text-card-foreground">
                  {accorda(["giorno", "giorni"], n)} {UNITA[a.key]}
                </span>
              </div>
              <p className="t-nota leading-snug">{a.knob.hint}</p>
            </section>

            {/* Il messaggio */}
            <section className="space-y-3">
              <h3 className="t-titolo-scheda text-card-foreground">Il messaggio</h3>
              <div className="space-y-1.5">
                <Label htmlFor={`subject-${a.key}`}>Oggetto</Label>
                <Input
                  id={`subject-${a.key}`}
                  value={subject}
                  disabled={!canEdit}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocus={() => setEvidenza("oggetto")}
                  onBlur={() => setEvidenza(null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`intro-${a.key}`}>Cosa vuoi dire</Label>
                <Textarea
                  id={`intro-${a.key}`}
                  rows={5}
                  value={intro}
                  disabled={!canEdit}
                  onChange={(e) => setIntro(e.target.value)}
                  onFocus={() => setEvidenza("testo")}
                  onBlur={() => setEvidenza(null)}
                />
                <p className="t-nota leading-snug">Saluto, pulsante per prenotare e firma li mettiamo noi.</p>
              </div>
            </section>

            {/* L'omaggio */}
            <section
              className="space-y-3"
              onFocus={() => setEvidenza("omaggio")}
              onBlur={() => setEvidenza(null)}
            >
              <h3 className="t-titolo-scheda text-card-foreground">Omaggio</h3>
              <label
                htmlFor={`omaggio-${a.key}`}
                className={cn(
                  "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 transition-colors",
                  conOmaggio ? "border-[#c9a96a]/45 bg-[#c9a96a]/10" : "border-border",
                )}
              >
                <Gift className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
                <span className="flex-1 text-sm">
                  <span className="font-medium text-card-foreground">Allega un omaggio</span>
                  <span className="block text-xs text-muted-foreground">
                    {conOmaggio ? "Ogni persona riceve un codice suo." : "Il messaggio parte senza regali."}
                  </span>
                </span>
                <Switch
                  id={`omaggio-${a.key}`}
                  checked={conOmaggio}
                  disabled={!canEdit}
                  onCheckedChange={setConOmaggio}
                />
              </label>

              {conOmaggio && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor={`omaggio-tipo-${a.key}`}>Cosa dà</Label>
                      <Select value={tipo} onValueChange={(v) => setTipo(v as TipoOmaggio)} disabled={!canEdit}>
                        <SelectTrigger id={`omaggio-tipo-${a.key}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENT">Percentuale</SelectItem>
                          <SelectItem value="FIXED">Sconto in euro</SelectItem>
                          <SelectItem value="FREE_ITEM">Qualcosa in omaggio</SelectItem>
                          <SelectItem value="MENU_OFFER">Offerta dedicata</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {conValore && (
                      <div className="space-y-1.5">
                        <Label htmlFor={`omaggio-valore-${a.key}`}>{tipo === "PERCENT" ? "Percentuale" : "Euro"}</Label>
                        <Input
                          id={`omaggio-valore-${a.key}`}
                          inputMode="decimal"
                          value={valore}
                          disabled={!canEdit}
                          onChange={(e) => setValore(e.target.value)}
                        />
                      </div>
                    )}

                    {conOggetto && (
                      <div className="space-y-1.5">
                        <Label htmlFor={`omaggio-cosa-${a.key}`}>Cosa si offre</Label>
                        <Input
                          id={`omaggio-cosa-${a.key}`}
                          value={cosa}
                          disabled={!canEdit}
                          onChange={(e) => setCosa(e.target.value)}
                          placeholder="Es. il dolce"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor={`omaggio-giorni-${a.key}`}>Valido per (giorni)</Label>
                      <Input
                        id={`omaggio-giorni-${a.key}`}
                        type="number"
                        min={1}
                        max={365}
                        value={giorniValidita}
                        disabled={!canEdit}
                        onChange={(e) => setGiorniValidita(e.target.value)}
                      />
                    </div>
                  </div>

                  <p className="t-nota leading-snug">
                    Un codice <strong>intestato a una persona</strong>, valido una volta: uno uguale per tutti si gira
                    agli amici e diventa uno sconto che non hai deciso. Si usa al tavolo come gli altri coupon.
                  </p>
                </div>
              )}
            </section>
            </>
            )}
          </div>
        </div>

        {/* ── Piede: prova a sinistra, Annulla e Salva a destra ───────────── */}
        {canEdit && (
          <DialogFooter className="border-t border-border bg-card/60 px-5 py-3 sm:items-center md:px-6">
            <div className="flex flex-col gap-1 sm:mr-auto sm:flex-row sm:items-center sm:gap-3">
              <Button
                variant="ghost"
                className="pillola-comando rounded-full"
                disabled={provaInCorso || modificato}
                onClick={onProva}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {provaInCorso ? "Un istante…" : "Mandami una prova"}
              </Button>
              {messaggio ? (
                <p className={cn("text-sm", errore || erroreProva ? "text-destructive" : "text-sage-strong")}>
                  {messaggio}
                </p>
              ) : (
                modificato && <p className="t-nota">Salva per mandarti una prova.</p>
              )}
            </div>
            {/* Sul telefono affiancati: tre pulsanti impilati si prendevano
                mezzo foglio. */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
              <Button variant="ghost" className="rounded-full" onClick={chiudi}>
                Annulla
              </Button>
              <Button variant="accent" disabled={!modificato || salvando} onClick={salva}>
                {salvando ? "Un istante…" : "Salva"}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Le parti che si accendono nell'anteprima: una regola per ognuna. */
const PARTI: Parte[] = ["testo", "omaggio", "pulsante"];
const SCHELETRO = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0}
[data-parte]{border-radius:8px;transition:box-shadow .15s ease,background-color .15s ease}
${PARTI.map(
  (p) =>
    `body[data-evidenza="${p}"] [data-parte="${p}"]{box-shadow:0 0 0 3px rgba(201,169,106,.75);background-color:rgba(201,169,106,.14)}`,
).join("\n")}
</style></head><body></body></html>`;

/**
 * L'email come arriva nella casella: intestazione Da / A / Oggetto, poi
 * **l'HTML vero**, lo stesso che parte, dentro una cornice isolata — senza
 * script, e con gli stili del prodotto che non ci entrano. La parte che si
 * sta modificando è accesa.
 *
 * Il corpo si riscrive dentro la cornice invece di ricaricarla: a ogni tasto
 * ricaricare farebbe lampeggiare l'anteprima.
 */
function AnteprimaEmail({
  venueName,
  subject,
  html,
  evidenza,
}: {
  venueName: string;
  subject: string;
  html: string;
  evidenza: Parte | null;
}) {
  const cornice = useRef<HTMLIFrameElement>(null);
  const [pronta, setPronta] = useState(false);
  const [altezza, setAltezza] = useState(420);

  const misura = useCallback(() => {
    const doc = cornice.current?.contentDocument;
    const corpo = doc?.body.firstElementChild;
    const h = corpo ? Math.ceil(corpo.getBoundingClientRect().height) : 0;
    // Nascosta (la vista «Scrivi» sul telefono) la cornice misura zero:
    // quel numero non vale, si aspetta che torni visibile.
    if (h > 0) setAltezza(h);
  }, []);

  // Si rimisura quando la cornice cambia larghezza: anche quando passa da
  // nascosta a visibile, che sul telefono e sul tablet è il cambio di vista.
  useEffect(() => {
    const el = cornice.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const osservatore = new ResizeObserver(() => misura());
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, [misura]);

  useEffect(() => {
    const doc = cornice.current?.contentDocument;
    if (!pronta || !doc?.body) return;
    doc.body.innerHTML = html;
    doc.body.setAttribute("data-evidenza", evidenza ?? "");
    // Nell'anteprima i link non portano da nessuna parte.
    doc.querySelectorAll("a").forEach((l) => l.addEventListener("click", (e) => e.preventDefault()));
    doc.querySelectorAll("img").forEach((img) => img.addEventListener("load", misura));
    misura();
  }, [pronta, html, evidenza, misura]);

  return (
    <figure className="mx-auto max-w-[36rem] overflow-hidden rounded-xl border border-[#e2d5bd] bg-[#fffdf8] text-[#2F1F11] shadow-[0_18px_40px_-24px_rgba(60,40,15,0.45)]">
      <dl className="space-y-1 border-b border-[#e8dcc6] bg-[#f6efe2] px-4 py-3 text-[13px] text-[#6b5a45]">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0">Da</dt>
          <dd className="truncate text-[#2F1F11]">{venueName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0">A</dt>
          <dd className="truncate">Giulia · ospite di esempio</dd>
        </div>
        <div
          className={cn(
            "-mx-1.5 flex gap-2 rounded-md px-1.5 py-0.5 transition-colors",
            evidenza === "oggetto" && "bg-[#c9a96a]/15 ring-2 ring-[#c9a96a]/60",
          )}
        >
          <dt className="w-16 shrink-0">Oggetto</dt>
          <dd className="truncate font-semibold text-[#2F1F11]">{subject || "Senza oggetto"}</dd>
        </div>
      </dl>
      <iframe
        ref={cornice}
        title="Anteprima dell'email"
        sandbox="allow-same-origin"
        srcDoc={SCHELETRO}
        onLoad={() => setPronta(true)}
        className="block w-full border-0"
        style={{ height: altezza }}
      />
    </figure>
  );
}
