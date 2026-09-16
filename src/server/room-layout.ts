import { db } from "@/lib/db";
import {
  boundingBox,
  parseRoomInventory,
  parseRoomLayers,
  parseRoomLayoutElements,
  parseRoomMeta,
  SaveRoomLayoutSchema,
  type RoomElement,
} from "@/lib/room-layout";
import { parseFloorPlanAnalysis, type FloorPlanAnalysis } from "@/lib/floorplan-analysis";

export async function getRoomLayout(venueId: string, roomId: string) {
  const room = await db.room.findFirst({ where: { id: roomId, venueId }, include: { roomLayout: true } });
  if (!room) throw new Error("not_found");
  return room.roomLayout;
}

/** La piantina di una sala già pronta per l'editor: elementi validati, layer
 * completati con i valori di partenza, inventario e meta normalizzati. Sta
 * qui e non nella pagina perché la Sala, il Servizio e le Prenotazioni devono
 * leggere la stessa piantina nello stesso modo. */
export function readRoomLayout(layout: {
  elements: unknown;
  layers: unknown;
  inventory: unknown;
  meta: unknown;
  analysis?: unknown;
} | null) {
  return {
    elements: parseRoomLayoutElements(layout?.elements ?? []),
    layers: parseRoomLayers(layout?.layers ?? {}),
    inventory: parseRoomInventory(layout?.inventory ?? {}),
    meta: parseRoomMeta(layout?.meta ?? {}),
    analysis: layout?.analysis ? parseFloorPlanAnalysis(layout.analysis) : null,
  };
}

export async function saveRoomLayout(venueId: string, roomId: string, raw: unknown) {
  const room = await db.room.findFirst({ where: { id: roomId, venueId }, include: { roomLayout: true } });
  if (!room) throw new Error("not_found");

  const input = SaveRoomLayoutSchema.parse(raw);
  const box = boundingBox(input.elements as RoomElement[]);
  const margin = 40;
  const width = Math.max(input.width, Math.round(box.maxX + margin));
  const height = Math.max(input.height, Math.round(box.maxY + margin));

  // I campi non inviati restano quelli salvati: l'editor manda sempre tutto,
  // ma un chiamante che vuole cambiare solo i layer non deve rischiare di
  // azzerare l'inventario dichiarato.
  const layers = input.layers ? { ...parseRoomLayers(room.roomLayout?.layers ?? {}), ...input.layers } : undefined;

  const [layout] = await db.$transaction([
    db.roomLayout.upsert({
      where: { roomId },
      create: {
        roomId,
        elements: input.elements,
        layers: layers ?? {},
        inventory: input.inventory ?? {},
        meta: input.meta ?? {},
      },
      update: {
        elements: input.elements,
        ...(layers ? { layers } : {}),
        ...(input.inventory ? { inventory: input.inventory } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
      },
    }),
    db.room.update({ where: { id: roomId }, data: { width, height, activeLayoutMode: "BUILDER" } }),
  ]);

  return layout;
}

export async function setActiveLayoutMode(venueId: string, roomId: string, mode: "IMAGE" | "BUILDER") {
  const room = await db.room.findFirst({ where: { id: roomId, venueId } });
  if (!room) throw new Error("not_found");
  return db.room.update({ where: { id: roomId }, data: { activeLayoutMode: mode } });
}

/**
 * Conserva il riconoscimento accanto alla sala.
 *
 * Non tocca `elements`: il risultato dell'analisi diventa la piantina solo
 * quando il ristoratore lo conferma e salva. Fin lì resta materiale grezzo,
 * utile se domani il riconoscitore migliora e vogliamo rigenerare la piantina
 * senza chiedere di ricaricare l'immagine.
 */
export async function storeFloorPlanAnalysis(roomId: string, analysis: FloorPlanAnalysis) {
  return db.roomLayout.upsert({
    where: { roomId },
    create: { roomId, elements: [], analysis, analyzedAt: new Date() },
    update: { analysis, analyzedAt: new Date() },
  });
}
