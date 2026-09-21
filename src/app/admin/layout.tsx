import Link from "next/link";
import { notFound } from "next/navigation";
import { superAdminCorrente } from "@/lib/super-admin";

export const dynamic = "force-dynamic";

/**
 * Il pannello di piattaforma.
 *
 * Sta fuori dal guscio del gestionale, e non è una scelta estetica: quel
 * guscio è costruito intorno a **un locale attivo** — la barra, il selettore
 * dei locali, le notifiche del ristorante. Qui il locale non c'è: si guardano
 * tutti.
 *
 * A chi non è amministratore la pagina risponde «non esiste», non «non hai i
 * permessi». Un 403 è comunque una risposta: dice che qui c'è qualcosa.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/admin/dem" className="text-display text-sm">
              Foodtech · Piattaforma
            </Link>
            <nav className="flex items-center gap-3 text-sm text-muted-foreground">
              <Link href="/admin/dem" className="transition-colors hover:text-foreground">
                Clienti
              </Link>
              <Link href="/admin/dem/piani" className="transition-colors hover:text-foreground">
                Piani
              </Link>
              <Link href="/admin/locali" className="transition-colors hover:text-foreground">
                Locali e servizi
              </Link>
              <Link href="/admin/costi" className="transition-colors hover:text-foreground">
                Costi
              </Link>
            </nav>
          </div>
          <Link href="/overview" className="t-nota transition-colors hover:text-foreground">
            Torna al gestionale
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
