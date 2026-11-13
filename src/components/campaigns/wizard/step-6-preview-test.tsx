"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Monitor, Send, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { compileEmailDocument } from "@/lib/campaign-blocks-compiler";
import { fotoDiEsempioRimaste } from "@/lib/campaign-templates";
import { fetchProviderStatus, fetchSegmentPreview, sendTestEmail } from "@/lib/campaign-wizard-api";
import { barraDelTema } from "./anteprima-email";
import { useWizardDispatch, useWizardState } from "./wizard-context";

/* Oltre queste lunghezze le app di posta tagliano: l'oggetto su telefono
   intorno ai 50 caratteri, la riga d'anteprima intorno ai 90. */
const OGGETTO_IDEALE = 50;
const ANTEPRIMA_IDEALE = 90;

const NUM = new Intl.NumberFormat("it-IT");

/**
 * Anteprima e test.
 *
 * Questo passo risponde a una domanda sola: «com'è quando arriva?». Prima
 * l'email stava in un riquadro con la sua barra di scorrimento dentro quella
 * della pagina, e oggetto e testo d'anteprima erano due campi senza contesto.
 * Ora l'email sta dentro una finestra di posta (o un telefono) e scorre con la
 * pagina; a destra la riga della casella si aggiorna mentre si scrive.
 */
export function Step6PreviewTest() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    fetchProviderStatus()
      .then((r) => dispatch({ type: "SET_PROVIDER_CONFIGURED", configured: r.configured }))
      .catch(() => dispatch({ type: "SET_PROVIDER_CONFIGURED", configured: false }));
    /* Riaprendo una bozza si arriva qui senza essere passati dai filtri: il
       conto dei destinatari va chiesto, o resta un trattino. */
    if (!state.segmentPreview) {
      fetchSegmentPreview(state.segment)
        .then((preview) => dispatch({ type: "SET_SEGMENT_PREVIEW", preview }))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Il documento intero, impostazioni comprese: quello che si controlla
     prima di premere «Invia» dev'essere l'email che parte. */
  const html = compileEmailDocument(
    { version: 2, settings: state.emailSettings, blocks: state.contentBlocks },
    state.brandPrimaryColor || undefined,
  );

  const fotoEsempio = fotoDiEsempioRimaste(state.contentBlocks);
  const accento = state.brandPrimaryColor || "#2c5545";
  const mittente = state.senderName || state.venueName || "Il tuo locale";
  /* Senza testo d'anteprima le app di posta mostrano l'inizio dell'email:
     qui si mostra lo stesso, coi segnaposto risolti sul cliente d'esempio. */
  const inizioEmail = state.contentBlocks
    .filter((b) => b.type === "title" || b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join(" ")
    .replace(/\{\{\s*FIRSTNAME\s*\}\}/gi, "Mario")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  async function handleSendTest() {
    if (!state.campaignId || !testEmail) return;
    setSending(true);
    setTestError(null);
    setTestSuccess(false);
    try {
      await sendTestEmail(state.campaignId, testEmail);
      dispatch({ type: "MARK_TEST_SENT" });
      setTestSuccess(true);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Invio non riuscito");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h2 className="text-display text-2xl">Anteprima e test</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quattro controlli prima dell&apos;invio: com&apos;è nella casella, una prova a te stesso, a chi parte,
          e l&apos;email aperta.
        </p>
      </div>

      {/* Un avviso e non un blocco: una foto d'esempio può anche andar bene
          a chi la sceglie, ma deve saperlo prima di premere «Invia». */}
      {fotoEsempio > 0 && (
        <p className="riquadro flex items-start gap-2.5 border-[#e3cf9f] bg-[#fbf3e1] px-4 py-3 text-sm">
          <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          <span>
            {fotoEsempio === 1
              ? "C'è ancora una foto di esempio del modello."
              : `Ci sono ancora ${fotoEsempio} foto di esempio del modello.`}{" "}
            <span className="text-muted-foreground">
              Torna all&apos;editor e sostituiscile con quelle del tuo locale: chi legge si aspetta di trovare in
              sala quello che vede nell&apos;email.
            </span>
          </span>
        </p>
      )}

      {/* Quattro tappe, nell'ordine in cui le vive chi la riceve e chi la
          manda: com'è nella casella, una prova sul proprio telefono, a chi
          parte, e solo alla fine l'email aperta. Prima l'email stava a
          sinistra e tutto il resto in una colonna accanto: non si capiva da
          dove cominciare. */}
      <div className="mx-auto max-w-5xl space-y-5">
        {/* ------------------------------------------- 1. nella casella */}
        <Tappa numero={1} titolo="Nella casella" sottotitolo="Quello che si vede prima di aprirla.">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <RigaCasella
              mittente={mittente}
              oggetto={state.subject}
              anteprima={state.previewText.trim() || inizioEmail}
              accento={accento}
            />
            <div className="space-y-4">
              <CampoConConta
                id="subject"
                etichetta="Oggetto"
                valore={state.subject}
                ideale={OGGETTO_IDEALE}
                onChange={(v) => dispatch({ type: "SET_SUBJECT", subject: v })}
                placeholder="Es. Venerdì sera, musica dal vivo"
              />
              <CampoConConta
                id="previewText"
                etichetta="Testo di anteprima"
                valore={state.previewText}
                ideale={ANTEPRIMA_IDEALE}
                onChange={(v) => dispatch({ type: "SET_PREVIEW_TEXT", previewText: v })}
                placeholder="La riga grigia sotto l'oggetto"
                nota="Se lo lasci vuoto, al suo posto si legge l'inizio dell'email."
              />
            </div>
          </div>
        </Tappa>

        {/* ------------------------------------------- 2. invio di prova */}
        <Tappa
          numero={2}
          titolo="Invia una prova"
          sottotitolo="Aprila sul tuo telefono: è il controllo più affidabile."
        >
          <form
            className="flex max-w-xl gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendTest();
            }}
          >
            <Input
              id="test-email"
              type="email"
              aria-label="Il tuo indirizzo email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="tuo@indirizzo.it"
            />
            <Button type="submit" disabled={sending || !testEmail || !state.campaignId} className="shrink-0">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" /> Invia
                </>
              )}
            </Button>
          </form>
          {testError && <p className="mt-2 text-xs text-destructive-soft">{testError}</p>}
          {testSuccess && (
            <p className="mt-2 text-xs text-sage-strong">Inviata a {testEmail}: controlla la casella.</p>
          )}
        </Tappa>

        {/* ------------------------------------------- 3. destinatari */}
        <Tappa numero={3} titolo="Destinatari" sottotitolo="Chi la manda e a quanti arriva.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-secondary/60 px-4 py-3">
              <p className="t-etichetta">Da</p>
              <div className="mt-1.5 flex items-center gap-2.5">
                <Avatar nome={mittente} accento={accento} className="h-8 w-8 text-[13px]" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{mittente}</p>
                  <p className="truncate text-xs text-muted-foreground">{state.senderEmail}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-secondary/60 px-4 py-3">
              <p className="t-etichetta flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" aria-hidden="true" /> A
              </p>
              {state.segmentPreview ? (
                <p className="mt-1.5 text-display text-3xl leading-none tabular-nums">
                  {NUM.format(state.segmentPreview.finalRecipients)}
                  <span className="ml-1.5 align-middle text-sm font-normal text-muted-foreground [font-stretch:100%]">
                    {state.segmentPreview.finalRecipients === 1 ? "cliente" : "clienti"}
                  </span>
                </p>
              ) : (
                <Loader2
                  className="mt-2 h-4 w-4 animate-spin text-muted-foreground"
                  aria-label="Calcolo dei destinatari"
                />
              )}
            </div>
          </div>
        </Tappa>

        {/* ------------------------------------------- 4. l'email aperta */}
        <Tappa
          numero={4}
          titolo="L'email aperta"
          sottotitolo="Così la legge un cliente d'esempio, Mario Rossi."
          azione={
            <div
              className="segmenti-ios"
              data-scelto={viewport === "mobile" ? "1" : "0"}
              role="group"
              aria-label="Dispositivo"
            >
              <span className="segmenti-ios-cursore" aria-hidden="true" />
              <button
                type="button"
                className="segmenti-ios-voce"
                aria-pressed={viewport === "desktop"}
                onClick={() => setViewport("desktop")}
              >
                <Monitor className="h-4 w-4" aria-hidden="true" /> Computer
              </button>
              <button
                type="button"
                className="segmenti-ios-voce"
                aria-pressed={viewport === "mobile"}
                onClick={() => setViewport("mobile")}
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" /> Telefono
              </button>
            </div>
          }
        >
          <div className="flex justify-center rounded-2xl border border-black/[0.04] bg-[radial-gradient(ellipse_at_top,#f4efe4_0%,#e7e0d0_100%)] px-4 py-8 shadow-[inset_0_2px_12px_rgba(70,52,24,0.08)] md:px-8 md:py-10">
            {viewport === "desktop" ? (
              <FinestraComputer
                oggetto={state.subject}
                mittente={mittente}
                indirizzo={state.senderEmail}
                accento={accento}
              >
                <EmailAutoAltezza key="desktop" html={html} />
              </FinestraComputer>
            ) : (
              <Telefono oggetto={state.subject} mittente={mittente} accento={accento}>
                <iframe
                  key="mobile"
                  title="Anteprima email su telefono"
                  srcDoc={html}
                  onLoad={(e) => barraDelTema(e.currentTarget)}
                  className="block h-full w-full bg-white"
                />
              </Telefono>
            )}
          </div>
        </Tappa>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pezzi
 * ------------------------------------------------------------------ */

/**
 * Una tappa del passo: il numero nel tondo dice l'ordine, il titolo cosa si
 * controlla. Tutte uguali, così la pagina si legge dall'alto in basso.
 */
function Tappa({
  numero,
  titolo,
  sottotitolo,
  azione,
  children,
}: {
  numero: number;
  titolo: string;
  sottotitolo: string;
  azione?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface space-y-4 p-5 md:p-6" aria-labelledby={`tappa-${numero}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums">
            {numero}
          </span>
          <div>
            <h3 id={`tappa-${numero}`} className="text-base font-semibold leading-tight">
              {titolo}
            </h3>
            <p className="t-nota mt-0.5">{sottotitolo}</p>
          </div>
        </div>
        {azione}
      </header>
      {children}
    </section>
  );
}

/** L'iniziale del mittente nel tondo, come la mostrano Gmail e Mail. */
function Avatar({ nome, accento, className }: { nome: string; accento: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ backgroundColor: accento }}
    >
      {(nome.trim()[0] ?? "T").toUpperCase()}
    </span>
  );
}

/**
 * La riga della casella di posta, con due righe finte intorno: l'oggetto si
 * giudica accanto agli altri messaggi, non da solo.
 */
function RigaCasella({
  mittente,
  oggetto,
  anteprima,
  accento,
}: {
  mittente: string;
  oggetto: string;
  anteprima: string;
  accento: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#1f1f1f]"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <RigaFinta />
      <div className="flex gap-3 border-y border-black/[0.06] bg-[#f4f8fd] px-3.5 py-3">
        <Avatar nome={mittente} accento={accento} className="mt-0.5 h-8 w-8 text-[13px]" />
        <div className="min-w-0 flex-1 text-[13px] leading-snug">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-bold">{mittente}</p>
            <span className="shrink-0 text-[11px] font-bold text-[#1a5fb4]">adesso</span>
          </div>
          <p className={cn("truncate font-bold", !oggetto.trim() && "font-normal italic text-[#9a9a9a]")}>
            {oggetto.trim() || "Senza oggetto"}
          </p>
          <p className="line-clamp-2 text-[#6b6b6b]">{anteprima}</p>
        </div>
      </div>
      <RigaFinta />
    </div>
  );
}

function RigaFinta() {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 opacity-60" aria-hidden="true">
      <span className="h-8 w-8 shrink-0 rounded-full bg-[#e7e3da]" />
      <div className="flex-1 space-y-1.5">
        <span className="block h-2 w-1/3 rounded-full bg-[#e2ddd2]" />
        <span className="block h-2 w-3/4 rounded-full bg-[#ece8df]" />
      </div>
    </div>
  );
}

function CampoConConta({
  id,
  etichetta,
  valore,
  ideale,
  onChange,
  placeholder,
  nota,
}: {
  id: string;
  etichetta: string;
  valore: string;
  ideale: number;
  onChange: (v: string) => void;
  placeholder: string;
  nota?: string;
}) {
  const lunghezza = valore.trim().length;
  const lungo = lunghezza > ideale;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{etichetta}</Label>
        <span className={cn("text-[11px] tabular-nums", lungo ? "text-accent-strong" : "text-muted-foreground")}>
          {lunghezza}/{ideale}
        </span>
      </div>
      <Input id={id} value={valore} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {lungo ? (
        <p className="t-nota text-accent-strong">Sul telefono si vedrà tagliato: prova ad accorciarlo.</p>
      ) : (
        nota && <p className="t-nota">{nota}</p>
      )}
    </div>
  );
}

/**
 * L'email a tutta altezza: l'iframe si allunga quanto il suo contenuto, così
 * scorre la pagina e non una seconda barra dentro il riquadro.
 */
function EmailAutoAltezza({ html }: { html: string }) {
  const [altezza, setAltezza] = useState(640);
  const osservatore = useRef<ResizeObserver | null>(null);

  useEffect(() => () => osservatore.current?.disconnect(), []);

  return (
    <iframe
      title="Anteprima email"
      srcDoc={html}
      scrolling="no"
      onLoad={(e) => {
        const doc = e.currentTarget.contentDocument;
        if (!doc) return;
        const misura = () => setAltezza(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0));
        misura();
        osservatore.current?.disconnect();
        osservatore.current = new ResizeObserver(misura);
        if (doc.body) osservatore.current.observe(doc.body);
      }}
      className="block w-full bg-white"
      style={{ height: altezza }}
    />
  );
}

/** Una finestra di posta su computer: oggetto, mittente, poi l'email. */
function FinestraComputer({
  oggetto,
  mittente,
  indirizzo,
  accento,
  children,
}: {
  oggetto: string;
  mittente: string;
  indirizzo: string;
  accento: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-[760px] overflow-hidden rounded-2xl bg-white shadow-[0_30px_70px_-30px_rgba(70,52,24,0.5),0_2px_6px_rgba(70,52,24,0.08)] ring-1 ring-black/[0.06]">
      <div className="flex items-center gap-1.5 border-b border-black/[0.06] bg-[#f6f4ef] px-4 py-2.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ec6a5e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f4bf4f]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#61c554]" />
      </div>
      <div className="border-b border-black/[0.06] px-6 py-4 text-[#1f1f1f]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        <p className={cn("text-[19px] font-semibold leading-snug", !oggetto.trim() && "text-[#9a9a9a]")}>
          {oggetto.trim() || "Senza oggetto"}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Avatar nome={mittente} accento={accento} className="h-9 w-9 text-sm" />
          <div className="min-w-0 flex-1 text-[13px] leading-tight">
            <p className="truncate">
              <span className="font-semibold">{mittente}</span>{" "}
              <span className="text-[#7a7a7a]">&lt;{indirizzo}&gt;</span>
            </p>
            <p className="mt-0.5 text-[#7a7a7a]">a Mario Rossi</p>
          </div>
          <span className="shrink-0 text-xs text-[#8a8a8a]">adesso</span>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Un telefono: la cornice, la barra di stato, l'intestazione della mail. */
function Telefono({
  oggetto,
  mittente,
  accento,
  children,
}: {
  oggetto: string;
  mittente: string;
  accento: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[52px] bg-[#1c1c1e] p-3 shadow-[0_40px_80px_-30px_rgba(40,30,15,0.6),inset_0_0_0_2px_#3a3a3c]">
      <div className="relative flex h-[720px] w-[375px] max-w-full flex-col overflow-hidden rounded-[40px] bg-white">
        <div
          className="flex h-11 shrink-0 items-center justify-between px-7 text-[13px] font-semibold text-[#1f1f1f]"
          style={{ fontFamily: "-apple-system, Helvetica, Arial, sans-serif" }}
          aria-hidden="true"
        >
          <span>9:41</span>
          <span className="absolute left-1/2 top-2.5 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#1c1c1e]" />
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-[3px] border border-[#1f1f1f] p-px">
              <span className="block h-full w-3/4 rounded-[1px] bg-[#1f1f1f]" />
            </span>
          </span>
        </div>
        <div
          className="shrink-0 border-b border-black/[0.06] px-4 pb-3 pt-1 text-[#1f1f1f]"
          style={{ fontFamily: "-apple-system, Helvetica, Arial, sans-serif" }}
        >
          <p className={cn("text-[17px] font-semibold leading-snug", !oggetto.trim() && "text-[#9a9a9a]")}>
            {oggetto.trim() || "Senza oggetto"}
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            <Avatar nome={mittente} accento={accento} className="h-7 w-7 text-xs" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{mittente}</p>
            <span className="text-[11px] text-[#8a8a8a]">adesso</span>
          </div>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
