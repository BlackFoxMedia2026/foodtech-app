import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { iconaGruppo } from "./icone-gruppi";

/**
 * Le Impostazioni si **leggono scorrendo**, non aprendo.
 *
 * Fino al 15 settembre ogni configurazione era un `<details>`: il valore si
 * leggeva nell'intestazione e per cambiarlo si apriva. Risolveva il problema
 * di allora — tredici schede alte tutte uguali — creandone un altro: per
 * sapere *cosa c'è dentro* una sezione bisognava aprirla, una per una, e
 * l'indice mostrava una parte sola per volta. Due gesti obbligatori prima di
 * vedere qualcosa.
 *
 * Adesso è una pagina sola che scorre, e la gerarchia la fanno tre livelli
 * dichiarati qui:
 *
 * 1. **sezione** — «Il locale»: titolo grande in serif, sottotitolo, una linea
 *    sotto. È l'ancora della barra in alto;
 * 2. **gruppo** — «Brand»: un titolo e un riquadro di righe;
 * 3. **riga** — «Nome pubblico»: nome a sinistra, valore o controllo a destra.
 *
 * Nessun box dentro box: il gruppo è **l'unico** riquadro, e le righe dentro
 * sono separate da una linea, non da un bordo ciascuna. È la ragione per cui
 * queste primitive esistono invece del markup a mano — venti righe scritte a
 * mano sono venti densità diverse alla terza modifica.
 */

/* -------------------------------------------------------------------------- */
/*  Gruppo                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Una sottosezione: «Brand», «Turni di servizio», «Raccolta punti».
 *
 * `azione` è il comando che vale per tutto il gruppo (di solito «Modifica» o
 * «Salva») e sta in alto a destra, accanto al titolo: dentro le righe
 * competerebbe con i valori.
 */
/** «Organizzazione del servizio» → `gruppo-organizzazione-del-servizio`. */
export function idGruppo(titolo: string): string {
  return (
    "gruppo-" +
    titolo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

export function GruppoImpostazioni({
  titolo,
  descrizione,
  azione,
  children,
  className,
}: {
  titolo: string;
  descrizione?: ReactNode;
  azione?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const IconaGruppo = iconaGruppo(titolo);
  return (
    /*
      La testata sta **dentro** la scheda, e non sopra.

      Prima era un titolo grigio appoggiato sul fondo della pagina con un
      riquadro di righe sotto: su una sezione con quattro gruppi si leggevano
      otto blocchi di testo tutti dello stesso peso, e niente diceva dove
      finisse una cosa e cominciasse l'altra. Era il difetto che faceva
      sembrare questa pagina «un elenco di voci».

      Con la testata dentro, ogni gruppo è **un oggetto**: si vede il suo
      inizio, la sua fine, e il comando che vale per tutto quello che contiene.
    */
    <section
      /* `data-gruppo` e l'`id` li legge il sommario nella colonna di lato
         (`sommario-sezione.tsx`): ogni gruppo compare lì da solo, senza un
         elenco scritto a mano che prima o poi diverge. */
      data-gruppo={titolo}
      id={idGruppo(titolo)}
      className={cn(
        "scroll-mt-6",
        /* Lo stesso materiale delle tessere della Panoramica (19 nov 2026):
           vetro con lo spigolo vivo in alto a sinistra. */
        "vetro card-notch overflow-hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border/50 px-4 py-4 md:px-6 md:py-5">
        {/* La cupola del gruppo: un segno per scheda, si riconosce
            scorrendo senza leggere il titolo. */}
        <span className="vetro kpi-pastiglia grid h-11 w-11 shrink-0 place-items-center rounded-full md:h-12 md:w-12">
          <IconaGruppo
            className="h-5 w-5 md:h-6 md:w-6"
            stroke="url(#trattoVetro)"
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1 self-center">
          <h3 className="t-titolo-sezione">{titolo}</h3>
          {descrizione && (
            <p className="mt-0.5 hidden max-w-2xl text-sm leading-relaxed text-muted-foreground md:block">
              {descrizione}
            </p>
          )}
        </div>
        {azione && (
          <div className="flex shrink-0 items-center gap-2">{azione}</div>
        )}
        {/* Sul telefono la frase va sotto, larga quanto la scheda: accanto
            alla cupola restava una colonna di tre parole per riga. */}
        {descrizione && (
          <p className="order-last basis-full text-[0.8125rem] leading-relaxed text-muted-foreground md:hidden">
            {descrizione}
          </p>
        )}
      </div>

      <div className="px-4 md:px-6">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Riga                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Una singola impostazione: **nome a sinistra, valore o controllo a destra**.
 *
 * Su scrivania due colonne — il nome e la sua spiegazione prendono lo spazio
 * che avanza, il controllo una colonna fissa sulla destra. Sotto `md` le due
 * colonne si impilano invece di stringersi: un `<select>` largo 90 px con
 * accanto un'etichetta a capo ogni due parole non è più denso, è solo più
 * difficile da leggere.
 *
 * `larga` toglie la colonna fissa: serve alle righe il cui controllo è esso
 * stesso una forma — la scelta fra sale e tavoli, l'elenco dei collegamenti
 * alle recensioni — che a 22rem sarebbe schiacciata.
 */
export function RigaImpostazione({
  nome,
  descrizione,
  htmlFor,
  larga = false,
  children,
  className,
}: {
  nome: ReactNode;
  descrizione?: ReactNode;
  /** Se il controllo a destra è un campo, la sua `id`: così il nome della riga
   *  è la sua etichetta e ci si clicca sopra. */
  htmlFor?: string;
  larga?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const Nome = htmlFor ? "label" : "p";

  /*
    **Nome e valore sulla stessa riga, vicini.**

    Su uno schermo da 1440 il valore stava incollato al bordo destro, a
    milletrecento pixel dal nome: l'occhio faceva un viaggio per ogni riga, e
    quaranta viaggi sono la sensazione di leggere un registro. Adesso la
    colonna del valore è larga il necessario e la coppia si legge in un colpo
    d'occhio — la larghezza della pagina la limita la pagina, non questa riga.

    E la **spiegazione va sotto entrambi**, non accanto al nome: è la parte che
    si legge la prima volta e mai più, e messa in mezzo separava il nome dal
    suo valore.
  */
  if (larga) {
    return (
      <div
        className={cn(
          "border-b border-border/60 py-3.5 last:border-b-0 md:py-4",
          className,
        )}
      >
        <div className="flex items-center gap-1.5">
          <Nome
            {...(htmlFor ? { htmlFor } : {})}
            className={cn(
              "min-w-0 text-[0.9375rem] font-medium text-foreground",
              htmlFor && "cursor-pointer",
            )}
          >
            {nome}
          </Nome>
          {descrizione && <SpiegaRiga nome={nome}>{descrizione}</SpiegaRiga>}
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-b border-border/60 py-3.5 last:border-b-0 md:py-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_10rem] items-center gap-1.5 md:flex-1">
        <Nome
          {...(htmlFor ? { htmlFor } : {})}
          className={cn(
            /* Base 10rem e non zero (`flex-1`) sul telefono: con base zero il
               nome restava sulla riga del controllo e si stringeva fino a una
               parola per riga («Come / si / divide / il / lavoro»). Con una
               base vera, quando nome e controllo non stanno insieme il
               controllo scende sotto, e il nome resta leggibile. */
            "min-w-0 text-[0.9375rem] font-medium text-foreground",
            htmlFor && "cursor-pointer",
          )}
        >
          {nome}
        </Nome>
          {descrizione && <SpiegaRiga nome={nome}>{descrizione}</SpiegaRiga>}
        </div>
        {children && (
          /* `min-w-0` e non `shrink-0`: un valore lungo — l'indirizzo del
             modulo di prenotazione — sforava il bordo della scheda sul
             telefono, perché una colonna che non si stringe non fa andare a
             capo il testo che contiene. I controlli veri (campi, pulsanti,
             tendine) hanno la loro larghezza minima e vanno a capo per conto
             loro grazie al `flex-wrap` della riga. */
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * La spiegazione di una riga, dietro una «i» (19 nov 2026).
 *
 * Stava sotto ogni riga, sempre: «la parte che si legge la prima volta e mai
 * più», ripetuta quaranta volte, ed era la ragione per cui ogni pagina delle
 * Impostazioni sembrava «tutto testo». Adesso c'è, a un tocco, come le regole
 * di Analytics: nome e valore restano soli e si leggono a colpo d'occhio.
 */
function SpiegaRiga({ nome, children }: { nome: ReactNode; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-tertiary-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground"
        aria-label="Cosa vuol dire"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 space-y-1.5 p-3.5 text-[0.8125rem] leading-relaxed text-muted-foreground"
      >
        <p className="font-semibold text-card-foreground">{nome}</p>
        <div>{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Valori                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Il valore attuale, quando non c'è niente da toccare sulla riga.
 *
 * Più basso di contrasto del nome dell'impostazione, e **non** oro: l'oro qui
 * dice stato e metadato, non «questo è il dato». Con tre valori per riga su
 * quaranta righe, tutto oro vuol dire niente oro.
 */
export function ValoreImpostazione({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  /** Cifre che si incolonnano: orari, coperti, percentuali. */
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-sm text-card-foreground/80 md:text-right",
        mono && "tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Il valore che non c'è: **si vede che manca**, non è un grigio come gli altri.
 *
 * Prima «non caricato», «non scelti» e «non configurato» erano scritti con lo
 * stesso grigio di «Locale di prova» e «Google»: su quaranta righe niente
 * distingueva le cose fatte da quelle da fare, e per saperlo bisognava leggere
 * ogni singolo valore. Adesso è un bollino con il bordo tratteggiato — la
 * forma che in questo prodotto dice «qui manca qualcosa» — e le assenze si
 * contano con un'occhiata, che è l'unica cosa per cui si entra in una pagina
 * di configurazione.
 *
 * Tratteggiato e non pieno di proposito: un bollino d'allarme su sei righe di
 * un locale nuovo trasformerebbe le impostazioni in un elenco di errori.
 */
export function ValoreVuoto({
  children = "non impostato",
}: {
  children?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[0.8125rem] text-tertiary-foreground md:text-xs">
      {children}
    </span>
  );
}

/**
 * Una riga che non è un'impostazione: la frase che riassume cosa vedrà il
 * cliente, l'esempio di calcolo, la fila «aggiungi e salva».
 *
 * Esiste per non far scrivere a mano il bordo e il respiro di una riga ogni
 * volta che dentro un gruppo serve qualcosa che non sta in due colonne — che
 * è esattamente il modo in cui, la volta scorsa, sono nate quattro spaziature
 * diverse per la stessa cosa.
 */
export function RigaLibera({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-b border-border/60 py-4 last:border-b-0 md:py-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * L'esito di un salvataggio, detto sul posto.
 *
 * Con le impostazioni tutte visibili in una pagina sola, un «Salvato.» in
 * fondo alla schermata è un «Salvato.» che non si vede: sta accanto al
 * pulsante che l'ha prodotto.
 */
export function EsitoSalvataggio({
  salvato,
  errore,
}: {
  salvato?: boolean;
  errore?: string | null;
}) {
  if (errore)
    return <span className="text-sm text-destructive-soft">{errore}</span>;
  if (salvato)
    return <span className="text-sm text-sage-strong">Salvato.</span>;
  return null;
}
