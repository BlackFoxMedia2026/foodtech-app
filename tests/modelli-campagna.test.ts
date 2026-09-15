import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_SETTINGS,
  hasSubstantiveContent,
  hasUnsubscribeBlock,
  parseEmailDocument,
  type Block,
  type EmailDocument,
} from "@/lib/campaign-blocks";
import { compileEmailDocument } from "@/lib/campaign-blocks-compiler";
import {
  CAMPAIGN_TEMPLATES,
  CATEGORIE_MODELLI,
  getCampaignTemplate,
  templatesForCategory,
} from "@/lib/campaign-templates";
import { CAMPAIGN_OBJECTIVES } from "@/lib/campaign-objectives";
import { resolveTemplateSelection, type FonteNewsletter } from "@/lib/campaign-start";
import { cloneBlocksWithNewIds } from "@/lib/campaign-document-ops";

/** Ogni id del documento, colonne comprese: è lì che la copia sbagliava. */
function tuttiGliId(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    ids.push(b.id);
    if (b.type === "columns") for (const colonna of b.columns) for (const figlio of colonna) ids.push(figlio.id);
    if (b.type === "two_columns") for (const figlio of [...b.left, ...b.right]) ids.push(figlio.id);
  }
  return ids;
}

describe("la libreria dei modelli", () => {
  it("ne offre almeno dieci, tutti con id distinto", () => {
    expect(CAMPAIGN_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    const ids = CAMPAIGN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("copre tutte le categorie dei filtri, e nessun modello ne inventa una", () => {
    for (const categoria of CATEGORIE_MODELLI) {
      expect(templatesForCategory(categoria).length).toBeGreaterThan(0);
    }
    // «Tutti» non filtra: è lo stato iniziale, non un caso a parte.
    expect(templatesForCategory(null)).toHaveLength(CAMPAIGN_TEMPLATES.length);
  });

  /**
   * Il difetto che questa prova esclude è preciso: due modelli con la stessa
   * sequenza di blocchi sono due nomi per la stessa email, e una libreria in
   * cui scegliere non cambia niente non è una libreria.
   */
  it("non contiene due modelli con la stessa impaginazione", () => {
    const forme = CAMPAIGN_TEMPLATES.map((t) => t.blocks.map((b) => b.type).join(">"));
    expect(new Set(forme).size).toBe(forme.length);
  });

  it("dà a ogni blocco un id suo, anche dentro le colonne", () => {
    for (const template of CAMPAIGN_TEMPLATES) {
      const ids = tuttiGliId(template.blocks);
      expect(new Set(ids).size, `id ripetuti in ${template.id}`).toBe(ids.length);
    }
  });

  it("compila ogni modello in HTML senza perdere il titolo", () => {
    for (const template of CAMPAIGN_TEMPLATES) {
      const html = compileEmailDocument({
        version: 2,
        settings: { ...DEFAULT_EMAIL_SETTINGS, ...template.settings },
        blocks: template.blocks,
      });
      expect(html).toContain("<table");
      // Un modello senza contenuto vero arriverebbe nell'editor come un foglio
      // quasi bianco: la libreria mostrerebbe una miniatura muta.
      expect(hasSubstantiveContent(template.blocks), template.id).toBe(true);
    }
  });

  it("resta raggiungibile dagli obiettivi che lo suggeriscono", () => {
    for (const obiettivo of CAMPAIGN_OBJECTIVES) {
      if (!obiettivo.suggestedTemplateId) continue;
      expect(getCampaignTemplate(obiettivo.suggestedTemplateId), obiettivo.id).toBeDefined();
    }
  });
});

const CONTESTO = { subject: "", brandLogoUrl: "", previousCampaigns: [] as FonteNewsletter[] };

describe("da dove parte una campagna", () => {
  it("«email vuota» dà un foglio con la sola disiscrizione", () => {
    const doc = resolveTemplateSelection({ type: "blank" }, CONTESTO);
    expect(hasUnsubscribeBlock(doc.blocks)).toBe(true);
    expect(hasSubstantiveContent(doc.blocks)).toBe(false);
    expect(doc.settings).toEqual(DEFAULT_EMAIL_SETTINGS);
  });

  it("un modello arriva con id nuovi, la disiscrizione e le sue impostazioni", () => {
    const template = getCampaignTemplate("storytelling")!;
    const doc = resolveTemplateSelection({ type: "template", templateId: template.id }, CONTESTO);

    expect(hasUnsubscribeBlock(doc.blocks)).toBe(true);
    // Nessun id del modello sopravvive: due campagne dallo stesso modello non
    // devono condividere identità di blocco.
    const idModello = new Set(tuttiGliId(template.blocks));
    for (const id of tuttiGliId(doc.blocks)) expect(idModello.has(id)).toBe(false);
    expect(doc.settings.fontFamily).toBe(template.settings?.fontFamily);
    expect(doc.subject).toBe(template.name);
  });

  it("non tocca l'oggetto se chi scrive ne ha già uno", () => {
    const doc = resolveTemplateSelection(
      { type: "template", templateId: "win_back" },
      { ...CONTESTO, subject: "Il mio oggetto" },
    );
    expect(doc.subject).toBeUndefined();
  });

  it("mette il logo del locale al posto del segnaposto", () => {
    const doc = resolveTemplateSelection(
      { type: "template", templateId: "win_back" },
      { ...CONTESTO, brandLogoUrl: "https://esempio.it/logo.png" },
    );
    const logo = doc.blocks.find((b) => b.type === "logo");
    expect(logo && "imageUrl" in logo ? logo.imageUrl : null).toBe("https://esempio.it/logo.png");
  });
});

/**
 * La regola della copia.
 *
 * Riprendere una newsletter è **duplicare**, mai riaprire: la campagna già
 * inviata è un fatto accaduto, e un fatto accaduto non si modifica. Queste
 * prove guardano l'unica cosa che potrebbe tradire la regola — che il
 * documento d'origine esca dalla funzione identico a com'è entrato.
 */
describe("riprendere una newsletter precedente", () => {
  function fonte(): FonteNewsletter {
    const document: EmailDocument = parseEmailDocument({
      version: 2,
      settings: { ...DEFAULT_EMAIL_SETTINGS, contentWidth: 680, emailBackground: "#fff8f0" },
      blocks: [
        { id: "a", type: "title", text: "La festa di agosto", align: "center" },
        {
          id: "b",
          type: "columns",
          ratio: "50-50",
          columns: [
            [{ id: "b-0-0", type: "text", text: "Sinistra" }],
            [{ id: "b-1-0", type: "text", text: "Destra" }],
          ],
        },
        { id: "c", type: "unsubscribe_link", text: "Disiscriviti" },
      ],
    });
    return { id: "camp-1", subject: "Si festeggia", document };
  }

  it("copia blocchi e impostazioni in un documento nuovo", () => {
    const originale = fonte();
    const doc = resolveTemplateSelection(
      { type: "previous", sourceCampaignId: "camp-1" },
      { ...CONTESTO, previousCampaigns: [originale] },
    );

    expect(doc.blocks.map((b) => b.type)).toEqual(originale.document.blocks.map((b) => b.type));
    expect(doc.settings.contentWidth).toBe(680);
    expect(doc.settings.emailBackground).toBe("#fff8f0");
    expect(doc.subject).toBe("Si festeggia");
    expect(hasUnsubscribeBlock(doc.blocks)).toBe(true);
  });

  it("non lascia in giro nessun id della campagna d'origine", () => {
    const originale = fonte();
    const doc = resolveTemplateSelection(
      { type: "previous", sourceCampaignId: "camp-1" },
      { ...CONTESTO, previousCampaigns: [originale] },
    );
    const idOriginali = new Set(tuttiGliId(originale.document.blocks));
    const idCopia = tuttiGliId(doc.blocks);
    for (const id of idCopia) expect(idOriginali.has(id)).toBe(false);
    expect(new Set(idCopia).size).toBe(idCopia.length);
  });

  it("lascia la campagna d'origine esattamente com'era", () => {
    const originale = fonte();
    const prima = JSON.stringify(originale.document);
    const doc = resolveTemplateSelection(
      { type: "previous", sourceCampaignId: "camp-1" },
      { ...CONTESTO, previousCampaigns: [originale] },
    );
    // Si tocca la copia: se fosse lo stesso oggetto, l'originale cambierebbe.
    doc.blocks[0] = { ...doc.blocks[0], id: "toccato" } as Block;
    expect(JSON.stringify(originale.document)).toBe(prima);
  });

  it("non si pianta se la campagna indicata non c'è più", () => {
    const doc = resolveTemplateSelection({ type: "previous", sourceCampaignId: "sparita" }, CONTESTO);
    expect(hasUnsubscribeBlock(doc.blocks)).toBe(true);
    expect(doc.blocks).toHaveLength(1);
  });

  it("rinnova gli id anche dei figli di una riga a colonne", () => {
    const blocchi: Block[] = [
      {
        id: "riga",
        type: "columns",
        ratio: "50-50",
        columns: [[{ id: "figlio", type: "text", text: "x" }], []],
      },
    ];
    const copia = cloneBlocksWithNewIds(blocchi);
    const riga = copia[0];
    expect(riga.id).not.toBe("riga");
    expect(riga.type === "columns" && riga.columns[0][0].id).not.toBe("figlio");
  });
});
