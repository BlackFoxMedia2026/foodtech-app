"use client";

import { Coins, Receipt, Users, Wallet } from "lucide-react";

/**
 * «Come vuoi pagare?» — quattro riquadri, due per riga.
 *
 * ## Perché una griglia e non un elenco
 *
 * Erano quattro card larghe quanto lo schermo, ognuna con titolo e due righe
 * di spiegazione. Leggibili, e lunghe: da sole occupavano mezzo telefono e
 * spingevano il conto sotto la piega. Ma quattro scelte esclusive **non sono
 * un elenco da leggere**, sono un tastierino da guardare: in una griglia 2×2
 * si prendono tutte con un colpo d'occhio e si toccano senza mirare, come le
 * azioni in cima a un'app bancaria.
 *
 * Il prezzo è la spiegazione lunga, che sparisce. Si può pagare perché i
 * titoli dicono già tutto — «Dividi», «I miei piatti», «Altro importo» — e
 * quello che serve davvero saperlo lo dice il foglio che si apre dopo, quando
 * serve. Una descrizione che nessuno rilegge alla seconda visita è spazio
 * speso una volta e sprecato per sempre.
 *
 * ## Le proporzioni
 *
 * Altezza fissa e larghezza dalla colonna: da 375 a 430 px il riquadro passa
 * da quasi quadrato a leggermente sdraiato, e va bene così. Legarla alla
 * larghezza con `aspect-ratio` sembrava più elegante e non lo era — sui
 * telefoni larghi il riquadro cresceva fino a 156 px di altezza, e mettergli
 * un tetto stringeva anche la larghezza, staccando le tile dal bordo proprio
 * dove c'era più spazio.
 *
 * L'icona sta in alto, il titolo in basso, e in mezzo c'è l'aria che rende un
 * riquadro un bersaglio invece che un bottone.
 *
 * ## La riga sotto il titolo
 *
 * Una sola, corta, e c'è su tutti e quattro. Non è la descrizione di prima
 * rimessa dentro dalla finestra: «Dividi» e «Altro importo» da soli sono due
 * parole che si capiscono solo se si è già capito il resto, e su «Paga tutto»
 * quella riga porta la cifra — chi vuole solo saldare non deve risalire con
 * l'occhio al saldo per sapere cosa sta per confermare.
 *
 * Averla su tutti serve anche all'occhio: con tre riquadri su quattro a una
 * riga e uno a due, i titoli si allineano su due altezze diverse e la griglia
 * si legge storta.
 *
 * ## «Paga tutto» è crema
 *
 * Non è gusto: è la strada che prende la maggior parte delle persone, e in
 * quattro riquadri identici si perderebbe.
 *
 * I titoli stanno tutti su una riga anche a 375 px, ed è un vincolo, non un
 * caso: sono bottom-allineati, quindi basta che uno vada a capo perché il suo
 * titolo si alzi di una riga e la griglia si legga storta.
 *
 * «I miei piatti» sparisce quando non resta niente da selezionare: allora
 * «Paga tutto» prende tutta la riga, che è comunque la cosa giusta da fare.
 */
export function SceltaModalita({
  residuoCents,
  euro,
  haRighe,
  onScegli,
}: {
  residuoCents: number;
  euro: (c: number) => string;
  haRighe: boolean;
  onScegli: (modo: "tutto" | "quota" | "righe" | "importo") => void;
}) {
  return (
    <section aria-labelledby="modalita" className="space-y-3">
      <h2 id="modalita" className="text-display text-[20px] leading-none">
        Come vuoi pagare?
      </h2>

      <div className="grid grid-cols-2 gap-2.5">
        <Riquadro
          primario
          largo={!haRighe}
          icona={<Wallet className="h-[26px] w-[26px]" aria-hidden="true" />}
          titolo="Paga tutto"
          nota={euro(residuoCents)}
          aria={`Paga tutto: ${euro(residuoCents)}`}
          onClick={() => onScegli("tutto")}
        />
        <Riquadro
          icona={<Users className="h-[26px] w-[26px]" aria-hidden="true" />}
          titolo="Dividi"
          nota="in parti uguali"
          aria="Dividi il conto in parti uguali"
          onClick={() => onScegli("quota")}
        />
        {haRighe && (
          <Riquadro
            icona={<Receipt className="h-[26px] w-[26px]" aria-hidden="true" />}
            titolo="I miei piatti"
            nota="piatti e bevande"
            aria="Paga i piatti e le bevande che hai ordinato"
            onClick={() => onScegli("righe")}
          />
        )}
        <Riquadro
          icona={<Coins className="h-[26px] w-[26px]" aria-hidden="true" />}
          titolo="Altro importo"
          nota="decidi tu quanto"
          aria="Scegli tu quanto pagare"
          onClick={() => onScegli("importo")}
        />
      </div>
    </section>
  );
}

function Riquadro({
  icona,
  titolo,
  nota,
  aria,
  onClick,
  primario = false,
  largo = false,
}: {
  icona: React.ReactNode;
  titolo: string;
  nota: string;
  aria: string;
  onClick: () => void;
  primario?: boolean;
  largo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className={[
        "flex flex-col justify-between rounded-[22px] p-4 text-left",
        // Il minimo in pixel copre il caso largo, dove l'aspetto quadrato
        // darebbe un riquadro alto il doppio degli altri.
        // Altezza fissa, non proporzionale alla larghezza: con `aspect-ratio`
        // il riquadro arrivava a 156 px sui telefoni larghi — mezzo pollice in
        // più che non si legge meglio, si scorre soltanto di più. E vincolarne
        // l'altezza per rimediare stringeva anche la larghezza, lasciando le
        // tile staccate dal bordo proprio dove c'era più spazio.
        largo ? "col-span-2 min-h-[104px]" : "h-[128px]",
        "transition duration-200 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        primario
          ? "bg-cream text-clay-ink shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:brightness-105"
          : "surface hover:border-accent/40",
      ].join(" ")}
    >
      <span className={primario ? "text-accent-strong-ink" : "text-accent-strong"}>{icona}</span>
      <span className="mt-3 block">
        <span className="block text-[18px] font-semibold leading-tight">{titolo}</span>
        <span
          className={`mt-0.5 block text-[13px] leading-tight ${
            primario ? "tabular-nums text-clay-ink-soft" : "text-muted-foreground"
          }`}
        >
          {nota}
        </span>
      </span>
    </button>
  );
}
