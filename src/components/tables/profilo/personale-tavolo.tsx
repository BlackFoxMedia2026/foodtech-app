"use client";

import { useEffect, useState } from "react";
import { Check, Users, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { isAssignable, staffStatusLabel, staffStatusTone } from "@/lib/staff-status";
import { TABLE_ASSIGNABLE_CAPABILITIES, TABLE_ROLE_LABELS } from "@/lib/staff-roles";
import { TABLE_ROLE_ICONS } from "@/components/floor/staff-role-icons";
import { cn, initials } from "@/lib/utils";
import type { ProfiloTavolo } from "@/server/profilo-tavolo";
import { Modulo } from "./sezione";

type Ruolo = (typeof TABLE_ASSIGNABLE_CAPABILITIES)[number];
type Candidato = { id: string; firstName: string; lastName: string };

/**
 * Chi serve questo tavolo, in una piastrella.
 *
 * ## Perché non è più un blocco con una frase
 *
 * Perché la frase diceva sempre la stessa cosa. «Nessuno assegnato a questo
 * tavolo per Pranzo» sono sette parole per un'informazione che sta in una:
 * *nessuno*. E occupava la stessa altezza di quello che succede al tavolo
 * adesso, che è il motivo per cui si è aperto il pannello.
 *
 * Qui: l'insegna, lo stato, il bersaglio. Gli avatar si sovrappongono perché
 * «chi c'è» si conta con l'occhio prima di leggerlo, e il nome per esteso è
 * uno solo — gli altri sono un `+2`, e per sapere chi sono si tocca.
 */
export function PersonaleModulo({
  profilo,
  puoGestire,
  onGestisci,
}: {
  profilo: ProfiloTavolo;
  /** `manage_staff`: senza, i nomi si leggono e non si toccano. */
  puoGestire: boolean;
  onGestisci: () => void;
}) {
  const persone = profilo.personale;
  const apribile = puoGestire && !!profilo.servizio;

  return (
    <Modulo
      icona={Users}
      titolo="Personale"
      onApri={apribile ? onGestisci : undefined}
      ariaLabel={`Gestisci il personale del tavolo ${profilo.tavolo.label}`}
    >
      {!profilo.servizio ? (
        // Le assegnazioni sono scritte per giorno **e** servizio: fuori dagli
        // orari di apertura non c'è una chiave con cui leggerle, e mostrare
        // quelle di un'altra fascia sarebbe peggio che non mostrarne.
        <span className="block t-nota">fuori turno</span>
      ) : persone.length === 0 ? (
        <span className="block text-sm text-muted-foreground">Nessuno</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="flex shrink-0 -space-x-2">
            {persone.slice(0, 3).map((p) => (
              <Avatar
                key={p.ruolo}
                className="h-6 w-6 ring-2 ring-card-sunken"
                title={`${TABLE_ROLE_LABELS[p.ruolo]}: ${p.nome}`}
              >
                {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                <AvatarFallback className="text-[10px]">{initials(p.nome)}</AvatarFallback>
              </Avatar>
            ))}
          </span>
          <span className="min-w-0 truncate text-sm">
            {persone[0].nome.split(" ")[0]}
            {persone.length > 1 && (
              <span className="text-muted-foreground"> +{persone.length - 1}</span>
            )}
          </span>
        </span>
      )}
    </Modulo>
  );
}

/**
 * Il livello di gestione: **dentro lo stesso pannello**, non sopra.
 *
 * Una finestra modale qui coprirebbe la mappa della sala, che è il contesto su
 * cui si sta decidendo chi va dove. Si scende di un livello e si torna
 * indietro dalla testata, come in una scheda del telefono.
 */
export function PersonaleLivello({
  profilo,
  onChanged,
}: {
  profilo: ProfiloTavolo;
  onChanged: () => void;
}) {
  const [apertoSu, setApertoSu] = useState<Ruolo | null>(null);
  const [candidati, setCandidati] = useState<Candidato[]>([]);
  const [caricando, setCaricando] = useState(false);
  const [inCorso, setInCorso] = useState<Ruolo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const assegnato = new Map(profilo.personale.map((p) => [p.ruolo, p]));

  useEffect(() => {
    if (!apertoSu) return;
    let annullato = false;
    setCaricando(true);
    fetch(`/api/staff/eligible?capability=${apertoSu}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => !annullato && setCandidati(lista))
      .finally(() => !annullato && setCaricando(false));
    return () => {
      annullato = true;
    };
  }, [apertoSu]);

  async function scrivi(ruolo: Ruolo, corpo: Record<string, unknown>, metodo: "POST" | "DELETE") {
    setInCorso(ruolo);
    setErrore(null);
    const res = await fetch("/api/staff-assignments", {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tableId: profilo.tavolo.id,
        assignmentType: ruolo,
        date: profilo.giorno,
        service: profilo.servizio,
        ...corpo,
      }),
    });
    setInCorso(null);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a salvare. Riprova."));
      return;
    }
    setApertoSu(null);
    onChanged();
  }

  return (
    <div className="space-y-3">
      <p className="t-nota">
        {profilo.servizio} · {profilo.tavolo.sala ?? "senza sala"}
      </p>

      {TABLE_ASSIGNABLE_CAPABILITIES.map((ruolo) => {
        const Icona = TABLE_ROLE_ICONS[ruolo];
        const attuale = assegnato.get(ruolo);
        const aperto = apertoSu === ruolo;
        return (
          <div key={ruolo} className="rounded-lg border border-border bg-card-sunken/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {attuale ? (
                  <Avatar className="h-8 w-8 shrink-0">
                    {attuale.photoUrl && <AvatarImage src={attuale.photoUrl} alt="" />}
                    <AvatarFallback>{initials(attuale.nome)}</AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary/60">
                    <Icona className="h-3.5 w-3.5 text-tertiary-foreground" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {attuale ? (
                      <span className="font-medium">{attuale.nome}</span>
                    ) : (
                      <span className="text-muted-foreground">Nessuno</span>
                    )}
                  </p>
                  <p className="t-nota">{TABLE_ROLE_LABELS[ruolo]}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Lo stato si dice **solo quando è un problema**: un cameriere
                    attivo non ha bisogno di una pillola che lo confermi, uno a
                    riposo assegnato a un tavolo sì. */}
                {attuale && !isAssignable(attuale.status) && (
                  <Badge tone={staffStatusTone(attuale.status)}>
                    {staffStatusLabel(attuale.status)}
                  </Badge>
                )}
                {attuale && (
                  <button
                    type="button"
                    disabled={inCorso === ruolo}
                    onClick={() => scrivi(ruolo, {}, "DELETE")}
                    aria-label={`Togli ${attuale.nome} da ${TABLE_ROLE_LABELS[ruolo]}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-tertiary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-soft disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setApertoSu(aperto ? null : ruolo)}
                >
                  {attuale ? "Cambia" : "Assegna"}
                </Button>
              </div>
            </div>

            {aperto && (
              <div className="mt-2.5 max-h-48 overflow-y-auto rounded-md bg-background/40 p-1">
                {caricando ? (
                  <p className="px-2 py-1.5 t-nota">Carico…</p>
                ) : candidati.length === 0 ? (
                  <p className="px-2 py-1.5 t-nota">
                    Nessuno in organico ha la competenza «{TABLE_ROLE_LABELS[ruolo]}».
                  </p>
                ) : (
                  candidati.map((c) => {
                    const scelto = attuale?.waiterId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={inCorso === ruolo}
                        onClick={() => scrivi(ruolo, { waiterId: c.id }, "POST")}
                        className={cn(
                          "flex min-h-[40px] w-full items-center justify-between gap-2 rounded px-2 text-left text-sm transition-colors hover:bg-secondary disabled:opacity-50",
                          scelto && "text-accent-strong",
                        )}
                      >
                        {c.firstName} {c.lastName}
                        {scelto && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      {errore && (
        <p role="alert" className="text-sm text-destructive-soft">
          {errore}
        </p>
      )}
    </div>
  );
}
