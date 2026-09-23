"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  Cake,
  CalendarClock,
  CalendarDays,
  ChefHat,
  Copy,
  Euro,
  type LucideIcon,
  Pause,
  PartyPopper,
  Play,
  Share2,
  Ticket,
  Undo2,
  User,
  UserPlus,
  Wifi,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { accorda } from "@/lib/accordo";
import { categoriaDi, conData, euro, GIORNI_INTERI, statoDi } from "@/lib/coupon-vista";
import { cn } from "@/lib/utils";
import { MOTIVO_NON_VALIDO, type CouponView } from "@/server/coupons";

type Utilizzo = {
  id: string;
  redeemedAt: string;
  amountCents: number | null;
  notes: string | null;
  bookingId: string | null;
  Guest: { id: string; firstName: string; lastName: string | null } | null;
};

/**
 * Un'icona per tipo di coupon.
 *
 * È l'unico pezzo di grafica del pannello, e serve a una cosa sola: dare un
 * punto d'appoggio all'occhio in cima a una colonna di testo. Un compleanno e
 * uno sconto Wi-Fi si riconoscono prima di leggere il nome.
 */
const ICONA_CATEGORIA: Record<string, LucideIcon> = {
  GENERIC: Ticket,
  BIRTHDAY: Cake,
  WINBACK: Undo2,
  EVENT: PartyPopper,
  NEW_CUSTOMER: UserPlus,
  WIFI: Wifi,
  REFERRAL: Share2,
  STAFF: ChefHat,
};

/**
 * La scheda di un coupon, in un pannello laterale.
 *
 * **Questo pannello non modifica niente**, e non è una svista: nel prodotto la
 * modifica di un coupon non esiste — ci sono la creazione e i tre cambi di
 * stato, e basta. Costruirla qui avrebbe voluto dire una rotta nuova e una
 * decisione di prodotto (cosa succede a un codice già speso quando qualcuno ne
 * cambia il valore?) presa di straforo dentro un lavoro di interfaccia.
 *
 * La prima versione aveva il difetto che aveva l'elenco: **tutto pesava
 * uguale**. «Quando vale» era una tabella di cinque righe identiche, e quattro
 * su cinque dicevano che una regola *non c'è* — «nessuna», «tutti i giorni»,
 * «senza scadenza», «tutti gli ospiti» — con lo stesso corpo e lo stesso
 * colore dell'unica che diceva qualcosa. Un coupon senza condizioni occupava
 * mezzo pannello per dire cinque volte «niente».
 *
 * Adesso **le regole che esistono hanno un peso e quelle che non esistono una
 * riga sola**, in grigio, in fondo. E il valore viene prima dell'etichetta:
 * «Solo il martedì» sopra «giorni in cui vale», non il contrario, perché è il
 * valore la cosa che si cerca.
 */
export function CouponPannello({
  c,
  canEdit,
  inCorso,
  onChiudi,
  onCambiaStato,
  onDuplica,
}: {
  c: CouponView;
  canEdit: boolean;
  inCorso: boolean;
  onChiudi: () => void;
  onCambiaStato: (status: "ACTIVE" | "PAUSED" | "ARCHIVED") => void;
  onDuplica: () => void;
}) {
  const stato = statoDi(c);
  const conTetto = c.restanti != null && c.maxRedemptions != null;
  const quota = conTetto ? Math.min(100, Math.round((c.usi / c.maxRedemptions!) * 100)) : 0;
  const Icona = ICONA_CATEGORIA[c.category] ?? Ticket;

  const [utilizzi, setUtilizzi] = useState<Utilizzo[] | null>(null);
  const [erroreUtilizzi, setErroreUtilizzi] = useState(false);

  useEffect(() => {
    // Gli utilizzi portano nomi di ospiti: la porta chiede `edit_marketing`,
    // quindi chi non ce l'ha non la bussa nemmeno.
    if (!canEdit) return;
    let vivo = true;
    setUtilizzi(null);
    setErroreUtilizzi(false);
    fetch(`/api/coupons/${c.id}/redemptions`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("no"))))
      .then((righe: Utilizzo[]) => vivo && setUtilizzi(righe))
      .catch(() => vivo && setErroreUtilizzi(true));
    return () => {
      vivo = false;
    };
  }, [c.id, canEdit]);

  const { regole, assenze } = condizioni(c);

  return (
    <Sheet open modal={false} onOpenChange={(v) => !v && onChiudi()}>
      {/*
        Il pannello **galleggia**, non è incollato ai bordi.

        `SheetContent` nasce attaccato: parte esattamente sotto la barra
        (`top-16`), arriva al fondo e al fianco destro della finestra, e ha
        l'angolo alto-sinistro l'unico arrotondato. È giusto per il cassetto
        dell'Agente, che è una parete laterale permanente; qui no — questa è la
        **scheda di un coupon**, un oggetto che si apre sopra l'elenco e si
        chiude, e attaccata alla barra sembrava un secondo pezzo di cornice
        invece di un foglio appoggiato sopra.

        Sedici pixel su tre lati, quattro angoli uguali, bordo su tutto il
        giro: bastano quelli a dire che sta *sopra* la pagina, e l'ombra di
        `.surface` fa il resto senza aggiungere aloni.

        Solo da `md`: sul telefono un foglio che galleggia lascerebbe intravedere
        una striscia di barra di navigazione sotto il bordo inferiore, e lì la
        parete piena è la cosa giusta.
      */}
      <SheetContent className="w-[34rem] md:bottom-4 md:right-4 md:top-20 md:rounded-xl md:border-r md:border-t">
        {/* ── Testata: chi è, e vale? ─────────────────────────────────── */}
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-10 bg-veil-7 text-accent-strong"
              aria-hidden="true"
            >
              <Icona className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-display text-xl leading-tight text-card-foreground">
                {c.name}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Scheda del coupon {c.name}, codice {c.code}.
              </SheetDescription>
              {/* Tipo e stato sulla stessa riga: erano due pillole incolonnate
                  che costavano una riga a testa per due parole. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="gold" className="uppercase tracking-wider">
                  {categoriaDi(c)}
                </Badge>
                <Badge tone={stato.tono} className="gap-1.5">
                  <i
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      stato.concluso ? "shadow-[inset_0_0_0_1.5px_currentColor]" : "bg-current",
                    )}
                    aria-hidden="true"
                  />
                  {stato.testo}
                </Badge>
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Chiudi la scheda del coupon"
              onClick={onChiudi}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {/* Il perché, per esteso: nell'elenco sta in un suggerimento, e un
              suggerimento non si legge con un dito su un tablet. */}
          {c.stato !== "usabile" && (
            <p className="mt-3 text-sm text-muted-foreground">
              {MOTIVO_NON_VALIDO[c.stato as keyof typeof MOTIVO_NON_VALIDO]}
            </p>
          )}
        </div>

        <div className="fill-scroll space-y-4 px-5 py-4">
          {/* ── Il coupon: cosa dà, e come si detta ───────────────────── */}
          {/*
            Beneficio e codice in un blocco solo, ed è l'unico blocco in
            rilievo del pannello: sono le due cose che si vengono a prendere
            qui — «cosa offro» e «la stringa da dettare». Prima il codice
            stava in un riquadro gemello di quello degli utilizzi, tagliato a
            metà da `truncate`, con lo stesso peso di un contatore.
          */}
          <div className="riquadro comodo bg-veil-3">
            <p className="t-etichetta">Cosa dà</p>
            <p className="mt-1.5 text-2xl font-semibold leading-tight text-accent-strong">
              {c.descrizione}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="t-etichetta leading-none">Codice</p>
                {/* Tutto intero e su una riga: è la stringa che si detta al
                    telefono. Su 504 px ci sta anche il codice più lungo che lo
                    schema consente. */}
                <code className="mt-1.5 block break-all font-mono text-base tracking-wider text-card-foreground">
                  {c.code}
                </code>
              </div>
              <CopyButton
                value={c.code}
                variant="subtle"
                size="sm"
                className="shrink-0"
                aria-label={`Copia il codice ${c.code}`}
              />
            </div>
          </div>

          {/* ── Quanto gira ───────────────────────────────────────────── */}
          {/*
            Due numeri, non due caselle di testo: sono gli stessi della fascia
            in cima alla pagina, letti su un coupon solo. «5 senza tetto» in
            corpo normale non era un dato, era una frase.
          */}
          <div className="grid grid-cols-2 gap-3">
            <div className="riquadro comodo">
              <p className="text-2xl font-semibold leading-none tabular-nums text-card-foreground">
                {c.usi}
                {conTetto && (
                  <span className="text-base font-normal text-muted-foreground"> / {c.maxRedemptions}</span>
                )}
              </p>
              <p className="mt-2 t-etichetta">{accorda(["Utilizzo", "Utilizzi"], c.usi)}</p>
              {conTetto ? (
                <>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-veil-10" aria-hidden="true">
                    <div
                      className={cn("h-full rounded-full", quota >= 100 ? "bg-accent" : "bg-sage")}
                      style={{ width: `${quota}%` }}
                    />
                  </div>
                  <p className="mt-1.5 t-nota">
                    {c.restanti} {accorda(["rimasto", "rimasti"], c.restanti ?? 0)}
                  </p>
                </>
              ) : (
                <p className="mt-1 t-nota">senza tetto</p>
              )}
            </div>
            <div className="riquadro comodo">
              <p className="text-2xl font-semibold leading-none tabular-nums text-card-foreground">
                {c.usiMese}
              </p>
              <p className="mt-2 t-etichetta">Questo mese</p>
              <p className="mt-1 t-nota">
                {c.ultimoUso ? `ultimo: ${quando(c.ultimoUso)}` : "mai usato"}
              </p>
            </div>
          </div>

          {/* ── Le regole ─────────────────────────────────────────────── */}
          {/*
            Condizioni e note in **un blocco solo**, non due sezioni sciolte.

            Sotto i due riquadri dei numeri la metà bassa del pannello era testo
            nudo: tre etichette in maiuscoletto tutte uguali — «Quando vale»,
            «Note per il personale», «Ultimi utilizzi» — allo stesso rientro e
            nello stesso colore, una dietro l'altra senza niente che dicesse
            dove finiva una e cominciava l'altra. Il pannello era pesante in
            cima e piatto in fondo.

            I blocchi diventano quattro e sono raggruppati per **a cosa
            servono**: il coupon, i numeri, come è configurato, cosa è
            successo. Le note stanno qui dentro perché sono configurazione
            quanto la spesa minima — le scrive il locale, non le fa il tempo.
          */}
          <div className="riquadro comodo">
            <p className="t-etichetta">Quando vale</p>
            <ul className="mt-1 divide-y divide-border/40">
              {regole.map((r) => (
                <li key={r.etichetta} className="flex items-start gap-3 py-2.5">
                  <r.icona className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
                  <div className="min-w-0">
                    {/* Il valore sopra l'etichetta, e non a destra in fondo a
                        una riga di puntini: è il valore la cosa che si cerca. */}
                    <p className="text-[0.9375rem] font-medium leading-snug text-card-foreground">
                      {r.valore}
                    </p>
                    <p className="t-nota">{r.etichetta}</p>
                  </div>
                </li>
              ))}
            </ul>
            {assenze.length > 0 && (
              // Tutto ciò che **non** limita questo coupon, in una riga sola.
              // Erano quattro righe con lo stesso peso delle regole vere.
              <p className="mt-2.5 t-nota">Per il resto: {assenze.join(", ")}.</p>
            )}

            {/* La descrizione libera vive qui, non sulla scheda dell'elenco:
                «Sconto per chi si è collegato alla rete del locale», ripetuto
                su venti coupon del Wi-Fi, era la riga più larga della pagina. */}
            {c.description && (
              <div className="mt-3.5 border-t border-border/50 pt-3">
                <p className="t-etichetta">Note per il personale</p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {c.description}
                </p>
              </div>
            )}
          </div>

          {/* ── Cosa è successo ───────────────────────────────────────── */}
          {canEdit && (
            <div className="riquadro comodo">
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-etichetta">Ultimi utilizzi</p>
                {utilizzi != null && utilizzi.length > 0 && (
                  <span className="t-nota tabular-nums">
                    {utilizzi.length} {accorda(["volta", "volte"], utilizzi.length)}
                  </span>
                )}
              </div>
              {erroreUtilizzi ? (
                <p className="mt-1.5 t-nota">Non siamo riusciti a leggere gli utilizzi.</p>
              ) : utilizzi == null ? (
                <p className="mt-1.5 t-nota">Carico…</p>
              ) : utilizzi.length === 0 ? (
                <p className="mt-1.5 t-nota">Nessuno, per ora.</p>
              ) : (
                <ul className="mt-1 divide-y divide-border/40">
                  {utilizzi.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 py-2">
                      {/* Un dischetto con l'iniziale: la stessa cosa che il
                          CRM fa sulle righe degli ospiti, e basta a rendere
                          scorribile una colonna di nomi. */}
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-10 bg-veil-6 text-[11px] font-medium uppercase text-muted-foreground"
                        aria-hidden="true"
                      >
                        {u.Guest ? u.Guest.firstName.charAt(0) : "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-card-foreground">
                        {u.Guest
                          ? `${u.Guest.firstName}${u.Guest.lastName ? ` ${u.Guest.lastName}` : ""}`
                          : "Senza cliente collegato"}
                      </span>
                      {/* Quanto è stato scontato davvero, dove lo sappiamo: è
                          l'unico numero di questa colonna, e trasforma una
                          riga che diceva «chi e quando» in una che dice anche
                          «quanto è costato». Spesso non c'è — al tavolo si
                          segna il coupon, non sempre l'importo — e allora non
                          si scrive un «—» al posto suo. */}
                      {u.amountCents != null && (
                        <span className="shrink-0 text-sm tabular-nums text-card-foreground">
                          {euro(u.amountCents)}
                        </span>
                      )}
                      <span className="w-[6.5rem] shrink-0 text-right t-nota">{quando(u.redeemedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Dove si annulla, e perché non qui: l'utilizzo si toglie dal
                  tavolo, dove lo si è messo. Spostare il comando qui vorrebbe
                  dire poter disfare da marketing quello che è successo in
                  sala, senza avere davanti la prenotazione. */}
              <p className="mt-2.5 border-t border-border/50 pt-2.5 t-nota">
                Gli utilizzi si annullano dal tavolo, in Servizio.
              </p>
            </div>
          )}
        </div>

        {/* ── Comandi ────────────────────────────────────────────────── */}
        {canEdit && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3">
            {c.status === "ACTIVE" ? (
              <Button variant="subtle" size="sm" disabled={inCorso} onClick={() => onCambiaStato("PAUSED")}>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Metti in pausa
              </Button>
            ) : (
              <Button variant="subtle" size="sm" disabled={inCorso} onClick={() => onCambiaStato("ACTIVE")}>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                {c.status === "ARCHIVED" ? "Ripristina" : "Riattiva"}
              </Button>
            )}
            <Button variant="subtle" size="sm" disabled={inCorso} onClick={onDuplica}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Duplica
            </Button>
            {c.status !== "ARCHIVED" && (
              // Il più silenzioso dei tre, ed è l'unico che toglie il coupon
              // dalla vista: non può essere anche il più grosso.
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground"
                disabled={inCorso}
                onClick={() => onCambiaStato("ARCHIVED")}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archivia…
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */

type Regola = { icona: LucideIcon; valore: string; etichetta: string };

/**
 * Le regole che questo coupon ha davvero, e in una frase quelle che non ha.
 *
 * La distinzione è tutta qui: una regola **impostata** restringe l'uso del
 * coupon ed è il motivo per cui un cameriere si sente dire di no al tavolo —
 * quella si legge. Una regola **non** impostata non è un'informazione, è
 * l'assenza di una: mostrarla con lo stesso peso trasformava il pannello di un
 * coupon senza condizioni in cinque righe che dicevano «niente».
 *
 * «Per cliente» c'è sempre perché è sempre un limite vero: `maxPerGuest` vale
 * almeno 1, quindi anche il coupon più libero del locale si può usare un
 * numero finito di volte a testa.
 */
function condizioni(c: CouponView): { regole: Regola[]; assenze: string[] } {
  const regole: Regola[] = [
    {
      icona: User,
      valore: `${c.maxPerGuest} ${accorda(["volta", "volte"], c.maxPerGuest)}`,
      etichetta: "Per cliente",
    },
  ];
  const assenze: string[] = [];

  if (c.minSpendCents != null) {
    regole.push({ icona: Euro, valore: `Da ${euro(c.minSpendCents)} di conto`, etichetta: "Spesa minima" });
  } else {
    assenze.push("nessuna spesa minima");
  }

  const giorni = c.validWeekdays ?? [];
  if (giorni.length > 0) {
    const nomi = giorni
      .slice()
      .sort((a, b) => a - b)
      .map((g) => GIORNI_INTERI[g]);
    regole.push({
      icona: CalendarDays,
      valore: `Solo ${nomi.join(", ")}`,
      etichetta: "Giorni in cui vale",
    });
  } else {
    assenze.push("tutti i giorni");
  }

  const periodo = validita(c);
  if (periodo) {
    regole.push({ icona: CalendarClock, valore: periodo, etichetta: "Validità" });
  } else {
    assenze.push("senza scadenza");
  }

  if (c.guestName) {
    regole.push({ icona: UserPlus, valore: c.guestName, etichetta: "Riservato a" });
  } else {
    assenze.push("tutti gli ospiti");
  }

  return { regole, assenze };
}

/** La validità in una riga, o niente se non ce n'è una da dire. */
function validita(c: CouponView): string | null {
  const da = c.validFrom ? new Date(c.validFrom) : null;
  const a = c.validUntil ? new Date(c.validUntil) : null;
  if (da && a) return `${maiuscola(conData("da", da))} ${conData("a", a)}`;
  if (a) return `Fino ${conData("a", a)}`;
  if (da) return maiuscola(conData("da", da));
  return null;
}

function maiuscola(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function quando(iso: string | Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
