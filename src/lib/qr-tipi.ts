/**
 * Le cinque cose che un QR code può aprire.
 *
 * La pagina dei QR partiva da un campo «URL di destinazione»: una casella di
 * testo che chiede a un ristoratore di sapere a memoria l'indirizzo della
 * propria carta. Il prodotto quegli indirizzi li conosce già — il menu, la
 * prenotazione, il conto del tavolo — e l'unica cosa che non sa è **quale dei
 * cinque** si voleva stampare.
 *
 * Quindi si chiede quello, e basta: il resto lo compila il prodotto. Questo
 * catalogo è il posto dove un sesto tipo (recensione, coupon, evento, fidelity)
 * si aggiunge con una voce, senza toccare l'editor.
 */

export const TIPI_QR = ["PAY_TABLE", "MENU", "WIFI", "BOOKING", "CUSTOM"] as const;
export type TipoQr = (typeof TIPI_QR)[number];

export type SchedaTipo = {
  id: TipoQr;
  /** Il nome dell'icona in `lucide-react`, risolta dal selettore. */
  icona: "CreditCard" | "UtensilsCrossed" | "Wifi" | "CalendarCheck" | "SlidersHorizontal";
  titolo: string;
  descrizione: string;
  /**
   * Il nome che il QR ha appena nato. Non è un segnaposto: è già un nome
   * buono, e chi non vuole pensarci lo lascia com'è.
   */
  nomeSuggerito: string;
  /**
   * L'invito stampato sulla cornice. Cambia col tipo perché «Scansiona qui»
   * sotto un QR di pagamento non dice a nessuno che si sta per pagare.
   */
  invito: string;
};

export const SCHEDE_TIPO: SchedaTipo[] = [
  {
    id: "PAY_TABLE",
    icona: "CreditCard",
    titolo: "Paga al tavolo",
    descrizione:
      "Permetti ai clienti di aprire il conto del tavolo, dividerlo e pagare direttamente dal telefono.",
    nomeSuggerito: "Pagamento tavolo",
    invito: "Scansiona per pagare",
  },
  {
    id: "MENU",
    icona: "UtensilsCrossed",
    titolo: "Menù",
    descrizione: "Apri il menù digitale del locale direttamente dal telefono.",
    nomeSuggerito: "Menu al tavolo",
    invito: "Scansiona il menu",
  },
  {
    id: "WIFI",
    icona: "Wifi",
    titolo: "Wi-Fi",
    descrizione: "Permetti ai clienti di collegarsi facilmente alla rete Wi-Fi del locale.",
    nomeSuggerito: "Wi-Fi sala principale",
    invito: "Scansiona per connetterti",
  },
  {
    id: "BOOKING",
    icona: "CalendarCheck",
    titolo: "Prenota un tavolo",
    descrizione: "Porta il cliente direttamente alla pagina di prenotazione del locale.",
    nomeSuggerito: "Prenota un tavolo",
    invito: "Scansiona per prenotare",
  },
  {
    id: "CUSTOM",
    icona: "SlidersHorizontal",
    titolo: "Personalizzato",
    descrizione: "Crea un QR code collegato a un link, una pagina o una destinazione personalizzata.",
    nomeSuggerito: "Nuovo QR code",
    invito: "Scansiona qui",
  },
];

export function schedaTipo(id: TipoQr): SchedaTipo {
  return SCHEDE_TIPO.find((s) => s.id === id) ?? SCHEDE_TIPO[SCHEDE_TIPO.length - 1];
}

/** L'etichetta breve, quella che sta su un badge in elenco. */
export function etichettaTipo(id: TipoQr): string {
  return schedaTipo(id).titolo;
}

export function tipoValido(v: string | null | undefined): v is TipoQr {
  return !!v && (TIPI_QR as readonly string[]).includes(v);
}
