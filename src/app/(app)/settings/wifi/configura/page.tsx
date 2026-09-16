import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, getActiveVenue } from "@/lib/tenant";
import { decifra } from "@/lib/cifratura";
import { WizardPortale } from "@/components/settings/wifi/wizard-portale";

export const dynamic = "force-dynamic";

/**
 * La procedura guidata del portale Wi-Fi.
 *
 * Pagina e non finestra: sono quattro passi, ci si può tornare con un link, e
 * su un telefono una procedura dentro una finestra modale è una schermata
 * dentro una schermata.
 *
 * Chi non può configurare il locale non ci arriva nemmeno: la pagina rimanda
 * al pannello, dove trova comunque lo stato e l'anteprima. Un modulo con tutti
 * i campi disattivati è un modo più lento di dire «non puoi».
 */
export default async function ConfiguraWifiPage() {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_venue")) redirect("/settings/wifi");

  const v = ctx.venue;
  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="schermo animate-fade-in">
      <WizardPortale
        iniziale={{
          networkName: v.wifiNetworkName ?? "",
          // Nel database sta cifrata: qui si rilegge, perché il locale deve
          // poter vedere la password che sta consegnando ai suoi clienti.
          password: decifra(v.wifiPassword) ?? "",
          welcome: v.wifiPortalWelcome ?? "",
          legal: v.wifiPortalLegal ?? "",
          accent: v.wifiPortalAccent ?? "",
          logoUrl: v.wifiPortalLogoUrl ?? "",
          redirectUrl: v.wifiRedirectUrl ?? "",
          askEmail: v.wifiAskEmail,
          askPhone: v.wifiAskPhone,
          askMarketing: v.wifiAskMarketing,
          couponEnabled: v.wifiAutoCouponEnabled,
          couponPercent: v.wifiAutoCouponPercent,
          couponDays: v.wifiAutoCouponDays,
        }}
        venueName={v.name}
        venueLogoUrl={v.brandLogoUrl}
        portaleUrl={`${proto}://${host}/wifi/${v.slug}`}
        eraAttivo={v.wifiSetupAt != null}
      />
    </div>
  );
}
