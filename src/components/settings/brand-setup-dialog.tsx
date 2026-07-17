"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ColorField } from "./color-field";
import { BrandImageField } from "./brand-image-field";
import { BrandPreviewCard } from "./brand-preview-card";
import { updateBrandSettings, type BrandSettingsPayload } from "@/lib/venue-brand-api";

const STEPS = [
  { id: "identity", label: "Identità" },
  { id: "colors", label: "Colori" },
  { id: "info", label: "Info pubbliche" },
  { id: "confirm", label: "Conferma" },
];

export function BrandSetupDialog({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initialName);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#F44C12");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [googleBusiness, setGoogleBusiness] = useState("");

  function goTo(index: number) {
    setStep(index);
    setFurthestStep((f) => Math.max(f, index));
  }

  function collectPayload(): BrandSettingsPayload {
    return {
      name: name.trim(),
      ...(logoUrl && { brandLogoUrl: logoUrl }),
      ...(primaryColor && { brandAccent: primaryColor }),
      ...(secondaryColor && { brandSecondaryColor: secondaryColor }),
      ...(phone.trim() && { phone: phone.trim() }),
      ...(email.trim() && { email: email.trim() }),
      ...(website.trim() && { websiteUrl: website.trim() }),
      ...(address.trim() && { address: address.trim() }),
      ...(instagram.trim() && { instagramUrl: instagram.trim() }),
      ...(facebook.trim() && { facebookUrl: facebook.trim() }),
      ...(googleBusiness.trim() && { googleBusinessUrl: googleBusiness.trim() }),
    };
  }

  async function handleComplete() {
    setSubmitting(true);
    setError(null);
    try {
      await updateBrandSettings(collectPayload(), "complete");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Salvataggio non riuscito. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    setError(null);
    try {
      await updateBrandSettings({}, "skip");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Operazione non riuscita. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  const canAdvance = step !== 0 || name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <div className="space-y-1">
          <h2 className="text-display text-lg">Personalizza il tuo brand</h2>
          <p className="text-sm text-muted-foreground">
            Imposta logo, colori e informazioni principali del tuo ristorante. Potrai modificarli in qualsiasi momento dalle
            impostazioni.
          </p>
        </div>

        <Stepper steps={STEPS} currentStepIndex={step} furthestStepIndex={furthestStep} onStepClick={goTo} />

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Nome ristorante / brand</Label>
              <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Ristorante Tavolo" />
            </div>
            <BrandImageField label="Logo" value={logoUrl} onChange={setLogoUrl} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <ColorField label="Colore principale" value={primaryColor} onChange={setPrimaryColor} />
            <ColorField label="Colore secondario (opzionale)" value={secondaryColor} onChange={setSecondaryColor} placeholder="#B7ADA4" />
            <BrandPreviewCard name={name} logoUrl={logoUrl} primaryColor={primaryColor} secondaryColor={secondaryColor} />
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Ecco un riepilogo di come apparirà il tuo brand.</p>
            <BrandPreviewCard name={name} logoUrl={logoUrl} primaryColor={primaryColor} secondaryColor={secondaryColor} />
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={handleSkip} disabled={submitting}>
            Configura più tardi
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => goTo(step - 1)} disabled={submitting}>
                Indietro
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" variant="gold" onClick={() => goTo(step + 1)} disabled={!canAdvance || submitting}>
                Avanti
              </Button>
            ) : (
              <Button type="button" variant="gold" onClick={handleComplete} disabled={submitting}>
                {submitting ? "Salvataggio..." : "Completa setup"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
