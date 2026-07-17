import { getActiveVenue } from "@/lib/tenant";
import { listQrCodes } from "@/server/qr-codes";
import { formatDateTime } from "@/lib/utils";
import { QrCodeManager } from "@/components/marketing/qr-code-manager";

export const dynamic = "force-dynamic";

export default async function QrCodesPage() {
  const ctx = await getActiveVenue();
  const items = await listQrCodes(ctx.venueId);

  return (
    <QrCodeManager
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
