import type {
  Block,
  BlockStyle,
  ColumnChildBlock,
  ColumnRatio,
  EmailSettings,
  WithoutId,
} from "./campaign-blocks";
import { EMAIL_FONT_STACKS } from "./campaign-blocks";

/**
 * Le categorie dei modelli, nell'ordine in cui compaiono nei filtri.
 *
 * Sono cinque parole che un ristoratore usa già — non una tassonomia di
 * prodotto. «Clienti» raccoglie i modelli che parlano a una persona (fedeltà,
 * compleanno, recupero), «Newsletter» quelli che raccontano.
 */
export const CATEGORIE_MODELLI = ["Eventi", "Promozioni", "Menu", "Newsletter", "Clienti"] as const;

export type CategoriaModello = (typeof CATEGORIE_MODELLI)[number];

export interface CampaignTemplate {
  id: string;
  name: string;
  category: CategoriaModello;
  objectiveTags: string[];
  tone: "formale" | "amichevole" | "urgente" | "elegante";
  previewText: string;
  /**
   * Le impostazioni del foglio — carattere, colori, larghezza. Sono parte del
   * modello quanto i blocchi: è ciò che distingue un editoriale con le grazie
   * da una promozione lineare, e senza di esse tredici modelli diversi
   * arriverebbero nell'editor tutti con la stessa faccia.
   */
  settings?: Partial<EmailSettings>;
  blocks: Block[];
}

/* ------------------------------------------------------------------ *
 * Scrittura dei modelli: blocchi senza id, id assegnati qui
 * ------------------------------------------------------------------ */

type ColonnaSenzaId = WithoutId<ColumnChildBlock>;

/** Come `WithoutId<Block>`, ma le colonne si scrivono senza id anche dentro. */
type BloccoSenzaId =
  | Exclude<WithoutId<Block>, { type: "columns" }>
  | { type: "columns"; ratio: ColumnRatio; columns: ColonnaSenzaId[][]; style?: BlockStyle };

/**
 * Gli id sono deterministici (`modello-3`, `modello-3-1-0`) e non casuali:
 * un modello è un valore costante, e due render dello stesso modello devono
 * produrre lo stesso documento. Gli id freschi si assegnano una volta sola,
 * quando il modello diventa una campagna vera (vedi `resolveTemplateSelection`).
 */
function blocchi(templateId: string, list: BloccoSenzaId[]): Block[] {
  return list.map((b, i) => {
    const id = `${templateId}-${i}`;
    if (b.type === "columns") {
      return {
        ...b,
        id,
        columns: b.columns.map((colonna, c) =>
          colonna.map((figlio, j) => ({ ...figlio, id: `${id}-${c}-${j}` }) as ColumnChildBlock),
        ),
      } as Block;
    }
    return { ...b, id } as Block;
  });
}

/**
 * Placeholder visivo (SVG inline, nessuna chiamata di rete) per i campi
 * logo/foto dei modelli: senza, l'anteprima mostrerebbe riquadri vuoti/rotti
 * e non "renderebbe l'idea" del modello. Il bordo tratteggiato e la scritta
 * segnalano chiaramente che va sostituito con la foto vera del locale prima
 * dell'invio — non è pensato per restare nell'email reale.
 */
function placeholderImage(label: string, width: number, height: number): string {
  const fontSize = Math.max(13, Math.round(height / 9));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#F4E9DE"/><rect x="3" y="3" width="${width - 6}" height="${height - 6}" fill="none" stroke="#D1AF05" stroke-width="2" stroke-dasharray="10 8"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="#A98D04" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const LOGO_PLACEHOLDER = placeholderImage("IL TUO LOGO", 240, 72);

const SERIF = EMAIL_FONT_STACKS[1].stack;
const MODERNO = EMAIL_FONT_STACKS[2].stack;

/* ------------------------------------------------------------------ *
 * I modelli
 * ------------------------------------------------------------------ */

/**
 * Tredici modelli, e ognuno è una **composizione** diversa.
 *
 * La versione precedente ne aveva otto e sette erano la stessa impaginazione
 * — logo, titolo, testo, pulsante, piè di pagina — con dentro parole diverse:
 * una libreria in cui scegliere non cambiava niente di ciò che si vedeva.
 * Qui ogni modello ha una struttura riconoscibile a colpo d'occhio nella
 * miniatura: una foto grande, una griglia a due, una a tre, un coupon che
 * occupa il centro, un editoriale con le grazie e nessuna immagine.
 *
 * Il blocco di disiscrizione non è incluso: lo aggiunge il wizard quando il
 * modello diventa una campagna (`withUnsubscribeBlock`).
 */
export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  /* ---------------------------------------------------------------- Eventi */
  {
    id: "event_announcement",
    name: "Serata evento",
    category: "Eventi",
    objectiveTags: ["event"],
    tone: "elegante",
    previewText: "Foto grande, data in evidenza, un solo invito.",
    blocks: blocchi("event_announcement", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "hero_image", imageUrl: placeholderImage("FOTO DELL'EVENTO", 600, 320), alt: "L'evento" },
      {
        type: "title",
        text: "Una serata da ricordare",
        align: "center",
        level: 1,
        style: { paddingTop: 28 },
      },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nabbiamo preparato qualcosa di speciale: un menù pensato per l'occasione, musica e l'atmosfera delle sere che restano.\n\nI posti sono limitati — ti conviene prenotare adesso.",
        style: { align: "center", paddingLeft: 40, paddingRight: 40 },
      },
      {
        type: "event",
        title: "Il nome della serata",
        dateLabel: "Venerdì 24 · ore 20.00",
        description: "Racconta qui in due righe cosa succede: il menù, l'ospite, la musica.",
        ctaLabel: "Prenota il tuo posto",
        ctaUrl: "{{BOOKING_LINK}}",
      },
      { type: "spacer", height: 8 },
      {
        type: "contacts",
        restaurantName: "{{RESTAURANT_NAME}}",
        address: "{{RESTAURANT_ADDRESS}}",
        phone: "",
        hours: "",
      },
    ]),
  },
  {
    id: "holiday",
    name: "Festa e ricorrenze",
    category: "Eventi",
    objectiveTags: ["event", "holiday"],
    tone: "amichevole",
    previewText: "Per Natale, San Valentino, Ferragosto: foto, menù, prenotazione.",
    settings: { pageBackground: "#f3ece1", emailBackground: "#fffdf9" },
    blocks: blocchi("holiday", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      {
        type: "title",
        text: "Festeggia con noi",
        align: "center",
        level: 1,
        style: { fontSize: 34, letterSpacing: -1 },
      },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}}, arriva la ricorrenza che aspettavamo tutto l'anno e vogliamo passarla con te.",
        style: { align: "center", paddingBottom: 4 },
      },
      { type: "hero_image", imageUrl: placeholderImage("FOTO DELLA FESTA", 600, 280), alt: "La festa" },
      {
        type: "offer_box",
        title: "Il menù della festa",
        body: "Scrivi qui i piatti principali, il prezzo a persona e fino a quando si può prenotare. Poche righe: chi legge deve capire in cinque secondi se fa per lui.",
        badge: "Menù dedicato",
      },
      { type: "button_cta", label: "Prenota il tuo tavolo", url: "{{BOOKING_LINK}}", align: "center" },
      {
        type: "social_links",
        links: [
          { platform: "Instagram", url: "" },
          { platform: "Facebook", url: "" },
        ],
      },
      {
        type: "contacts",
        restaurantName: "{{RESTAURANT_NAME}}",
        address: "{{RESTAURANT_ADDRESS}}",
        phone: "",
        hours: "",
      },
    ]),
  },
  {
    id: "wine_dinner",
    name: "Degustazione e wine dinner",
    category: "Eventi",
    objectiveTags: ["tasting_menu", "event"],
    tone: "elegante",
    previewText: "Il percorso a sinistra, i dettagli a destra. Tono da cantina.",
    settings: { fontFamily: SERIF, emailBackground: "#fdfbf7", textColor: "#3a332b", linkColor: "#7a4a2c" },
    blocks: blocchi("wine_dinner", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "hero_image", imageUrl: placeholderImage("FOTO DEI CALICI", 600, 260), alt: "Degustazione" },
      {
        type: "title",
        text: "Cena in degustazione",
        align: "center",
        level: 1,
        style: { paddingTop: 26, fontSize: 30 },
      },
      {
        type: "text",
        text: "Cinque portate, cinque calici, una serata sola. Il nostro chef e la cantina hanno lavorato insieme a un percorso che si assaggia una volta e si ricorda a lungo.",
        style: { align: "center", paddingLeft: 44, paddingRight: 44, fontSize: 16 },
      },
      { type: "divider", style: { paddingLeft: 44, paddingRight: 44 } },
      {
        type: "columns",
        ratio: "50-50",
        columns: [
          [
            { type: "title", text: "Il percorso", align: "left", level: 3 },
            {
              type: "text",
              text: "Scrivi qui le portate, una per riga, con il vino in abbinamento.",
              style: { fontSize: 14 },
            },
          ],
          [
            { type: "title", text: "I dettagli", align: "left", level: 3 },
            {
              type: "text",
              text: "Data e ora\nPrezzo a persona\nPosti disponibili",
              style: { fontSize: 14 },
            },
          ],
        ],
      },
      { type: "button_cta", label: "Riserva il tuo posto", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}} · {{RESTAURANT_ADDRESS}}" },
    ]),
  },

  /* ----------------------------------------------------------- Promozioni */
  {
    id: "special_promo",
    name: "Promozione con codice",
    category: "Promozioni",
    objectiveTags: ["promo", "custom"],
    tone: "urgente",
    previewText: "Il codice sconto al centro, tutto il resto gli fa spazio.",
    blocks: blocchi("special_promo", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      {
        type: "title",
        text: "Un'offerta pensata per te",
        align: "center",
        level: 1,
        style: { paddingTop: 24 },
      },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}}, abbiamo messo da parte qualcosa per la tua prossima visita da {{RESTAURANT_NAME}}.",
        style: { align: "center", paddingLeft: 40, paddingRight: 40 },
      },
      {
        type: "coupon",
        code: "CODICE10",
        title: "Il tuo vantaggio",
        description: "Mostra questo codice al tavolo. Valido una volta sola, non cumulabile con altre offerte.",
        expiry: "31 dicembre",
      },
      { type: "button_cta", label: "Prenota e usalo", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}} · {{RESTAURANT_ADDRESS}}" },
    ]),
  },
  {
    id: "last_minute",
    name: "Riempi una serata",
    category: "Promozioni",
    objectiveTags: ["fill_slow_day"],
    tone: "urgente",
    previewText: "Corta e diretta: una riga, un pulsante. Si legge dal telefono.",
    blocks: blocchi("last_minute", [
      {
        type: "title",
        text: "Domani sera c'è posto",
        align: "center",
        level: 1,
        style: { paddingTop: 36, fontSize: 32 },
      },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}}, abbiamo ancora qualche tavolo libero e ci piacerebbe vederti. Scrivi qui l'occasione: il piatto del giorno, il calice offerto, la musica dal vivo.",
        style: { align: "center", paddingLeft: 44, paddingRight: 44, fontSize: 16 },
      },
      { type: "button_cta", label: "Prenota in 30 secondi", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "spacer", height: 12 },
      { type: "divider", style: { paddingLeft: 44, paddingRight: 44 } },
      {
        type: "contacts",
        restaurantName: "{{RESTAURANT_NAME}}",
        address: "{{RESTAURANT_ADDRESS}}",
        phone: "",
        hours: "",
      },
    ]),
  },

  /* ----------------------------------------------------------------- Menu */
  {
    id: "new_menu",
    name: "Nuovi piatti in carta",
    category: "Menu",
    objectiveTags: ["new_menu"],
    tone: "amichevole",
    previewText: "Foto e testo che si alternano, come una pagina di rivista.",
    blocks: blocchi("new_menu", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "title", text: "Novità in carta", align: "center", level: 1 },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}}, abbiamo rinnovato il menù. Ecco i due piatti di cui andiamo più fieri.",
        style: { align: "center" },
      },
      {
        type: "columns",
        ratio: "30-70",
        columns: [
          [{ type: "image", imageUrl: placeholderImage("PIATTO", 300, 300), alt: "Il primo piatto" }],
          [
            { type: "title", text: "Il nome del piatto", align: "left", level: 3 },
            {
              type: "text",
              text: "Due righe sull'ingrediente principale e su come è fatto. Niente elenchi: si racconta.",
              style: { fontSize: 14 },
            },
          ],
        ],
      },
      {
        type: "columns",
        ratio: "70-30",
        columns: [
          [
            { type: "title", text: "Il secondo piatto", align: "left", level: 3 },
            {
              type: "text",
              text: "Due righe sull'ingrediente principale e su come è fatto. Niente elenchi: si racconta.",
              style: { fontSize: 14 },
            },
          ],
          [{ type: "image", imageUrl: placeholderImage("PIATTO", 300, 300), alt: "Il secondo piatto" }],
        ],
      },
      { type: "button_cta", label: "Prenota per assaggiarli", url: "{{BOOKING_LINK}}", align: "center" },
      {
        type: "contacts",
        restaurantName: "{{RESTAURANT_NAME}}",
        address: "{{RESTAURANT_ADDRESS}}",
        phone: "",
        hours: "",
      },
    ]),
  },
  {
    id: "seasonal_menu",
    name: "Menù di stagione",
    category: "Menu",
    objectiveTags: ["new_menu", "tasting_menu"],
    tone: "elegante",
    previewText: "Tre piatti affiancati, come una vetrina.",
    settings: { fontFamily: MODERNO, pageBackground: "#efeae1" },
    blocks: blocchi("seasonal_menu", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "hero_image", imageUrl: placeholderImage("FOTO DELLA STAGIONE", 600, 240), alt: "La stagione" },
      { type: "title", text: "Il menù della stagione", align: "center", level: 1, style: { paddingTop: 24 } },
      {
        type: "text",
        text: "Gli ingredienti che arrivano adesso, cucinati come vanno cucinati. Resta in carta per poche settimane.",
        style: { align: "center", paddingLeft: 40, paddingRight: 40 },
      },
      {
        type: "columns",
        ratio: "33-33-33",
        columns: [
          [
            { type: "image", imageUrl: placeholderImage("FOTO", 180, 180), alt: "Antipasto" },
            { type: "title", text: "Antipasto", align: "center", level: 3, style: { fontSize: 15 } },
            { type: "text", text: "Una riga di descrizione.", style: { fontSize: 13, align: "center" } },
          ],
          [
            { type: "image", imageUrl: placeholderImage("FOTO", 180, 180), alt: "Primo" },
            { type: "title", text: "Primo", align: "center", level: 3, style: { fontSize: 15 } },
            { type: "text", text: "Una riga di descrizione.", style: { fontSize: 13, align: "center" } },
          ],
          [
            { type: "image", imageUrl: placeholderImage("FOTO", 180, 180), alt: "Dolce" },
            { type: "title", text: "Dolce", align: "center", level: 3, style: { fontSize: 15 } },
            { type: "text", text: "Una riga di descrizione.", style: { fontSize: 13, align: "center" } },
          ],
        ],
      },
      { type: "button_cta", label: "Prenota un tavolo", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}} · {{RESTAURANT_ADDRESS}}" },
    ]),
  },

  /* ----------------------------------------------------------- Newsletter */
  {
    id: "weekly_news",
    name: "Newsletter settimanale",
    category: "Newsletter",
    objectiveTags: ["newsletter"],
    tone: "amichevole",
    previewText: "Due notizie affiancate, i social in fondo. Da mandare ogni settimana.",
    blocks: blocchi("weekly_news", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      {
        type: "title",
        text: "Questa settimana da noi",
        align: "center",
        level: 2,
        style: { paddingTop: 20 },
      },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}}, ecco cosa succede nei prossimi giorni.",
        style: { align: "center", paddingBottom: 4 },
      },
      { type: "divider", style: { paddingLeft: 40, paddingRight: 40 } },
      {
        type: "columns",
        ratio: "50-50",
        columns: [
          [
            { type: "image", imageUrl: placeholderImage("FOTO", 260, 170), alt: "La prima notizia" },
            { type: "title", text: "La prima notizia", align: "left", level: 3, style: { fontSize: 17 } },
            {
              type: "text",
              text: "Tre righe al massimo. Se serve più spazio, è un'email a parte.",
              style: { fontSize: 14 },
            },
          ],
          [
            { type: "image", imageUrl: placeholderImage("FOTO", 260, 170), alt: "La seconda notizia" },
            { type: "title", text: "La seconda notizia", align: "left", level: 3, style: { fontSize: 17 } },
            {
              type: "text",
              text: "Tre righe al massimo. Se serve più spazio, è un'email a parte.",
              style: { fontSize: 14 },
            },
          ],
        ],
      },
      { type: "divider", style: { paddingLeft: 40, paddingRight: 40 } },
      { type: "button_cta", label: "Prenota un tavolo", url: "{{BOOKING_LINK}}", align: "center" },
      {
        type: "social_links",
        links: [
          { platform: "Instagram", url: "" },
          { platform: "Facebook", url: "" },
          { platform: "Sito", url: "" },
        ],
      },
      {
        type: "contacts",
        restaurantName: "{{RESTAURANT_NAME}}",
        address: "{{RESTAURANT_ADDRESS}}",
        phone: "",
        hours: "",
      },
    ]),
  },
  {
    id: "storytelling",
    name: "Storia da raccontare",
    category: "Newsletter",
    objectiveTags: ["newsletter"],
    tone: "elegante",
    previewText: "Un editoriale con le grazie: una foto, un testo lungo, una firma.",
    settings: { fontFamily: SERIF, emailBackground: "#fffdf8", textColor: "#33302b" },
    blocks: blocchi("storytelling", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      {
        type: "title",
        text: "Da dove arriva ciò che mangi",
        align: "left",
        level: 1,
        style: { paddingLeft: 44, paddingRight: 44, fontSize: 30, lineHeight: 1.2 },
      },
      { type: "image", imageUrl: placeholderImage("FOTO", 520, 300), alt: "La storia" },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nqui si scrive la storia: il produttore che ci porta le verdure, il piatto che viene da una ricetta di famiglia, il motivo per cui abbiamo aperto.\n\nÈ il tipo di email che non chiede niente e che la gente legge fino in fondo. Un paio di paragrafi bastano — il resto lo racconti a tavola.",
        style: { paddingLeft: 44, paddingRight: 44, fontSize: 16, lineHeight: 1.75 },
      },
      { type: "divider", style: { paddingLeft: 44, paddingRight: 44 } },
      {
        type: "text",
        text: "— La squadra di {{RESTAURANT_NAME}}",
        style: { paddingLeft: 44, paddingRight: 44, fontSize: 14, color: "#7a6a56" },
      },
      { type: "button_cta", label: "Vieni a trovarci", url: "{{BOOKING_LINK}}", align: "left", style: { paddingLeft: 44 } },
      { type: "footer", text: "{{RESTAURANT_NAME}} · {{RESTAURANT_ADDRESS}}" },
    ]),
  },
  {
    id: "institutional",
    name: "Comunicazione dal locale",
    category: "Newsletter",
    objectiveTags: ["institutional"],
    tone: "formale",
    previewText: "Nessuna immagine, nessuna offerta: cambi di orario, chiusure, avvisi.",
    blocks: blocchi("institutional", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "left" },
      {
        type: "title",
        text: "Una comunicazione importante",
        align: "left",
        level: 2,
        style: { paddingLeft: 32, paddingRight: 32 },
      },
      {
        type: "text",
        text: "Gentile {{FIRSTNAME}},\n\nti scriviamo per informarti di un cambiamento che ti riguarda: i nuovi orari, una chiusura temporanea, un trasloco, una novità nel servizio.\n\nSpiega qui cosa cambia, da quando, e cosa deve fare chi ha già una prenotazione. Chiudi dicendo come contattarci in caso di dubbi.",
        style: { paddingLeft: 32, paddingRight: 32, lineHeight: 1.7 },
      },
      { type: "divider", style: { paddingLeft: 32, paddingRight: 32 } },
      {
        type: "contacts",
        restaurantName: "{{RESTAURANT_NAME}}",
        address: "{{RESTAURANT_ADDRESS}}",
        phone: "",
        hours: "",
        style: { align: "left", paddingLeft: 32, paddingRight: 32 },
      },
    ]),
  },

  /* -------------------------------------------------------------- Clienti */
  {
    id: "vip_invite",
    name: "Invito riservato",
    category: "Clienti",
    objectiveTags: ["vip"],
    tone: "elegante",
    previewText: "Minimale e centrato: molto spazio attorno a poche parole.",
    settings: { fontFamily: SERIF, emailBackground: "#faf6ef", textColor: "#3b332a", linkColor: "#7a4a2c" },
    blocks: blocchi("vip_invite", [
      { type: "spacer", height: 24 },
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      {
        type: "text",
        text: "RISERVATO A TE",
        style: { align: "center", fontSize: 12, letterSpacing: 3, color: "#9a7b52", paddingBottom: 0 },
      },
      {
        type: "title",
        text: "Qualcosa di speciale,\nsolo per i nostri ospiti",
        align: "center",
        level: 1,
        style: { fontSize: 28, lineHeight: 1.35, paddingTop: 6, paddingBottom: 12 },
      },
      { type: "divider", style: { paddingLeft: 200, paddingRight: 200, color: "#d8c7ab" } },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\ncome cliente {{LOYALTY_LEVEL}} sei fra le prime persone a saperlo. Scrivi qui cosa rendi disponibile in anticipo: una serata, un tavolo, un menù.",
        style: { align: "center", paddingLeft: 60, paddingRight: 60, fontSize: 16, lineHeight: 1.8 },
      },
      { type: "button_cta", label: "Approfitta dell'invito", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "spacer", height: 20 },
      {
        type: "contacts",
        restaurantName: "{{RESTAURANT_NAME}}",
        address: "{{RESTAURANT_ADDRESS}}",
        phone: "",
        hours: "",
      },
    ]),
  },
  {
    id: "win_back",
    name: "Torna a trovarci",
    category: "Clienti",
    objectiveTags: ["win_back"],
    tone: "amichevole",
    previewText: "Un invito caldo a chi non prenota da un po', con un motivo per tornare.",
    blocks: blocchi("win_back", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      { type: "hero_image", imageUrl: placeholderImage("FOTO DELLA SALA", 600, 240), alt: "La sala" },
      { type: "title", text: "Ci sei mancato", align: "center", level: 1, style: { paddingTop: 24 } },
      {
        type: "text",
        text: "Ciao {{FIRSTNAME}},\n\nè da un po' che non ti vediamo — l'ultima volta è stata il {{LAST_VISIT_DATE}}. Nel frattempo è cambiato qualcosa in cucina e ci piacerebbe fartelo assaggiare.",
        style: { align: "center", paddingLeft: 40, paddingRight: 40 },
      },
      {
        type: "coupon",
        code: "BENTORNATO",
        title: "Un motivo in più",
        description: "Un pensiero della casa alla tua prossima visita. Basta dirlo al tavolo.",
      },
      { type: "button_cta", label: "Prenota ora", url: "{{BOOKING_LINK}}", align: "center" },
      {
        type: "contacts",
        restaurantName: "{{RESTAURANT_NAME}}",
        address: "{{RESTAURANT_ADDRESS}}",
        phone: "",
        hours: "",
      },
    ]),
  },
  {
    id: "birthday",
    name: "Buon compleanno",
    category: "Clienti",
    objectiveTags: ["birthday_month"],
    tone: "amichevole",
    previewText: "Gli auguri a chi festeggia, con un pensiero della casa.",
    settings: { pageBackground: "#f3ece1" },
    blocks: blocchi("birthday", [
      { type: "logo", imageUrl: LOGO_PLACEHOLDER, align: "center" },
      {
        type: "title",
        text: "Buon compleanno, {{FIRSTNAME}}!",
        align: "center",
        level: 1,
        style: { paddingTop: 28, fontSize: 30 },
      },
      {
        type: "text",
        text: "Festeggiare è la cosa che sappiamo fare meglio. Se passi da noi questo mese, ci pensiamo noi.",
        style: { align: "center", paddingLeft: 44, paddingRight: 44 },
      },
      {
        type: "offer_box",
        title: "Un pensiero per te",
        body: "Scrivi qui cosa offri: il dolce con la candelina, un calice di bollicine, il conto scontato per il festeggiato. Dillo in una riga.",
        badge: "Compleanno",
      },
      { type: "button_cta", label: "Prenota il tuo tavolo", url: "{{BOOKING_LINK}}", align: "center" },
      { type: "footer", text: "{{RESTAURANT_NAME}} · {{RESTAURANT_ADDRESS}}" },
    ]),
  },
];

export function getCampaignTemplate(id: string | null): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id);
}

export function templatesForObjective(objectiveId: string | null): CampaignTemplate[] {
  if (!objectiveId) return CAMPAIGN_TEMPLATES;
  return CAMPAIGN_TEMPLATES.filter((t) => t.objectiveTags.includes(objectiveId));
}

/**
 * I modelli di una categoria, oppure tutti. `null` è «Tutti»: un filtro che
 * non filtra deve poter essere lo stato iniziale senza casi speciali a valle.
 */
export function templatesForCategory(categoria: CategoriaModello | null): CampaignTemplate[] {
  if (!categoria) return CAMPAIGN_TEMPLATES;
  return CAMPAIGN_TEMPLATES.filter((t) => t.category === categoria);
}

/**
 * Sostituisce il placeholder logo dei blocchi con quello reale del locale
 * (Impostazioni → Brand), se impostato — altrimenti lascia il placeholder
 * del modello invariato. Usata ovunque un modello venga istanziato per
 * una campagna vera, non per la sola anteprima.
 */
export function withBrandLogo(blocks: Block[], logoUrl?: string): Block[] {
  if (!logoUrl) return blocks;
  return blocks.map((b) => (b.type === "logo" ? { ...b, imageUrl: logoUrl } : b));
}
