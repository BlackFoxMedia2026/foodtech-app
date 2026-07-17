"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ColorField } from "./color-field";
import { BrandImageField } from "./brand-image-field";
import { BrandPreviewCard } from "./brand-preview-card";
import { updateBrandSettings } from "@/lib/venue-brand-api";

type Typography = "ELEGANT" | "MODERN" | "CLASSIC" | "CASUAL";

const TYPOGRAPHY_LABELS: Record<Typography, string> = {
  ELEGANT: "Elegante",
  MODERN: "Moderno",
  CLASSIC: "Classico",
  CASUAL: "Informale",
};

export interface BrandSettingsInitial {
  name: string;
  brandLogoUrl: string;
  coverImage: string;
  brandAccent: string;
  brandSecondaryColor: string;
  brandTypography: Typography | "";
  phone: string;
  email: string;
  address: string;
  websiteUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  googleBusinessUrl: string;
}

export function BrandSettingsForm({ initial }: { initial: BrandSettingsInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [logoUrl, setLogoUrl] = useState(initial.brandLogoUrl);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [primaryColor, setPrimaryColor] = useState(initial.brandAccent || "#F44C12");
  const [secondaryColor, setSecondaryColor] = useState(initial.brandSecondaryColor);
  const [typography, setTypography] = useState<Typography | "">(initial.brandTypography);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [address, setAddress] = useState(initial.address);
  const [website, setWebsite] = useState(initial.websiteUrl);
  const [instagram, setInstagram] = useState(initial.instagramUrl);
  const [facebook, setFacebook] = useState(initial.facebookUrl);
  const [googleBusiness, setGoogleBusiness] = useState(initial.googleBusinessUrl);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      setError("Il nome del brand è obbligatorio.");
      setSuccess(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateBrandSettings({
        name: name.trim(),
        brandLogoUrl: logoUrl,
        coverImage,
        brandAccent: primaryColor,
        brandSecondaryColor: secondaryColor,
        ...(typography && { brandTypography: typography }),
        phone,
        email,
        address,
        websiteUrl: website,
        instagramUrl: instagram,
        facebookUrl: facebook,
        googleBusinessUrl: googleBusiness,
      });
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Salvataggio non riuscito. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Identità</CardTitle>
            <CardDescription>Nome e logo del tuo ristorante.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Nome ristorante / brand</Label>
              <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Ristorante Tavolo" />
            </div>
            <BrandImageField label="Logo" value={logoUrl} onChange={setLogoUrl} />
            <BrandImageField label="Immagine copertina (opzionale)" value={coverImage} onChange={setCoverImage} removeLabel="Rimuovi copertina" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Colori e stile</CardTitle>
            <CardDescription>Usati per bottoni, accenti e materiali brandizzati.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ColorField label="Colore principale" value={primaryColor} onChange={setPrimaryColor} />
            <ColorField label="Colore secondario (opzionale)" value={secondaryColor} onChange={setSecondaryColor} placeholder="#B7ADA4" />
            <div className="space-y-1.5">
              <Label>Stile tipografico (opzionale)</Label>
              <Select value={typography || undefined} onValueChange={(v) => setTypography(v as Typography)}>
                <SelectTrigger>
                  <SelectValue placeholder="Scegli uno stile" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPOGRAPHY_LABELS) as Typography[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPOGRAPHY_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informazioni pubbliche</CardTitle>
            <CardDescription>Mostrate su widget e pagine pubbliche future.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brand-phone">Telefono</Label>
              <Input id="brand-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-email">Email</Label>
              <Input id="brand-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-website">Sito web</Label>
              <Input id="brand-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="iltuolocale.it" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-address">Indirizzo</Label>
              <Input id="brand-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-instagram">Instagram</Label>
              <Input id="brand-instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="instagram.com/..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-facebook">Facebook</Label>
              <Input id="brand-facebook" value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="facebook.com/..." />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="brand-google">Google Maps / Google Business</Label>
              <Input id="brand-google" value={googleBusiness} onChange={(e) => setGoogleBusiness(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">Brand salvato correttamente.</p>}

        <div className="flex items-center gap-3">
          <Button variant="gold" onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </Button>
          <p className="text-xs text-muted-foreground">Potrai modificare questi dati in qualsiasi momento.</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Anteprima</p>
        <BrandPreviewCard name={name} logoUrl={logoUrl} primaryColor={primaryColor} secondaryColor={secondaryColor} />
      </div>
    </div>
  );
}
