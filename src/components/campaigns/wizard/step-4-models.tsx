"use client";

import { useMemo, useState } from "react";
import { ArchiveRestore, Check, Eye, FilePlus2, Mail, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hasSubstantiveContent, type Block, type EmailSettings } from "@/lib/campaign-blocks";
import { compileEmailDocument, resolveTestVariables } from "@/lib/campaign-blocks-compiler";
import { impostazioniModello } from "@/lib/campaign-start";
import {
  deleteCampaignDraft,
  patchCampaignDraft,
  restoreCampaignDraft,
  setTemplateHidden,
} from "@/lib/campaign-wizard-api";
import { CAMPAIGN_TEMPLATES, CATEGORIE_MODELLI, withBrandLogo, type CategoriaModello } from "@/lib/campaign-templates";
import type { StepProps } from "./campaign-wizard";
import { AnteprimaEmail, barraDelTema } from "./anteprima-email";
import { useWizardDispatch, useWizardState, type PendingTemplateSelection } from "./wizard-context";

// Dati fittizi solo per rendere leggibili le miniature (non toccano mai il
// server): senza questi, l'anteprima mostrerebbe token letterali come
// "{{FIRSTNAME}}" invece di un nome plausibile.
const VARIABILI_ANTEPRIMA = {
  firstName: "Mario",
  lastName: "Rossi",
  restaurantName: "Il Tuo Locale",
  bookingLink: "#",
  unsubscribeLink: "#",
  lastVisitDate: "12 giugno 2026",
  loyaltyLevel: "VIP",
};

function anteprimaHtml(
  blocks: Block[],
  settings: EmailSettings,
  brandLogoUrl: string,
  brandPrimaryColor: string,
): string {
  const conLogo = withBrandLogo(blocks, brandLogoUrl || undefined);
  return resolveTestVariables(
    compileEmailDocument({ version: 2, settings, blocks: conLogo }, brandPrimaryColor || undefined),
    VARIABILI_ANTEPRIMA,
  );
}

/* ------------------------------------------------------------------ *
 * Le card
 * ------------------------------------------------------------------ */

/**
 * Una card della libreria.
 *
 * Tre livelli sovrapposti, e l'ordine conta: la miniatura in fondo, sopra un
 * pulsante che copre tutta la card (è lui a rendere la card selezionabile da
 * tastiera senza annidare pulsanti dentro pulsanti, che l'HTML non ammette),
 * sopra ancora le due azioni che compaiono al passaggio del mouse.
 */
function CardLibreria({
  html,
  titolo,
  sottotitolo,
  selezionata,
  altezza,
  etichettaUso,
  onSeleziona,
  onUsa,
  onGuarda,
  onDeseleziona,
}: {
  html: string;
  titolo: string;
  sottotitolo: string;
  selezionata: boolean;
  altezza: string;
  etichettaUso: string;
  onSeleziona: () => void;
  onUsa: () => void;
  onGuarda: () => void;
  onDeseleziona: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl transition-all",
        selezionata
          ? "ring-2 ring-accent-strong ring-offset-2 ring-offset-background"
          : "ring-1 ring-border hover:ring-border-strong",
      )}
    >
      <AnteprimaEmail html={html} className={altezza} />

      {/* Sopra la velatura (`z-30`) e senza tagliare il nome: il nome è
          l'identità della card, e «S…» non distingue due newsletter. Se non
          ci sta accanto alla data, va a capo. */}
      <div className="relative z-30 flex flex-wrap items-baseline justify-between gap-x-2 bg-secondary/80 px-3 py-2.5">
        <p className="min-w-0 text-sm font-medium">{titolo}</p>
        <p className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">{sottotitolo}</p>
      </div>

      {/* Il bersaglio grande: tutta la card seleziona. */}
      <button
        type="button"
        onClick={onSeleziona}
        aria-pressed={selezionata}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="sr-only">{titolo}</span>
      </button>

      {/* La casella di selezione, sempre visibile in alto a sinistra: vuota
          finché la card non è scelta, piena col segno dopo. È lo stesso gesto
          del clic sulla card, ma si vede che c'è — e un secondo clic toglie
          la scelta. Sopra la velatura, così resta cliccabile anche lì. */}
      <button
        type="button"
        onClick={selezionata ? onDeseleziona : onSeleziona}
        aria-pressed={selezionata}
        aria-label={selezionata ? `Togli la selezione da ${titolo}` : `Seleziona ${titolo}`}
        title={selezionata ? "Togli la selezione" : "Seleziona"}
        className={cn(
          "absolute left-2.5 top-2.5 z-30 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selezionata
            ? "bg-accent-strong text-accent-strong-foreground"
            : "border-2 border-white bg-black/20 text-transparent backdrop-blur-sm hover:bg-black/35 hover:text-white",
        )}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </button>

      {/* La velatura copre la miniatura, non la fascia col nome: il nome deve
          restare leggibile mentre si decide. Sul tocco non c'è passaggio del
          mouse — lì la card si seleziona e basta, e si va avanti dalla barra. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2",
          "bg-background/80 p-4 opacity-0 backdrop-blur-[1px] transition-opacity",
          // `:has(:focus-visible)` e non `focus-within`: dopo un clic col mouse
          // la card resta a fuoco, e con `focus-within` la velatura rimarrebbe
          // aperta per sempre sopra la miniatura appena scelta.
          "group-hover:opacity-100 group-[&:has(:focus-visible)]:opacity-100",
        )}
      >
        {/* La velatura non prende i clic: solo i due pulsanti. Altrimenti
            cliccare la miniatura — il gesto più ovvio — non selezionerebbe
            niente, perché sotto il puntatore ci sarebbe un velo e non la card. */}
        <Button
          variant="accent"
          size="sm"
          className="pointer-events-none w-full max-w-[200px] group-hover:pointer-events-auto group-[&:has(:focus-visible)]:pointer-events-auto"
          onClick={onUsa}
        >
          {etichettaUso}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="pointer-events-none w-full max-w-[200px] border-line-40 bg-background/70 text-ink hover:bg-background/90 group-hover:pointer-events-auto group-[&:has(:focus-visible)]:pointer-events-auto"
          onClick={onGuarda}
        >
          <Eye className="h-3.5 w-3.5" /> Guarda
        </Button>
      </div>
    </div>
  );
}

function Sezione({
  titolo,
  azione,
  children,
}: {
  titolo: string;
  azione?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="t-etichetta">{titolo}</h3>
        {azione}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Lo step
 * ------------------------------------------------------------------ */

/** Quante newsletter precedenti stanno in una riga prima di «Vedi tutte». */
const NEWSLETTER_IN_VETRINA = 4;

export function Step4Models({ onAvanti }: StepProps) {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const [categoria, setCategoria] = useState<CategoriaModello | null>(null);
  const [tutteLeNewsletter, setTutteLeNewsletter] = useState(false);
  const [inVisione, setInVisione] = useState<{
    titolo: string;
    html: string;
    usa: () => void;
  } | null>(null);

  const [eliminando, setEliminando] = useState<string | null>(null);
  const [cestinoAperto, setCestinoAperto] = useState(false);
  const selezione = state.pendingTemplateSelection;
  const { brandLogoUrl, brandPrimaryColor, previousCampaigns } = state;

  const modelli = useMemo(
    () =>
      CAMPAIGN_TEMPLATES.filter(
        (t) => !state.modelliNascosti.includes(t.id) && (!categoria || t.category === categoria),
      ).map((t) => ({
        template: t,
        html: anteprimaHtml(t.blocks, impostazioniModello(t), brandLogoUrl, brandPrimaryColor),
      })),
    [categoria, brandLogoUrl, brandPrimaryColor, state.modelliNascosti],
  );

  const newsletter = useMemo(
    () =>
      previousCampaigns.map((c) => ({
        fonte: c,
        html: anteprimaHtml(c.document.blocks, c.document.settings, brandLogoUrl, brandPrimaryColor),
      })),
    [previousCampaigns, brandLogoUrl, brandPrimaryColor],
  );

  /* Chi è già passato dall'editor ha un'email sua: la si offre come prima
     scelta, così tornare a guardare i modelli non obbliga a ricominciare.
     Va comunque selezionata — «Avanti» non parte mai senza una scelta. */
  const emailAttuale = useMemo(
    () =>
      state.furthestStep > 2 && hasSubstantiveContent(state.contentBlocks)
        ? anteprimaHtml(state.contentBlocks, state.emailSettings, brandLogoUrl, brandPrimaryColor)
        : null,
    [state.furthestStep, state.contentBlocks, state.emailSettings, brandLogoUrl, brandPrimaryColor],
  );

  /* «Elimina» lavora sulla scelta: la propria bozza, una newsletter mai
     partita o un modello della libreria. Tutto finisce nel cestino e da lì si
     recupera. Spento negli altri casi, e il suggerimento dice perché. */
  const elimina: { etichetta: string; azione?: () => void } = (() => {
    if (!selezione) return { etichetta: "Seleziona un'email o un modello da eliminare" };
    if (selezione.type === "current")
      return { etichetta: "Togli questa email (resta nel cestino)", azione: svuotaEmailAttuale };
    if (selezione.type === "previous") {
      const fonte = previousCampaigns.find((c) => c.id === selezione.sourceCampaignId);
      if (fonte?.eliminabile)
        return { etichetta: "Sposta questa bozza nel cestino", azione: () => eliminaNewsletter(fonte) };
      return { etichetta: "Già partita: resta nello storico delle campagne" };
    }
    if (selezione.type === "template" && selezione.templateId) {
      const id = selezione.templateId;
      return { etichetta: "Togli questo modello (resta nel cestino)", azione: () => nascondi(id) };
    }
    return { etichetta: "Niente da eliminare" };
  })();

  const modelliNelCestino = CAMPAIGN_TEMPLATES.filter((t) => state.modelliNascosti.includes(t.id));
  const nelCestino = state.cestino.length + modelliNelCestino.length + (state.emailScartata ? 1 : 0);

  const newsletterVisibili = tutteLeNewsletter ? newsletter : newsletter.slice(0, NEWSLETTER_IN_VETRINA);

  function seleziona(selection: PendingTemplateSelection) {
    dispatch({ type: "SET_PENDING_TEMPLATE_SELECTION", selection });
  }

  function deseleziona() {
    dispatch({ type: "SET_PENDING_TEMPLATE_SELECTION", selection: null });
  }

  function errore(err: unknown, ripiego: string) {
    window.alert(err instanceof Error ? err.message : ripiego);
  }

  /**
   * La propria email: si toglie l'email, non la campagna. Si resta qui a
   * sceglierne un'altra — nome, pubblico e filtri sono lavoro fatto e non si
   * buttano con lei. L'email tolta va nel cestino e da lì torna com'era.
   * Si salva subito vuota: riaprendo la bozza non deve ricomparire.
   */
  async function svuotaEmailAttuale() {
    const scartata = { blocks: state.contentBlocks, settings: state.emailSettings };
    setEliminando("current");
    try {
      if (state.campaignId) {
        await patchCampaignDraft(state.campaignId, {
          contentBlocks: { version: 2, settings: state.emailSettings, blocks: [] },
        });
      }
      deseleziona();
      dispatch({ type: "SET_EMAIL_SCARTATA", email: scartata });
      dispatch({ type: "SET_BLOCKS", blocks: [] });
    } catch (err) {
      errore(err, "Eliminazione non riuscita");
    } finally {
      setEliminando(null);
    }
  }

  async function ripristinaEmailAttuale() {
    const email = state.emailScartata;
    if (!email) return;
    setEliminando("current");
    try {
      if (state.campaignId) {
        await patchCampaignDraft(state.campaignId, {
          contentBlocks: { version: 2, settings: email.settings, blocks: email.blocks },
        });
      }
      dispatch({ type: "SET_BLOCKS", blocks: email.blocks });
      dispatch({ type: "SET_EMAIL_SETTINGS", settings: email.settings });
      dispatch({ type: "SET_EMAIL_SCARTATA", email: null });
    } catch (err) {
      errore(err, "Ripristino non riuscito");
    } finally {
      setEliminando(null);
    }
  }

  async function eliminaNewsletter(fonte: (typeof previousCampaigns)[number]) {
    setEliminando(fonte.id);
    try {
      await deleteCampaignDraft(fonte.id);
      deseleziona();
      dispatch({
        type: "SET_PREVIOUS_CAMPAIGNS",
        previousCampaigns: previousCampaigns.filter((c) => c.id !== fonte.id),
      });
      dispatch({
        type: "SET_CESTINO",
        cestino: [{ id: fonte.id, name: fonte.name, dataLabel: "Eliminata adesso", fonte }, ...state.cestino],
      });
    } catch (err) {
      errore(err, "Eliminazione non riuscita");
    } finally {
      setEliminando(null);
    }
  }

  async function nascondi(templateId: string) {
    setEliminando(templateId);
    try {
      const ids = await setTemplateHidden(templateId, true);
      deseleziona();
      dispatch({ type: "SET_MODELLI_NASCOSTI", ids });
    } catch (err) {
      errore(err, "Non è stato possibile togliere il modello");
    } finally {
      setEliminando(null);
    }
  }

  async function ripristinaBozza(id: string) {
    setEliminando(id);
    try {
      await restoreCampaignDraft(id);
      const voce = state.cestino.find((c) => c.id === id);
      dispatch({ type: "SET_CESTINO", cestino: state.cestino.filter((c) => c.id !== id) });
      if (voce?.fonte) {
        dispatch({ type: "SET_PREVIOUS_CAMPAIGNS", previousCampaigns: [voce.fonte, ...previousCampaigns] });
      }
    } catch (err) {
      errore(err, "Ripristino non riuscito");
    } finally {
      setEliminando(null);
    }
  }

  async function ripristinaModello(templateId: string) {
    setEliminando(templateId);
    try {
      dispatch({ type: "SET_MODELLI_NASCOSTI", ids: await setTemplateHidden(templateId, false) });
    } catch (err) {
      errore(err, "Ripristino non riuscito");
    } finally {
      setEliminando(null);
    }
  }

  /**
   * Scegliere e partire sono lo stesso gesto. La selezione va passata anche a
   * `onAvanti`: `dispatch` non ha ancora aggiornato lo stato quando il wizard
   * legge cosa applicare, e senza questo argomento partirebbe il modello
   * selezionato in precedenza.
   */
  function usa(selection: PendingTemplateSelection) {
    seleziona(selection);
    setInVisione(null);
    onAvanti?.(selection);
  }

  return (
    /* `px-1`: l'anello della card scelta sta 4 px fuori dal suo bordo, e
       l'area che scorre taglia tutto quello che esce a sinistra. */
    <div className="space-y-10 px-1 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-display text-2xl">Da dove vuoi partire?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Riprendi una bozza, scegli un modello oppure parti da zero.
          </p>
        </div>
        {/* Bianco pieno e non trasparente: sul fondo caldo della pagina un
            contorno solo spariva, e partire da zero è una strada vera quanto
            i modelli. */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Accanto all'altra strada e non sulle card: una fila di icone su
              ogni miniatura sporcava proprio quello che si guarda per
              decidere. Si seleziona sulla card, si elimina da qui. */}
          <div className="flex items-center gap-0.5 rounded-full bg-white p-1 shadow-sm ring-1 ring-primary/15">
            <button
              type="button"
              title={elimina.etichetta}
              disabled={!elimina.azione || eliminando !== null}
              onClick={() => elimina.azione?.()}
              className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent"
            >
              <Trash2 className="h-4 w-4" /> Elimina
            </button>
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setCestinoAperto(true)}
              className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArchiveRestore className="h-4 w-4" /> Cestino
              {nelCestino > 0 && (
                <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 text-xs tabular-nums">{nelCestino}</span>
              )}
            </button>
          </div>
          <Button
            variant="outline"
            size="lg"
            className="rounded-full border-primary/25 bg-white font-medium text-primary shadow-sm hover:border-primary/50 hover:bg-white hover:shadow-md"
            onClick={() => usa({ type: "blank" })}
          >
            <FilePlus2 className="h-4 w-4" /> Email personalizzata
          </Button>
        </div>
      </header>

      {emailAttuale && (
        <Sezione titolo="La tua email">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
            <CardLibreria
              html={emailAttuale}
              titolo={state.subject.trim() || "L'email a cui stai lavorando"}
              sottotitolo="In corso"
              altezza="h-44 md:h-52"
              etichettaUso="Continua con questa"
              selezionata={selezione?.type === "current"}
              onDeseleziona={deseleziona}
              onSeleziona={() => seleziona({ type: "current" })}
              onUsa={() => usa({ type: "current" })}
              onGuarda={() =>
                setInVisione({
                  titolo: state.subject.trim() || "La tua email",
                  html: emailAttuale,
                  usa: () => usa({ type: "current" }),
                })
              }
            />
          </div>
        </Sezione>
      )}

      <Sezione
        titolo="Le tue bozze"
        azione={
          newsletter.length > NEWSLETTER_IN_VETRINA && (
            <button
              type="button"
              className="text-xs text-accent-strong underline-offset-4 hover:underline"
              onClick={() => setTutteLeNewsletter((v) => !v)}
            >
              {tutteLeNewsletter ? "Mostra solo le ultime" : `Vedi tutte (${newsletter.length})`}
            </button>
          )
        }
      >
        {newsletter.length === 0 ? (
          /* Compatto di proposito: una libreria vuota non deve occupare mezza
             pagina per dire che è vuota — i modelli qui sotto sono la strada. */
          <div className="riquadro tratteggiato flex items-center gap-3 px-4 py-3.5 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0 text-tertiary-foreground" aria-hidden="true" />
            <span>
              Nessuna bozza salvata. Le campagne che prepari e non invii compariranno qui, pronte da riprendere.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
            {newsletterVisibili.map(({ fonte, html }) => (
              <CardLibreria
                key={fonte.id}
                html={html}
                titolo={fonte.name}
                sottotitolo={fonte.dataLabel}
                altezza="h-44 md:h-52"
                etichettaUso="Usa come base"
                selezionata={selezione?.type === "previous" && selezione.sourceCampaignId === fonte.id}
                onDeseleziona={deseleziona}
                onSeleziona={() => seleziona({ type: "previous", sourceCampaignId: fonte.id })}
                onUsa={() => usa({ type: "previous", sourceCampaignId: fonte.id })}
                onGuarda={() =>
                  setInVisione({
                    titolo: fonte.name,
                    html,
                    usa: () => usa({ type: "previous", sourceCampaignId: fonte.id }),
                  })
                }
              />
            ))}
          </div>
        )}
      </Sezione>

      <Sezione
        titolo="Modelli"
        azione={
          /* Filtri a pillola, scorrevoli su telefono. Una ricerca qui non
             aggiungerebbe niente con questo numero di modelli: il posto dove
             andrebbe è questo, accanto ai filtri. */
          /* Niente margini negativi: con `max-w-full` e `justify-between` il
             `-mx-1` spingeva la fila 4 px oltre il bordo destro, e tutta la
             pagina prendeva una barra di scorrimento orizzontale. */
          <div className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto pb-1">
            <ChipCategoria attiva={categoria === null} onClick={() => setCategoria(null)}>
              Tutti
            </ChipCategoria>
            {CATEGORIE_MODELLI.map((c) => (
              <ChipCategoria key={c} attiva={categoria === c} onClick={() => setCategoria(c)}>
                {c}
              </ChipCategoria>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {modelli.map(({ template, html }) => (
            <CardLibreria
              key={template.id}
              html={html}
              titolo={template.name}
              sottotitolo={template.category}
              altezza="h-64 md:h-80"
              etichettaUso="Usa questo modello"
              selezionata={selezione?.type === "template" && selezione.templateId === template.id}
              onDeseleziona={deseleziona}
              onSeleziona={() => seleziona({ type: "template", templateId: template.id })}
              onUsa={() => usa({ type: "template", templateId: template.id })}
              onGuarda={() =>
                setInVisione({
                  titolo: template.name,
                  html,
                  usa: () => usa({ type: "template", templateId: template.id }),
                })
              }
            />
          ))}
        </div>
      </Sezione>

      <Dialog open={cestinoAperto} onOpenChange={setCestinoAperto}>
        <DialogContent className="max-w-lg gap-4 p-5">
          <DialogTitle className="text-base">Cestino</DialogTitle>
          {nelCestino === 0 ? (
            <p className="text-sm text-muted-foreground">
              Il cestino è vuoto. Le bozze e i modelli che elimini finiscono qui, e da qui li recuperi.
            </p>
          ) : (
            <div className="max-h-[60vh] space-y-5 overflow-y-auto">
              {state.emailScartata && (
                <VociCestino
                  titolo="Questa campagna"
                  voci={[{ id: "current", nome: "L'email che avevi preparato", nota: "Tolta adesso" }]}
                  occupato={eliminando}
                  onRipristina={() => void ripristinaEmailAttuale()}
                />
              )}
              {state.cestino.length > 0 && (
                <VociCestino
                  titolo="Bozze"
                  voci={state.cestino.map((b) => ({ id: b.id, nome: b.name, nota: b.dataLabel }))}
                  occupato={eliminando}
                  onRipristina={ripristinaBozza}
                />
              )}
              {modelliNelCestino.length > 0 && (
                <VociCestino
                  titolo="Modelli"
                  voci={modelliNelCestino.map((t) => ({ id: t.id, nome: t.name, nota: t.category }))}
                  occupato={eliminando}
                  onRipristina={ripristinaModello}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={inVisione !== null} onOpenChange={(aperto) => !aperto && setInVisione(null)}>
        <DialogContent className="max-w-3xl gap-3 p-4 sm:p-5">
          <DialogTitle className="text-base">{inVisione?.titolo}</DialogTitle>
          {/* Un iframe e non l'HTML in pagina: a grandezza vera gli stili
              dell'email devono restare fuori dal documento del CRM. */}
          <iframe
            title={`Anteprima di ${inVisione?.titolo ?? ""}`}
            srcDoc={inVisione?.html ?? ""}
            onLoad={(e) => barraDelTema(e.currentTarget)}
            className="h-[62vh] w-full rounded-lg border border-border bg-white"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInVisione(null)}>
              Chiudi
            </Button>
            <Button variant="accent" onClick={() => inVisione?.usa()}>
              Usa e apri l&apos;editor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VociCestino({
  titolo,
  voci,
  occupato,
  onRipristina,
}: {
  titolo: string;
  voci: { id: string; nome: string; nota: string }[];
  occupato: string | null;
  onRipristina: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="t-etichetta">{titolo}</h3>
      <ul className="divide-y divide-border rounded-xl ring-1 ring-border">
        {voci.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{v.nome}</p>
              <p className="text-xs text-muted-foreground">{v.nota}</p>
            </div>
            <Button variant="outline" size="sm" disabled={occupato !== null} onClick={() => onRipristina(v.id)}>
              <RotateCcw className="h-3.5 w-3.5" /> Ripristina
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChipCategoria({
  attiva,
  onClick,
  children,
}: {
  attiva: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
        attiva
          ? "border-accent-strong bg-accent-strong/10 font-medium text-accent-strong"
          : "border-border text-muted-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}
