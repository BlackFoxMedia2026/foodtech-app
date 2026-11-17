import type { StaffDocumentCategory, StaffPrimaryRole, StaffTrainingKind } from "@prisma/client";
import { statoScadenza } from "@/lib/scheda-dipendente";

/**
 * I documenti che ogni persona in organico deve avere, uno per riga nella
 * sezione Documenti della scheda e al passo Documenti di «Nuova persona».
 *
 * - **Documento di identità**, **Codice fiscale**, **Scheda anagrafica
 *   professionale**: per tutti.
 * - **Permesso di soggiorno**: solo per chi non è cittadino dell'Unione
 *   europea (o dello Spazio economico europeo, o svizzero) — si decide dalla
 *   nazionalità scritta in anagrafica.
 * - **Attestato HACCP**, in corso di validità: per chi prepara, maneggia o
 *   entra in contatto con gli alimenti — cioè tutti i ruoli di sala, bar e
 *   cucina, tranne l'accoglienza. Vale anche l'attestato caricato col corso
 *   HACCP in Formazione.
 *
 * I documenti con scadenza (identità, permesso, HACCP) contano solo se non
 * sono scaduti: un permesso scaduto è un permesso da rinnovare.
 */

export type ChiaveObbligatorio = "identita" | "codice_fiscale" | "permesso" | "scheda_anagrafica" | "haccp";

export type DocumentoRichiesto = {
  chiave: ChiaveObbligatorio;
  label: string;
  descrizione: string;
  categoria: StaffDocumentCategory;
  /** Chi carica deve dire quando scade. */
  conScadenza: boolean;
};

const IDENTITA: DocumentoRichiesto = {
  chiave: "identita",
  label: "Documento di identità",
  descrizione: "Carta d'identità, passaporto o patente, fronte e retro.",
  categoria: "CARTA_IDENTITA",
  conScadenza: true,
};
const CODICE_FISCALE: DocumentoRichiesto = {
  chiave: "codice_fiscale",
  label: "Codice fiscale",
  descrizione: "Tessera sanitaria o tesserino del codice fiscale.",
  categoria: "CODICE_FISCALE",
  conScadenza: false,
};
const PERMESSO: DocumentoRichiesto = {
  chiave: "permesso",
  label: "Permesso di soggiorno",
  descrizione: "Per chi non è cittadino dell'Unione europea: valido per lavoro.",
  categoria: "PERMESSO_SOGGIORNO",
  conScadenza: true,
};
const SCHEDA_ANAGRAFICA: DocumentoRichiesto = {
  chiave: "scheda_anagrafica",
  label: "Scheda anagrafica professionale",
  descrizione: "Rilasciata dal Centro per l'impiego.",
  categoria: "SCHEDA_ANAGRAFICA",
  conScadenza: false,
};
const HACCP: DocumentoRichiesto = {
  chiave: "haccp",
  label: "Attestato HACCP",
  descrizione: "In corso di validità: norme igienico-sanitarie, per chi tocca gli alimenti.",
  categoria: "ATTESTATO_HACCP",
  conScadenza: true,
};

/*
  Le nazionalità che non chiedono il permesso: Unione europea, Spazio
  economico europeo, Svizzera, San Marino e Vaticano. Si confrontano gli
  inizi delle parole, così «Italiana», «italiano», «Italia» e «IT» passano
  tutti; «Rumena» e «Romena» pure.
*/
const SENZA_PERMESSO = [
  "ital", "austria", "belg", "bulgar", "cipr", "croat", "danes", "danimarc", "eston", "finland", "frances", "francia",
  "tedesc", "german", "grec", "grecia", "irland", "letton", "lituan", "lussemburg", "maltes", "malta", "oland",
  "paesi bassi", "neerlandes", "polac", "polon", "portog", "cec", "repubblica ceca", "slovacc", "sloven", "spagn",
  "sved", "svezia", "ungher", "rumen", "romen", "romania", "norveg", "island", "liechtenstein", "svizzer", "elvetic",
  "sammarin", "san marino", "vatican", "europe", "ue", "comunitari",
];

function normalizza(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Serve il permesso di soggiorno? Sì se la nazionalità è scritta e non è
 *  europea; con la nazionalità vuota non si chiede (si sa troppo poco). */
export function richiedePermesso(nazionalita: string | null | undefined): boolean {
  const n = normalizza(nazionalita ?? "");
  if (!n || n === "it" || n === "ita") return false;
  // «Extracomunitaria» dice da sé che il permesso serve.
  if (n.includes("extracomunitari")) return true;
  // Doppia cittadinanza («Italiana e marocchina»): basta una europea.
  const parti = n.split(/[,/;]|\se\s/).map((p) => p.trim()).filter(Boolean);
  return !parti.some((p) => {
    const parole = p.split(/\s+/);
    return SENZA_PERMESSO.some((s) =>
      s.includes(" ") ? p.includes(s) : s === "ue" ? parole.includes(s) : parole.some((w) => w.startsWith(s)),
    );
  });
}

/** Tocca gli alimenti? Tutti i ruoli di sala, bar e cucina, tranne l'accoglienza. */
export function richiedeHaccp(ruolo: StaffPrimaryRole | null | undefined): boolean {
  return ruolo !== "HOST";
}

export function documentiRichiesti(persona: {
  nationality: string | null;
  primaryRole: StaffPrimaryRole | null;
}): DocumentoRichiesto[] {
  return [
    IDENTITA,
    CODICE_FISCALE,
    ...(richiedePermesso(persona.nationality) ? [PERMESSO] : []),
    SCHEDA_ANAGRAFICA,
    ...(richiedeHaccp(persona.primaryRole) ? [HACCP] : []),
  ];
}

type DocLike = { id: string; category: StaffDocumentCategory; expiresAt: string | null; createdAt: string };
type CorsoLike = { kind: StaffTrainingKind; expiresAt: string | null; certificate: { id: string } | null };

export type EsitoRichiesto<D extends DocLike> = DocumentoRichiesto & {
  /** Il documento che lo soddisfa (il più recente), se c'è. */
  documento: D | null;
  /** L'attestato arriva da un corso HACCP in Formazione, non da qui. */
  daFormazione: boolean;
  stato: "mancante" | "scaduto" | "ok";
};

export function verificaDocumenti<D extends DocLike>(
  persona: { nationality: string | null; primaryRole: StaffPrimaryRole | null },
  documenti: D[],
  corsi: CorsoLike[] = [],
  oggi: Date = new Date(),
): EsitoRichiesto<D>[] {
  return documentiRichiesti(persona).map((r) => {
    const candidati = documenti
      .filter((d) => d.category === r.categoria)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const valido = (scade: string | null) => !r.conScadenza || !scade || statoScadenza(new Date(scade), oggi) !== "scaduto";
    const buono = candidati.find((d) => valido(d.expiresAt));
    if (buono) return { ...r, documento: buono, daFormazione: false, stato: "ok" as const };

    if (r.chiave === "haccp") {
      const corso = corsi.find((c) => c.kind === "HACCP" && c.certificate && valido(c.expiresAt));
      if (corso) return { ...r, documento: null, daFormazione: true, stato: "ok" as const };
    }
    const ultimo = candidati[0] ?? null;
    return { ...r, documento: ultimo, daFormazione: false, stato: ultimo ? ("scaduto" as const) : ("mancante" as const) };
  });
}
