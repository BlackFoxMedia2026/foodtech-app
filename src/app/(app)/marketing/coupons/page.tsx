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
  const items = await listCoupons(ctx.venueId);

  // Solo un giorno che esiste: un numero inventato nell'indirizzo non deve
  // creare un coupon valido in un giorno che non c'è.
  const giorno = Number(searchParams?.giorno);
  const giorniIniziali =
    Number.isInteger(giorno) && giorno >= 0 && giorno <= 6 ? [giorno] : [];

  return (
    <div className="schermo animate-fade-in">
      <CouponList
        items={items}
        canEdit={can(ctx.role, "edit_marketing")}
        apriNuovo={searchParams?.nuovo === "1"}
        giorniIniziali={giorniIniziali}
      />
    </div>
  );
}
