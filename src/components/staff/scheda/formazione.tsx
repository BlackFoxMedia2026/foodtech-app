"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, GraduationCap, Pencil, Plus, Stethoscope, Trash2, Upload } from "lucide-react";
import type { StaffMedicalFitness, StaffTrainingKind } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAvvisi } from "@/components/ui/avvisi";
import { readApiError } from "@/lib/api-client";
import {
  IDONEITA,
  STATO_SCADENZA_LABEL,
  STATO_SCADENZA_TONE,
  TIPI_CORSO,
  dataBreve,
  dataLunga,
  descriviScadenza,
  idoneitaLabel,
  idoneitaTone,
  nomeCorso,
  perCampoData,
  statoScadenza,
  tipoCorsoLabel,
  type StatoScadenza,
} from "@/lib/scheda-dipendente";
import { cn } from "@/lib/utils";
import { Campo, CampoModulo, GrigliaCampi, Sezione } from "./sezione";
import type { CorsoDTO, PersonaDTO, VisitaDTO } from "./tipi";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

/**
 * Formazione e sicurezza: la visita medica, grande e per prima, poi i corsi.
 *
 * La visita sta sopra perché è l'adempimento con la scadenza più corta e la
 * multa più alta, e perché ha un giudizio — idoneo o no — che cambia cosa la
 * persona può fare. I corsi sono una card ciascuno, **anche quelli che
 * mancano**: «Antincendio · Non presente» è un'informazione, e va scritta
 * dove si andrebbe a cercarla.
 */
export function Formazione({ persona, corsi, visite, canEdit }: { persona: PersonaDTO; corsi: CorsoDTO[]; visite: VisitaDTO[]; canEdit: boolean }) {
  return (
    <div className="space-y-5">
      <VisitaMedica persona={persona} visite={visite} canEdit={canEdit} />
      <Corsi persona={persona} corsi={corsi} canEdit={canEdit} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Visita medica                                                             */
/* -------------------------------------------------------------------------- */

type ValoriVisita = { examinedAt: string; fitness: StaffMedicalFitness; expiresAt: string; doctorName: string; notes: string };

function VisitaMedica({ persona, visite, canEdit }: { persona: PersonaDTO; visite: VisitaDTO[]; canEdit: boolean }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [dialogo, setDialogo] = useState<{ modo: "nuova" | "modifica"; visita?: VisitaDTO } | null>(null);
  const [anteprima, setAnteprima] = useState<{ url: string; nome: string; mime: string } | null>(null);
  const ultima = visite[0] ?? null;
  const precedenti = visite.slice(1);
  const oggi = new Date();
  const stato: StatoScadenza | null = ultima ? statoScadenza(ultima.expiresAt ? new Date(ultima.expiresAt) : null, oggi) : null;

  return (
    <Sezione
      id="visita-medica"
      titolo="Visita medica aziendale"
      icona={Stethoscope}
      descrizione="La sorveglianza sanitaria del medico competente."
      azione={
        canEdit && (
          <Button type="button" variant={ultima ? "outline" : "accent"} onClick={() => setDialogo({ modo: "nuova" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {ultima ? "Registra nuova visita" : "Registra la visita"}
          </Button>
        )
      }
    >
      {ultima ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={idoneitaTone(ultima.fitness)} className="text-sm">
              {idoneitaLabel(ultima.fitness)}
            </Badge>
            {stato && <Badge tone={STATO_SCADENZA_TONE[stato]}>{STATO_SCADENZA_LABEL[stato]}</Badge>}
            {ultima.expiresAt && (
              <span className={cn("text-sm", stato === "scaduto" ? "text-destructive-soft" : stato === "in_scadenza" ? "text-accent-strong" : "text-muted-foreground")}>
                {descriviScadenza(new Date(ultima.expiresAt), oggi)}
              </span>
            )}
          </div>
          <GrigliaCampi colonne={4}>
            <Campo etichetta="Ultima visita" valore={dataLunga(ultima.examinedAt)} />
            <Campo etichetta="Idoneità" valore={idoneitaLabel(ultima.fitness)} />
            <Campo etichetta="Scadenza" valore={ultima.expiresAt ? dataLunga(ultima.expiresAt) : null} vuoto="Nessuna scadenza" />
            <Campo etichetta="Medico competente" valore={ultima.doctorName} />
            {ultima.notes && <Campo etichetta="Note" valore={ultima.notes} largo />}
          </GrigliaCampi>

          <Allegato
            etichetta="Certificato di idoneità"
            allegato={ultima.certificate}
            urlUpload={`/api/waiters/${persona.id}/medical/${ultima.id}/certificato`}
            urlVedi={ultima.certificate ? `/api/waiters/${persona.id}/documents/${ultima.certificate.id}` : null}
            nomeSuggerito={`Certificato idoneità ${dataBreve(ultima.examinedAt)}`}
            canEdit={canEdit}
            onVedi={setAnteprima}
          />

          {canEdit && (
            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogo({ modo: "modifica", visita: ultima })}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Aggiorna visita
              </Button>
            </div>
          )}

          {precedenti.length > 0 && (
            <div className="border-t border-border/60 pt-4">
              <p className="t-etichetta mb-2">Visite precedenti</p>
              <ul className="divide-y divide-border/60">
                {precedenti.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      {dataLunga(v.examinedAt)} · {idoneitaLabel(v.fitness)}
                      {v.doctorName ? ` · ${v.doctorName}` : ""}
                    </span>
                    {canEdit && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDialogo({ modo: "modifica", visita: v })}>
                        Modifica
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="riquadro tratteggiato p-8 text-center">
          <Stethoscope className="mx-auto mb-3 h-8 w-8 text-tertiary-foreground" aria-hidden="true" />
          <p className="text-base font-medium">Nessuna visita registrata</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Registra l&apos;ultima visita con l&apos;idoneità e la scadenza: comparirà fra le scadenze della Panoramica e nell&apos;elenco Staff.
          </p>
        </div>
      )}

      {dialogo && (
        <DialogoVisita
          waiterId={persona.id}
          visita={dialogo.visita}
          onClose={() => setDialogo(null)}
          onFatto={(msg) => {
            avvisi.mostra(msg);
            router.refresh();
          }}
        />
      )}
      <Anteprima anteprima={anteprima} onClose={() => setAnteprima(null)} />
    </Sezione>
  );
}

function DialogoVisita({ waiterId, visita, onClose, onFatto }: { waiterId: string; visita?: VisitaDTO; onClose: () => void; onFatto: (msg: string) => void }) {
  const [v, setV] = useState<ValoriVisita>({
    examinedAt: perCampoData(visita?.examinedAt) || perCampoData(new Date()),
    fitness: visita?.fitness ?? "IDONEO",
    expiresAt: perCampoData(visita?.expiresAt),
    doctorName: visita?.doctorName ?? "",
    notes: visita?.notes ?? "",
  });
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v.examinedAt) return setErrore("Inserisci la data della visita.");
    if (v.expiresAt && v.expiresAt < v.examinedAt) return setErrore("La scadenza non può precedere la visita.");
    setInCorso(true);
    setErrore(null);
    const res = await fetch(visita ? `/api/waiters/${waiterId}/medical/${visita.id}` : `/api/waiters/${waiterId}/medical`, {
      method: visita ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ examinedAt: v.examinedAt, fitness: v.fitness, expiresAt: v.expiresAt || null, doctorName: v.doctorName.trim() || null, notes: v.notes.trim() || null }),
    });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile salvare la visita."));
    onClose();
    onFatto(visita ? "Visita aggiornata" : "Visita registrata");
  }

  async function elimina() {
    if (!visita) return;
    setInCorso(true);
    const res = await fetch(`/api/waiters/${waiterId}/medical/${visita.id}`, { method: "DELETE" });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile eliminare la visita."));
    onClose();
    onFatto("Visita eliminata");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{visita ? "Aggiorna la visita medica" : "Registra la visita medica"}</DialogTitle>
          <DialogDescription>Data, giudizio di idoneità e prossima scadenza.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salva} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoModulo etichetta="Data della visita" htmlFor="examinedAt">
              <Input id="examinedAt" type="date" value={v.examinedAt} onChange={(e) => setV({ ...v, examinedAt: e.target.value })} />
            </CampoModulo>
            <CampoModulo etichetta="Idoneità" htmlFor="fitness">
              <Select value={v.fitness} onValueChange={(f) => setV({ ...v, fitness: f as StaffMedicalFitness })}>
                <SelectTrigger id="fitness">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDONEITA.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CampoModulo>
            <CampoModulo etichetta="Scadenza" htmlFor="expiresAt" nota="Di solito un anno dopo.">
              <Input id="expiresAt" type="date" min={v.examinedAt || undefined} value={v.expiresAt} onChange={(e) => setV({ ...v, expiresAt: e.target.value })} />
            </CampoModulo>
            <CampoModulo etichetta="Medico competente" htmlFor="doctorName">
              <Input id="doctorName" value={v.doctorName} onChange={(e) => setV({ ...v, doctorName: e.target.value })} placeholder="Es. Dr. Mario Rossi" />
            </CampoModulo>
            <CampoModulo etichetta="Note" htmlFor="notesVisita" largo>
              <Textarea id="notesVisita" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className="min-h-[60px]" placeholder="Es. prescrizioni, limitazioni." />
            </CampoModulo>
          </div>
          {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {visita &&
                (confermaElimina ? (
                  <span className="flex items-center gap-2 text-sm">
                    <Button type="button" variant="destructive" size="sm" onClick={elimina} disabled={inCorso}>
                      Elimina
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfermaElimina(false)}>
                      Annulla
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfermaElimina(true)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina
                  </Button>
                ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={inCorso}>
                Annulla
              </Button>
              <Button type="submit" variant="accent" disabled={inCorso}>
                {inCorso ? "Salvo…" : "Salva"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Corsi                                                                     */
/* -------------------------------------------------------------------------- */

type ValoriCorso = { kind: StaffTrainingKind; name: string; completedAt: string; expiresAt: string; provider: string; certificateNumber: string; notes: string };

function Corsi({ persona, corsi, canEdit }: { persona: PersonaDTO; corsi: CorsoDTO[]; canEdit: boolean }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [dialogo, setDialogo] = useState<{ corso?: CorsoDTO; kind?: StaffTrainingKind } | null>(null);
  const [anteprima, setAnteprima] = useState<{ url: string; nome: string; mime: string } | null>(null);
  const oggi = new Date();

  // Per ogni tipo, l'edizione più recente; i corsi «altro» ognuno per sé.
  const perTipo = new Map<StaffTrainingKind, CorsoDTO>();
  const altri: CorsoDTO[] = [];
  for (const c of corsi) {
    if (c.kind === "ALTRO") {
      altri.push(c);
      continue;
    }
    const gia = perTipo.get(c.kind);
    if (!gia || (c.completedAt ?? "") > (gia.completedAt ?? "")) perTipo.set(c.kind, c);
  }
  const schede = TIPI_CORSO.filter((t) => t.value !== "ALTRO").map((t) => ({ tipo: t, corso: perTipo.get(t.value) ?? null }));

  return (
    <Sezione
      id="corsi"
      titolo="Corsi e adempimenti"
      icona={GraduationCap}
      descrizione="Sicurezza, HACCP, antincendio, primo soccorso e gli altri attestati."
      azione={
        canEdit && (
          <Button type="button" variant="outline" onClick={() => setDialogo({ kind: "ALTRO" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi corso
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {schede.map(({ tipo, corso }) => (
          <CartaCorso
            key={tipo.value}
            titolo={tipo.label}
            corso={corso}
            oggi={oggi}
            canEdit={canEdit}
            waiterId={persona.id}
            onAggiungi={() => setDialogo({ kind: tipo.value })}
            onModifica={corso ? () => setDialogo({ corso }) : undefined}
            onVedi={setAnteprima}
          />
        ))}
        {altri.map((c) => (
          <CartaCorso
            key={c.id}
            titolo={nomeCorso(c)}
            corso={c}
            oggi={oggi}
            canEdit={canEdit}
            waiterId={persona.id}
            onAggiungi={() => setDialogo({ kind: "ALTRO" })}
            onModifica={() => setDialogo({ corso: c })}
            onVedi={setAnteprima}
          />
        ))}
      </div>

      {dialogo && (
        <DialogoCorso
          waiterId={persona.id}
          corso={dialogo.corso}
          kindIniziale={dialogo.kind}
          onClose={() => setDialogo(null)}
          onFatto={(msg) => {
            avvisi.mostra(msg);
            router.refresh();
          }}
        />
      )}
      <Anteprima anteprima={anteprima} onClose={() => setAnteprima(null)} />
    </Sezione>
  );
}

function CartaCorso({
  titolo,
  corso,
  oggi,
  canEdit,
  waiterId,
  onAggiungi,
  onModifica,
  onVedi,
}: {
  titolo: string;
  corso: CorsoDTO | null;
  oggi: Date;
  canEdit: boolean;
  waiterId: string;
  onAggiungi: () => void;
  onModifica?: () => void;
  onVedi: (a: { url: string; nome: string; mime: string }) => void;
}) {
  const stato: StatoScadenza = corso ? statoScadenza(corso.expiresAt ? new Date(corso.expiresAt) : null, oggi) : "assente";
  return (
    <article
      className={cn(
        "riquadro flex flex-col gap-4 p-5",
        stato === "scaduto" && "border-destructive/40",
        stato === "in_scadenza" && "border-accent/50",
        stato === "assente" && "tratteggiato",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-medium leading-tight text-foreground md:text-xl">{titolo}</h3>
        <Badge tone={STATO_SCADENZA_TONE[stato]} className="shrink-0">
          {STATO_SCADENZA_LABEL[stato]}
        </Badge>
      </header>

      {corso ? (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="t-etichetta">Completato</dt>
              <dd className="mt-0.5 text-base text-foreground">{corso.completedAt ? dataBreve(corso.completedAt) : <span className="text-tertiary-foreground">—</span>}</dd>
            </div>
            <div>
              <dt className="t-etichetta">Scadenza</dt>
              <dd className={cn("mt-0.5 text-base", stato === "scaduto" ? "text-destructive-soft" : stato === "in_scadenza" ? "text-accent-strong" : "text-foreground")}>
                {corso.expiresAt ? dataBreve(corso.expiresAt) : <span className="text-tertiary-foreground">Nessuna</span>}
              </dd>
            </div>
            {corso.provider && (
              <div>
                <dt className="t-etichetta">Ente formatore</dt>
                <dd className="mt-0.5 text-base text-foreground">{corso.provider}</dd>
              </div>
            )}
            {corso.certificateNumber && (
              <div>
                <dt className="t-etichetta">N. attestato</dt>
                <dd className="mt-0.5 text-base tabular-nums text-foreground">{corso.certificateNumber}</dd>
              </div>
            )}
          </dl>
          <Allegato
            etichetta="Attestato"
            allegato={corso.certificate}
            urlUpload={`/api/waiters/${waiterId}/training/${corso.id}/attestato`}
            urlVedi={corso.certificate ? `/api/waiters/${waiterId}/documents/${corso.certificate.id}` : null}
            nomeSuggerito={`Attestato ${titolo}`}
            canEdit={canEdit}
            onVedi={onVedi}
            compatto
          />
          {canEdit && onModifica && (
            <div className="mt-auto flex gap-2 border-t border-border/60 pt-3">
              <Button type="button" variant="ghost" size="sm" onClick={onModifica}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica
              </Button>
              {corso.kind !== "ALTRO" && (
                <Button type="button" variant="ghost" size="sm" onClick={onAggiungi}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Nuova edizione
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Nessun corso registrato per questa persona.</p>
          {canEdit && (
            <div className="mt-auto">
              <Button type="button" variant="outline" size="sm" onClick={onAggiungi}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi corso
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function DialogoCorso({
  waiterId,
  corso,
  kindIniziale,
  onClose,
  onFatto,
}: {
  waiterId: string;
  corso?: CorsoDTO;
  kindIniziale?: StaffTrainingKind;
  onClose: () => void;
  onFatto: (msg: string) => void;
}) {
  const [v, setV] = useState<ValoriCorso>({
    kind: corso?.kind ?? kindIniziale ?? "ALTRO",
    name: corso?.name ?? "",
    completedAt: perCampoData(corso?.completedAt),
    expiresAt: perCampoData(corso?.expiresAt),
    provider: corso?.provider ?? "",
    certificateNumber: corso?.certificateNumber ?? "",
    notes: corso?.notes ?? "",
  });
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (v.kind === "ALTRO" && !v.name.trim()) return setErrore("Dai un nome al corso.");
    if (v.completedAt && v.expiresAt && v.expiresAt < v.completedAt) return setErrore("La scadenza non può precedere la data del corso.");
    setInCorso(true);
    setErrore(null);
    const res = await fetch(corso ? `/api/waiters/${waiterId}/training/${corso.id}` : `/api/waiters/${waiterId}/training`, {
      method: corso ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: v.kind,
        name: v.name.trim() || null,
        completedAt: v.completedAt || null,
        expiresAt: v.expiresAt || null,
        provider: v.provider.trim() || null,
        certificateNumber: v.certificateNumber.trim() || null,
        notes: v.notes.trim() || null,
      }),
    });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile salvare il corso."));
    onClose();
    onFatto(corso ? "Corso aggiornato" : "Corso registrato");
  }

  async function elimina() {
    if (!corso) return;
    setInCorso(true);
    const res = await fetch(`/api/waiters/${waiterId}/training/${corso.id}`, { method: "DELETE" });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile eliminare il corso."));
    onClose();
    onFatto("Corso rimosso");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{corso ? "Modifica corso" : "Registra un corso"}</DialogTitle>
          <DialogDescription>Quando è stato svolto, quando scade, chi l&apos;ha tenuto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salva} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoModulo etichetta="Tipo di corso" htmlFor="kind">
              <Select value={v.kind} onValueChange={(k) => setV({ ...v, kind: k as StaffTrainingKind })}>
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPI_CORSO.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CampoModulo>
            <CampoModulo etichetta={v.kind === "ALTRO" ? "Nome del corso" : "Titolo (facoltativo)"} htmlFor="nameCorso">
              <Input id="nameCorso" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={v.kind === "ALTRO" ? "Es. Corso sommelier AIS" : tipoCorsoLabel(v.kind)} />
            </CampoModulo>
            <CampoModulo etichetta="Data svolgimento" htmlFor="completedAt">
              <Input id="completedAt" type="date" value={v.completedAt} onChange={(e) => setV({ ...v, completedAt: e.target.value })} />
            </CampoModulo>
            <CampoModulo etichetta="Data scadenza" htmlFor="expiresAtCorso" nota="Vuota se non scade.">
              <Input id="expiresAtCorso" type="date" min={v.completedAt || undefined} value={v.expiresAt} onChange={(e) => setV({ ...v, expiresAt: e.target.value })} />
            </CampoModulo>
            <CampoModulo etichetta="Ente formatore" htmlFor="provider">
              <Input id="provider" value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value })} />
            </CampoModulo>
            <CampoModulo etichetta="Numero attestato" htmlFor="certificateNumber">
              <Input id="certificateNumber" value={v.certificateNumber} onChange={(e) => setV({ ...v, certificateNumber: e.target.value })} />
            </CampoModulo>
            <CampoModulo etichetta="Note" htmlFor="notesCorso" largo>
              <Textarea id="notesCorso" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className="min-h-[60px]" />
            </CampoModulo>
          </div>
          {!corso && <p className="text-xs text-muted-foreground">L&apos;attestato si carica dopo, dalla card del corso.</p>}
          {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {corso &&
                (confermaElimina ? (
                  <span className="flex items-center gap-2 text-sm">
                    <Button type="button" variant="destructive" size="sm" onClick={elimina} disabled={inCorso}>
                      Elimina
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfermaElimina(false)}>
                      Annulla
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfermaElimina(true)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina
                  </Button>
                ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={inCorso}>
                Annulla
              </Button>
              <Button type="submit" variant="accent" disabled={inCorso}>
                {inCorso ? "Salvo…" : "Salva"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Allegato (attestato / certificato)                                        */
/* -------------------------------------------------------------------------- */

function Allegato({
  etichetta,
  allegato,
  urlUpload,
  urlVedi,
  nomeSuggerito,
  canEdit,
  onVedi,
  compatto = false,
}: {
  etichetta: string;
  allegato: CorsoDTO["certificate"];
  urlUpload: string;
  urlVedi: string | null;
  nomeSuggerito: string;
  canEdit: boolean;
  onVedi: (a: { url: string; nome: string; mime: string }) => void;
  compatto?: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(false);

  async function carica(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return avvisi.problema("Carica un file PDF, JPG, PNG o WebP.");
    if (file.size > 10 * 1024 * 1024) return avvisi.problema("Il file supera i 10 MB.");
    setInCorso(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", nomeSuggerito);
    const res = await fetch(urlUpload, { method: "POST", body: fd });
    setInCorso(false);
    if (!res.ok) return avvisi.problema(await readApiError(res, "Impossibile caricare il file."));
    avvisi.mostra(`${etichetta} caricato`);
    router.refresh();
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", !compatto && "riquadro p-3")}>
      <span className="t-etichetta mr-1">{etichetta}</span>
      {allegato && urlVedi ? (
        <>
          <button
            type="button"
            onClick={() => onVedi({ url: urlVedi, nome: allegato.originalFileName, mime: allegato.mimeType })}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
          >
            <Eye className="h-4 w-4" aria-hidden="true" /> Visualizza documento
          </button>
          {canEdit && (
            <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={inCorso}>
              <Upload className="h-4 w-4" aria-hidden="true" /> {inCorso ? "Carico…" : "Sostituisci"}
            </Button>
          )}
        </>
      ) : canEdit ? (
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={inCorso}>
          <Upload className="h-4 w-4" aria-hidden="true" /> {inCorso ? "Carico…" : "Carica"}
        </Button>
      ) : (
        <span className="text-sm text-tertiary-foreground">Non caricato</span>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={carica} />
    </div>
  );
}

function Anteprima({ anteprima, onClose }: { anteprima: { url: string; nome: string; mime: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!anteprima} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{anteprima?.nome}</DialogTitle>
          <DialogDescription>Anteprima del documento</DialogDescription>
        </DialogHeader>
        {anteprima && (
          <div className="overflow-hidden riquadro bg-muted">
            {anteprima.mime === "application/pdf" ? (
              <iframe src={anteprima.url} title={anteprima.nome} className="h-[65vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={anteprima.url} alt={anteprima.nome} className="max-h-[65vh] w-full object-contain" />
            )}
          </div>
        )}
        {anteprima && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" asChild>
              <a href={`${anteprima.url}?download=1`} download={anteprima.nome}>
                Scarica
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
