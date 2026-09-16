import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { deflateSync } from "zlib";
import {
  PAYLOAD_WIFI_VUOTO,
  contenutoQr,
  destinazioneAutomatica,
  linkQr,
  stringaWifi,
} from "@/lib/qr-contenuto";
import {
  DESIGN_PREDEFINITO,
  MODULO,
  QUIETE,
  componiQr,
  formeCampioneAngoli,
  formeCampioneModuli,
  livelloCorrezione,
  matriceDa,
  STILI_MODULI,
  type DesignQr,
} from "@/lib/qr-disegno";
import { disegnoInSvg } from "@/lib/qr-svg";
import { controllaQr, qrSalvabile } from "@/lib/qr-validazione";
import { immaginePerPdf } from "@/lib/immagine-pdf";
import { foglioQr } from "@/lib/qr-pdf-stampa";
import { indirizzoEsternoAmmesso } from "@/lib/indirizzo-esterno";

/* -------------------------------------------------------------------------- */
/*  Il contenuto                                                              */
/* -------------------------------------------------------------------------- */

describe("il Wi-Fi come lo legge un telefono", () => {
  it("scrive la riga dello standard", () => {
    expect(stringaWifi({ ssid: "Aurora", password: "segreto", sicurezza: "WPA", nascosta: false })).toBe(
      "WIFI:T:WPA;S:Aurora;P:segreto;;",
    );
  });

  it("senza password non scrive il campo della password", () => {
    const s = stringaWifi({ ssid: "Aurora", password: "ignorata", sicurezza: "NONE", nascosta: false });
    expect(s).toBe("WIFI:T:nopass;S:Aurora;;");
    expect(s).not.toContain("ignorata");
  });

  it("WPA3 usa SAE, che è il nome del suo metodo", () => {
    expect(stringaWifi({ ...PAYLOAD_WIFI_VUOTO, ssid: "A", sicurezza: "WPA3" })).toContain("T:SAE;");
  });

  it("la rete nascosta si dichiara", () => {
    expect(stringaWifi({ ...PAYLOAD_WIFI_VUOTO, ssid: "A", nascosta: true })).toContain("H:true");
  });

  /* Il difetto che questo test esiste per impedire: una password con un punto
     e virgola chiudeva il campo a metà, e il telefono provava a collegarsi con
     mezza password dicendo che la rete non risponde. */
  it("protegge i caratteri che nello standard separano i campi", () => {
    const s = stringaWifi({
      ssid: 'Bar "Da Gino"; sala',
      password: "a;b,c:d\\e",
      sicurezza: "WPA",
      nascosta: false,
    });
    expect(s).toContain('S:Bar \\"Da Gino\\"\\; sala;');
    expect(s).toContain("P:a\\;b\\,c\\:d\\\\e;");
  });
});

describe("dove porta il codice", () => {
  it("il Wi-Fi non ha un indirizzo da copiare", () => {
    const fonti = {
      kind: "WIFI" as const,
      destinationUrl: null,
      payload: { wifi: { ...PAYLOAD_WIFI_VUOTO, ssid: "Aurora" } },
    };
    expect(contenutoQr(fonti)).toContain("WIFI:");
    expect(linkQr(fonti)).toBeNull();
  });

  it("senza nome della rete il contenuto resta vuoto", () => {
    expect(
      contenutoQr({ kind: "WIFI", destinationUrl: null, payload: { wifi: { ...PAYLOAD_WIFI_VUOTO } } }),
    ).toBe("");
  });

  it("il testo libero è il contenuto, non un link", () => {
    const fonti = {
      kind: "CUSTOM" as const,
      destinationUrl: "https://ignorato.it",
      payload: { custom: { modo: "testo" as const, valore: "Torniamo alle 19" } },
    };
    expect(contenutoQr(fonti)).toBe("Torniamo alle 19");
    expect(linkQr(fonti)).toBeNull();
  });

  it("menu e prenotazione li compone il prodotto, non chi scrive", () => {
    expect(destinazioneAutomatica("MENU", "https://x.it/", "aurora")).toBe("https://x.it/m/aurora");
    expect(destinazioneAutomatica("BOOKING", "https://x.it", "aurora")).toBe(
      "https://x.it/book?venue=aurora",
    );
    expect(destinazioneAutomatica("CUSTOM", "https://x.it", "aurora")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  La leggibilità                                                            */
/* -------------------------------------------------------------------------- */

const design = (patch: Partial<DesignQr> = {}): DesignQr => ({ ...DESIGN_PREDEFINITO, ...patch });

describe("il controllo che ferma un QR illeggibile", () => {
  it("il disegno predefinito passa", () => {
    const avvisi = controllaQr({ design: design(), contenuto: "https://aurora.it" });
    expect(qrSalvabile(avvisi)).toBe(true);
  });

  it("due colori troppo vicini fermano il salvataggio", () => {
    const avvisi = controllaQr({
      design: design({ coloreQr: "#3A4A44", coloreSfondo: "#2F3B36" }),
      contenuto: "https://aurora.it",
    });
    expect(avvisi.find((a) => a.chiave === "contrasto")?.grave).toBe(true);
    expect(qrSalvabile(avvisi)).toBe(false);
  });

  it("un contrasto appena sufficiente si dice, ma non blocca", () => {
    const avvisi = controllaQr({
      design: design({ coloreQr: "#898989", coloreSfondo: "#FFFFFF" }),
      contenuto: "https://aurora.it",
    });
    expect(avvisi.some((a) => a.chiave === "contrasto-basso")).toBe(true);
    expect(qrSalvabile(avvisi)).toBe(true);
  });

  it("il codice chiaro su fondo scuro si segnala e si lascia fare", () => {
    const avvisi = controllaQr({
      design: design({ coloreQr: "#F2E7D0", coloreSfondo: "#13332C" }),
      contenuto: "https://aurora.it",
    });
    expect(avvisi.some((a) => a.chiave === "invertito")).toBe(true);
    expect(qrSalvabile(avvisi)).toBe(true);
  });

  it("senza destinazione non c'è niente da salvare", () => {
    expect(qrSalvabile(controllaQr({ design: design(), contenuto: "  " }))).toBe(false);
  });

  it("un contenuto smisurato si ferma prima di diventare una griglia illeggibile", () => {
    const avvisi = controllaQr({ design: design(), contenuto: "x".repeat(1200) });
    expect(avvisi.find((a) => a.chiave === "lungo")?.grave).toBe(true);
  });
});

describe("la correzione d'errore", () => {
  it("sale a H solo con il logo al centro, che copre dei moduli", () => {
    expect(livelloCorrezione(design())).toBe("Q");
    expect(livelloCorrezione(design({ logoUrl: "https://x.it/l.png", posizioneLogo: "centro" }))).toBe("H");
    expect(livelloCorrezione(design({ logoUrl: "https://x.it/l.png", posizioneLogo: "sotto" }))).toBe("Q");
  });
});

/* -------------------------------------------------------------------------- */
/*  Il disegno                                                                */
/* -------------------------------------------------------------------------- */

function matrice(testo = "https://aurora.it/m/aurora") {
  return matriceDa(QRCode.create(testo, { errorCorrectionLevel: "Q" }).modules as never);
}

describe("la composizione del codice", () => {
  it("lascia la zona di quiete su tutti e quattro i lati", () => {
    const m = matrice();
    const d = componiQr({ matrice: m, design: design() });
    expect(d.riquadroQr.lato).toBe((m.size + QUIETE * 2) * MODULO);
    expect(d.larghezza).toBe(d.riquadroQr.lato);
    expect(d.altezza).toBe(d.riquadroQr.lato);
  });

  it("disegna i tre quadrati grandi, in tutti gli stili", () => {
    for (const stile of STILI_MODULI) {
      const d = componiQr({ matrice: matrice(), design: design({ stileModuli: stile }) });
      /* Il fondo, più tre forme per occhio: se uno stile smettesse di
         disegnarli il codice resterebbe senza i suoi punti di riferimento. */
      expect(d.forme.length).toBeGreaterThan(10);
    }
  });

  it("la cornice con l'invito aggiunge una fascia e la scritta", () => {
    const d = componiQr({
      matrice: matrice(),
      design: design({ cornice: "cta-sotto", testoCornice: "Scansiona per pagare" }),
    });
    const nudo = componiQr({ matrice: matrice(), design: design() });
    expect(d.altezza).toBeGreaterThan(nudo.altezza);
    expect(d.forme.some((f) => f.t === "testo" && f.testo === "Scansiona per pagare")).toBe(true);
  });

  it("una cornice senza niente da leggere non apre una fascia vuota", () => {
    const con = componiQr({ matrice: matrice(), design: design({ cornice: "cta-sotto", testoCornice: "  " }) });
    expect(con.forme.some((f) => f.t === "testo")).toBe(false);
  });

  it("l'invito troppo lungo si taglia invece di uscire dal riquadro", () => {
    const d = componiQr({
      matrice: matrice(),
      design: design({ cornice: "badge", testoCornice: "x".repeat(200) }),
    });
    const testo = d.forme.find((f) => f.t === "testo");
    expect(testo && testo.t === "testo" && testo.testo.length).toBeLessThanOrEqual(34);
  });

  /* Il logo al centro copre dei moduli: senza il riquadro chiaro sotto, il
     telefono legge una macchia al posto del centro del codice. */
  it("il logo al centro porta con sé la sua zona di rispetto", () => {
    const d = componiQr({
      matrice: matrice(),
      design: design({ logoUrl: "https://x.it/l.png", posizioneLogo: "centro" }),
    });
    const immagine = d.forme.find((f) => f.t === "immagine");
    expect(immagine).toBeTruthy();
    if (immagine?.t !== "immagine") throw new Error("atteso il logo");

    const indice = d.forme.indexOf(immagine);
    const sotto = d.forme[indice - 1];
    expect(sotto.t).toBe("path");
    expect(sotto.t === "path" && sotto.colore).toBe(DESIGN_PREDEFINITO.coloreSfondo);

    /* E non deve crescere: oltre un certo lato la correzione d'errore non
       basta più, e quel punto non si vede sullo schermo. */
    expect(immagine.w / d.riquadroQr.lato).toBeLessThanOrEqual(0.23);
  });

  it("il logo «nella cornice» senza cornice scende sotto il codice invece di sparire", () => {
    const d = componiQr({
      matrice: matrice(),
      design: design({ logoUrl: "https://x.it/l.png", posizioneLogo: "cornice", cornice: "nessuna" }),
    });
    expect(d.forme.some((f) => f.t === "immagine")).toBe(true);
    expect(d.altezza).toBeGreaterThan(d.riquadroQr.lato);
  });
});

describe("gli angoli tondi", () => {
  /* Gli archi SVG (`A`) il PDF non li ha: se tornassero qui, la stampa e
     l'anteprima comincerebbero a disegnare due curve diverse. */
  it("sono curve di Bézier, non archi", () => {
    const svg = disegnoInSvg(componiQr({ matrice: matrice(), design: design({ stileModuli: "arrotondato" }) }));
    expect(svg).toContain("C");
    expect(svg).not.toMatch(/\sA[\d.]/);
  });
});

describe("l'SVG", () => {
  it("protegge il testo dell'invito", () => {
    const svg = disegnoInSvg(
      componiQr({
        matrice: matrice(),
        design: design({ cornice: "cta-sotto", testoCornice: '<b>"Paga"</b>' }),
      }),
    );
    expect(svg).toContain("&lt;b&gt;&quot;Paga&quot;&lt;/b&gt;");
    expect(svg).not.toContain("<b>");
  });

  it("dichiara il riquadro di vista e non una misura fissa, se non la si chiede", () => {
    const d = componiQr({ matrice: matrice(), design: design() });
    expect(disegnoInSvg(d)).toContain(`viewBox="0 0 ${d.larghezza} ${d.altezza}"`);
    expect(disegnoInSvg(d, { lato: 512 })).toContain('width="512"');
  });
});

describe("le miniature dei preset", () => {
  it("ogni stile disegna qualcosa, e i sei stili non sono lo stesso disegno", () => {
    const disegni = STILI_MODULI.map((s) => {
      const { forme } = formeCampioneModuli(s, "#000000");
      expect(forme.length).toBeGreaterThan(0);
      return JSON.stringify(forme);
    });
    expect(new Set(disegni).size).toBe(STILI_MODULI.length);
  });

  it("l'occhio di campione ha l'anello, il vuoto e il punto", () => {
    const { forme } = formeCampioneAngoli("cerchio", "#000000", "#FFFFFF");
    expect(forme).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/*  La stampa                                                                 */
/* -------------------------------------------------------------------------- */

/** Un PNG minuscolo, scritto a mano: quattro pixel in RGBA. */
function pngDiProva(): Buffer {
  const pezzo = (nome: string, corpo: Buffer) => {
    const lunghezza = Buffer.alloc(4);
    lunghezza.writeUInt32BE(corpo.length);
    const tipoECorpo = Buffer.concat([Buffer.from(nome, "latin1"), corpo]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tipoECorpo) >>> 0);
    return Buffer.concat([lunghezza, tipoECorpo, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // otto bit per canale
  ihdr[9] = 6; // RGBA
  const righe = Buffer.from([
    0, 255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 0, 255, 255, 255, 255, 255, 0,
  ]);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pezzo("IHDR", ihdr),
    pezzo("IDAT", deflateSync(righe)),
    pezzo("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

describe("il logo dentro il PDF", () => {
  it("apre un PNG e lo consegna in RGB", () => {
    const img = immaginePerPdf(pngDiProva(), [255, 255, 255]);
    expect(img).toBeTruthy();
    expect(img!.larghezza).toBe(2);
    expect(img!.altezza).toBe(2);
    expect(img!.spazio).toBe("DeviceRGB");
    expect(img!.filtro).toBe("FlateDecode");
  });

  it("compone la trasparenza sul fondo invece di annerirla", () => {
    /* Il quarto pixel è giallo con alfa a zero: su fondo bianco deve sparire
       nel bianco, non diventare un quadrato nero in mezzo al codice. */
    const { inflateSync } = require("zlib") as typeof import("zlib");
    const img = immaginePerPdf(pngDiProva(), [255, 255, 255])!;
    const rgb = inflateSync(img.dati);
    expect([...rgb.subarray(9, 12)]).toEqual([255, 255, 255]);
  });

  it("un formato che non sa aprire dice di no invece di indovinare", () => {
    expect(immaginePerPdf(Buffer.from("<svg/>", "utf8"), [255, 255, 255])).toBeNull();
  });
});

describe("il foglio da stampare", () => {
  it("è un PDF, col nome del codice in fondo", () => {
    const pdf = foglioQr({
      disegno: componiQr({ matrice: matrice(), design: design() }),
      nome: "Menu tavolo",
      sfondo: DESIGN_PREDEFINITO.coloreSfondo,
    });
    const testo = pdf.toString("latin1");
    expect(testo.startsWith("%PDF-1.4")).toBe(true);
    expect(testo).toContain("(Menu tavolo)");
    expect(testo.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("porta dentro il logo quando riesce ad aprirlo", () => {
    const pdf = foglioQr({
      disegno: componiQr({
        matrice: matrice(),
        design: design({ logoUrl: "https://x.it/l.png", posizioneLogo: "centro" }),
      }),
      nome: "Con logo",
      sfondo: "#FFFFFF",
      loghi: [{ url: "https://x.it/l.png", byte: pngDiProva() }],
    });
    const testo = pdf.toString("latin1");
    expect(testo).toContain("/Subtype /Image");
    expect(testo).toContain("/Im1 Do");
  });

  /* La tabella dei riferimenti è la parte del formato che un lettore usa per
     trovare ogni oggetto: un solo scostamento sbagliato e Acrobat dice «file
     danneggiato» senza aggiungere altro. Qui si rilegge il file come lo
     rileggerebbe lui. */
  it("la tabella dei riferimenti punta davvero agli oggetti, anche col logo dentro", () => {
    const pdf = foglioQr({
      disegno: componiQr({
        matrice: matrice(),
        design: design({ logoUrl: "https://x.it/l.png", posizioneLogo: "centro" }),
      }),
      nome: "Prova",
      sfondo: "#FFFFFF",
      loghi: [{ url: "https://x.it/l.png", byte: pngDiProva() }],
    });
    const testo = pdf.toString("latin1");
    const inizio = Number(testo.slice(testo.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
    const righe = testo.slice(inizio).split("\n");
    expect(righe[0]).toBe("xref");

    const quanti = Number(righe[1].split(" ")[1]);
    expect(quanti).toBe(8); // sette oggetti più la voce zero
    for (let i = 1; i < quanti; i++) {
      const scostamento = Number(righe[1 + i + 1].slice(0, 10));
      expect(testo.slice(scostamento, scostamento + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    }
  });

  it("un logo che non si apre non fa fallire la stampa", () => {
    const pdf = foglioQr({
      disegno: componiQr({
        matrice: matrice(),
        design: design({ logoUrl: "https://x.it/l.svg", posizioneLogo: "centro" }),
      }),
      nome: "Senza logo",
      sfondo: "#FFFFFF",
      loghi: [{ url: "https://x.it/l.svg", byte: Buffer.from("<svg/>", "utf8") }],
    });
    const testo = pdf.toString("latin1");
    expect(testo.startsWith("%PDF")).toBe(true);
    expect(testo).not.toContain("/Subtype /Image");
  });
});

/* -------------------------------------------------------------------------- */
/*  Gli indirizzi che il server va a prendere                                 */
/* -------------------------------------------------------------------------- */

describe("il filtro sugli indirizzi esterni", () => {
  it("accetta un indirizzo pubblico in https", () => {
    expect(indirizzoEsternoAmmesso("https://blob.vercel-storage.com/qr/logo.png")).toBe(true);
  });

  it.each([
    "http://esempio.it/l.png",
    "https://localhost/l.png",
    "https://127.0.0.1/l.png",
    "https://169.254.169.254/latest/meta-data/",
    "https://192.168.1.10/l.png",
    "https://10.0.0.4/l.png",
    "https://172.16.0.9/l.png",
    "https://[::1]/l.png",
    "file:///etc/passwd",
    "non-un-indirizzo",
  ])("rifiuta %s", (url) => {
    expect(indirizzoEsternoAmmesso(url)).toBe(false);
  });
});
