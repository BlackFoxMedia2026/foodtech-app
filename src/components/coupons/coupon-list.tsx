"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarDays,
  Check,
  CircleSlash,
  type LucideIcon,
  Pause,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Ticket,
  TicketCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartaKpi } from "@/components/ui/carta-kpi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";
import {
  categoriaDi,
  corrisponde,
  gruppoDi,
  GRUPPI,
  type GruppoCoupon,
} from "@/lib/coupon-vista";
import { cn } from "@/lib/utils";
import type { CouponView } from "@/server/coupons";
import { CouponCard } from "@/components/coupons/coupon-card";
import { CouponDialog } from "@/components/coupons/coupon-dialog";
import { CouponPannello } from "@/components/coupons/coupon-pannello";

/**
 * I coupon del locale.
 *
 * Il difetto di prima non era il disordine: era che **tutto pesava uguale**.
 * Ogni coupon era una riga con undici informazioni della stessa dimensione e
 * dello stesso colore — nome, tipo, descrizione, valore, codice, copia, usi,
 * disponibilità, stato, pausa, archivia — e una pagina in cui niente prevale
 * è una pagina in cui l'occhio non ha un punto da cui iniziare. Con venti
 * coupon del Wi-Fi, ognuno con la sua descrizione ripetuta per intero,
 * diventava un muro di testo grigio.
 *
 * Adesso la pagina risponde a quattro domande **prima** dell'elenco:
 *
 * - quanti coupon valgono adesso (e su quanti);
 * - quanto sono stati usati, da sempre e **questo mese** — un totale alto su
 *   un codice acceso due anni fa non dice che stia funzionando oggi;
 * - quale sta girando di più;
 * - dove sta quello che sto cercando (ricerca e linguette).
 *
 * E l'elenco risponde alla quinta, una scheda per volta: vedi `CouponCard`.
 *
 * Gli archiviati arrivano dal server insieme agli altri e vivono in una
 * linguetta loro: prima restavano fuori dalla query, quindi archiviare era
 * l'unica azione del prodotto senza ritorno.
 */
export function CouponList({
  items,
  canEdit,
  adesso,
  apriNuovo = false,
  giorniIniziali = [],
}: {
  items: CouponView[];
  canEdit: boolean;
  /**
   * L'ora del server, una sola per tutta la pagina.
   *
   * Arriva da fuori invece di nascere qui con `new Date()` per due motivi: le
   * schede devono raccontare tutte lo stesso giorno, e lo stato dei coupon
   * (`stato`) è già stato deciso sul server con **quell'** orologio. Calcolare
   * «scade fra 3 giorni» con un secondo orologio, nel browser, vuol dire che
   * prima o poi una scheda dirà «Scaduto» accanto a «scade domani».
   */
  adesso: Date;
  /**
   * Il modulo «nuovo coupon» già aperto, perché lo chiede l'indirizzo.
   *
   * `?nuovo=1&giorno=2` è come ci arriva l'intento «riempire il martedì»
   * dell'hub marketing. Sta nell'indirizzo e non in uno stato del browser per
   * la stessa ragione delle viste di Analytics e delle parti delle
   * Impostazioni: si può mandare a un collega, e il tasto indietro fa quello
   * che ci si aspetta.
   */
  apriNuovo?: boolean;
  giorniIniziali?: number[];
}) {
  const router = useRouter();
  const [nuovo, setNuovo] = useState(apriNuovo && canEdit);
  const [daDuplicare, setDaDuplicare] = useState<CouponView | null>(null);
  const [apertoId, setApertoId] = useState<string | null>(null);
  const [daArchiviare, setDaArchiviare] = useState<CouponView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [gruppo, setGruppo] = useState<GruppoCoupon>("attivi");
  const [categoria, setCategoria] = useState<string | null>(null);

  /* ---------------------------------------------------------------------- */
  /*  I numeri della testata                                                */
  /* ---------------------------------------------------------------------- */

  /*
    I numeri sono su **tutti** i coupon, non su quelli filtrati: una fascia
    che cambia mentre si cerca non è un riepilogo, è un secondo elenco. Gli
    utilizzi contano anche gli archiviati, perché la storia di uno sconto non
    si cancella — è la stessa frase in fondo alla pagina, e i numeri devono
    dire quello che dice lei.
  */
  const riepilogo = useMemo(() => {
    const validi = items.filter((c) => c.stato === "usabile").length;
    const vivi = items.filter((c) => c.status !== "ARCHIVED").length;
    const usiTotali = items.reduce((n, c) => n + c.usi, 0);
    const usiMese = items.reduce((n, c) => n + c.usiMese, 0);
    const piuUsato = items.reduce<CouponView | null>(
      (max, c) => (c.usi > 0 && (max == null || c.usi > max.usi) ? c : max),
      null,
    );
    return { validi, vivi, usiTotali, usiMese, piuUsato };
  }, [items]);

  const meseCorrente = useMemo(
    () => new Intl.DateTimeFormat("it-IT", { month: "long" }).format(adesso),
    [adesso],
  );

  /* ---------------------------------------------------------------------- */
  /*  Ricerca, linguette, tipologia                                         */
  /* ---------------------------------------------------------------------- */

  const categorie = useMemo(() => {
    const viste = new Map<string, string>();
    for (const c of items) viste.set(c.category, categoriaDi(c));
    return [...viste].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [items]);

  /** Le righe che passano ricerca e tipologia, **prima** delle linguette. */
  const trovati = useMemo(
    () => items.filter((c) => corrisponde(c, q) && (categoria == null || c.category === categoria)),
    [items, q, categoria],
  );

  /*
    Le linguette contano le corrispondenze, non i totali.

    Cercare un codice e non trovarlo perché si stava guardando la linguetta
    sbagliata è il modo più veloce di far credere che la ricerca sia rotta.
    Con i conteggi sulle linguette il posto dove sta si vede senza cambiarle,
    e se dove si sta non c'è niente la pagina lo dice e offre di andarci.
  */
  const conteggi = useMemo(() => {
    const n: Record<GruppoCoupon, number> = { attivi: 0, pausa: 0, terminati: 0, archiviati: 0 };
    for (const c of trovati) n[gruppoDi(c)]++;
    return n;
  }, [trovati]);

  const visibili = useMemo(() => trovati.filter((c) => gruppoDi(c) === gruppo), [trovati, gruppo]);
  const altroveConRisultati = GRUPPI.filter((g) => g.id !== gruppo && conteggi[g.id] > 0);
  const filtrando = q.trim() !== "" || categoria != null;

  const aperto = apertoId ? (items.find((c) => c.id === apertoId) ?? null) : null;

  /* ---------------------------------------------------------------------- */
  /*  Le azioni                                                             */
  /* ---------------------------------------------------------------------- */

  async function cambiaStato(id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED") {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/coupons/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a cambiare lo stato del coupon."));
      return;
    }
    router.refresh();
  }

  /**
   * Archiviare passa da una conferma; pausa e riattiva no.
   *
   * Non è prudenza distribuita a caso: mettere in pausa si disfa con un clic
   * dalla stessa riga, archiviare toglie il coupon dalla vista — e fino a ieri
   * lo toglieva **per sempre**, perché gli archiviati non venivano nemmeno
   * caricati. Adesso si ripristinano dalla loro linguetta, ma resta l'unica
   * azione che fa sparire qualcosa, e un tocco di troppo su un tablet non deve
   * poterla fare.
   */
  function chiediArchiviazione(c: CouponView) {
    setDaArchiviare(c);
  }

  function apri(c: CouponView) {
    setApertoId(c.id);
  }

  function duplica(c: CouponView) {
    setApertoId(null);
    setDaDuplicare(c);
  }

  /* ---------------------------------------------------------------------- */

  const vuotoDelTutto = items.length === 0;

  return (
    <>
      {/*
        Niente testata.

        «Marketing / Coupon», il titolo, la frase che spiega la pagina e la
        chiamata occupavano centoventi pixel sulla scrivania e duecentotrenta
        sul telefono per dire una cosa che la barra in alto dice già: accanto
        al marchio c'è scritto **Coupon**, e la voce «Marketing» è accesa. Una
        pagina che ripete il proprio nome sotto il proprio nome spende la
        striscia più preziosa dello schermo per un'eco.

        Quello che resta della testata è la chiamata, che scende nella barra
        dei comandi: lì è ancora la cosa più chiara della riga — è l'unica
        pillola crema — e non ha più bisogno di una riga sua.

        Dove si usano i coupon è finito nella nota in fondo, insieme all'altra
        cosa che vale la pena sapere una volta sola.
      */}
      {error && (
        <p className="fissa mb-3 text-sm text-destructive-soft" role="alert">
          {error}
        </p>
      )}

      {vuotoDelTutto ? (
        <div className="fill">
          <EmptyState
            icon={Ticket}
            title="Nessun coupon"
            action={
              canEdit ? (
                <Button variant="accent" onClick={() => setNuovo(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Crea il primo
                </Button>
              ) : undefined
            }
          >
            Uno sconto di benvenuto, un omaggio di compleanno, qualcosa per chi non torna da un
            po&apos;: qui si creano i codici, e al tavolo si segnano come usati.
          </EmptyState>
        </div>
      ) : (
        /*
          La fascia dei numeri scorre con l'elenco, la barra dei comandi no.

          La regola della schermata che non si scorre parla di **comandi**
          fissi in cima, e i numeri non sono un comando: sono una lettura, e
          si leggono arrivando. Tenerli fissi costava novanta pixel di elenco
          su ogni telefono. La barra invece resta appiccicata al bordo alto
          della regione che scorre, così cercare è possibile anche a metà di
          quaranta coupon.
        */
        <div className="fill-scroll -mx-1 px-1">
          {/*
            Quattro numeri sulla scrivania, due sul telefono.

            È la stessa scelta della fascia di Servizio: sul telefono si
            portano «le tre che servono davvero», non tutte rimpicciolite.
            Quattro carte in due file mangiavano 300 px su uno schermo da 844,
            e insieme alla testata non lasciavano vedere **nessun coupon**
            senza scorrere — su una pagina il cui contenuto sono i coupon.
            Restano i due numeri che cambiano: quanti valgono adesso e quanto
            si è usato questo mese. Il totale di sempre e il primo della classe
            sono una lettura da scrivania.
          */}
          <div className="grid grid-cols-2 gap-2.5 md:gap-3.5 lg:grid-cols-4 lg:gap-4">
            <CartaKpi
              icona={Ticket}
              tono="bosco"
              valore={riepilogo.validi}
              etichetta="Validi adesso"
              nota={`su ${riepilogo.vivi} coupon`}
            />
            <CartaKpi
              className="hidden sm:flex"
              icona={TicketCheck}
              tono="petrolio"
              valore={riepilogo.usiTotali}
              etichetta="Utilizzi totali"
              nota="da sempre"
            />
            <CartaKpi
              icona={CalendarDays}
              tono="bronzo"
              valore={riepilogo.usiMese}
              etichetta="Questo mese"
              nota={meseCorrente}
            />
            <CartaKpi
              className="hidden sm:flex"
              icona={Star}
              tono="oliva"
              valore={riepilogo.piuUsato?.name ?? "—"}
              valoreCompatto
              etichetta="Il più usato"
              nota={
                riepilogo.piuUsato
                  ? `${riepilogo.piuUsato.usi} utilizzi`
                  : "nessun utilizzo, per ora"
              }
            />
          </div>

          {/* ══ La barra: ricerca, viste, tipologia, chiamata ═════════════ */}
          <div className="sticky top-0 z-10 -mx-1 mt-4 bg-background px-1 pb-2.5 pt-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/*
                La ricerca prende tutto lo spazio che avanza.

                Era capata a `max-w-xs` e lasciava mezza riga vuota fra sé e le
                linguette: un vuoto in mezzo a una barra si legge come una cosa
                che manca. Presa per intero, la barra diventa **un oggetto
                solo** da un bordo all'altro — ed è anche il campo dove si
                incolla un codice, che è lungo.
              */}
              <div className="relative min-w-[13rem] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cerca per nome o codice…"
                  aria-label="Cerca fra i coupon"
                  className="h-10 rounded-full pl-9 pr-9"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    aria-label="Svuota la ricerca"
                    className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-current/10"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Le quattro viste. Il conteggio è la risposta a «quanti ne ho
                  attivi» letta senza spostarsi. */}
              {/* Le linguette e la tipologia condividono la riga anche sul
                  telefono: mandarle a capo una per una costava due righe di
                  barra, cioè mezza scheda di coupon. Le linguette scorrono di
                  lato dentro la loro capsula, il filtro resta agganciato in
                  fondo. */}
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-card-sunken/70 p-1 lg:flex-none",
                  // Il bordo destro sfuma dove le linguette escono dalla
                  // capsula: senza, sul telefono si vede «Attivi 13» e basta,
                  // e le altre tre viste — archiviati compresi — sembrano non
                  // esistere invece che stare a un dito di scorrimento. Da
                  // `lg` non serve: ci stanno tutte.
                  "[mask-image:linear-gradient(to_right,#000_calc(100%-1.75rem),transparent)] lg:[mask-image:none]",
                )}
                role="tablist"
                aria-label="Filtra per stato"
              >
                {GRUPPI.map((g) => {
                  const scelto = g.id === gruppo;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="tab"
                      aria-selected={scelto}
                      onClick={() => setGruppo(g.id)}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        scelto
                          ? "border border-accent/55 bg-accent/20 font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {g.nome}
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          scelto ? "text-accent-strong" : "text-muted-foreground/70",
                        )}
                      >
                        {conteggi[g.id]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {categorie.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      aria-label="Filtra per tipologia"
                      className={cn(
                        "h-10 shrink-0 rounded-full border-border/70 px-3 sm:px-4",
                        categoria && "border-accent/55 bg-accent/15",
                      )}
                    >
                      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                      {/* Sul telefono resta la sola icona: la parola costava
                          gli ottanta pixel che mandavano la barra a capo. */}
                      <span className={cn("hidden sm:inline", categoria && "inline")}>
                        {categoria ? (nomeCategoria(categorie, categoria) ?? "Tipologia") : "Tipologia"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Tipologia</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setCategoria(null)}>
                      <Check
                        className={cn("h-4 w-4", categoria == null ? "opacity-100" : "opacity-0")}
                        aria-hidden="true"
                      />
                      Tutte
                    </DropdownMenuItem>
                    {categorie.map(([id, nome]) => (
                      <DropdownMenuItem key={id} onSelect={() => setCategoria(id)}>
                        <Check
                          className={cn("h-4 w-4", categoria === id ? "opacity-100" : "opacity-0")}
                          aria-hidden="true"
                        />
                        {nome}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/*
                La chiamata chiude la barra, e resta la cosa più chiara che ci
                sta dentro: è l'unica pillola crema, che in questo sistema
                significa «cosa fare» (DESIGN.md, la Regola della Chiamata
                Crema). Non le serviva una riga sua per essere la prima cosa
                che si vede.

                Sul telefono prende la riga intera invece di appendersi in
                coda alle linguette: una pillola da 165 px stretta accanto a
                una capsula che scorre è un bersaglio che si manca.
              */}
              {canEdit && (
                <Button
                  variant="accent"
                  className="h-10 w-full shrink-0 sm:ml-auto sm:w-auto"
                  onClick={() => setNuovo(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Nuovo coupon
                </Button>
              )}
            </div>
          </div>

          {/* ══ Elenco ════════════════════════════════════════════════════ */}
          {visibili.length === 0 ? (
            /*
              Tre vuoti diversi, perché sono tre situazioni diverse.

              La prima versione diceva «Quello che cerchi sta in un'altra
              vista» anche aprendo «Archiviati» senza aver cercato niente: una
              vista vuota **non** è una ricerca fallita, e rispondere a una
              domanda che nessuno ha fatto è il modo più rapido di sembrare un
              messaggio d'errore. Qui il vuoto della linguetta spiega **a cosa
              serve la linguetta**, che è l'unico momento in cui si può.
            */
            <EmptyState
              icon={filtrando ? Search : VUOTO[gruppo].icona}
              compact
              title={filtrando ? "Nessun coupon trovato qui" : VUOTO[gruppo].titolo}
              className="mt-2"
              action={
                filtrando && altroveConRisultati.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {altroveConRisultati.map((g) => (
                      <Button key={g.id} variant="subtle" size="sm" onClick={() => setGruppo(g.id)}>
                        {conteggi[g.id]} in {g.nome.toLowerCase()}
                      </Button>
                    ))}
                  </div>
                ) : filtrando ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => {
                      setQ("");
                      setCategoria(null);
                    }}
                  >
                    Togli i filtri
                  </Button>
                ) : undefined
              }
            >
              {filtrando
                ? altroveConRisultati.length > 0
                  ? "Quello che cerchi sta in un'altra vista."
                  : "Nessun coupon risponde a questa ricerca."
                : VUOTO[gruppo].spiegazione}
            </EmptyState>
          ) : (
            <ul className="mt-2 flex flex-col gap-2.5 pb-2">
              {visibili.map((c) => (
                <CouponCard
                  key={c.id}
                  c={c}
                  canEdit={canEdit}
                  adesso={adesso}
                  inCorso={busy === c.id}
                  onApri={() => apri(c)}
                  onDuplica={() => duplica(c)}
                  onCambiaStato={(status) =>
                    status === "ARCHIVED" ? chiediArchiviazione(c) : void cambiaStato(c.id, status)
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* «Si usano al tavolo» stava in testa alla pagina e occupava una riga
          anche a chi lo sapeva già. Sta qui perché è la stessa materia
          dell'altra frase — dove finisce un coupon, dove lo si usa — e perché
          è una cosa che si legge una volta sola nella vita. */}
      <p className="fissa mt-4 t-nota">
        I coupon si usano al tavolo, dalla scheda della prenotazione in Servizio. Uno archiviato non si
        usa più ma resta negli utilizzi già fatti: la storia di uno sconto non si cancella. Gli utilizzi
        si possono annullare, uno per uno, dal tavolo.
      </p>

      {/* ══ Fuori dal flusso ════════════════════════════════════════════ */}
      {aperto && (
        <CouponPannello
          c={aperto}
          canEdit={canEdit}
          inCorso={busy === aperto.id}
          onChiudi={() => setApertoId(null)}
          onDuplica={() => duplica(aperto)}
          onCambiaStato={(status) =>
            status === "ARCHIVED" ? chiediArchiviazione(aperto) : void cambiaStato(aperto.id, status)
          }
        />
      )}

      {nuovo && (
        <CouponDialog
          open
          onOpenChange={(v) => !v && setNuovo(false)}
          giorniIniziali={giorniIniziali}
        />
      )}

      {daDuplicare && (
        <CouponDialog
          // La chiave rimonta il modulo quando si duplica un secondo coupon
          // senza chiudere: i valori iniziali si leggono una volta sola.
          key={daDuplicare.id}
          open
          onOpenChange={(v) => !v && setDaDuplicare(null)}
          daDuplicare={daDuplicare}
        />
      )}

      <Dialog open={daArchiviare != null} onOpenChange={(v) => !v && setDaArchiviare(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archiviare «{daArchiviare?.name}»?</DialogTitle>
            <DialogDescription>
              Smette di valere subito, anche per chi ha già il codice. Gli utilizzi già fatti restano, e
              il coupon si ritrova nella vista «Archiviati».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDaArchiviare(null)}>
              Annulla
            </Button>
            <Button
              variant="accent"
              disabled={busy != null}
              onClick={() => {
                const c = daArchiviare;
                setDaArchiviare(null);
                if (c) void cambiaStato(c.id, "ARCHIVED");
              }}
            >
              Archivia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Il vuoto di ogni linguetta, detto per quella linguetta.
 *
 * Nessuno dei quattro è un problema da risolvere — zero coupon in pausa è una
 * buona notizia — quindi nessuno porta un pulsante. Portano invece la cosa che
 * altrove non si può dire: **a cosa serve questa vista**, letta nel solo
 * momento in cui c'è spazio per dirlo.
 */
const VUOTO: Record<GruppoCoupon, { icona: LucideIcon; titolo: string; spiegazione: string }> = {
  attivi: {
    icona: Ticket,
    titolo: "Nessun coupon attivo",
    spiegazione: "Quelli che hai sono in pausa, terminati o archiviati.",
  },
  pausa: {
    icona: Pause,
    titolo: "Nessun coupon in pausa",
    spiegazione: "Mettere in pausa sospende un coupon senza cancellarlo: il codice smette di valere e torna valido quando lo riattivi.",
  },
  terminati: {
    icona: CircleSlash,
    titolo: "Nessun coupon terminato",
    spiegazione: "Qui finiscono da soli i coupon scaduti e quelli che hanno esaurito gli utilizzi previsti.",
  },
  archiviati: {
    icona: Archive,
    titolo: "Nessun coupon archiviato",
    spiegazione: "Qui finiscono i coupon che togli dalla circolazione. Restano gli utilizzi già fatti, e da qui si possono ripristinare.",
  },
};

/** Il nome della tipologia scelta, per scriverlo sul pulsante del filtro. */
function nomeCategoria(categorie: [string, string][], id: string): string | undefined {
  return categorie.find(([k]) => k === id)?.[1];
}
