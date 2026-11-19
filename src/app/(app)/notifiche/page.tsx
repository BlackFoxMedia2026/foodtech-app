import { getActiveVenue } from "@/lib/tenant";
import { listNotifications } from "@/server/notifications";
import { ElencoNotifiche } from "@/components/shell/elenco-notifiche";

export const dynamic = "force-dynamic";

/**
 * Tutte le notifiche (19 nov 2026).
 *
 * La campanella mostra le ultime; qui c'è lo storico, diviso per giorno e
 * filtrabile per tipo, con «da leggere» a un tocco. Ci si arriva da «Vedi
 * tutte le notifiche» in fondo alla campanella.
 */
export default async function NotifichePage() {
  const ctx = await getActiveVenue();
  const notifiche = await listNotifications(ctx.venueId, ctx.role, { limit: 300 });
  return (
    <div className="schermo animate-fade-in">
      <div className="fill-scroll -mx-2 -mt-2 px-2 pb-6 pt-2">
        <ElencoNotifiche
          iniziali={notifiche.map((n) => ({
            id: n.id,
            kind: n.kind,
            title: n.title,
            body: n.body,
            link: n.link,
            readAt: n.readAt ? n.readAt.toISOString() : null,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
