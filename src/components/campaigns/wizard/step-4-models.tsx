"use client";

import { useMemo, useState } from "react";
import { Check, Eye, FilePlus2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Block, EmailSettings } from "@/lib/campaign-blocks";
import { compileEmailDocument, resolveTestVariables } from "@/lib/campaign-blocks-compiler";
import { impostazioniModello } from "@/lib/campaign-start";
import { CAMPAIGN_TEMPLATES, CATEGORIE_MODELLI, withBrandLogo, type CategoriaModello } from "@/lib/campaign-templates";
import type { StepProps } from "./campaign-wizard";
import { AnteprimaEmail } from "./anteprima-email";
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

      {selezionata && (
        <span className="absolute right-2 top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full bg-accent-strong text-accent-strong-foreground shadow-md">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}

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
  const [inVisione, setInVisione] = useState<{ titolo: string; html: string; usa: () => void } | null>(null);

  const selezione = state.pendingTemplateSelection;
  const { brandLogoUrl, brandPrimaryColor, previousCampaigns } = state;

  const modelli = useMemo(
    () =>
      CAMPAIGN_TEMPLATES.filter((t) => !categoria || t.category === categoria).map((t) => ({
        template: t,
        html: anteprimaHtml(t.blocks, impostazioniModello(t), brandLogoUrl, brandPrimaryColor),
      })),
    [categoria, brandLogoUrl, brandPrimaryColor],
  );

  const newsletter = useMemo(
    () =>
      previousCampaigns.map((c) => ({
        fonte: c,
        html: anteprimaHtml(c.document.blocks, c.document.settings, brandLogoUrl, brandPrimaryColor),
      })),
    [previousCampaigns, brandLogoUrl, brandPrimaryColor],
  );

  const newsletterVisibili = tutteLeNewsletter ? newsletter : newsletter.slice(0, NEWSLETTER_IN_VETRINA);

  function seleziona(selection: PendingTemplateSelection) {
    dispatch({ type: "SET_PENDING_TEMPLATE_SELECTION", selection });
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
    <div className="space-y-10 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-display text-2xl">Da dove vuoi partire?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Riprendi una newsletter già creata, scegli un modello oppure parti da zero.
          </p>
        </div>
        <Button variant="outline" onClick={() => usa({ type: "blank" })}>
          <FilePlus2 className="h-4 w-4" /> Email vuota
        </Button>
      </header>

      <Sezione
        titolo="Newsletter precedenti"
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
              Non hai ancora newsletter da riprendere. Le campagne che crei compariranno qui, pronte da riusare.
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
          <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
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

      <Dialog open={inVisione !== null} onOpenChange={(aperto) => !aperto && setInVisione(null)}>
        <DialogContent className="max-w-3xl gap-3 p-4 sm:p-5">
          <DialogTitle className="text-base">{inVisione?.titolo}</DialogTitle>
          {/* Un iframe e non l'HTML in pagina: a grandezza vera gli stili
              dell'email devono restare fuori dal documento del CRM. */}
          <iframe
            title={`Anteprima di ${inVisione?.titolo ?? ""}`}
            srcDoc={inVisione?.html ?? ""}
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
