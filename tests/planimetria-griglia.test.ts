import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { preparaPlanimetria } from "@/server/planimetria-griglia";

/**
 * La griglia esiste per un motivo misurato: senza, il riconoscimento non
 * misurava le coordinate, riciclava le quote scritte sul disegno. Qui non si
 * verifica la qualità della lettura — quella dipende dal modello — ma che
 * l'immagine che gli mandiamo sia quella che crediamo.
 */

async function immagineDiProva(larghezza: number, altezza: number, formato: "png" | "jpeg" = "png") {
  const img = sharp({
    create: { width: larghezza, height: altezza, channels: 3, background: "#ffffff" },
  });
  const buf = await (formato === "png" ? img.png() : img.jpeg()).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function byteDelDataUrl(dataUrl: string) {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

describe("la planimetria preparata per il modello", () => {
  it("torna un PNG con la griglia, non un JPEG", async () => {
    const p = await preparaPlanimetria(await immagineDiProva(800, 600));
    expect(p?.conGriglia).toBe(true);
    expect(p?.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("le linee ci sono davvero: il bianco non è più tutto bianco", async () => {
    const p = await preparaPlanimetria(await immagineDiProva(800, 600));
    const meta = await sharp(byteDelDataUrl(p!.dataUrl)).stats();
    // Partiva da un foglio bianco pieno: se dopo il rosso e il blu hanno una
    // media più bassa del bianco, qualcosa è stato disegnato sopra.
    expect(meta.channels[0].mean).toBeLessThan(255);
    expect(meta.channels[2].mean).toBeLessThan(255);
  });

  it("le proporzioni restano quelle, e sotto il tetto non si tocca la dimensione", async () => {
    const p = await preparaPlanimetria(await immagineDiProva(954, 640));
    expect([p?.larghezza, p?.altezza]).toEqual([954, 640]);
  });

  it("un'immagine enorme si rimpicciolisce invece di far esplodere il trasferimento", async () => {
    const p = await preparaPlanimetria(await immagineDiProva(4096, 2048));
    expect(p?.larghezza).toBe(2048);
    expect(p?.altezza).toBe(1024);
  });

  it("un file che non è un'immagine non fa cadere il riconoscimento", async () => {
    const p = await preparaPlanimetria(Buffer.from("non sono una planimetria").buffer as ArrayBuffer);
    // Si va avanti senza griglia: il prompt lo dice al modello, che stima a
    // occhio invece di cercare un righello che non c'è.
    expect(p?.conGriglia).toBe(false);
  });

  it("un file vuoto è l'unico caso in cui si rinuncia", async () => {
    expect(await preparaPlanimetria(new ArrayBuffer(0))).toBeNull();
  });
});
