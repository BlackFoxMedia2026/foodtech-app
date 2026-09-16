import { headers } from "next/headers";
import { getActiveVenue } from "@/lib/tenant";
import { origineDa } from "@/lib/origine";
import { listQrCodes } from "@/server/qr-codes";
import { QrLista } from "@/components/marketing/qr/qr-lista";

export const dynamic = "force-dynamic";

export default async function QrCodesPage() {
  const ctx = await getActiveVenue();
  const origine = origineDa(headers());

  const items = await listQrCodes(ctx.venueId, origine);

  return (
    <QrLista
      items={items.map((q) => ({ ...q, createdAt: q.createdAt.toISOString() }))}
    />
  );
}
