import { Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Il portale come lo vedrà il cliente, dentro la sagoma di un telefono.
 *
 * **È un'immagine, non un modulo.** Niente `<input>` e niente `<button>`: un
 * campo vero qui dentro finirebbe nell'ordine di tabulazione, si potrebbe
 * compilare, e su un telefono aprirebbe la tastiera per scrivere in una
 * schermata che non manda niente da nessuna parte. Per chi legge con la voce
 * l'anteprima è una descrizione (`aria-hidden` sulla scena, il riassunto
 * sotto), perché leggere ad alta voce un finto modulo sarebbe peggio che non
 * leggerlo.
 *
 * Quello che si vede qui è **esattamente** ciò che compone
 * `wifi-portal-form.tsx`: stessi campi, stesso ordine, stesse due spunte
 * separate. Se là cambia qualcosa, qui va cambiato, altrimenti l'anteprima
 * diventa la bugia più facile da credere di tutta la pagina.
 */
export type DatiAnteprima = {
  venueName: string;
  logoUrl: string | null;
  accent: string | null;
  welcome: string | null;
  legal: string | null;
  chiediEmail: boolean;
  chiediTelefono: boolean;
  chiediMarketing: boolean;
  conCoupon: boolean;
};

const BENVENUTO_PREDEFINITO = "Lascia i tuoi dati e ricevi subito la password della rete.";

function Campo({ etichetta, esempio }: { etichetta: string; esempio: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wider text-cream/55">{etichetta}</p>
      <div className="rounded-md border border-cream/15 bg-black/20 px-2.5 py-2 text-[11px] text-cream/40">
        {esempio}
      </div>
    </div>
  );
}

function Spunta({ testo, nota }: { testo: string; nota?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-px h-3.5 w-3.5 shrink-0 rounded-[3px] border border-cream/30" />
      <div className="min-w-0">
        <p className="text-[11px] leading-snug text-cream/80">{testo}</p>
        {nota && <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-cream/45">{nota}</p>}
      </div>
    </div>
  );
}

export function AnteprimaPortale({ dati, className }: { dati: DatiAnteprima; className?: string }) {
  const accento = dati.accent ?? undefined;
  const benvenuto = dati.welcome?.trim() || BENVENUTO_PREDEFINITO;
  // «il nome, l'email e il telefono»: l'ultima congiunzione è «e», le altre
  // sono virgole. Un elenco letto ad alta voce come «nome e email e telefono»
  // suona come un errore, ed è l'unica versione che certe persone sentono.
  const chiesti = ["il nome", dati.chiediEmail && "l'email", dati.chiediTelefono && "il telefono"].filter(
    Boolean,
  ) as string[];
  const elenco =
    chiesti.length > 1 ? `${chiesti.slice(0, -1).join(", ")} e ${chiesti.at(-1)}` : chiesti[0];

  return (
    <figure className={cn("mx-auto w-full max-w-[280px]", className)}>
      {/* La sagoma: cornice spessa, angoli da telefono, e il tacchino in alto.
          Serve a dire «questa è un'altra schermata, non un pezzo della
          pagina» — senza, l'anteprima si legge come un altro riquadro di
          impostazioni. */}
      <div
        className="rounded-[28px] border-[6px] border-black/50 bg-forest shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
        aria-hidden="true"
      >
        <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-b from-[#163c2f] to-[#102c1f] px-4 pb-5 pt-6">
          <span className="absolute left-1/2 top-2 h-1 w-12 -translate-x-1/2 rounded-full bg-black/40" />

          <div className="space-y-3 text-center">
            {dati.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dati.logoUrl} alt="" className="mx-auto h-9 w-auto object-contain" />
            ) : (
              <Wifi className="mx-auto h-7 w-7" style={{ color: accento ?? "#E2B383" }} />
            )}
            <p className="text-display text-base leading-tight text-cream">{dati.venueName}</p>
            <p className="line-clamp-3 text-[11px] leading-snug text-cream/65">{benvenuto}</p>
          </div>

          <div className="mt-4 space-y-2.5">
            <Campo etichetta="Come ti chiami" esempio="Nome e cognome" />
            {dati.chiediEmail && <Campo etichetta="Email" esempio="nome@esempio.it" />}
            {dati.chiediTelefono && <Campo etichetta="Telefono" esempio="340 1234567" />}
          </div>

          <div className="mt-3 space-y-2">
            <Spunta testo="Ho letto l'informativa sul trattamento dei dati." nota={dati.legal ?? undefined} />
            {dati.chiediMarketing && (
              <Spunta testo={`Voglio ricevere le novità di ${dati.venueName}.`} nota="Facoltativo." />
            )}
          </div>

          <div
            className="mt-4 rounded-md py-2 text-center text-[11px] font-medium"
            style={{ backgroundColor: accento ?? "#F2E7D0", color: "#2F1F11" }}
          >
            {dati.conCoupon ? "Collegati e prendi lo sconto" : "Collegati"}
          </div>
        </div>
      </div>

      <figcaption className="mt-2.5 text-center t-nota">
        Anteprima del portale: {dati.venueName} chiede {elenco}
        {dati.chiediMarketing ? ", con la spunta facoltativa per il marketing" : ""}.
      </figcaption>
    </figure>
  );
}
