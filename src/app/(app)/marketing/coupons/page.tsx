import { can, getActiveVenue } from "@/lib/tenant";
import { listCoupons } from "@/server/coupons";
import { CouponList } from "@/components/coupons/coupon-list";

export const dynamic = "force-dynamic";

export default async function CouponsPage({
  searchParams,
}: {
  searchParams?: { nuovo?: string; giorno?: string };
}) {
  const ctx = await getActiveVenue();
  /*
    Gli archiviati si caricano, e non si mostrano.

    Prima restavano fuori dalla query, quindi dall'interfaccia non c'era modo
    di rivederne uno: archiviare era l'unica azione del prodotto senza ritorno.
    Adesso arrivano con gli altri e li tiene fuori dalla vista una linguetta —
    che è anche l'unico posto da cui si può riattivarli — e i due numeri che
    li riguardano (gli utilizzi di sempre) smettono di essere sbagliati per
    difetto: la storia di uno sconto non si cancella, quindi non si può
    nemmeno non contarla.
  */
  // Un orologio solo per la pagina: lo stesso con cui `listCoupons` decide chi
  // è scaduto e chi no, e con cui le schede scrivono «scade fra tre giorni».
  // Due `new Date()` diversi — uno qui, uno nel browser — sono il modo in cui
  // una scheda finisce per dire «Scaduto» accanto a «scade domani».
  const adesso = new Date();
  const items = await listCoupons(ctx.venueId, { includeArchived: true, now: adesso });

  // Solo un giorno che esiste: un numero inventato nell'indirizzo non deve
  // creare un coupon valido in un giorno che non c'è.
  const giorno = Number(searchParams?.giorno);
  const giorniIniziali =
    Number.isInteger(giorno) && giorno >= 0 && giorno <= 6 ? [giorno] : [];

  return (
    <div className="schermo animate-fade-in">
      <CouponList
        items={items}
        adesso={adesso}
        canEdit={can(ctx.role, "edit_marketing")}
        apriNuovo={searchParams?.nuovo === "1"}
        giorniIniziali={giorniIniziali}
      />
    </div>
  );
}
