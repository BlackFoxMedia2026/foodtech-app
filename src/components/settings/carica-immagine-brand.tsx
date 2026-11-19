"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";
import { updateBrandSettings, uploadBrandImage } from "@/lib/venue-brand-api";
import { cn } from "@/lib/utils";

/**
 * Carica il logo o la copertina **da qui**, senza passare dalla pagina del
 * brand (19 nov 2026). Prima la riga diceva «non caricato» e l'unica strada
 * era «Gestisci», cioè un modulo intero per fare una cosa sola.
 *
 * Stesso caricamento di `BrandImageField`, ma salva subito: si sceglie il
 * file e il logo è al suo posto. Il salvataggio manda solo il campo cambiato
 * (la rotta accetta campi parziali), quindi non tocca nient'altro del brand.
 */
export function CaricaImmagineBrand({
  campo,
  valore,
  etichetta,
  variante = "chiaro",
  className,
}: {
  campo: "brandLogoUrl" | "coverImage";
  valore: string | null;
  /** «logo» o «copertina»: compone «Carica logo», «Cambia copertina». */
  etichetta: string;
  /** `scuro` sopra una foto: il pulsante resta leggibile. */
  variante?: "chiaro" | "scuro";
  className?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(url: string) {
    await updateBrandSettings({ [campo]: url });
    router.refresh();
  }

  async function scelto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLavoro(true);
    setErrore(null);
    try {
      const { url } = await uploadBrandImage(file);
      await salva(url);
    } catch {
      setErrore("Non è andato: riprova con un PNG, JPG o SVG.");
    } finally {
      setLavoro(false);
    }
  }

  async function togli() {
    setLavoro(true);
    setErrore(null);
    try {
      await salva("");
    } catch {
      setErrore("Non è andato: riprova.");
    } finally {
      setLavoro(false);
    }
  }

  const pulsante =
    variante === "scuro"
      ? "bg-black/45 text-white ring-1 ring-white/30 backdrop-blur hover:bg-black/60"
      : "bg-white/75 text-foreground ring-1 ring-black/5 shadow-sm hover:bg-white dark:bg-white/10 dark:ring-white/10 dark:hover:bg-white/15";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={lavoro}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors disabled:opacity-60",
          pulsante,
        )}
      >
        {lavoro ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {valore ? `Cambia ${etichetta}` : `Carica ${etichetta}`}
      </button>
      {valore && (
        <button
          type="button"
          onClick={togli}
          disabled={lavoro}
          aria-label={`Togli ${etichetta}`}
          title={`Togli ${etichetta}`}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full transition-colors disabled:opacity-60",
            pulsante,
          )}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={scelto}
      />
      {errore && (
        <p
          role="alert"
          className={cn(
            "w-full text-xs",
            variante === "scuro" ? "text-white" : "text-destructive-soft",
          )}
        >
          {errore}
        </p>
      )}
    </div>
  );
}
