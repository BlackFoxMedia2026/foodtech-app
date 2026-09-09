import { can, getActiveVenue } from "@/lib/tenant";
import { listCoupons } from "@/server/coupons";
import { CouponList } from "@/components/coupons/coupon-list";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const ctx = await getActiveVenue();
  const items = await listCoupons(ctx.venueId);

  return (
    <div className="schermo animate-fade-in">
      <CouponList items={items} canEdit={can(ctx.role, "edit_marketing")} />
    </div>
  );
}
