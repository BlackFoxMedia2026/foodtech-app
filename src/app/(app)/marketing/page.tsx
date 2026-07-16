import Link from "next/link";
import { ChevronRight, Megaphone, QrCode as QrCodeIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/campaigns",
    icon: Megaphone,
    eyebrow: "Campagne email",
    title: "Campagne email",
    description: "Crea campagne email, scegli segmenti di ospiti e programma comunicazioni.",
  },
  {
    href: "/marketing/qr-codes",
    icon: QrCodeIcon,
    eyebrow: "QR Code",
    title: "QR Code",
    description: "Genera QR code collegati a URL specifici per menu, prenotazioni, eventi o campagne.",
  },
];

export default function MarketingPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing</p>
        <h1 className="text-display text-3xl">Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Gestisci campagne, strumenti promozionali e contenuti per raggiungere i tuoi ospiti.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map(({ href, icon: Icon, eyebrow, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:border-gilt-dark/50">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <div className="flex items-center gap-2 text-accent">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wide">{eyebrow}</span>
                  </div>
                  <CardTitle className="mt-1">{title}</CardTitle>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription>{description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
