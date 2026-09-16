"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Power, PowerOff, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYLOAD_WIFI_VUOTO, nomeDestinazione, type PayloadWifi } from "@/lib/qr-contenuto";
import { accendiPagamentoTavolo, rigeneraSegretoTavolo } from "@/lib/qr-tavolo-api";
import { cn } from "@/lib/utils";
import type { BozzaQr, ContestoQr } from "./bozza";

/**
 * La colonna del contenuto: il nome, e poi solo i campi di quel tipo.
 *
 * La regola che tiene insieme tutti e cinque i casi: **niente indirizzi
 * tecnici da compilare**. Dove il prodotto conosce già la destinazione la
 * mostra e basta; dove non la conosce chiede la cosa vera — il nome della
 * rete, il tavolo — e l'indirizzo lo compone lui.
 */
export function QrContentPanel({
  bozza,
  ctx,
  unicoTavolo = false,
  onCambia,
}: {
  bozza: BozzaQr;
  ctx: ContestoQr;
  /**
   * Un tavolo solo, e non più d'uno.
   *
   * Vale quando si **modifica** un codice che esiste già: quello è il codice di
   * quel tavolo, e sceglierne tre qui non potrebbe che spostarlo su uno dei
   * tre. Sceglierne altri due si fa creandone altri due.
   */
  unicoTavolo?: boolean;
  onCambia: (patch: Partial<BozzaQr>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="qr-nome">Nome QR</Label>
        <Input
          id="qr-nome"
          value={bozza.nome}
          onChange={(e) => onCambia({ nome: e.target.value })}
          placeholder="Es. Menu tavolo"
          maxLength={120}
        />
        <p className="t-nota">Solo per te: serve a ritrovarlo in elenco.</p>
      </div>

      {bozza.kind === "PAY_TABLE" && (
        <Tavoli bozza={bozza} ctx={ctx} unicoTavolo={unicoTavolo} onCambia={onCambia} />
      )}
      {(bozza.kind === "MENU" || bozza.kind === "BOOKING") && <DestinazioneNota bozza={bozza} />}
      {bozza.kind === "WIFI" && <Rete bozza={bozza} onCambia={onCambia} />}
      {bozza.kind === "CUSTOM" && <Personalizzato bozza={bozza} onCambia={onCambia} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * La destinazione che il prodotto conosce già.
 *
 * L'indirizzo si vede — chi stampa un QR ha il diritto di sapere dove porta —
 * ma in piccolo e non modificabile: è un fatto, non un campo.
 */
function DestinazioneNota({ bozza }: { bozza: BozzaQr }) {
  return (
    <div className="riquadro comodo space-y-1 bg-secondary/30">
      <p className="t-titolo-scheda">{nomeDestinazione(bozza.kind)}</p>
      <p className="break-all font-mono text-xs text-muted-foreground">{bozza.destinationUrl}</p>
      <p className="t-nota">Il QR porta qui. L&apos;indirizzo lo teniamo aggiornato noi.</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * I tavoli.
 *
 * Ogni tavolo ha un suo segreto stampato — è quello che impedisce al tavolo 3
 * di aprire il conto del 4 — quindi ogni tavolo ha il **suo** codice. Sceglierne
 * dieci qui vuol dire crearne dieci con un gesto solo, tutti con questo
 * disegno, e ognuno col nome del suo tavolo.
 *
 * I tavoli su cui il pagamento non è acceso si vedono lo stesso, spenti e con
 * il motivo: nasconderli lascerebbe a chiedersi perché il tavolo 7 non c'è.
 */
function Tavoli({
  bozza,
  ctx,
  unicoTavolo,
  onCambia,
}: {
  bozza: BozzaQr;
  ctx: ContestoQr;
  unicoTavolo: boolean;
  onCambia: (patch: Partial<BozzaQr>) => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const scelti = new Set(bozza.tableIds);
  const daAccendere = ctx.tavoli.filter((t) => scelti.has(t.id) && !t.pronto);
  const spenti = ctx.tavoli.filter((t) => !t.pronto);

  function alterna(id: string) {
    if (unicoTavolo) {
      onCambia({ tableIds: [id] });
      return;
    }
    const prossimi = new Set(scelti);
    if (prossimi.has(id)) prossimi.delete(id);
    else prossimi.add(id);
    onCambia({ tableIds: [...prossimi] });
  }

  /**
   * Accende il pagamento sui tavoli scelti che erano spenti.
   *
   * Uno alla volta e non in blocco perché ogni accensione genera **il suo**
   * segreto e lascia la sua riga nel registro: è una decisione per tavolo, e
   * va scritta come tale anche quando il gesto che la fa partire è uno solo.
   */
  async function accendi() {
    setInCorso(true);
    setErrore(null);
    try {
      for (const t of daAccendere) await accendiPagamentoTavolo(t.id, true);
      /* I tavoli arrivano dal server: dopo l'accensione la pagina si ricarica
         e tornano con il loro stato vero, invece di fidarsi di una copia
         aggiornata a mano qui. */
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Non è stato possibile accendere il pagamento.");
    } finally {
      setInCorso(false);
    }
  }

  if (!ctx.pagamentiAttivi) {
    return (
      <div className="riquadro comodo space-y-2 bg-secondary/30">
        <p className="t-titolo-scheda">Destinazione</p>
        <p className="text-sm text-muted-foreground">
          Il pagamento al tavolo non è ancora acceso per questo locale. Si accende una volta sola, in
          Impostazioni, e poi da qui nasce il QR di ogni tavolo.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/pagamenti">
            Vai ai pagamenti <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    );
  }

  if (ctx.tavoli.length === 0) {
    return (
      <div className="riquadro comodo space-y-2 bg-secondary/30">
        <p className="t-titolo-scheda">Destinazione</p>
        <p className="text-sm text-muted-foreground">
          Questo locale non ha ancora tavoli: si disegnano in Sala, e da lì tornano qui.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/floor">
            Vai in Sala <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <Label>Destinazione</Label>
        {!unicoTavolo && (
          <button
            type="button"
            className="text-xs text-accent-strong underline-offset-2 hover:underline"
            onClick={() =>
              onCambia({
                tableIds: scelti.size === ctx.tavoli.length ? [] : ctx.tavoli.map((t) => t.id),
              })
            }
          >
            {scelti.size === ctx.tavoli.length ? "Nessuno" : "Tutti i tavoli"}
          </button>
        )}
      </div>

      {/*
        Gli spenti si scelgono lo stesso.

        Nascondere un tavolo perché il pagamento non è ancora acceso lascia a
        chiedersi perché il 7 non c'è, e manda a cercare un interruttore
        altrove. Qui si sceglie il tavolo che serve e l'interruttore viene
        dietro: è l'ordine in cui la cosa succede nella testa di chi la fa.
      */}
      <div className="riquadro grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto p-2 sm:grid-cols-3">
        {ctx.tavoli.map((t) => {
          const attivo = scelti.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => alterna(t.id)}
              aria-pressed={attivo}
              title={t.pronto ? t.label : `${t.label} — pagamento da accendere`}
              className={cn(
                "flex items-center justify-between gap-1 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                attivo
                  ? "border-accent-strong bg-accent-strong/10 text-foreground"
                  : "border-border hover:bg-secondary/60",
                !t.pronto && !attivo && "text-muted-foreground",
              )}
            >
              <span className="truncate">{t.label}</span>
              {attivo ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-accent-strong" aria-hidden="true" />
              ) : (
                !t.pronto && <PowerOff className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <p className="t-nota">
        {scelti.size === 0
          ? "Scegli almeno un tavolo: ogni tavolo ha il suo codice."
          : unicoTavolo
            ? "Questo codice vale per un tavolo solo: per gli altri se ne creano altri."
            : scelti.size === 1
              ? "Un codice, per questo tavolo."
              : `${scelti.size} codici, uno per tavolo, tutti con questo disegno.`}
      </p>

      {/*
        L'interruttore che mancava.

        Il pagamento al tavolo aveva il segreto, la revoca, il cartoncino da
        stampare e la pagina che incassa — e nessuno schermo per accenderlo su
        un tavolo. Sta qui perché è qui che ci si accorge che serve: si è
        appena scelto il tavolo per cui stampare il codice.
      */}
      {daAccendere.length > 0 &&
        (ctx.puoGestireTavoli ? (
          <div className="riquadro comodo space-y-2 bg-secondary/30">
            <p className="text-sm">
              {daAccendere.length === 1
                ? `Sul tavolo ${daAccendere[0].label} il pagamento non è ancora acceso.`
                : `Su ${daAccendere.length} dei tavoli scelti il pagamento non è ancora acceso.`}{" "}
              Senza, il QR nascerebbe senza destinazione.
            </p>
            <Button variant="outline" size="sm" onClick={accendi} disabled={inCorso}>
              {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              {inCorso
                ? "Accendo..."
                : daAccendere.length === 1
                  ? "Accendi il pagamento"
                  : `Accendi il pagamento su ${daAccendere.length} tavoli`}
            </Button>
            {errore && <p className="text-xs text-destructive-soft">{errore}</p>}
          </div>
        ) : (
          <p className="riquadro comodo text-sm text-muted-foreground">
            {daAccendere.length === 1
              ? `Sul tavolo ${daAccendere[0].label} il pagamento non è ancora acceso.`
              : `Su ${daAccendere.length} dei tavoli scelti il pagamento non è ancora acceso.`}{" "}
            Può accenderlo chi amministra il locale: decidere che un tavolo incassa denaro non è una
            modifica di marketing.
          </p>
        ))}

      {/* Solo mentre si crea: modificando, scegliere un altro tavolo **sposta**
          questo codice, non ne accende un secondo — invitare a farlo qui
          sarebbe un consiglio che fa una cosa diversa da quella che dice. */}
      {spenti.length > 0 && daAccendere.length === 0 && !unicoTavolo && (
        <p className="t-nota">
          {spenti.length === 1 ? "Un tavolo non ha" : `${spenti.length} tavoli non hanno`} ancora il pagamento
          acceso: {spenti.map((t) => t.label).join(", ")}. Sceglilo qui sopra per accenderlo.
        </p>
      )}

      {unicoTavolo && ctx.puoGestireTavoli && bozza.tableIds[0] && (
        <RigeneraSegreto
          tableId={bozza.tableIds[0]}
          etichetta={ctx.tavoli.find((t) => t.id === bozza.tableIds[0])?.label ?? ""}
        />
      )}
    </div>
  );
}

/**
 * Revocare il codice di un tavolo.
 *
 * Serve quando l'adesivo finisce in una fotografia pubblica o sparisce dal
 * tavolo. **Non è una modifica, è una revoca:** da quel momento ogni
 * cartoncino già stampato per quel tavolo smette di funzionare, e chi lo
 * inquadra trova un link morto. Per questo sta in fondo, si chiede due volte,
 * e la frase dice la conseguenza invece del meccanismo.
 */
function RigeneraSegreto({ tableId, etichetta }: { tableId: string; etichetta: string }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function rigenera() {
    if (
      !confirm(
        `Rigenerare il codice del tavolo ${etichetta}?\n\nOgni cartoncino già stampato per questo tavolo smetterà di funzionare: andranno ristampati.`,
      )
    ) {
      return;
    }
    setInCorso(true);
    setErrore(null);
    try {
      await rigeneraSegretoTavolo(tableId);
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Non è stato possibile rigenerare il codice.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-1 pt-1">
      <button
        type="button"
        onClick={rigenera}
        disabled={inCorso}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
      >
        <RotateCcw className={cn("h-3 w-3", inCorso && "animate-spin")} aria-hidden="true" />
        {inCorso ? "Rigenero..." : "Rigenera il codice di questo tavolo"}
      </button>
      <p className="t-nota">Da usare se l&apos;adesivo è finito in una foto pubblica. I cartoncini già stampati smettono di funzionare.</p>
      {errore && <p className="text-xs text-destructive-soft">{errore}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const SICUREZZA: { valore: PayloadWifi["sicurezza"]; nome: string }[] = [
  { valore: "WPA", nome: "WPA / WPA2" },
  { valore: "WPA3", nome: "WPA3" },
  { valore: "NONE", nome: "Nessuna" },
];

function Rete({ bozza, onCambia }: { bozza: BozzaQr; onCambia: (patch: Partial<BozzaQr>) => void }) {
  const wifi = bozza.payload.wifi ?? PAYLOAD_WIFI_VUOTO;
  const set = (patch: Partial<PayloadWifi>) =>
    onCambia({ payload: { ...bozza.payload, wifi: { ...wifi, ...patch } } });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="qr-ssid">Nome rete</Label>
        <Input
          id="qr-ssid"
          value={wifi.ssid}
          onChange={(e) => set({ ssid: e.target.value })}
          placeholder="Es. Aurora-Ospiti"
          maxLength={64}
        />
        <p className="t-nota">Esattamente com&apos;è scritto sul router: maiuscole comprese.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Sicurezza</Label>
        <Select value={wifi.sicurezza} onValueChange={(v) => set({ sicurezza: v as PayloadWifi["sicurezza"] })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SICUREZZA.map((s) => (
              <SelectItem key={s.valore} value={s.valore}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {wifi.sicurezza !== "NONE" && (
        <div className="space-y-1.5">
          <Label htmlFor="qr-password">Password</Label>
          <Input
            id="qr-password"
            value={wifi.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder="La password della rete ospiti"
            maxLength={128}
          />
          {/* Chi stampa questo codice sta appendendo la password al muro: è la
              rete ospiti, nata per essere data a chiunque entri, ma va detto. */}
          <p className="t-nota">
            Chi inquadra si collega senza digitare niente. Usa la rete degli ospiti, non quella della cassa.
          </p>
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-sm">Rete nascosta</span>
          <span className="t-nota block">Il nome della rete non compare nell&apos;elenco del telefono.</span>
        </span>
        <Switch checked={wifi.nascosta} onCheckedChange={(v) => set({ nascosta: v })} />
      </label>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Personalizzato({ bozza, onCambia }: { bozza: BozzaQr; onCambia: (patch: Partial<BozzaQr>) => void }) {
  const custom = bozza.payload.custom ?? { modo: "url" as const, valore: "" };
  const modoUrl = custom.modo === "url";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Tipo destinazione</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(["url", "testo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onCambia({ payload: { ...bozza.payload, custom: { ...custom, modo: m } } })}
              aria-pressed={custom.modo === m}
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors",
                custom.modo === m
                  ? "border-accent-strong bg-accent-strong/10"
                  : "border-border hover:bg-secondary/60",
              )}
            >
              {m === "url" ? "Un link" : "Un testo"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="qr-custom">{modoUrl ? "Indirizzo" : "Testo"}</Label>
        <Input
          id="qr-custom"
          value={modoUrl ? bozza.destinationUrl : custom.valore}
          onChange={(e) =>
            modoUrl
              ? onCambia({ destinationUrl: e.target.value })
              : onCambia({ payload: { ...bozza.payload, custom: { ...custom, valore: e.target.value } } })
          }
          placeholder={modoUrl ? "iltuolocale.it/eventi" : "Il messaggio che compare sul telefono"}
          maxLength={modoUrl ? 2000 : 1500}
        />
        <p className="t-nota">
          {modoUrl
            ? "Se manca, aggiungiamo «https://» da soli."
            : "Chi inquadra legge il testo, senza aprire nessuna pagina."}
        </p>
      </div>
    </div>
  );
}
