import { headers } from "next/headers";
import { getActiveVenue } from "@/lib/tenant";
import { listQrCodes, superficiDelLocale } from "@/server/qr-codes";
import { formatDateTime } from "@/lib/utils";
import { QrCodeManager } from "@/components/marketing/qr-code-manager";

export const dynamic = "force-dynamic";

export default async function QrCodesPage() {
  const ctx = await getActiveVenue();

  /* L'origine si legge dalla richiesta, come fa la pagina del portale Wi-Fi:
     lo stesso locale è raggiungibile su domini diversi (l'anteprima, il
     dominio del prodotto, un domino suo) e un QR stampato deve puntare a
     quello da cui lo si sta creando. */
  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const [items, superfici] = await Promise.all([
    listQrCodes(ctx.venueId),
    superficiDelLocale(
      { id: ctx.venueId, slug: ctx.venue.slug, wifiSetupAt: ctx.venue.wifiSetupAt },
      `${proto}://${host}`,
    ),
  ]);

  return (
    <QrCodeManager
      superfici={superfici}
      items={items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        destinationUrl: item.destinationUrl,
        category: item.category,
        isActive: item.isActive,
        scansCount: item.scansCount,
        createdAtLabel: formatDateTime(item.createdAt),
      }))}
    />
  );
}
