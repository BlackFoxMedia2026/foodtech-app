import { Fraunces, Inter, Space_Mono } from "next/font/google";
import { Header } from "@/components/shell/header";
import { BrandSetupDialog } from "@/components/settings/brand-setup-dialog";
import { can, getActiveVenue } from "@/lib/tenant";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap" });

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveVenue();
  const showBrandSetup = ctx.venue.onboardingStatus === "NOT_STARTED" && can(ctx.role, "manage_venue");

  const venueList = ctx.allMemberships.map((m) => ({
    id: m.venue.id,
    name: m.venue.name,
    city: m.venue.city,
  }));

  return (
    <div className={`${sans.variable} ${display.variable} ${mono.variable} relative z-0 flex h-screen flex-col overflow-hidden bg-background text-foreground`}>
      <Header
        user={{ name: ctx.session.user?.name, email: ctx.session.user?.email }}
        venues={venueList}
        activeVenueId={ctx.venueId}
      />
      <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">{children}</main>
      {showBrandSetup && <BrandSetupDialog initialName={ctx.venue.name} />}
    </div>
  );
}
