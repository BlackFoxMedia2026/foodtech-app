import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { WifiSettings } from "@/components/settings/wifi-settings";
import { cifraturaAttiva, decifra } from "@/lib/cifratura";

export const dynamic = "force-dynamic";

export default async function WifiSettingsPage() {
  const ctx = await getActiveVenue();
  const v = ctx.venue;

  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="schermo animate-fade-in gap-3">
      <Button asChild variant="ghost" size="sm" className="fissa self-start">
        <Link href="/settings">
          <ArrowLeft className="h-4 w-4" /> Impostazioni
        </Link>
      </Button>

      <header className="fissa">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Impostazioni / Wi-Fi</p>
        <h1 className="text-display text-3xl">Portale Wi-Fi</h1>
      </header>

      {/*
        Lo stato della cifratura, detto una volta.

        Non è un dettaglio tecnico: è la differenza fra «se qualcuno legge una
        copia del database trova una stringa inutile» e «trova la password
        della vostra rete». Chi gestisce il locale ha il diritto di saperlo,
        e chi installa Tavolo ha il dovere di leggerlo.
      */}
      <p className="fissa text-xs text-tertiary-foreground">
        {cifraturaAttiva()
          ? "La password della rete è salvata cifrata: nel database non c'è il testo leggibile."
          : "La password della rete è salvata in chiaro: questa installazione non ha una chiave di cifratura configurata (CHIAVE_CIFRATURA). Il portale funziona comunque."}
      </p>

      <div className="fill-scroll pr-0.5">
      <WifiSettings
        iniziale={{
          networkName: v.wifiNetworkName,
          // Nel database sta cifrata: qui si rilegge, perché il locale deve
          // poter vedere la password che sta consegnando ai suoi clienti.
          password: decifra(v.wifiPassword),
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
    </div>
  );
}
