"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hasUnsubscribeBlock } from "@/lib/campaign-blocks";
import {
  ErroreApi,
  fetchDestinatari,
  fetchProviderStatus,
  fetchSegmentPreview,
  patchCampaignDraft,
  sendCampaignNow,
  scheduleCampaignAt,
  type RigaDestinatario,
} from "@/lib/campaign-wizard-api";
import { QuotaInsufficienteDialog, type QuotaMancante } from "@/components/dem/quota-insufficiente";
import { quotaDelPiano } from "./quota-piano";
import { CaricaContatti } from "./carica-contatti";
import { useWizardDispatch, useWizardState } from "./wizard-context";

const NUM = new Intl.NumberFormat("it-IT");

function ChecklistRow({ ok, label, consiglio = false }: { ok: boolean; label: string; consiglio?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage-strong" />
      ) : (
        <X className={cn("mt-0.5 h-4 w-4 shrink-0", consiglio ? "text-accent-strong" : "text-destructive")} />
      )}
      <span className={cn(!ok && (consiglio ? "text-muted-foreground" : "text-destructive-soft"))}>{label}</span>
    </li>
  );
}

/**
 * Destinatari e invio.
 *
 * La pagina prima diceva «controlla la checklist» e basta: non si capiva a
 * chi sarebbe arrivata la campagna, né che lì si potessero aggiungere
 * contatti. Ora al centro c'è l'elenco vero dei destinatari — come le voci di
 * un modulo: nome, email, da dove arrivano — con «Aggiungi contatti» in alto
 * a destra, che apre il caricamento del CSV. Accanto, i controlli e i due
 * modi di partire.
 */
export function Step7Send() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaMancante, setQuotaMancante] = useState<QuotaMancante | null>(null);
  const [aggiungiAperto, setAggiungiAperto] = useState(false);

  useEffect(() => {
    if (state.providerConfigured === null) {
      fetchProviderStatus()
        .then((r) => dispatch({ type: "SET_PROVIDER_CONFIGURED", configured: r.configured }))
        .catch(() => dispatch({ type: "SET_PROVIDER_CONFIGURED", configured: false }));
    }
    if (!state.segmentPreview) {
      fetchSegmentPreview(state.segment).then((preview) => dispatch({ type: "SET_SEGMENT_PREVIEW", preview }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUnsubscribe = hasUnsubscribeBlock(state.contentBlocks);
  const destinatari = state.segmentPreview?.finalRecipients ?? 0;
  const hasRecipients = destinatari > 0;
  const quota = quotaDelPiano(state);
  const providerConfigured = !!state.providerConfigured;
  const canSend = hasUnsubscribe && hasRecipients && providerConfigured && !!state.campaignId;

  /**
   * Gli invii finiti hanno una finestra, non una riga rossa: è una scelta da
   * fare — piano più grande o meno destinatari — e una riga d'errore non
   * offre né l'una né l'altra.
   */
  function mostraQuota(err: unknown): boolean {
    if (err instanceof ErroreApi && err.code === "dem_quota_insufficient" && err.detail) {
      setQuotaMancante(err.detail as QuotaMancante);
      return true;
    }
    return false;
  }

  async function handleSendNow() {
    if (!state.campaignId) return;
    setBusy(true);
    setError(null);
    try {
      await sendCampaignNow(state.campaignId);
      router.push(`/campaigns/${state.campaignId}`);
    } catch (err) {
      if (!mostraQuota(err)) setError(err instanceof Error ? err.message : "Invio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function handleSchedule() {
    if (!state.campaignId || !scheduledAt) return;
    setBusy(true);
    setError(null);
    try {
      await scheduleCampaignAt(state.campaignId, new Date(scheduledAt).toISOString());
      router.push(`/campaigns/${state.campaignId}`);
    } catch (err) {
      if (!mostraQuota(err)) {
        setError(err instanceof Error ? err.message : "Programmazione non riuscita");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-display text-2xl">Destinatari e invio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Questi sono i clienti che riceveranno la campagna. Puoi aggiungerne altri da un file, poi invia o programma.
          </p>
        </div>
        <Button variant="accent" onClick={() => setAggiungiAperto(true)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Aggiungi contatti
        </Button>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TabellaDestinatari onAggiungi={() => setAggiungiAperto(true)} />

        {/* ------------------------------------------- controlli e invio */}
        <aside className="space-y-4 xl:sticky xl:top-0">
          <div className="surface space-y-4 p-5">
            <p className="t-etichetta">Pronta per partire?</p>
            <ul className="space-y-2">
              <ChecklistRow ok={hasUnsubscribe} label="Link di disiscrizione presente" />
              <ChecklistRow
                ok={hasRecipients}
                label={`Destinatari validi (${NUM.format(destinatari)}${
                  state.segmentPreview?.fromFile ? `, di cui ${NUM.format(state.segmentPreview.fromFile)} dal file` : ""
                })`}
              />
              <ChecklistRow ok label="Consenso marketing rispettato (sempre applicato)" />
              {/* Il nome del fornitore non compare: per chi usa Foodtech l'invio
                  è di Foodtech, e sapere da chi passa non gli serve per decidere. */}
              <ChecklistRow ok={providerConfigured} label="Invio email attivo" />
              {quota && (
                <ChecklistRow
                  ok={quota.disponibili >= destinatari}
                  label={`Invii disponibili (${NUM.format(quota.disponibili)} nel piano, ${NUM.format(destinatari)} richiesti)`}
                />
              )}
              <ChecklistRow
                ok={state.testEmailSentThisSession}
                consiglio
                label="Email di prova inviata (consigliato)"
              />
            </ul>

            {error && <p className="text-sm text-destructive-soft">{error}</p>}

            <Button variant="accent" className="w-full" onClick={handleSendNow} disabled={!canSend || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              Invia ora a {NUM.format(destinatari)} {destinatari === 1 ? "cliente" : "clienti"}
            </Button>
          </div>

          <div className="surface space-y-3 p-5">
            <Label htmlFor="scheduledAt" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" /> Oppure programma l&apos;invio
            </Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSchedule}
              disabled={!canSend || busy || !scheduledAt}
            >
              Programma
            </Button>
          </div>

          <Button variant="ghost" className="w-full" onClick={() => router.push("/campaigns")}>
            Salva bozza ed esci
          </Button>
        </aside>
      </div>

      <QuotaInsufficienteDialog quota={quotaMancante} onClose={() => setQuotaMancante(null)} />

      <Dialog open={aggiungiAperto} onOpenChange={setAggiungiAperto}>
        <DialogContent className="max-h-[88vh] max-w-2xl gap-4 overflow-y-auto p-5 sm:p-6">
          <div>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" /> Aggiungi contatti
            </DialogTitle>
            <DialogDescription className="mt-1">
              Carica un CSV con una colonna email (nome e cognome se ci sono). Prima di aggiungerli ti mostriamo il
              controllo: quanti sono validi, quanti sono già clienti, chi resta fuori e perché.
            </DialogDescription>
          </div>
          <CaricaContatti nelPopup onFatto={() => setAggiungiAperto(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * La tabella
 * ------------------------------------------------------------------ */

/**
 * I destinatari, come le voci di un modulo: una riga per persona, la ricerca
 * in alto, la pagina in fondo. Si ricarica da sola quando cambia il pubblico
 * (un file aggiunto, i contatti del file tolti).
 */
function TabellaDestinatari({ onAggiungi }: { onAggiungi: () => void }) {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const [cerca, setCerca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dati, setDati] = useState<Awaited<ReturnType<typeof fetchDestinatari>> | null>(null);
  const [carica, setCarica] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const dalFile = state.segment.extraGuestIds?.length ?? 0;

  // La ricerca aspetta che si smetta di scrivere; il pubblico e la pagina no.
  useEffect(() => {
    let annullato = false;
    const t = setTimeout(
      () => {
        setCarica(true);
        fetchDestinatari(state.segment, { cerca, pagina })
          .then((d) => {
            if (!annullato) {
              setDati(d);
              setErrore(null);
            }
          })
          .catch((err) => !annullato && setErrore(err instanceof Error ? err.message : "Elenco non disponibile"))
          .finally(() => !annullato && setCarica(false));
      },
      cerca ? 300 : 0,
    );
    return () => {
      annullato = true;
      clearTimeout(t);
    };
  }, [state.segment, cerca, pagina]);

  async function togliDalFile() {
    const segment = { ...state.segment, extraGuestIds: undefined };
    dispatch({ type: "SET_SEGMENT", segment });
    if (state.campaignId) await patchCampaignDraft(state.campaignId, { segment });
    dispatch({ type: "SET_SEGMENT_PREVIEW", preview: await fetchSegmentPreview(segment) });
  }

  const daA =
    dati && dati.trovati > 0 ? `${(dati.pagina - 1) * 25 + 1}–${Math.min(dati.pagina * 25, dati.trovati)}` : "0";

  return (
    <section className="surface min-w-0 overflow-hidden p-0" aria-label="Destinatari della campagna">
      {/* -------------------------------------------- testata */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-display text-xl leading-none tabular-nums">
              {dati ? NUM.format(dati.totale) : "—"}{" "}
              <span className="font-sans text-sm font-normal text-muted-foreground">
                {dati?.totale === 1 ? "destinatario" : "destinatari"}
              </span>
            </p>
            {dalFile > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                di cui dal file: {NUM.format(state.segmentPreview?.fromFile ?? dalFile)}
                <button
                  type="button"
                  onClick={() => void togliDalFile()}
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-destructive-soft hover:bg-destructive/10"
                >
                  <X className="h-3 w-3" aria-hidden="true" /> togli
                </button>
              </p>
            )}
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={cerca}
            onChange={(e) => {
              setCerca(e.target.value);
              setPagina(1);
            }}
            placeholder="Cerca nome o email"
            aria-label="Cerca fra i destinatari"
            className="pl-9"
          />
        </div>
      </div>

      {/* -------------------------------------------- righe */}
      {errore ? (
        <p className="px-5 py-10 text-center text-sm text-destructive-soft">{errore}</p>
      ) : dati && dati.totale === 0 && !carica ? (
        <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
          <Users className="h-6 w-6 text-tertiary-foreground" aria-hidden="true" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Nessun destinatario ancora. Allarga i filtri, oppure aggiungi i contatti da un file.
          </p>
          <Button variant="accent" size="sm" onClick={onAggiungi}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Aggiungi contatti
          </Button>
        </div>
      ) : (
        <div className={cn("relative overflow-x-auto transition-opacity", carica && dati && "opacity-60")}>
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="t-etichetta px-5 py-2.5 font-normal">Nome</th>
                <th className="t-etichetta px-3 py-2.5 font-normal">Email</th>
                <th className="t-etichetta px-3 py-2.5 font-normal">Origine</th>
                <th className="t-etichetta px-3 py-2.5 font-normal">Ultima visita</th>
                <th className="t-etichetta px-5 py-2.5 font-normal">In rubrica dal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {!dati
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-5 py-3">
                        <span className="block h-4 w-2/3 animate-pulse rounded bg-secondary" />
                      </td>
                    </tr>
                  ))
                : dati.righe.map((r) => <Riga key={r.id} r={r} />)}
              {dati && dati.trovati === 0 && dati.totale > 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Nessuno corrisponde a «{cerca}».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* -------------------------------------------- pagine */}
      {dati && dati.trovati > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {daA} di {NUM.format(dati.trovati)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Pagina precedente"
              disabled={dati.pagina <= 1 || carica}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums">
              {dati.pagina} / {dati.pagine}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Pagina successiva"
              disabled={dati.pagina >= dati.pagine || carica}
              onClick={() => setPagina((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Riga({ r }: { r: RigaDestinatario }) {
  return (
    <tr className="hover:bg-secondary/40">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            {(r.nome.trim()[0] ?? r.email[0] ?? "?").toUpperCase()}
          </span>
          <span className="font-medium">{r.nome || "—"}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{r.email}</td>
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            r.origine === "file" ? "bg-[#f6ecd6] text-[#8a6416]" : "bg-[#e2eee6] text-[#2c5545]",
          )}
        >
          {r.origine === "file" ? "Da file" : "Filtri"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{r.ultimaVisita ?? "mai"}</td>
      <td className="px-5 py-2.5 text-muted-foreground">{r.inRubricaDal}</td>
    </tr>
  );
}
