"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { ImageUp, Loader2, QrCode, Radar, Wifi, WifiHigh, WifiLow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { leggiStringaWifi } from "@/lib/qr-contenuto";
import { piattaforma, retiVicineDalTelefono, scansioneRetiDisponibile, type ReteVicina } from "@/lib/app-nativa";

/**
 * I due modi per non ricopiare a mano nome e password della rete.
 *
 * ## Inquadra il QR
 *
 * Quasi ogni router ha un QR sull'etichetta, e ogni telefono collegato sa
 * mostrarne uno («Condividi rete»). Dentro c'è tutto: nome e password. Si
 * inquadra con la fotocamera — nel browser e nell'app — oppure, dal computer
 * senza fotocamera, si carica la foto o lo screenshot del QR.
 *
 * ## Scansiona le reti (solo nell'app)
 *
 * Il browser non può vedere le reti intorno; l'app sì, su Android. Si sceglie
 * la rete dall'elenco e resta da scrivere la password, che nessun telefono
 * legge dall'aria. Su iPhone Apple non dà l'elenco a nessuna app: lì il
 * pulsante propone la rete a cui il telefono è collegato.
 */

export type ReteCompilata = { ssid: string; password: string | null };

export function CompilaRete({ onCompila }: { onCompila: (r: ReteCompilata) => void }) {
  const [inquadra, setInquadra] = useState(false);
  const [scansiona, setScansiona] = useState(false);
  // Dopo il montaggio: sul server e al primo disegno il ponte non esiste.
  const [conApp, setConApp] = useState(false);
  useEffect(() => setConApp(scansioneRetiDisponibile()), []);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setInquadra(true)}>
          <QrCode className="h-4 w-4" aria-hidden="true" />
          Inquadra il QR della rete
        </Button>
        {conApp && (
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setScansiona(true)}>
            <Radar className="h-4 w-4" aria-hidden="true" />
            {piattaforma() === "ios" ? "Usa la rete del telefono" : "Scansiona le reti"}
          </Button>
        )}
      </div>

      <DialogoInquadra
        aperto={inquadra}
        onChiudi={() => setInquadra(false)}
        onLetto={(r) => {
          setInquadra(false);
          onCompila(r);
        }}
      />
      {conApp && (
        <DialogoReti
          aperto={scansiona}
          onChiudi={() => setScansiona(false)}
          onScelta={(ssid) => {
            setScansiona(false);
            onCompila({ ssid, password: null });
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Inquadra il QR                                                     */
/* ------------------------------------------------------------------ */

function decodifica(ctx: CanvasRenderingContext2D, w: number, h: number): string | null {
  const img = ctx.getImageData(0, 0, w, h);
  return jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

function DialogoInquadra({
  aperto,
  onChiudi,
  onLetto,
}: {
  aperto: boolean;
  onChiudi: () => void;
  onLetto: (r: ReteCompilata) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const tela = useRef<HTMLCanvasElement | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inAvvio, setInAvvio] = useState(false);

  /** Un QR letto: se è di una rete compila, altrimenti lo dice e continua. */
  const valuta = useCallback(
    (testo: string): boolean => {
      const w = leggiStringaWifi(testo);
      if (!w) {
        setErrore("Questo QR non è di una rete Wi-Fi. Cerca quello sull'etichetta del router.");
        return false;
      }
      onLetto({ ssid: w.ssid, password: w.password || null });
      return true;
    },
    [onLetto],
  );

  useEffect(() => {
    if (!aperto) return;
    setErrore(null);
    let flusso: MediaStream | null = null;
    let giro = 0;
    let finito = false;

    async function avvia() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrore("Questo dispositivo non dà accesso alla fotocamera: carica una foto del QR.");
        return;
      }
      setInAvvio(true);
      try {
        flusso = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setInAvvio(false);
        setErrore("La fotocamera non è disponibile o il permesso è stato negato. Puoi caricare una foto del QR.");
        return;
      }
      if (finito || !video.current) {
        flusso.getTracks().forEach((t) => t.stop());
        return;
      }
      video.current.srcObject = flusso;
      await video.current.play().catch(() => {});
      setInAvvio(false);

      const canvas = (tela.current ??= document.createElement("canvas"));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const fotogramma = () => {
        if (finito) return;
        const v = video.current;
        if (v && ctx && v.readyState >= 2 && v.videoWidth) {
          // Basta un lato di 640 px: più grande rallenta e non legge meglio.
          const scala = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
          canvas.width = Math.round(v.videoWidth * scala);
          canvas.height = Math.round(v.videoHeight * scala);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const testo = decodifica(ctx, canvas.width, canvas.height);
          if (testo && valuta(testo)) return;
        }
        giro = requestAnimationFrame(fotogramma);
      };
      giro = requestAnimationFrame(fotogramma);
    }
    void avvia();

    return () => {
      finito = true;
      cancelAnimationFrame(giro);
      flusso?.getTracks().forEach((t) => t.stop());
    };
  }, [aperto, valuta]);

  async function daFoto(file: File) {
    setErrore(null);
    try {
      const bmp = await createImageBitmap(file);
      const scala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scala);
      canvas.height = Math.round(bmp.height * scala);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error();
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const testo = decodifica(ctx, canvas.width, canvas.height);
      if (!testo) setErrore("Nella foto non si legge un QR. Riprova più da vicino, con il QR dritto e a fuoco.");
      else valuta(testo);
    } catch {
      setErrore("Questa immagine non si apre. Prova con una foto JPG o PNG.");
    }
  }

  return (
    <Dialog open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Inquadra il QR della rete</DialogTitle>
          <DialogDescription>
            Quello sull&apos;etichetta del router, o quello che mostra un telefono già collegato in «Condividi
            rete». Nome e password si compilano da soli.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#10201a]">
          <video ref={video} className="h-full w-full object-cover" playsInline muted aria-hidden="true" />
          <div
            className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(16,32,26,0.35)]"
            aria-hidden="true"
          />
          {inAvvio && (
            <span className="absolute inset-0 grid place-items-center text-white/80">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Accendo la fotocamera" />
            </span>
          )}
        </div>

        <p className="min-h-5 text-sm text-destructive-soft" aria-live="polite">
          {errore}
        </p>

        <label className="inline-flex cursor-pointer items-center gap-2 self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
          <ImageUp className="h-4 w-4" aria-hidden="true" />
          Oppure carica una foto del QR
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void daFoto(f);
            }}
          />
        </label>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Scansiona le reti (app)                                            */
/* ------------------------------------------------------------------ */

function Segnale({ dbm }: { dbm: number }) {
  if (dbm === 0) return <Wifi className="h-4 w-4" aria-hidden="true" />;
  const Icona = dbm >= -60 ? Wifi : dbm >= -75 ? WifiHigh : WifiLow;
  return <Icona className="h-4 w-4" aria-label={`Segnale ${dbm} dBm`} />;
}

function DialogoReti({
  aperto,
  onChiudi,
  onScelta,
}: {
  aperto: boolean;
  onChiudi: () => void;
  onScelta: (ssid: string) => void;
}) {
  const [reti, setReti] = useState<ReteVicina[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const cerca = useCallback(async () => {
    setReti(null);
    setErrore(null);
    try {
      setReti(await retiVicineDalTelefono());
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "La scansione non è riuscita. Riprova tra qualche secondo.");
      setReti([]);
    }
  }, []);

  useEffect(() => {
    if (aperto) void cerca();
  }, [aperto, cerca]);

  const ios = piattaforma() === "ios";

  return (
    <Dialog open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ios ? "La rete del telefono" : "Le reti qui intorno"}</DialogTitle>
          <DialogDescription>
            Scegli la rete degli ospiti. La password poi la scrivi tu: nessun telefono la legge dall&apos;aria.
          </DialogDescription>
        </DialogHeader>

        {reti === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cerco le reti…
          </p>
        ) : reti.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground" aria-live="polite">
            {errore ?? (ios ? "Il telefono non è collegato a un Wi-Fi." : "Nessuna rete trovata. Il Wi-Fi del telefono è acceso?")}
          </p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-border/70 overflow-y-auto rounded-xl border border-border/70">
            {reti.map((r) => (
              <li key={r.ssid}>
                <button
                  type="button"
                  onClick={() => onScelta(r.ssid)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-veil-6"
                >
                  <Segnale dbm={r.segnale} />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.ssid}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!ios && reti !== null && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => void cerca()}>
            <Radar className="h-4 w-4" aria-hidden="true" /> Cerca di nuovo
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
