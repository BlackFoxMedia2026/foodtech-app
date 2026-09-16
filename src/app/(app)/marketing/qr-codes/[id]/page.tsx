import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { can, getActiveVenue } from "@/lib/tenant";
import { origineDa } from "@/lib/origine";
import { contestoEditor, getQrCode } from "@/server/qr-codes";
import { PAYLOAD_WIFI_VUOTO } from "@/lib/qr-contenuto";
import { QrCreazione } from "@/components/marketing/qr/qr-creazione";
import type { BozzaQr } from "@/components/marketing/qr/bozza";

export const dynamic = "force-dynamic";

/** L'editor di un codice che esiste già: stesso editor, campi già pieni. */
export default async function ModificaQrPage({ params }: { params: { id: string } }) {
  const venue = await getActiveVenue();
  const origine = origineDa(headers());

  const [qr, ctx] = await Promise.all([
    getQrCode(venue.venueId, params.id, origine),
    contestoEditor(venue.venue, origine, can(venue.role, "manage_venue")),
  ]);
  if (!qr) notFound();

  const bozza: BozzaQr = {
    nome: qr.name,
    kind: qr.kind,
    tableIds: qr.tableId ? [qr.tableId] : [],
    destinationUrl: qr.link ?? "",
    payload:
      qr.payload ?? (qr.kind === "WIFI" ? { wifi: { ...PAYLOAD_WIFI_VUOTO } } : {}),
    design: qr.design,
  };

  return <QrCreazione bozzaIniziale={bozza} ctx={ctx} id={qr.id} />;
}
