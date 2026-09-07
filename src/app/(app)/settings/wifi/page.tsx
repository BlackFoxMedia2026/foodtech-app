import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { WifiSettings } from "@/components/settings/wifi-settings";

export const dynamic = "force-dynamic";

export default async function WifiSettingsPage() {
  const ctx = await getActiveVenue();
  const v = ctx.venue;

  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="space-y-6 animate-fade-in">
      <Button asChild variant="ghost" size="sm">
        <Link href="/settings">
          <ArrowLeft className="h-4 w-4" /> Impostazioni
        </Link>
      </Button>

      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Impostazioni / Wi-Fi</p>
        <h1 className="text-display text-3xl">Portale Wi-Fi</h1>
      </header>

      <WifiSettings
        iniziale={{
          networkName: v.wifiNetworkName,
          password: v.wifiPassword,
          welcome: v.wifiPortalWelcome,
          legal: v.wifiPortalLegal,
          accent: v.wifiPortalAccent,
          redirectUrl: v.wifiRedirectUrl,
          couponEnabled: v.wifiAutoCouponEnabled,
          couponPercent: v.wifiAutoCouponPercent,
          couponDays: v.wifiAutoCouponDays,
          attivo: v.wifiSetupAt != null,
        }}
        portaleUrl={`${proto}://${host}/wifi/${v.slug}`}
        canManage={can(ctx.role, "manage_venue")}
      />
    </div>
  );
}
