import Link from "next/link";
import { Megaphone, QrCode as QrCodeIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

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
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-accent">
              <Megaphone className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Campagne email</span>
            </div>
            <CardTitle>Campagne email</CardTitle>
            <CardDescription>
              Crea campagne email, scegli segmenti di ospiti e programma comunicazioni.
            </CardDescription>
          </CardHeader>
          <CardContent />
          <CardFooter>
            <Button asChild variant="gold">
              <Link href="/campaigns">Gestisci campagne</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-accent">
              <QrCodeIcon className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">QR Code</span>
            </div>
            <CardTitle>QR Code</CardTitle>
            <CardDescription>
              Genera QR code collegati a URL specifici per menu, prenotazioni, eventi o campagne.
            </CardDescription>
          </CardHeader>
          <CardContent />
          <CardFooter>
            <Button asChild variant="gold">
              <Link href="/marketing/qr-codes">Crea QR code</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
