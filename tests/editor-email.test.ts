import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_SETTINGS,
  parseEmailDocument,
  withUnsubscribeBlock,
  type Block,
  type EmailDocument,
} from "@/lib/campaign-blocks";
import { compileCampaignContent, compileEmailDocument } from "@/lib/campaign-blocks-compiler";
import { sanitizeRichText } from "@/lib/campaign-rich-text";
import {
  createColumnsBlock,
  insertBlock,
  moveBlock,
  removeBlock,
  setBlockStyle,
  upgradeLegacyBlocks,
} from "@/lib/campaign-document-ops";

/**
 * L'editor visuale ha cambiato la forma di `Campaign.contentBlocks`: prima un
 * array di blocchi, ora un documento con dentro anche le impostazioni. Le
 * campagne salvate prima esistono, e questo file esiste per loro.
 */

const CAMPAGNA_VECCHIA: Block[] = [
  { id: "1", type: "logo", imageUrl: "https://esempio.it/logo.png", align: "center" },
  { id: "2", type: "title", text: "Ci sei mancato", align: "center" },
  { id: "3", type: "text", text: "Ciao {{FIRSTNAME}},\n\nti aspettiamo." },
  { id: "4", type: "button_cta", label: "Prenota ora", url: "{{BOOKING_LINK}}", align: "center" },
  { id: "5", type: "unsubscribe_link", text: "Disiscriviti" },
];

function doc(blocks: Block[]): EmailDocument {
  return { version: 2, settings: { ...DEFAULT_EMAIL_SETTINGS }, blocks };
}

describe("compatibilità con le campagne già salvate", () => {
  it("legge un array piatto come documento completo", () => {
    const parsed = parseEmailDocument(CAMPAGNA_VECCHIA);
    expect(parsed.blocks).toHaveLength(5);
    expect(parsed.settings).toEqual(DEFAULT_EMAIL_SETTINGS);
  });

  it("legge il documento nuovo conservando le impostazioni", () => {
    const parsed = parseEmailDocument({
      version: 2,
      settings: { ...DEFAULT_EMAIL_SETTINGS, contentWidth: 680 },
      blocks: CAMPAGNA_VECCHIA,
    });
    expect(parsed.settings.contentWidth).toBe(680);
  });

  it("non si rompe su un contenuto assente o inatteso", () => {
    expect(parseEmailDocument(null).blocks).toEqual([]);
    expect(parseEmailDocument("qualcosa").blocks).toEqual([]);
  });

  it("compila una campagna vecchia senza perdere niente", () => {
    const html = compileCampaignContent(CAMPAGNA_VECCHIA);
    expect(html).toContain("Ci sei mancato");
    expect(html).toContain("Ciao {{FIRSTNAME}}");
    expect(html).toContain("Prenota ora");
    expect(html).toContain('href="{{BOOKING_LINK}}"');
    // Il token di disiscrizione resta letterale: lo risolve l'invio.
    expect(html).toContain('href="{{UNSUBSCRIBE_LINK}}"');
  });

  it("resta HTML da email: tabelle e stili in linea, nessuna classe di layout", () => {
    const html = compileCampaignContent(CAMPAGNA_VECCHIA);
    expect(html).toContain("<table");
    expect(html).toContain('role="presentation"');
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("class=\"grid");
  });
});

describe("stile e impostazioni finiscono nell'email", () => {
  it("applica la spaziatura scelta al posto di quella predefinita", () => {
    const base = doc([{ id: "t", type: "text", text: "ciao" }]);
    const conStile = setBlockStyle(base, "t", { paddingTop: 40, paddingBottom: 40 });
    expect(compileEmailDocument(conStile)).toContain("padding:40px 24px 40px 24px");
  });

  it("rispetta larghezza e colori del documento", () => {
    const html = compileEmailDocument({
      version: 2,
      settings: { ...DEFAULT_EMAIL_SETTINGS, contentWidth: 680, emailBackground: "#fffaf0" },
      blocks: [],
    });
    expect(html).toContain("width:680px");
    expect(html).toContain("background-color:#fffaf0");
  });

  it("scarta un colore che non è un colore", () => {
    const base = setBlockStyle(doc([{ id: "t", type: "text", text: "ciao" }]), "t", {
      color: "red; background:url(javascript:alert(1))",
    });
    const html = compileEmailDocument(base);
    expect(html).not.toContain("javascript:");
  });

  it("le colonne diventano celle con le proporzioni giuste", () => {
    const riga = createColumnsBlock("30-70");
    const conTesto = insertBlock(doc([riga]), { id: "x", type: "text", text: "dentro" }, {
      kind: "column",
      rowId: riga.id,
      col: 1,
      index: 0,
    });
    const html = compileEmailDocument(conTesto);
    expect(html).toContain('width="30%"');
    expect(html).toContain('width="70%"');
    expect(html).toContain("dentro");
    // Su telefono le colonne si impilano.
    expect(html).toContain("@media only screen and (max-width:620px)");
  });
});

describe("il testo formattato non porta dentro ciò che non deve", () => {
  it("tiene la formattazione ammessa", () => {
    expect(sanitizeRichText("<p>Ciao <b>Mario</b> e <em>famiglia</em></p>")).toBe(
      "<p>Ciao <b>Mario</b> e <em>famiglia</em></p>"
    );
  });

  it("butta gli script e gli attributi che eseguono codice", () => {
    const sporco = '<p onclick="rubaTutto()">ciao</p><script>alert(1)</script><img src=x onerror="alert(1)">';
    const pulito = sanitizeRichText(sporco);
    expect(pulito).not.toContain("onclick");
    expect(pulito).not.toContain("onerror");
    expect(pulito).not.toContain("<script");
    expect(pulito).toContain("ciao");
  });

  it("rifiuta un link che non porta a un indirizzo", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">qui</a>')).toBe("<a>qui</a>");
    expect(sanitizeRichText('<a href="https://tavolo.it">qui</a>')).toContain('href="https://tavolo.it"');
    expect(sanitizeRichText('<a href="{{BOOKING_LINK}}">qui</a>')).toContain('href="{{BOOKING_LINK}}"');
  });

  it("tiene solo le proprietà CSS che un client email legge", () => {
    const pulito = sanitizeRichText('<span style="color:#ff0000;position:fixed;behavior:url(x)">ciao</span>');
    expect(pulito).toContain("color:#ff0000");
    expect(pulito).not.toContain("position");
    expect(pulito).not.toContain("behavior");
  });

  it("chiude i tag lasciati aperti invece di sputare marcatura rotta", () => {
    expect(sanitizeRichText("<b>grassetto")).toBe("<b>grassetto</b>");
    expect(sanitizeRichText("testo</b>")).toBe("testo");
  });

  it("il testo formattato arriva nell'email compilata", () => {
    const html = compileEmailDocument(
      doc([{ id: "t", type: "text", text: "Ciao Mario", html: "<p>Ciao <b>Mario</b></p>" }])
    );
    expect(html).toContain("<b>Mario</b>");
  });
});

describe("le operazioni sul documento", () => {
  it("sposta un blocco di una posizione in giù", () => {
    const base = doc([
      { id: "a", type: "divider" },
      { id: "b", type: "divider" },
      { id: "c", type: "divider" },
    ]);
    // Trascinare "a" nello spazio fra "b" e "c" significa indice 2.
    const dopo = moveBlock(base, "a", { kind: "root", index: 2 });
    expect(dopo.blocks.map((b) => b.id)).toEqual(["b", "a", "c"]);
  });

  it("non lascia cancellare il piè di pagina obbligatorio", () => {
    const base = doc(CAMPAGNA_VECCHIA);
    expect(removeBlock(base, "5").blocks).toHaveLength(5);
    expect(removeBlock(base, "2").blocks).toHaveLength(4);
  });

  it("non infila dentro una colonna un blocco che non ci sta", () => {
    const riga = createColumnsBlock("50-50");
    const base = doc([riga]);
    const dopo = insertBlock(base, { id: "c", type: "coupon", code: "X", title: "T", description: "D" }, {
      kind: "column",
      rowId: riga.id,
      col: 0,
      index: 0,
    });
    expect(dopo).toBe(base);
  });

  it("trasforma la vecchia riga a due colonne in una riga modificabile", () => {
    const vecchia: Block[] = [
      {
        id: "r",
        type: "two_columns",
        left: [{ id: "l1", type: "text", text: "sinistra" }],
        right: [{ id: "r1", type: "text", text: "destra" }],
      },
    ];
    const [riga] = upgradeLegacyBlocks(vecchia);
    expect(riga.type).toBe("columns");
    if (riga.type !== "columns") throw new Error("conversione mancata");
    expect(riga.ratio).toBe("50-50");
    expect(riga.columns.map((c) => c.length)).toEqual([1, 1]);
    // Gli identificatori restano gli stessi: la conversione non è una riscrittura.
    expect(riga.id).toBe("r");
    expect(riga.columns[1][0].id).toBe("r1");
  });

  it("aggiunge il piè di pagina obbligatorio quando manca", () => {
    const blocchi = withUnsubscribeBlock([{ id: "t", type: "text", text: "ciao" }]);
    expect(blocchi.some((b) => b.type === "unsubscribe_link")).toBe(true);
    // E non lo aggiunge due volte.
    expect(withUnsubscribeBlock(blocchi)).toHaveLength(2);
  });
});
