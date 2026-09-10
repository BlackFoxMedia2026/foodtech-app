import { describe, expect, it } from "vitest";
import { stessaDestinazione, superficiPubbliche, type FattiDelLocale } from "@/lib/qr-superfici";

const BASE: FattiDelLocale = {
  slug: "aurora-bistrot",
  origine: "https://tavolo.app",
  wifiPronto: true,
  piattiVisibili: 24,
  linkRecensione: { url: "https://g.page/r/aurora/review", etichetta: "Google" },
  giaCreati: [],
};

const per = (chiave: string, f: FattiDelLocale = BASE) =>
  superficiPubbliche(f).find((s) => s.chiave === chiave)!;

describe("superficiPubbliche", () => {
  it("propone le quattro superfici, sempre nello stesso ordine", () => {
    expect(superficiPubbliche(BASE).map((s) => s.chiave)).toEqual(["menu", "prenota", "wifi", "recensione"]);
  });

  it("costruisce gli indirizzi pubblici dallo slug", () => {
    expect(per("menu").url).toBe("https://tavolo.app/m/aurora-bistrot");
    expect(per("prenota").url).toBe("https://tavolo.app/book?venue=aurora-bistrot");
    expect(per("wifi").url).toBe("https://tavolo.app/wifi/aurora-bistrot");
    expect(per("recensione").url).toBe("https://g.page/r/aurora/review");
  });

  it("non raddoppia la barra quando l'origine ne ha una in fondo", () => {
    expect(per("menu", { ...BASE, origine: "https://tavolo.app/" }).url).toBe("https://tavolo.app/m/aurora-bistrot");
  });

  it("la prenotazione è sempre pronta: quella pagina esiste per ogni locale", () => {
    expect(per("prenota", { ...BASE, piattiVisibili: 0, wifiPronto: false, linkRecensione: null }).stato).toBe("pronta");
  });

  it("una carta senza piatti visibili non è una superficie pronta, e dice cosa manca", () => {
    const s = per("menu", { ...BASE, piattiVisibili: 0 });
    expect(s.stato).toBe("manca");
    expect(s.cosaManca).toContain("piatti disponibili");
    expect(s.dove).toBe("/menu");
  });

  it("il portale Wi-Fi non configurato si dice, non si nasconde", () => {
    const tutte = superficiPubbliche({ ...BASE, wifiPronto: false });
    expect(tutte.map((s) => s.chiave)).toContain("wifi");
    const s = tutte.find((x) => x.chiave === "wifi")!;
    expect(s.stato).toBe("manca");
    expect(s.dove).toBe("/settings/wifi");
  });

  it("senza collegamento di recensione non inventa un indirizzo", () => {
    const s = per("recensione", { ...BASE, linkRecensione: null });
    expect(s.stato).toBe("manca");
    expect(s.url).toBe("");
    expect(s.nome).toBe("Lascia una recensione");
  });

  it("con il collegamento, il nome dice su quale piattaforma", () => {
    expect(per("recensione").nome).toBe("Lascia una recensione su Google");
  });

  it("un QR che esiste già non si propone di nuovo", () => {
    const f = { ...BASE, giaCreati: ["https://tavolo.app/m/aurora-bistrot"] };
    expect(per("menu", f).stato).toBe("giaCreato");
    expect(per("prenota", f).stato).toBe("pronta");
  });

  it("riconosce il doppione anche con la barra finale o l'host in maiuscolo", () => {
    for (const g of ["https://tavolo.app/m/aurora-bistrot/", "https://TAVOLO.APP/m/aurora-bistrot", "tavolo.app/m/aurora-bistrot"]) {
      expect(per("menu", { ...BASE, giaCreati: [g] }).stato).toBe("giaCreato");
    }
  });

  it("una superficie che manca non diventa «già creata» anche se un QR ci punta", () => {
    // il portale non è configurato: il QR esisterebbe ma porterebbe a una pagina che non c'è
    const s = per("wifi", { ...BASE, wifiPronto: false, giaCreati: ["https://tavolo.app/wifi/aurora-bistrot"] });
    expect(s.stato).toBe("manca");
  });

  it("le categorie sono quelle che il modello accetta", () => {
    expect(superficiPubbliche(BASE).map((s) => s.categoria)).toEqual(["MENU", "BOOKING", "OTHER", "REVIEW"]);
  });
});

describe("stessaDestinazione", () => {
  it("ignora barra finale, maiuscole dell'host e schema mancante", () => {
    expect(stessaDestinazione("https://a.it/x", "https://a.it/x/")).toBe(true);
    expect(stessaDestinazione("https://A.IT/x", "https://a.it/x")).toBe(true);
    expect(stessaDestinazione("a.it/x", "https://a.it/x")).toBe(true);
  });

  it("distingue percorsi e parametri diversi", () => {
    expect(stessaDestinazione("https://a.it/x", "https://a.it/y")).toBe(false);
    expect(stessaDestinazione("https://a.it/b?venue=uno", "https://a.it/b?venue=due")).toBe(false);
  });

  it("su una stringa che non è un indirizzo non solleva", () => {
    expect(stessaDestinazione("non un url", "non un url")).toBe(true);
    expect(stessaDestinazione("", "")).toBe(true);
  });
});

describe("il nome della superficie delle recensioni", () => {
  it("senza nome di piattaforma resta generico, non dice «su Altro»", () => {
    const s = superficiPubbliche({
      ...BASE,
      linkRecensione: { url: "https://esempio.it/recensioni", etichetta: "" },
    }).find((x) => x.chiave === "recensione")!;
    expect(s.nome).toBe("Lascia una recensione");
    expect(s.stato).toBe("pronta");
    expect(s.url).toBe("https://esempio.it/recensioni");
  });
});
