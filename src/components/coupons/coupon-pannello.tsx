"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  Cake,
  CalendarClock,
  CalendarDays,
  Check,
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { accorda } from "@/lib/accordo";
import { categoriaDi, conData, euro, GIORNI_INTERI, misuraCodice, statoDi } from "@/lib/coupon-vista";
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

  const regole = condizioni(c);

  return (
    <Sheet open modal={false} onOpenChange={(v) => !v && onChiudi()}>
      {/*
        Il pannello **galleggia**, non è incollato ai bordi: è la scheda di un
        coupon, un foglio appoggiato sopra l'elenco. Solo da `md`: sul telefono
        la parete piena è la cosa giusta.
      */}
      <SheetContent className="w-[34rem] md:bottom-4 md:right-4 md:top-20 md:rounded-xl md:border-r md:border-t">
        {/* ── Testata: chi è, e vale? ─────────────────────────────────── */}
        <div className="shrink-0 px-6 pb-4 pt-5">
          <div className="flex items-start gap-3.5">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_14px_-6px_rgba(16,32,26,0.5)]"
              aria-hidden="true"
            >
              <Icona className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[0.6875rem] font-medium uppercase leading-none tracking-[0.14em] text-tertiary-foreground">
                {categoriaDi(c)}
              </p>
              <SheetTitle className="mt-1.5 text-display text-xl leading-tight text-card-foreground">
                {c.name}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Scheda del coupon {c.name}, codice {c.code}.
              </SheetDescription>
            </div>
            <Badge tone={stato.tono} className="mt-0.5 shrink-0 gap-1.5 whitespace-nowrap">
              <i
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  stato.concluso ? "shadow-[inset_0_0_0_1.5px_currentColor]" : "bg-current",
                )}
                aria-hidden="true"
              />
              {stato.testo}
            </Badge>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="-mr-2 -mt-1 h-8 w-8 shrink-0"
              aria-label="Chiudi la scheda del coupon"
              onClick={onChiudi}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {/* Il perché, per esteso: nell'elenco sta in un suggerimento, e un
              suggerimento non si legge con un dito su un tablet. */}
          {c.stato !== "usabile" && (
            <p className="mt-3 rounded-lg bg-veil-6 px-3 py-2 text-sm text-muted-foreground">
              {MOTIVO_NON_VALIDO[c.stato as keyof typeof MOTIVO_NON_VALIDO]}
            </p>
          )}
        </div>

        <div className="fill-scroll space-y-5 px-6 pb-6 pt-1">
          {/* ── Il biglietto: cosa dà, e il codice da staccare ───────────── */}
          {/*
            Lo stesso oggetto della scheda nell'elenco, nello stesso verso: a
            sinistra cosa offre il coupon, oltre la perforazione la matrice col
            codice, che si clicca tutta per copiarlo. In piedi era alto 190 px
            per due righe di testo.
          */}
          <div className="biglietto-orizzontale flex min-h-[4.75rem]">
            <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-3.5">
              <p className="text-[0.6875rem] font-medium uppercase leading-none tracking-[0.14em] text-tertiary-foreground">
                Cosa dà
              </p>
              <p className="mt-1.5 text-[0.9375rem] font-semibold leading-snug text-accent-strong">
                {c.descrizione}
              </p>
            </div>
            <Matrice codice={c.code} />
          </div>

          {/* ── Quanto gira: tre numeri in una fascia ─────────────────────── */}
          {/*
            Una fascia sola con tre letture, non due caselle gemelle: sono i
            numeri della testata della pagina letti su un coupon solo, e
            separati da un filo si leggono come una riga di cruscotto.
          */}
          <div className="grid grid-cols-3 divide-x divide-border/60 rounded-2xl border border-border/70 bg-veil-4">
            <Numero
              valore={
                <>
                  {c.usi}
                  {conTetto && (
                    <span className="text-base font-normal text-muted-foreground"> / {c.maxRedemptions}</span>
                  )}
                </>
              }
              etichetta={accorda(["Utilizzo", "Utilizzi"], c.usi)}
              nota={
                conTetto ? `${c.restanti} ${accorda(["rimasto", "rimasti"], c.restanti ?? 0)}` : "senza tetto"
              }
            >
              {conTetto && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-veil-10" aria-hidden="true">
                  <div
                    className={cn("h-full rounded-full", quota >= 100 ? "bg-accent" : "bg-sage")}
                    style={{ width: `${quota}%` }}
                  />
                </div>
              )}
            </Numero>
            <Numero valore={c.usiMese} etichetta="Questo mese" nota={meseCorrente()} />
            <Numero
              valore={c.ultimoUso ? giorno(c.ultimoUso) : "—"}
              etichetta="Ultimo uso"
              nota={c.ultimoUso ? ora(c.ultimoUso) : "mai usato"}
              compatto
            />
          </div>

          {/* ── Quando vale ───────────────────────────────────────────────── */}
          {/*
            Un elenco solo, compatto: l'etichetta a sinistra, il valore a
            destra. Le regole che esistono hanno l'icona verde e il valore
            scuro, perché sono il motivo per cui al tavolo si dice di no;
            quelle che non esistono restano in grigio sulla stessa riga, così
            il blocco ha la stessa forma da un coupon all'altro.
          */}
          <section>
            <h3 className="t-etichetta mb-2.5">Quando vale</h3>
            <ul className="divide-y divide-border/40 rounded-2xl border border-border/70 bg-veil-4 px-4">
              {regole.map((r) => (
                <li key={r.etichetta} className="flex items-center gap-3 py-2.5">
                  <r.icona
                    className={cn(
                      "h-4 w-4 shrink-0",
                      r.attiva ? "text-primary" : "text-tertiary-foreground/70",
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-sm text-muted-foreground">{r.etichetta}</span>
                  <span
                    className={cn(
                      "text-right text-sm",
                      r.attiva ? "font-semibold text-card-foreground" : "text-tertiary-foreground",
                    )}
                  >
                    {r.valore}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Note per il personale ─────────────────────────────────────── */}
          {/* Un biglietto scritto a mano dal locale: citato, con il filo d'oro
              a sinistra, non un'altra sezione in maiuscoletto. */}
          {c.description && (
            <section>
              <h3 className="t-etichetta mb-2.5">Note per il personale</h3>
              <blockquote className="border-l-2 border-[#c9a96a] py-0.5 pl-4 text-[0.9375rem] leading-relaxed text-card-foreground">
                <p className="whitespace-pre-line">{c.description}</p>
              </blockquote>
            </section>
          )}

          {/* ── Cosa è successo ───────────────────────────────────────────── */}
          {canEdit && (
            <section>
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h3 className="t-etichetta">Ultimi utilizzi</h3>
                {utilizzi != null && utilizzi.length > 0 && (
                  <span className="t-nota tabular-nums">
                    {utilizzi.length} {accorda(["volta", "volte"], utilizzi.length)}
                  </span>
                )}
              </div>
              <div className="rounded-2xl border border-border/70 bg-veil-4 px-4">
                {erroreUtilizzi ? (
                  <p className="py-4 t-nota">Non siamo riusciti a leggere gli utilizzi.</p>
                ) : utilizzi == null ? (
                  <p className="py-4 t-nota">Carico…</p>
                ) : utilizzi.length === 0 ? (
                  <p className="py-4 t-nota">Nessuno, per ora.</p>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {utilizzi.map((u) => (
                      <li key={u.id} className="flex items-center gap-3 py-2.5">
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#c9a96a]/20 text-xs font-semibold uppercase text-accent-strong"
                          aria-hidden="true"
                        >
                          {u.Guest ? iniziali(u.Guest.firstName, u.Guest.lastName) : "—"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-card-foreground">
                            {u.Guest
                              ? `${u.Guest.firstName}${u.Guest.lastName ? ` ${u.Guest.lastName}` : ""}`
                              : "Senza cliente collegato"}
                          </span>
                          <span className="block text-xs text-tertiary-foreground">
                            {quando(u.redeemedAt)}
                          </span>
                        </span>
                        {/* Quanto è stato scontato davvero, dove lo sappiamo:
                            al tavolo si segna il coupon, non sempre l'importo. */}
                        {u.amountCents != null && (
                          <span className="shrink-0 text-sm font-medium tabular-nums text-card-foreground">
                            {euro(u.amountCents)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* L'utilizzo si toglie dal tavolo, dove lo si è messo. */}
              <p className="mt-2 t-nota">Gli utilizzi si annullano dal tavolo, in Servizio.</p>
            </section>
          )}
        </div>

        {/* ── Comandi ────────────────────────────────────────────────── */}
        {/*
          Due pillole alla pari e un tondo. Pausa e Duplica sono le due cose
          che si fanno davvero da qui; Archivia toglie il coupon dalla vista,
          quindi è il più piccolo, e solo al passaggio prende il colore
          dell'avvertimento.
        */}
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-6 py-4">
            {c.status === "ACTIVE" ? (
              <Button
                variant="ghost"
                disabled={inCorso}
                onClick={() => onCambiaStato("PAUSED")}
                className="pillola-comando h-11 flex-1 rounded-full"
              >
                <Pause className="h-4 w-4" aria-hidden="true" /> Metti in pausa
              </Button>
            ) : (
              <Button
                disabled={inCorso}
                onClick={() => onCambiaStato("ACTIVE")}
                className="h-11 flex-1 rounded-full font-medium shadow-[0_4px_10px_-4px_rgba(16,32,26,0.45)]"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {c.status === "ARCHIVED" ? "Ripristina" : "Riattiva"}
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={inCorso}
              onClick={onDuplica}
              className="pillola-comando h-11 flex-1 rounded-full"
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Duplica
            </Button>
            {c.status !== "ARCHIVED" && (
              <Button
                variant="ghost"
                size="icon"
                disabled={inCorso}
                onClick={() => onCambiaStato("ARCHIVED")}
                aria-label="Archivia il coupon"
                title="Archivia"
                className="pillola-comando h-11 w-11 shrink-0 rounded-full !text-muted-foreground hover:!border-destructive/50 hover:!text-destructive"
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Una lettura della fascia dei numeri. */
function Numero({
  valore,
  etichetta,
  nota,
  compatto = false,
  children,
}: {
  valore: React.ReactNode;
  etichetta: string;
  nota: string;
  compatto?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <p className="text-[0.6875rem] font-medium uppercase leading-none tracking-[0.12em] text-tertiary-foreground">
        {etichetta}
      </p>
      <p
        className={cn(
          "mt-2 truncate font-semibold leading-none tabular-nums text-card-foreground",
          compatto ? "text-lg" : "text-2xl",
        )}
      >
        {valore}
      </p>
      {children}
      <p className="mt-1.5 truncate text-xs text-tertiary-foreground">{nota}</p>
    </div>
  );
}

/**
 * La matrice del biglietto: il codice, grande, e tutta si clicca per copiarlo.
 * Il riscontro sta nell'etichetta, e in un'area annunciata per chi non vede.
 */
function Matrice({ codice }: { codice: string }) {
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    try {
      await navigator.clipboard.writeText(codice);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1800);
    } catch {
      // Appunti negati: il codice resta lì, da leggere e selezionare.
    }
  }

  return (
    <button
      type="button"
      onClick={copia}
      aria-label={`Copia il codice ${codice}`}
      className="biglietto-matrice group relative flex w-[var(--matrice)] shrink-0 flex-col justify-center py-3.5 pl-5 pr-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {/* La perforazione, da una tacca all'altra. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-[calc(var(--tacca)+5px)] left-0 w-[2px] -translate-x-1/2 bg-[radial-gradient(circle,currentColor_1px,transparent_1.4px)] bg-[length:2px_7px] bg-repeat-y text-[#b3a07a]"
      />
      {/*
        Il simbolo della copia sta sulla riga dell'etichetta, in alto a
        destra: accanto al codice gli rubava larghezza e ci finiva addosso.
        Così il codice ha tutta la matrice per sé.
      */}
      <span className="flex items-center justify-between gap-2 text-[0.6875rem] font-medium uppercase leading-none tracking-[0.14em]">
        {copiato ? (
          <span className="text-sage">Copiato</span>
        ) : (
          <span className="text-tertiary-foreground">Codice</span>
        )}
        {copiato ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-sage" aria-hidden="true" />
        ) : (
          <Copy
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
            aria-hidden="true"
          />
        )}
      </span>
      <span
        className="mt-2 block whitespace-nowrap font-mono font-medium leading-tight tracking-[0.06em] text-primary"
        style={{ fontSize: misuraCodice(codice, 190, 15) }}
      >
        {codice}
      </span>
      <span className="sr-only" aria-live="polite">
        {copiato ? "Codice copiato" : ""}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */

type Regola = {
  icona: LucideIcon;
  etichetta: string;
  valore: string;
  attiva: boolean;
};

/**
 * Le cinque regole di un coupon, sempre nello stesso ordine.
 *
 * `attiva` distingue una regola **impostata** (restringe l'uso: è il motivo
 * per cui al tavolo si dice di no) da una che non c'è. Le seconde restano in
 * elenco ma in grigio: il blocco ha la stessa forma su ogni coupon, e l'occhio
 * trova la riga che cerca sempre allo stesso posto.
 *
 * «Per cliente» è sempre attiva: `maxPerGuest` vale almeno 1.
 */
function condizioni(c: CouponView): Regola[] {
  const giorni = c.validWeekdays ?? [];
  const periodo = validita(c);
  return [
    {
      icona: User,
      etichetta: "Per cliente",
      valore: `${c.maxPerGuest} ${accorda(["volta", "volte"], c.maxPerGuest)}`,
      attiva: true,
    },
    {
      icona: Euro,
      etichetta: "Spesa minima",
      valore: c.minSpendCents != null ? `da ${euro(c.minSpendCents)}` : "nessuna",
      attiva: c.minSpendCents != null,
    },
    {
      icona: CalendarDays,
      etichetta: "Giorni",
      valore:
        giorni.length > 0
          ? `solo ${giorni
              .slice()
              .sort((a, b) => a - b)
              .map((g) => GIORNI_INTERI[g])
              .join(", ")}`
          : "tutti",
      attiva: giorni.length > 0,
    },
    {
      icona: CalendarClock,
      etichetta: "Validità",
      valore: periodo ?? "senza scadenza",
      attiva: periodo != null,
    },
    {
      icona: UserPlus,
      etichetta: "Riservato a",
      valore: c.guestName ?? "tutti gli ospiti",
      attiva: c.guestName != null,
    },
  ];
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

function iniziali(nome: string, cognome: string | null): string {
  return `${nome.charAt(0)}${cognome?.charAt(0) ?? ""}`;
}

function giorno(iso: string | Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function ora(iso: string | Date): string {
  return `alle ${new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))}`;
}

function meseCorrente(): string {
  return new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date());
}

function quando(iso: string | Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
