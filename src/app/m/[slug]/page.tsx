import { notFound } from "next/navigation";
import { getMenuPubblico, nomeAllergene, nomeRegime } from "@/server/menu";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Il menu che legge il cliente, dal QR sul tavolo.
 *
 * Nessuna intestazione dell'applicazione, nessun accesso: chi apre questa
 * pagina è seduto a un tavolo con il telefono in mano, e quello che vuole è
 * leggere i piatti. Solo le categorie attive e i piatti disponibili — un
 * piatto finito non si legge, così nessuno lo ordina e nessuno resta deluso.
 *
 * Gli allergeni si scrivono per esteso, non come sigle o simboli: un cliente
 * allergico non deve interpretare una legenda.
 *
 * Le categorie in cima restano attaccate allo schermo: su un telefono, «dove
 * sono i dolci?» si risolve con un tocco invece che con dieci scorrimenti.
 * Sono **collegamenti**, non un componente interattivo: funzionano prima che
 * la pagina finisca di caricarsi, e chi non vede bene può usarli con la
 * tastiera come qualunque altro link.
 */

/** Un ancoraggio leggibile e stabile, dal nome della categoria. */
function ancora(nome: string): string {
  return `cat-${nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}
export default async function MenuPubblicoPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { carta?: string };
}) {
  const menu = await getMenuPubblico(params.slug, searchParams.carta || "main");
  if (!menu) notFound();

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto max-w-2xl space-y-8 py-8">
        <header className="space-y-2 text-center">
          {menu.brandLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={menu.brandLogoUrl} alt={menu.venueName} className="mx-auto h-14 w-auto object-contain" />
          )}
          <h1 className="text-display text-3xl">{menu.venueName}</h1>
        </header>

        {menu.categorie.length > 1 && (
          <nav
            aria-label="Vai a una portata"
            className="sticky top-0 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur"
          >
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {menu.categorie.map((c) => (
                <li key={c.name}>
                  <a
                    href={`#${ancora(c.name)}`}
                    className="inline-flex min-h-[36px] items-center whitespace-nowrap rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-current/10"
                  >
                    {c.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {menu.categorie.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Il menu non è ancora disponibile. Chiedi al personale.
          </p>
        ) : (
          menu.categorie.map((c) => (
            /* `scroll-mt` tiene il titolo sotto la barra appiccicata: senza,
               toccare «Dolci» porta il titolo esattamente dove la barra lo
               copre. */
            <section key={c.name} id={ancora(c.name)} className="scroll-mt-16 space-y-3">
              <h2 className="text-display text-xl">{c.name}</h2>
              <ul className="divide-y divide-border">
                {c.items.map((i) => (
                  <li key={i.name} className="py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-medium">{i.name}</span>
                      <span className="tabular-nums">{formatCurrency(i.priceCents, menu.currency)}</span>
                    </div>
                    {i.description && <p className="mt-1 text-sm text-muted-foreground">{i.description}</p>}
                    {(i.dietary.length > 0 || i.allergens.length > 0) && (
                      <p className="mt-1 t-nota">
                        {i.dietary.length > 0 && <>{i.dietary.map(nomeRegime).join(" · ")}</>}
                        {i.dietary.length > 0 && i.allergens.length > 0 && " — "}
                        {i.allergens.length > 0 && (
                          <>Contiene: {i.allergens.map(nomeAllergene).join(", ")}</>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <footer className="border-t border-border pt-6 text-center t-nota">
          Per intolleranze e allergie non elencate qui, parlane con il personale prima di ordinare.
        </footer>
      </div>
    </div>
  );
}
