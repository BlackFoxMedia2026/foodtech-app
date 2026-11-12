"use client";

import {
  UserX,
  PartyPopper,
  CalendarClock,
  UtensilsCrossed,
  Crown,
  Wand2,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CAMPAIGN_OBJECTIVES, type CampaignObjective } from "@/lib/campaign-objectives";
import { getCampaignTemplate, withBrandLogo } from "@/lib/campaign-templates";
import { useWizardDispatch, useWizardState } from "./wizard-context";
import { PannelloPubblico } from "./scelta-pubblico";

const ICONS: Record<CampaignObjective["icon"], LucideIcon> = {
  UserX,
  PartyPopper,
  CalendarClock,
  UtensilsCrossed,
  Crown,
  Wand2,
};

/** «Parti da zero» non è un obiettivo come gli altri: è l'uscita. */
const ID_LIBERA = "custom";

function nomeProposto(objective: CampaignObjective): string {
  const mese = new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date());
  return `${objective.id === ID_LIBERA ? "Nuova campagna" : objective.label} · ${mese}`;
}

export function Step1Objective() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  /* Il pannello esiste solo dopo il clic: è la risposta a una scelta, e
     prima della scelta non ha niente da dire. Anche riprendendo una bozza. */
  const mostraPubblico = state.objectiveId !== null;

  /* Sotto i 1280 px la colonna non entra di lato ma sotto le card, fuori
     dallo schermo: alla prima scelta la si porta in vista. Di lato è già lì. */
  const pannelloRef = useRef<HTMLDivElement>(null);
  const primaScelta = useRef(!mostraPubblico);
  useEffect(() => {
    if (!state.objectiveId || !primaScelta.current) return;
    primaScelta.current = false;
    if (window.matchMedia("(min-width: 1280px)").matches) return;
    const riduci = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pannelloRef.current?.scrollIntoView({ behavior: riduci ? "auto" : "smooth", block: "start" });
  }, [state.objectiveId]);

  function selectObjective(objective: CampaignObjective) {
    const template = objective.suggestedTemplateId ? getCampaignTemplate(objective.suggestedTemplateId) : undefined;
    const blocks = template ? template.blocks.map((b, i) => ({ ...b, id: `${objective.id}-init-${i}` })) : [];
    dispatch({
      type: "SET_OBJECTIVE",
      objectiveId: objective.id,
      segment: objective.suggestedSegment,
      subject: objective.suggestedSubject,
      blocks: withBrandLogo(blocks, state.brandLogoUrl || undefined),
    });
    /* Il nome ora sta nel titolo, e «Avanti» lo pretende: se è vuoto, o è
       ancora quello proposto per un altro obiettivo, se ne propone uno
       (obiettivo + mese). Uno scritto a mano non si tocca. */
    const proposti = CAMPAIGN_OBJECTIVES.map(nomeProposto);
    if (!state.name.trim() || proposti.includes(state.name)) {
      dispatch({ type: "SET_NAME", name: nomeProposto(objective) });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-2xl">Qual è l&apos;obiettivo della campagna?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sceglilo e ti mostriamo subito a chi arriva. Oggetto e contenuto li prepariamo noi: potrai cambiarli dopo.
        </p>
      </div>

      {/* Prima della scelta le card hanno tutta la larghezza; dopo, la
          seconda colonna si apre da 0 a 340 px e le spinge a sinistra mentre
          il riepilogo entra da destra. Si anima la griglia stessa
          (grid-template-columns), così le card scorrono invece di saltare. */}
      <div
        className={cn(
          /* `overflow-x-clip`: durante l'apertura il pannello (340 px fissi,
             e spostato a destra dall'entrata) sporge oltre il bordo, e la
             pagina mostrava per mezzo secondo una barra di scorrimento
             orizzontale. `clip` e non `hidden`: non crea un contenitore di
             scorrimento, quindi il pannello resta `sticky`. Il margine lascia
             respirare l'anello del focus delle card sul bordo. */
          "grid gap-6 overflow-x-clip [overflow-clip-margin:8px] xl:transition-[grid-template-columns,column-gap] xl:duration-500 xl:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          mostraPubblico
            ? "xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-x-8"
            : "xl:grid-cols-[minmax(0,1fr)_0px] xl:gap-x-0",
        )}
      >
        <div className="grid content-start gap-5 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Obiettivo della campagna">
          {CAMPAIGN_OBJECTIVES.map((objective) => {
            const Icon = ICONS[objective.icon];
            const selected = state.objectiveId === objective.id;
            const libera = objective.id === ID_LIBERA;
            return (
              <button
                key={objective.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectObjective(objective)}
                className={cn(
                  /* Le classi di Tailwind sono la resa al buio; in Carta
                     `scelta-obiettivo` ne fa una lastra (globals.css). */
                  "scelta-obiettivo group flex h-full flex-col overflow-hidden rounded-xl border text-left transition-[transform,box-shadow,border-color] duration-200 motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  libera && "scelta-obiettivo-libera border-dashed",
                  selected
                    ? "border-accent-strong bg-accent-strong/10"
                    : "border-border hover:border-border-strong hover:bg-secondary/60",
                )}
              >
                <div className="flex flex-1 flex-col gap-3 p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid h-12 w-12 shrink-0 place-items-center rounded-full",
                        libera ? "pastiglia border text-foreground" : "vetro kpi-pastiglia text-[var(--kpi-icon-ink)]",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    {/* La scelta si dice col verde pieno: un anello vuoto
                        finché non è tua, una spunta quando lo è. */}
                    <span
                      aria-hidden="true"
                      className="spunta-obiettivo grid h-7 w-7 shrink-0 place-items-center rounded-full border"
                    >
                      {selected && <Check className="h-4 w-4" strokeWidth={3} />}
                    </span>
                  </div>
                  {/* Il testo parte subito sotto l'icona, in tutte le card: in
                      fondo, una descrizione di una riga scendeva più in basso
                      di quelle di due e la fila non era più allineata. */}
                  <div className="space-y-1.5">
                    <p className="text-lg font-semibold leading-snug">{objective.label}</p>
                    <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{objective.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* `min-w-0`: finché la colonna è a 0 px il pannello (340 px fissi) non
            deve allargarla; esce dal bordo, ma è trasparente e non c'è ancora. */}
        <div ref={pannelloRef} className="min-w-0 scroll-mt-4">
          {mostraPubblico && (
            <div className="xl:w-[340px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-10 motion-safe:duration-500 motion-safe:fill-mode-both motion-safe:[animation-delay:120ms]">
              {/* Cambiando obiettivo il pannello riparte: il «personalizzato»
                  scelto a mano non deve sopravvivere a un gruppo nuovo. */}
              <PannelloPubblico key={state.objectiveId ?? "ripresa"} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
