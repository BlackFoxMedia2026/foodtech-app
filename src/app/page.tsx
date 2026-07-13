import Link from "next/link";
import { ArrowRight, CalendarRange, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <main className="dark relative z-0 min-h-screen overflow-hidden bg-background text-foreground">
      <div className="mesh-bg pointer-events-none absolute -inset-32 -z-10">
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
        <div className="mesh-blob mesh-blob-4" />
        <div className="mesh-blob mesh-blob-5" />
        <div className="mesh-blob mesh-blob-6" />
      </div>

      <header className="container relative z-10 flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background font-display font-semibold">T</span>
          <span className="text-display text-lg">Tavolo</span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="#features">Funzionalità</Link>
          <Link href="#audience">Per chi</Link>
          <Link href="#pricing">Piani</Link>
        </nav>
        <Button asChild size="sm">
          <Link href="/sign-in">Area riservata</Link>
        </Button>
      </header>

      <section className="container relative z-10 grid gap-12 py-20 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs uppercase tracking-wider text-accent">
            Beta · gestionale ospitalità
          </p>
          <h1 className="text-display text-5xl leading-tight md:text-6xl">
            Il tempo della sala, <br />
            <span className="text-accent">finalmente in ordine.</span>
          </h1>
          <p className="max-w-lg text-lg text-muted-foreground">
            Tavolo unisce prenotazioni, mappa sala, CRM, esperienze e marketing
            in un&apos;unica piattaforma per ristoranti, beach club e gruppi
            hospitality di fascia medio-alta.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" variant="gold">
              <Link href="/sign-in">
                Prova la demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#features">Scopri di più</Link>
            </Button>
          </div>
        </div>

        <div className="surface aspect-[4/3] overflow-hidden p-6">
          <p className="text-xs uppercase tracking-widest text-accent">Aurora Bistrot · Stasera</p>
          <p className="mt-2 text-display text-3xl">142 coperti</p>
          <p className="text-sm text-muted-foreground">98% occupazione · 4 turni · 6 VIP attesi</p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-xs">
            {["19:00", "19:30", "20:00", "20:30", "21:00", "21:30"].map((t) => (
              <div key={t} className="rounded-md border border-white/10 p-3">
                <p className="text-muted-foreground">{t}</p>
                <p className="mt-1 font-medium">{Math.floor(Math.random() * 22 + 8)} cop.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="container relative z-10 grid gap-6 py-12 md:grid-cols-3">
        {[
          { icon: CalendarRange, title: "Prenotazioni unificate", body: "Sito, telefono, social, walk-in: un'unica timeline con stati chiari e note operative." },
          { icon: Users, title: "CRM degli ospiti", body: "Storico visite, preferenze, allergie e fedeltà per accogliere ogni cliente come un habitué." },
          { icon: Sparkles, title: "Esperienze e ticket", body: "Eventi, degustazioni e serate speciali con limiti di capienza e pagamenti integrati." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="surface p-6">
            <Icon className="h-6 w-6 text-accent" />
            <h3 className="mt-4 text-display text-xl">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <footer className="container relative z-10 py-12 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Tavolo — Made for hospitality teams.
      </footer>
    </main>
  );
}
