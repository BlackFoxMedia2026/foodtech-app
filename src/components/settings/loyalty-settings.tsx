"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";
import {
  EsitoSalvataggio,
  GruppoImpostazioni,
  RigaImpostazione,
  RigaLibera,
} from "@/components/settings/righe-impostazioni";

/**
 * Le due regole della raccolta punti.
 *
 * Sono due numeri e nessuna terminologia: quanti punti dà un euro, e quanto
 * vale un punto quando si spende. Sotto c'è la frase che conta davvero — «un
 * conto da 60 € dà 60 punti, che valgono 3,00 €» — perché nessun ristoratore
 * ragiona in punti: ragiona in quanto gli costa.
 *
 * La percentuale accanto è la stessa cosa detta come la dice un commercialista,
 * ed è il numero su cui si decide se la raccolta ha senso.
 *
 * Le due regole valgono solo insieme. Metterne una sola vorrebbe dire far
 * accumulare punti che non si possono spendere, oppure lasciare a noi la
 * decisione su quanto vale un punto — che è denaro del locale, e non una cosa
 * che un software può decidere per conto suo.
 */
export function LoyaltySettings({
  puntiPerEuro,
  valorePuntoCents,
  premioPunti,
  premioCosa,
  canManage,
}: {
  puntiPerEuro: number | null;
  valorePuntoCents: number | null;
  premioPunti: number | null;
  premioCosa: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [punti, setPunti] = useState(puntiPerEuro != null ? String(puntiPerEuro) : "");
  const [valore, setValore] = useState(valorePuntoCents != null ? String(valorePuntoCents / 100) : "");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);
  const [premio, setPremio] = useState(premioPunti != null ? String(premioPunti) : "");
  const [cosa, setCosa] = useState(premioCosa ?? "");

  const puntiNum = Number(punti.replace(",", ".")) || 0;
  const valoreCents = Math.round((Number(valore.replace(",", ".")) || 0) * 100);
  const attiva = puntiNum > 0 && valoreCents > 0;

  // L'esempio è su 60 €: una cena per due, la cifra che un ristoratore
  // riconosce senza doverla convertire.
  const esempioPunti = puntiNum * 60;
  const esempioCents = esempioPunti * valoreCents;
  // Per ogni euro (100 centesimi) il cliente riceve `puntiNum` punti da
  // `valoreCents` l'uno: quei centesimi su cento **sono** la percentuale.
  // Dividere ancora per cento dava «restituisci lo 0,05%» dove il numero vero
  // era il 5%: due ordini di grandezza di differenza su una decisione di
  // prezzo.
  const percentuale = attiva ? puntiNum * valoreCents : 0;

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setError(null);
    setSalvato(false);

    const res = await fetch("/api/venue/loyalty", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        puntiPerEuro: puntiNum > 0 ? Math.round(puntiNum) : null,
        valorePuntoCents: valoreCents > 0 ? valoreCents : null,
        premioPunti: premio.trim() ? Number(premio) : null,
        premioCosa: cosa.trim() || null,
      }),
    });
    setSalvando(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a salvare. Riprova."));
      return;
    }
    setSalvato(true);
    router.refresh();
  }

  return (
    <form onSubmit={salva} method="post">
      <GruppoImpostazioni
        titolo="Raccolta punti"
        descrizione="I punti si accumulano sui conti chiusi al tavolo e si usano come sconto sul conto successivo. Senza entrambi i numeri la raccolta resta spenta."
        azione={
          canManage && (
            <>
              <EsitoSalvataggio salvato={salvato} errore={error} />
              <Button type="submit" variant="accent" size="sm" disabled={salvando}>
                {salvando ? "Salvo…" : attiva ? "Salva" : "Salva e spegni la raccolta"}
              </Button>
            </>
          )
        }
      >
        <RigaImpostazione
          nome="Punti per ogni euro speso"
          htmlFor="l-punti"
          descrizione="Quanti punti mette in tasca il cliente per un euro di conto."
        >
          <Input
            id="l-punti"
            inputMode="numeric"
            value={punti}
            onChange={(e) => {
              setPunti(e.target.value);
              setSalvato(false);
            }}
            placeholder="Es. 1"
            disabled={!canManage}
            className="w-24 text-right"
          />
        </RigaImpostazione>

        <RigaImpostazione
          nome="Quanto vale un punto"
          htmlFor="l-valore"
          descrizione="In euro, quando il cliente lo spende. È denaro del locale: non lo decidiamo noi."
        >
          <Input
            id="l-valore"
            inputMode="decimal"
            value={valore}
            onChange={(e) => {
              setValore(e.target.value);
              setSalvato(false);
            }}
            placeholder="Es. 0,05"
            disabled={!canManage}
            className="w-24 text-right"
          />
          <span className="text-sm text-muted-foreground">€</span>
        </RigaImpostazione>

        {/*
          Nessun ristoratore ragiona in punti: ragiona in quanto gli costa. La
          frase sta dopo i due campi perché è la loro conseguenza, e si
          riscrive mentre li si tocca.
        */}
        <RigaLibera>
          {attiva ? (
            <p className="text-sm text-card-foreground/80">
              Un conto da 60 € dà{" "}
              <strong className="tabular-nums text-foreground">
                {esempioPunti} {esempioPunti === 1 ? "punto" : "punti"}
              </strong>
              , che valgono{" "}
              <strong className="tabular-nums text-foreground">
                {(esempioCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
              </strong>{" "}
              sulla prossima cena. In pratica stai restituendo il{" "}
              <strong className="tabular-nums text-accent-strong">
                {percentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%
              </strong>{" "}
              di quello che incassi.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Senza entrambi i numeri la raccolta punti resta spenta, e nessun cliente accumula niente. Sono
              due decisioni tue: quanto premi la fedeltà e quanto ti costa.
            </p>
          )}
        </RigaLibera>

        {/* Il traguardo. Uno sconto lineare è troppo piccolo per essere
            notato: «ti mancano 40 punti alla cena omaggio» è la frase che
            riporta le persone. Il premio lo decide il locale — non sappiamo
            cosa può permettersi di regalare. */}
        {attiva && (
          <>
            <RigaImpostazione
              nome="Un traguardo, se vuoi"
              htmlFor="l-premio"
              descrizione={
                premio.trim() && cosa.trim() && valoreCents > 0
                  ? `Ci si arriva spendendo circa ${Math.round(Number(premio) / (puntiNum || 1))} €, e il premio ti costa quello che vale «${cosa.trim()}».`
                  : "Facoltativo. Senza, i punti restano solo uno sconto."
              }
            >
              <Input
                id="l-premio"
                inputMode="numeric"
                value={premio}
                onChange={(e) => {
                  setPremio(e.target.value.replace(/[^0-9]/g, ""));
                  setSalvato(false);
                }}
                placeholder="Es. 200"
                disabled={!canManage}
                className="w-24 text-right"
              />
              <span className="text-sm text-muted-foreground">punti</span>
            </RigaImpostazione>

            <RigaImpostazione nome="Cosa si vince" htmlFor="l-cosa">
              <Input
                id="l-cosa"
                value={cosa}
                onChange={(e) => {
                  setCosa(e.target.value);
                  setSalvato(false);
                }}
                placeholder="Es. una bottiglia della casa"
                disabled={!canManage}
                className="w-full sm:w-64"
              />
            </RigaImpostazione>
          </>
        )}
      </GruppoImpostazioni>
    </form>
  );
}
