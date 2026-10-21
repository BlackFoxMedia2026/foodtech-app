import Link from "next/link";
import { Fraunces, Inter, Space_Mono } from "next/font/google";
import { ArrowRight, CalendarRange, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/shell/logo";
import { TemaCarta } from "@/components/tema-carta";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap" });

const NAV_LINKS = [
  { href: "#features", label: "Funzionalità" },
  { href: "#audience", label: "Per chi" },
  { href: "#pricing", label: "Piani" },
];

const SLOTS = [
  { time: "19:00", covers: 14 },
  { time: "19:30", covers: 22 },
  { time: "20:00", covers: 28 },
  { time: "20:30", covers: 26 },
  { time: "21:00", covers: 18 },
  { time: "21:30", covers: 12 },
];

const FEATURES = [
  {
    icon: CalendarRange,
    title: "Prenotazioni unificate",
    body: "Sito, telefono, social, walk-in: un'unica timeline con stati chiari e note operative.",
  },
  {
    icon: Users,
    title: "CRM degli ospiti",
    body: "Storico visite, preferenze, allergie e fedeltà per accogliere ogni cliente come un habitué.",
  },
  {
    icon: Sparkles,
    title: "Esperienze e ticket",
    body: "Eventi, degustazioni e serate speciali con limiti di capienza e pagamenti integrati.",
  },
];

export default function Landing() {
  return (
    <main
      className={cn(
        sans.variable,
        display.variable,
        mono.variable,
        "relative z-0 min-h-screen bg-background text-foreground",
      )}
    >
      <TemaCarta />
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-display text-lg">Tavolo</span>
          </Link>

          <nav
            aria-label="Navigazione principale"
            className="hidden items-center gap-1 rounded-full border border-border bg-muted/70 p-1 md:flex"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <Button asChild size="sm" variant="accent">
            <Link href="/sign-in">Accedi</Link>
          </Button>
        </div>
      </header>

      <section className="container grid gap-12 py-20 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div className="space-y-6">
          <Badge tone="gold">Beta · gestionale ospitalità</Badge>
          <h1 className="text-display text-balance text-5xl leading-tight md:text-6xl">
            Il tempo della sala, <br />
            <span className="text-accent-strong">finalmente in ordine.</span>
          </h1>
          <p className="max-w-lg text-pretty text-lg text-muted-foreground">
            Tavolo unisce prenotazioni, mappa sala, CRM, esperienze e marketing
            in un&apos;unica piattaforma per ristoranti, beach club e gruppi
            hospitality di fascia medio-alta.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" variant="brand">
              <Link href="/sign-in">
                Prova la demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-input hover:bg-secondary">
              <Link href="#features">Scopri di più</Link>
            </Button>
          </div>
        </div>

        <Card className="card-notch overflow-hidden p-6 md:aspect-[4/3]">
          <div className="flex items-center justify-between">
            <Badge tone="gold">Aurora Bistrot · Stasera</Badge>
          </div>
          <p className="mt-4 font-mono text-3xl font-semibold">142 coperti</p>
          <p className="text-sm text-muted-foreground">98% occupazione · 4 turni · 6 VIP attesi</p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-xs">
            {SLOTS.map((slot) => (
              <div key={slot.time} className="riquadro p-3">
                <p className="text-muted-foreground">{slot.time}</p>
                <p className="mt-1 font-mono font-medium">{slot.covers} cop.</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section id="features" className="container grid gap-6 py-12 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="card-notch p-6">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-kpi-icon-border bg-kpi-icon-fill text-kpi-icon-ink">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-display text-xl">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </Card>
        ))}
      </section>

      <section className="border-y border-border bg-card">
        <div className="container flex flex-col items-center gap-4 py-16 text-center">
          <h2 className="text-display text-balance text-3xl">Pronto a mettere ordine nella sala?</h2>
          <p className="max-w-md text-pretty text-muted-foreground">
            Prova Tavolo con i tuoi dati, in pochi minuti, senza impegno.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="brand">
              <Link href="/sign-in">
                Prova la demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-input hover:bg-secondary">
              <Link href="/sign-in">Accedi</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-4 py-10 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Tavolo — Made for hospitality teams.</p>
          <nav className="flex items-center gap-4">
            <Link href="#features" className="transition-colors hover:text-foreground">
              Funzionalità
            </Link>
            <Link href="/sign-in" className="transition-colors hover:text-foreground">
              Accedi
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
