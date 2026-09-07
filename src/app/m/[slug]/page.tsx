import { notFound } from "next/navigation";
import { ALLERGENI, REGIMI, getMenuPubblico } from "@/server/menu";
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
 */
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

        {menu.categorie.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Il menu non è ancora disponibile. Chiedi al personale.
          </p>
        ) : (
          menu.categorie.map((c) => (
            <section key={c.name} className="space-y-3">
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
                      <p className="mt-1 text-xs text-tertiary-foreground">
                        {i.dietary.length > 0 && <>{i.dietary.map((d) => REGIMI[d]).join(" · ")}</>}
                        {i.dietary.length > 0 && i.allergens.length > 0 && " — "}
                        {i.allergens.length > 0 && (
                          <>Contiene: {i.allergens.map((a) => ALLERGENI[a]).join(", ")}</>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <footer className="border-t border-border pt-6 text-center text-xs text-tertiary-foreground">
          Per intolleranze e allergie non elencate qui, parlane con il personale prima di ordinare.
        </footer>
      </div>
    </div>
  );
}
