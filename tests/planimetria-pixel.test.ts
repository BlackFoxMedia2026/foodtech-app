import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { rilevaStanze } from "@/server/planimetria-pixel";

/**
 * Il calcolo delle stanze dai pixel.
 *
 * Si verifica su planimetrie disegnate qui, di cui conosciamo la risposta al
 * pixel: è l'unico modo di accorgersi che una modifica ai parametri della
 * morfologia ha rotto qualcosa, visto che dall'altra parte c'è un modello che
 * risponde in modo diverso ogni volta.
 */

/** Una planimetria finta: perimetro, un tramezzo verticale, e un vano porta
 * largo come una porta vera. */
async function planimetria(opts: { varco?: number; tramezzo?: boolean } = {}) {
  const W = 800;
  const H = 600;
  const varco = opts.varco ?? 40;
  const linee = [
    `<rect x="60" y="60" width="680" height="480" fill="none" stroke="black" stroke-width="8"/>`,
    opts.tramezzo === false
      ? ""
      : `<line x1="400" y1="60" x2="400" y2="${300 - varco / 2}" stroke="black" stroke-width="8"/>` +
        `<line x1="400" y1="${300 + varco / 2}" x2="400" y2="540" stroke="black" stroke-width="8"/>`,
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="white"/>${linee.join("")}</svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("le stanze calcolate dai pixel", () => {
  it("due stanze divise da un tramezzo, col vano porta tappato", async () => {
    const r = await rilevaStanze(await planimetria());
    expect(r).not.toBeNull();
    const grandi = r!.regioni.filter((g) => g.area > 0.05);
    expect(grandi).toHaveLength(2);
    // Una a sinistra del tramezzo e una a destra, ciascuna circa mezza sala.
    const centri = grandi.map((g) => g.x + g.width / 2).sort((a, b) => a - b);
    expect(centri[0]).toBeGreaterThan(0.15);
    expect(centri[0]).toBeLessThan(0.35);
    expect(centri[1]).toBeGreaterThan(0.6);
    expect(centri[1]).toBeLessThan(0.8);
  }, 60000);

  it("senza tramezzo è una stanza sola, e occupa quasi tutto il perimetro", async () => {
    const r = await rilevaStanze(await planimetria({ tramezzo: false }));
    const grandi = r!.regioni.filter((g) => g.area > 0.05);
    expect(grandi).toHaveLength(1);
    expect(grandi[0].width).toBeGreaterThan(0.8);
    expect(grandi[0].height).toBeGreaterThan(0.75);
  }, 60000);

  it("le misure sono in frazione, non in pixel: raddoppiare la scansione non cambia il risultato", async () => {
    const piccola = await rilevaStanze(await planimetria());
    const grande = await sharp(Buffer.from(await planimetria().then((b) => Buffer.from(b))))
      .resize(1600, 1200)
      .png()
      .toBuffer();
    const r = await rilevaStanze(grande.buffer.slice(grande.byteOffset, grande.byteOffset + grande.byteLength) as ArrayBuffer);
    // Ordinate: le due stanze hanno area quasi identica e quale sia «la
    // prima» può cambiare per un pixel. Qui si verifica *dove* sono, non in
    // che ordine escono.
    const centri = (x: typeof piccola) =>
      x!.regioni.filter((g) => g.area > 0.05).map((g) => +(g.x + g.width / 2).toFixed(1)).sort();
    expect(centri(r)).toEqual(centri(piccola));
  }, 90000);

  it("i riquadri escono ordinati dal più grande, e numerati da 1", async () => {
    const r = await rilevaStanze(await planimetria());
    const aree = r!.regioni.map((g) => g.area);
    expect([...aree].sort((x, y) => y - x)).toEqual(aree);
    expect(r!.regioni.map((g) => g.numero)).toEqual(r!.regioni.map((_, i) => i + 1));
  }, 60000);

  it("un foglio bianco non ha stanze, e lo dice", async () => {
    const vuoto = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ffffff" } })
      .png()
      .toBuffer();
    const r = await rilevaStanze(vuoto.buffer.slice(vuoto.byteOffset, vuoto.byteOffset + vuoto.byteLength) as ArrayBuffer);
    expect(r).toBeNull();
  }, 60000);

  it("un file che non è un'immagine non fa cadere il riconoscimento", async () => {
    expect(await rilevaStanze(Buffer.from("niente").buffer as ArrayBuffer)).toBeNull();
  }, 30000);
});
