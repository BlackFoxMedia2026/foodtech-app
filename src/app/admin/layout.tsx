import Link from "next/link";
import { TemaCarta } from "@/components/tema-carta";
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
      <TemaCarta />
      <header className="border-b border-border pt-[env(safe-area-inset-top)]">
        {/*
          Sul telefono due righe: il marchio con «Torna al gestionale», poi le
          cinque sezioni in una fila che scorre di lato (di proposito, e si
          vede dal bordo tagliato). Prima andavano a capo parola per parola —
          «Locali / e / servizi» — e l'ultima usciva dallo schermo. Da `md` la
          riga unica di sempre.
        */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 md:gap-3">
          <div className="flex min-w-0 items-center gap-4 max-md:contents">
            <Link href="/admin/dem" className="text-display text-sm max-md:order-1 max-md:flex max-md:min-h-[44px] max-md:items-center">
              Foodtech · Piattaforma
            </Link>
            <nav className="flex items-center gap-3 text-sm text-muted-foreground max-md:order-3 max-md:-mx-4 max-md:w-[calc(100%+2rem)] max-md:gap-1 max-md:overflow-x-auto max-md:px-2 max-md:[scrollbar-width:none]">
              {[
                ["/admin/dem", "Clienti"],
                ["/admin/dem/piani", "Piani"],
                ["/admin/locali", "Locali e servizi"],
                ["/admin/costi", "Costi"],
                ["/admin/integrazioni", "Integrazioni"],
              ].map(([href, nome]) => (
                <Link
                  key={href}
                  href={href}
                  className="whitespace-nowrap transition-colors hover:text-foreground max-md:flex max-md:min-h-[44px] max-md:items-center max-md:px-2"
                >
                  {nome}
                </Link>
              ))}
            </nav>
          </div>
          <Link
            href="/overview"
            className="t-nota transition-colors hover:text-foreground max-md:order-2 max-md:flex max-md:min-h-[44px] max-md:items-center"
          >
            Torna al gestionale
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
