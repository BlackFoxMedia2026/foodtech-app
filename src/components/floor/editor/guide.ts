import { isSegment, type RoomElement } from "@/lib/room-layout";

/**
 * Le guide intelligenti: le righe che compaiono quando un tavolo si allinea
 * a un altro.
 *
 * Non c'è una griglia visibile, e non è una dimenticanza. Una griglia dice
 * «allineati a me» sempre, anche quando non serve, e riempie di puntini una
 * schermata che deve somigliare a un pavimento. Le guide dicono la stessa
 * cosa solo nel momento in cui è vera — quando due tavoli stanno davvero per
 * andare in fila — e per il resto del tempo non ci sono.
 *
 * L'aggancio è **debole** di proposito: `SOGLIA_PX` è la distanza entro cui
 * scatta, ed è piccola abbastanza che chi vuole mettere un tavolo di sbieco
 * ci riesce senza combattere.
 */

export type Rettangolo = { x: number; y: number; w: number; h: number };
export type Guida = { orientamento: "v" | "h"; posizione: number; da: number; a: number };

const SOGLIA_PX = 7;
/** Il muro attira un po' di più: un tavolo appoggiato alla parete è una cosa
 * che si vuole quasi sempre, e mezzo centimetro di distacco si vede. */
const SOGLIA_MURO_PX = 10;

export type RisultatoGuide = {
  /** Quanto spostare il rettangolo perché l'allineamento sia esatto. */
  dx: number;
  dy: number;
  guide: Guida[];
};

export function calcolaGuide(
  mobile: Rettangolo,
  altri: Rettangolo[],
  elementi: RoomElement[],
): RisultatoGuide {
  const bordiV = [mobile.x, mobile.x + mobile.w / 2, mobile.x + mobile.w];
  const bordiH = [mobile.y, mobile.y + mobile.h / 2, mobile.y + mobile.h];

  let miglioreV: { delta: number; posizione: number; altro: Rettangolo } | null = null;
  let miglioreH: { delta: number; posizione: number; altro: Rettangolo } | null = null;

  for (const altro of altri) {
    const candidatiV = [altro.x, altro.x + altro.w / 2, altro.x + altro.w];
    for (const bordo of bordiV) {
      for (const cand of candidatiV) {
        const delta = cand - bordo;
        if (Math.abs(delta) <= SOGLIA_PX && (!miglioreV || Math.abs(delta) < Math.abs(miglioreV.delta))) {
          miglioreV = { delta, posizione: cand, altro };
        }
      }
    }
    const candidatiH = [altro.y, altro.y + altro.h / 2, altro.y + altro.h];
    for (const bordo of bordiH) {
      for (const cand of candidatiH) {
        const delta = cand - bordo;
        if (Math.abs(delta) <= SOGLIA_PX && (!miglioreH || Math.abs(delta) < Math.abs(miglioreH.delta))) {
          miglioreH = { delta, posizione: cand, altro };
        }
      }
    }
  }

  // I muri: solo quelli perfettamente verticali o orizzontali. Agganciarsi a
  // un muro obliquo con una riga dritta darebbe una guida che mente.
  let muroV: { delta: number; posizione: number; da: number; a: number } | null = null;
  let muroH: { delta: number; posizione: number; da: number; a: number } | null = null;

  for (const el of elementi) {
    if (!isSegment(el)) continue;
    const spessore = el.thickness / 2;
    if (Math.abs(el.startX - el.endX) < 1) {
      const facce = [el.startX - spessore, el.startX + spessore];
      const da = Math.min(el.startY, el.endY);
      const a = Math.max(el.startY, el.endY);
      for (const faccia of facce) {
        for (const bordo of [mobile.x, mobile.x + mobile.w]) {
          const delta = faccia - bordo;
          if (Math.abs(delta) <= SOGLIA_MURO_PX && (!muroV || Math.abs(delta) < Math.abs(muroV.delta))) {
            muroV = { delta, posizione: faccia, da, a };
          }
        }
      }
    } else if (Math.abs(el.startY - el.endY) < 1) {
      const facce = [el.startY - spessore, el.startY + spessore];
      const da = Math.min(el.startX, el.endX);
      const a = Math.max(el.startX, el.endX);
      for (const faccia of facce) {
        for (const bordo of [mobile.y, mobile.y + mobile.h]) {
          const delta = faccia - bordo;
          if (Math.abs(delta) <= SOGLIA_MURO_PX && (!muroH || Math.abs(delta) < Math.abs(muroH.delta))) {
            muroH = { delta, posizione: faccia, da, a };
          }
        }
      }
    }
  }

  const guide: Guida[] = [];
  let dx = 0;
  let dy = 0;

  // Fra un tavolo e un muro vince il più vicino: se sono entrambi in soglia,
  // quello a cui l'occhio sta davvero mirando è il più stretto.
  if (miglioreV && (!muroV || Math.abs(miglioreV.delta) <= Math.abs(muroV.delta))) {
    dx = miglioreV.delta;
    guide.push({
      orientamento: "v",
      posizione: miglioreV.posizione,
      da: Math.min(mobile.y, miglioreV.altro.y) - 24,
      a: Math.max(mobile.y + mobile.h, miglioreV.altro.y + miglioreV.altro.h) + 24,
    });
  } else if (muroV) {
    dx = muroV.delta;
    guide.push({ orientamento: "v", posizione: muroV.posizione, da: muroV.da, a: muroV.a });
  }

  if (miglioreH && (!muroH || Math.abs(miglioreH.delta) <= Math.abs(muroH.delta))) {
    dy = miglioreH.delta;
    guide.push({
      orientamento: "h",
      posizione: miglioreH.posizione,
      da: Math.min(mobile.x, miglioreH.altro.x) - 24,
      a: Math.max(mobile.x + mobile.w, miglioreH.altro.x + miglioreH.altro.w) + 24,
    });
  } else if (muroH) {
    dy = muroH.delta;
    guide.push({ orientamento: "h", posizione: muroH.posizione, da: muroH.da, a: muroH.a });
  }

  return { dx, dy, guide };
}
