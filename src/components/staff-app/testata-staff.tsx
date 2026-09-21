import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shell/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Le testate della Staff App.
 *
 * Due sole forme, e nessuna barra fissa: lo spazio verticale su un telefono è
 * la risorsa scarsa, e una barra sempre presente che ripete il nome del
 * ristorante a chi ci sta lavorando dentro costa quarantotto pixel di sala a
 * ogni schermata.
 *
 * - `TestataSaluto` apre la Home: dice a chi sta parlando e dove;
 * - `TestataSezione` apre le altre schermate di primo livello;
 * - `TestataRitorno` apre quelle in cui si è entrati da qualche parte: un
 *   titolo e la strada per tornare.
 *
 * **Il ritorno è a sinistra ed è grande.** È l'unica azione dell'app che sta
 * in alto, e ci sta perché è quella che il pollice cerca per abitudine in ogni
 * applicazione che esiste; tutto il resto — il §35 — sta in basso.
 *
 * ## In alto a destra: l'avatar in Home, il marchio altrove
 *
 * Erano tutti e due il marchio. In Home è tornato l'**avatar della persona**,
 * e il motivo non è decorativo: quel cerchio ha sempre avuto l'aspetto di una
 * cosa da premere — è tondo, è in un angolo, è alla misura di un pollice — e
 * per mesi non era premibile. Un bersaglio che sembra un bottone e non lo è
 * costa più di un bersaglio che non c'è, perché chi prova e non ottiene
 * niente conclude che l'app non risponde.
 *
 * Adesso porta a Profilo, dove ci si aspetta che porti, e mostra la foto
 * della persona quando c'è. Il marchio resta sulle **altre** schermate di
 * primo livello, dove il suo lavoro — dire in che prodotto si è, a chi dal
 * telefono non passa mai dalla schermata d'accesso — non ha concorrenti.
 *
 * Non c'è sulle schermate di dettaglio (il tavolo aperto): lì a destra sta lo
 * **stato del tavolo**, che è un'informazione operativa e vince su un marchio
 * già visto entrando.
 */

export function TestataSaluto({
  saluto,
  locale,
  sottotitolo,
  persona,
}: {
  saluto: string;
  locale: string;
  sottotitolo?: string | null;
  /** Chi sta guardando: l'avatar a destra, e dove porta. */
  persona?: { nome: string; cognome: string; photoUrl: string | null };
}) {
  return (
    <header className="fissa flex items-center gap-3 px-5 pb-3.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="min-w-0 flex-1">
        <h1 className="sa-titolo line-clamp-2">{saluto}</h1>
        <p className="mt-1 truncate text-[0.875rem] text-muted-foreground">
          {locale}
          {sottotitolo ? ` · ${sottotitolo}` : ""}
        </p>
      </div>
      {persona ? <AvatarProfilo persona={persona} /> : <Logo className="mt-0.5" />}
    </header>
  );
}

/**
 * L'avatar, e il suo bersaglio.
 *
 * Il cerchio visibile è 44 px — la misura minima di un bersaglio, non una
 * scelta grafica — e il bordo chiaro serve a staccarlo dal fondo verde: un
 * cerchio bruno su verde scuro fa poco contrasto, e senza contorno non si
 * legge come un oggetto separato dalla pagina.
 */
function AvatarProfilo({
  persona,
}: {
  persona: { nome: string; cognome: string; photoUrl: string | null };
}) {
  const iniziali = inizialiDi(persona.nome, persona.cognome);

  return (
    <Link
      href="/staff-app/profilo"
      aria-label={`Profilo di ${persona.nome} ${persona.cognome}`}
      className="sa-tocco shrink-0 rounded-full"
    >
      {/* `Avatar` e non `next/image`: la foto di un dipendente arriva da
          dov'è stata caricata, e `images.remotePatterns` in
          `next.config.mjs` elenca un dominio solo. Il resto del prodotto
          usa già questo componente per la stessa ragione. */}
      <Avatar className="h-11 w-11 border border-border-strong">
        {persona.photoUrl && <AvatarImage src={persona.photoUrl} alt="" />}
        <AvatarFallback className="bg-surface-brown-dark font-display text-[1.0625rem] font-semibold text-cream">
          {iniziali}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

/**
 * La testata delle altre schermate di primo livello: Sala, Comande, Turni,
 * Documenti, Profilo.
 *
 * Titolo a sinistra, marchio a destra, e nient'altro: non c'è una freccia
 * indietro perché da queste schermate non si «torna» — ci si sposta con la
 * barra in basso, e una freccia che riporta alla Home sarebbe un secondo modo
 * di fare una cosa che il pollice fa già senza alzarsi.
 */
export function TestataSezione({
  titolo,
  sottotitolo,
}: {
  titolo: string;
  sottotitolo?: string | null;
}) {
  return (
    <header className="fissa flex items-start gap-3 px-5 pb-3.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="min-w-0 flex-1">
        <h1 className="sa-titolo">{titolo}</h1>
        {sottotitolo && <p className="mt-1 truncate text-[0.875rem] text-muted-foreground">{sottotitolo}</p>}
      </div>
      <Logo className="mt-1" />
    </header>
  );
}

export function TestataRitorno({
  titolo,
  sottotitolo,
  indietro,
  azione,
  tono,
}: {
  titolo: string;
  sottotitolo?: string | null;
  /** Dove torna la freccia. */
  indietro: string;
  /** Un pulsante a destra, quando la schermata ne ha uno solo e piccolo. */
  azione?: React.ReactNode;
  /** Il filo colorato sotto la testata: lo stato del tavolo, di solito. */
  tono?: "neutro" | "attesa" | "attivo" | "urgente" | "spento";
}) {
  return (
    <header
      className={cn(
        "fissa border-b px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]",
        tono === "urgente" ? "border-accent/60" : "border-border",
      )}
    >
      <div className="flex items-center gap-1">
        <Link
          href={indietro}
          aria-label="Torna indietro"
          className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-current/10"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="t-titolo-sezione truncate">{titolo}</h1>
          {sottotitolo && <p className="t-nota truncate">{sottotitolo}</p>}
        </div>
        {azione && <div className="shrink-0 pr-1">{azione}</div>}
      </div>
    </header>
  );
}

/** «Luca Scamaldo» → «LS». Una lettera sola se manca il cognome. */
export function inizialiDi(nome: string, cognome: string): string {
  return `${nome.charAt(0)}${cognome.charAt(0)}`.toUpperCase() || "?";
}
