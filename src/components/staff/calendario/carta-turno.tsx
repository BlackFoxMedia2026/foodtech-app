"use client";

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FAMIGLIE, IconaReparto, IconaTipoTurno } from "@/components/staff/calendario/famiglie";
import { iniziali, nomeCompleto, type TurnoConPersona, type TurnoOrario } from "@/components/staff/calendario/tipi";
import { famigliaDiTurno } from "@/lib/turni-calendario";
import { staffDepartmentLabel } from "@/lib/staff-departments";
import { staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { durataNetta, minutiAOrario, oreLeggibili, tipoTurnoLabel } from "@/lib/turni";
import { cn } from "@/lib/utils";

/**
 * La card di un turno.
 *
 * Una persona, una card, **larga quanto la colonna**. È la forma del planning
 * che i locali usano davvero: sotto il giorno, l'elenco di chi c'è, ognuno con
 * la faccia, il ruolo, l'orario e il reparto. Niente corsie affiancate — con
 * sei persone in servizio le corsie riducono ogni card a una striscia da
 * settanta pixel, e in una striscia non ci sta un nome e cognome.
 *
 * Il prezzo è dichiarato: **l'altezza non è la durata**. La card sta nella
 * riga dell'ora in cui il turno comincia, e quanto dura c'è scritto dentro. In
 * cambio si legge tutto senza aprire niente, che è quello che questa pagina
 * deve fare in tre secondi.
 */
export function CartaTurno({
  turno,
  interattiva,
  trascinabile,
  onApri,
}: {
  turno: TurnoOrario;
  interattiva: boolean;
  trascinabile: boolean;
  onApri: () => void;
}) {
  // Il reparto del **turno** se c'è, altrimenti quello della persona: è lo
  // stesso valore che decide il colore della card e l'icona in fondo.
  const reparto = turno.department ?? staffDepartmentOf(turno.persona);
  const famiglia = FAMIGLIE[famigliaDiTurno("WORK", reparto)];
  const ruolo = turno.persona.primaryRole ? staffPrimaryRoleLabel(turno.persona.primaryRole) : "—";
  const orario = `${minutiAOrario(turno.startMinute)} – ${minutiAOrario(turno.endMinute)}`;

  const descrizione = [
    nomeCompleto(turno.persona),
    ruolo,
    orario,
    staffDepartmentLabel(reparto),
    turno.service,
    `${oreLeggibili(durataNetta(turno.startMinute, turno.endMinute, turno.breakMinutes))} nette`,
    turno.notes,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Guscio id={turno.id} trascinabile={trascinabile} famiglia={famiglia}>
      <button
        type="button"
        disabled={!interattiva}
        onClick={onApri}
        title={descrizione}
        aria-label={`${descrizione}. Apri il dettaglio del turno.`}
        className={cn(
          "flex min-h-[104px] w-full flex-col gap-2.5 px-2.5 py-2.5 text-left",
          interattiva ? "cursor-pointer" : "cursor-default",
        )}
      >
        <span className="flex items-start gap-2">
          <Avatar className={cn("h-8 w-8 border bg-transparent", famiglia.pastiglia)}>
            {turno.persona.photoUrl && <AvatarImage src={turno.persona.photoUrl} alt="" />}
            <AvatarFallback className="text-[0.62rem] font-semibold text-cream">
              {iniziali(turno.persona)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            {/* Il nome va a capo invece di troncarsi: in una colonna da 155 px
                «Nicola Ferraro» non ci sta su una riga, e «Nicola Fe…» non è
                una persona. Il ruolo sotto tronca — quello è il dettaglio. */}
            <span className="block text-[0.8rem] font-semibold leading-[1.2] text-cream">
              {nomeCompleto(turno.persona)}
            </span>
            <span className="mt-0.5 block truncate text-[0.7rem] leading-tight text-cream/55">{ruolo}</span>
          </span>
        </span>

        <span className="mt-auto block">
          <span className="block text-[0.78rem] font-medium tabular-nums leading-tight text-cream/95">{orario}</span>
          <span className="mt-1 flex items-center gap-1.5 text-[0.7rem] leading-tight text-cream/55">
            <IconaReparto department={reparto} className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {staffDepartmentLabel(reparto)}
              {turno.service ? ` · ${turno.service}` : ""}
            </span>
          </span>
        </span>
      </button>
    </Guscio>
  );
}

/**
 * Riposo, ferie, permesso: **una riga, non una card**.
 *
 * Stanno in cima alla colonna, in una fascia che resta appesa sotto la
 * testata mentre il resto scorre — perché «chi manca oggi» non deve sparire
 * appena si scende a guardare la sera.
 *
 * Ed è **esattamente per questo** che qui non si usa la card grande dei
 * turni. Una card da 104 px per ogni assenza, moltiplicata per il giorno con
 * più assenti della settimana, faceva una fascia da quasi trecento pixel
 * inchiodata in alto: un quarto dello schermo speso per dire tre cognomi, e
 * le card delle 17 tagliate a metà dietro. Una riga sola dice gli stessi tre
 * cognomi in trenta pixel.
 *
 * L'icona porta il perché — letto per il riposo, aereo per le ferie — e il
 * resto (tipo, nota, «tutto il giorno») sta nel `title`, che è dove si guarda
 * quando si vuole sapere di più.
 */
export function CartaGiornata({
  turno,
  interattiva,
  onApri,
}: {
  turno: TurnoConPersona;
  interattiva: boolean;
  onApri: () => void;
}) {
  const famiglia = FAMIGLIE[famigliaDiTurno(turno.kind, turno.department ?? staffDepartmentOf(turno.persona))];
  const tipo = tipoTurnoLabel(turno.kind);
  const nome = nomeCompleto(turno.persona);

  return (
    <button
      type="button"
      disabled={!interattiva}
      onClick={onApri}
      title={[nome, tipo, "tutto il giorno", turno.notes].filter(Boolean).join(" · ")}
      aria-label={`${nome}: ${tipo}, tutto il giorno. Apri il dettaglio.`}
      className={cn(
        "flex w-full items-center gap-1.5 overflow-hidden rounded-md border px-1.5 py-1 text-left transition-colors",
        famiglia.carta,
        interattiva ? "cursor-pointer hover:brightness-[1.18]" : "cursor-default",
      )}
    >
      <IconaTipoTurno kind={turno.kind} className={cn("h-3 w-3 shrink-0", famiglia.testo)} />
      <span className="truncate text-[0.72rem] leading-tight text-cream/90">{nome}</span>
    </button>
  );
}

type Famiglia = (typeof FAMIGLIE)[keyof typeof FAMIGLIE];

/**
 * Il perimetro comune, e il trascinamento.
 *
 * `useDraggable` di dnd-kit invece di una gestione a mano dei pointer event:
 * la libreria è già in progetto (la usa la pianta della sala), distingue da
 * sola un clic da un trascinamento, e soprattutto sa **quale casella sta
 * sotto** — che in una griglia a righe di altezza variabile non si ricava da
 * una divisione.
 */
function Guscio({
  id,
  trascinabile = false,
  famiglia,
  children,
}: {
  id?: string;
  trascinabile?: boolean;
  famiglia: Famiglia;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: id ?? "fermo",
    disabled: !trascinabile || !id,
  });

  return (
    <article
      ref={trascinabile ? setNodeRef : undefined}
      {...(trascinabile ? listeners : {})}
      {...(trascinabile ? attributes : {})}
      className={cn(
        "overflow-hidden rounded-xl border transition-colors",
        famiglia.carta,
        "hover:brightness-[1.18]",
        trascinabile && "touch-none",
        isDragging && "opacity-30",
      )}
    >
      {children}
    </article>
  );
}
