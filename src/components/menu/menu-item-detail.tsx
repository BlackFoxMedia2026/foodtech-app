"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ImagePlus,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MenuItemSales } from "@/components/menu/menu-item-sales";
import { readApiError } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import { fraseMargine, statoMargine } from "@/lib/margine";
import {
  ALLERGENI,
  REGIMI,
  type Allergene,
  type CategoriaSceltaView,
  type MenuItemView,
  type Regime,
  type RendimentoPiatto,
} from "@/server/menu";

/**
 * La scheda di un piatto: una pagina, non una finestra.
 *
 * Era una modale alta più dello schermo, con dentro nome, descrizione,
 * prezzo, costo, disponibilità, quattordici allergeni e cinque regimi: si
 * scorreva dentro una finestra che a sua volta stava sopra una lista che
 * scorre, e la foto non c'era proprio perché non ci sarebbe entrata.
 *
 * Qui il piatto ha lo spazio che gli serve, un indirizzo suo — quindi si può
 * mandare a qualcuno — e il tasto «indietro» del browser che funziona.
 *
 * **Cosa si salva e cosa no**, perché non sia una sorpresa:
 *
 * - i campi di questa scheda si salvano con «Salva modifiche», **la foto
 *   compresa**: caricarla la mette solo in anteprima;
 * - la posizione nella categoria si applica **subito**, perché è un ordine
 *   condiviso e tenerlo in sospeso vorrebbe dire riscrivere l'ordine di tutti
 *   con quello di mezz'ora fa;
 * - l'eliminazione sta in fondo, separata, e chiede conferma.
 */

type Iniziale = {
  name: string;
  description: string;
  /** In euro, come si scrive: la conversione in centesimi è al salvataggio. */
  prezzo: string;
  costo: string;
  available: boolean;
  categoryId: string;
  allergens: Allergene[];
  dietary: Regime[];
  imageUrl: string | null;
};

export function MenuItemDetail(props: {
  /** `nuovo` quando il piatto non esiste ancora: niente vendite, niente ordine, niente eliminazione. */
  modalita: "nuovo" | "modifica";
  itemId?: string;
  item?: MenuItemView;
  categoryIdIniziale: string;
  categorie: CategoriaSceltaView[];
  currency: string;
  canEdit: boolean;
  /** Le vendite vere del piatto. Solo in modifica. */
  rendimento?: RendimentoPiatto | null;
  /** L'ordine completo della categoria, per spostarlo di un posto. */
  fratelli?: string[];
  posizione?: number;
}) {
  const {
    modalita,
    itemId,
    item,
    categoryIdIniziale,
    categorie,
    currency,
    canEdit,
    rendimento,
    fratelli = [],
    posizione = 0,
  } = props;

  const router = useRouter();
  const nuovo = modalita === "nuovo";

  const iniziale: Iniziale = {
    name: item?.name ?? "",
    description: item?.description ?? "",
    prezzo: item ? String(item.priceCents / 100) : "",
    costo: item?.costCents != null ? String(item.costCents / 100) : "",
    available: item?.available ?? true,
    categoryId: categoryIdIniziale,
    allergens: item?.allergens ?? [],
    dietary: item?.dietary ?? [],
    imageUrl: item?.imageUrl ?? null,
  };

  const [name, setName] = useState(iniziale.name);
  const [description, setDescription] = useState(iniziale.description);
  const [prezzo, setPrezzo] = useState(iniziale.prezzo);
  const [costo, setCosto] = useState(iniziale.costo);
  const [available, setAvailable] = useState(iniziale.available);
  const [categoryId, setCategoryId] = useState(iniziale.categoryId);
  const [allergeni, setAllergeni] = useState<Allergene[]>(iniziale.allergens);
  const [regimi, setRegimi] = useState<Regime[]>(iniziale.dietary);
  const [imageUrl, setImageUrl] = useState<string | null>(iniziale.imageUrl);

  const [inCorso, setInCorso] = useState(false);
  const [caricando, setCaricando] = useState(false);
  const [spostando, setSpostando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const corrente: Iniziale = {
    name,
    description,
    prezzo,
    costo,
    available,
    categoryId,
    allergens: allergeni,
    dietary: regimi,
    imageUrl,
  };
  const cambiato = JSON.stringify(corrente) !== JSON.stringify(iniziale);

  const spunta = <T extends string>(elenco: T[], set: (v: T[]) => void, valore: T) =>
    set(elenco.includes(valore) ? elenco.filter((x) => x !== valore) : [...elenco, valore]);

  /**
   * Il margine dei numeri che sono nel modulo adesso.
   *
   * Non compare più nella lista — lì si guarda il piatto, non il conto — ma
   * qui sì: è dove si scrive il costo, ed è il momento in cui un dito
   * sbagliato sul tastierino va detto, prima che finisca nelle analisi.
   */
  const anteprimaMargine = (() => {
    const p = Number(prezzo.replace(",", "."));
    const c = Number(costo.replace(",", "."));
    if (costo.trim() === "" || !Number.isFinite(p) || !Number.isFinite(c) || p <= 0) return null;
    const margineCents = Math.round(p * 100) - Math.round(c * 100);
    const pct = Math.round((margineCents / Math.round(p * 100)) * 100);
    return {
      stato: statoMargine(margineCents),
      frase: fraseMargine(margineCents, pct, (cents) => formatCurrency(cents, currency)),
    };
  })();

  const prezzoValido = Number.isFinite(Number(prezzo.replace(",", "."))) && prezzo.trim() !== "";
  const salvabile = canEdit && name.trim() !== "" && prezzoValido && categoryId !== "";

  async function caricaFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCaricando(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/menu/upload-image", { method: "POST", body: form });
    setCaricando(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a caricare la foto."));
      return;
    }
    const { url } = (await res.json()) as { url: string };
    setImageUrl(url);
  }

  async function salva() {
    setInCorso(true);
    setError(null);

    const corpo = {
      categoryId,
      name: name.trim(),
      description: description.trim() || null,
      priceCents: Math.round(Number(prezzo.replace(",", ".")) * 100),
      available,
      allergens: allergeni,
      dietary: regimi,
      // Stringa vuota vuol dire «non lo so», e va distinta da «costa zero».
      costCents: costo.trim() === "" ? null : Math.round(Number(costo.replace(",", ".")) * 100),
      imageUrl,
    };

    const res = await fetch(nuovo ? "/api/menu/items" : `/api/menu/items/${itemId}`, {
      method: nuovo ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

    if (!res.ok) {
      setInCorso(false);
      setError(await readApiError(res, "Non siamo riusciti a salvare il piatto."));
      return;
    }

    if (nuovo) {
      // Sulla sua scheda, non indietro in lista: appena creato è il momento in
      // cui si aggiunge la foto e si spuntano gli allergeni.
      const creato = (await res.json()) as { id: string };
      router.push(`/menu/${creato.id}`);
      router.refresh();
      return;
    }

    setInCorso(false);
    router.refresh();
  }

  /** Sposta il piatto di un posto dentro la categoria. Si applica subito. */
  async function sposta(verso: -1 | 1) {
    const da = fratelli.indexOf(itemId ?? "");
    const a = da + verso;
    if (da < 0 || a < 0 || a >= fratelli.length) return;
    const ordine = [...fratelli];
    [ordine[da], ordine[a]] = [ordine[a], ordine[da]];

    setSpostando(true);
    setError(null);
    const res = await fetch("/api/menu/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cosa: "piatti", ids: ordine }),
    });
    setSpostando(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a cambiare l'ordine."));
      return;
    }
    router.refresh();
  }

  async function elimina() {
    setInCorso(true);
    setError(null);
    const res = await fetch(`/api/menu/items/${itemId}`, { method: "DELETE" });
    setInCorso(false);
    if (!res.ok) {
      setConfermaElimina(false);
      setError(await readApiError(res, "Non siamo riusciti a eliminare il piatto."));
      return;
    }
    router.push("/menu");
    router.refresh();
  }

  const categoriaCorrente = categorie.find((c) => c.id === categoryId);

  return (
    <div className="schermo animate-fade-in gap-4">
      {/* Dove sono: «Menu › Antipasti». L'etichetta della categoria stava sopra
          il titolo e costava una riga per dire una cosa che è un passaggio del
          percorso, non un dato del piatto. */}
      <div className="fissa flex items-center gap-1 self-start">
        <Button asChild variant="ghost" size="sm">
          <Link href="/menu">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Menu
          </Link>
        </Button>
        {categoriaCorrente && (
          <span className="t-nota truncate">/ {categoriaCorrente.name}</span>
        )}
      </div>

      {/*
        Testata su una riga sola.

        Erano quattro righe impilate — categoria, titolo, stato e prezzo,
        pulsante — e su un portatile mangiavano un quinto dell'altezza prima di
        arrivare al piatto. Titolo, stato e prezzo sono la stessa frase («la
        tartare, disponibile, a 16 €»): si leggono meglio in fila. Restano
        allineati sulla linea di base, così il prezzo non balla rispetto al
        nome, e vanno a capo da soli quando lo schermo è stretto.
      */}
      <header className="fissa flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="t-titolo-pagina break-words">
            {name.trim() || (nuovo ? "Nuovo piatto" : "Senza nome")}
          </h1>
          {prezzoValido && (
            <span className="tabular-nums text-accent-strong md:text-lg">
              {formatCurrency(Math.round(Number(prezzo.replace(",", ".")) * 100), currency)}
            </span>
          )}
          <Badge tone={available ? "success-soft" : "warning"} className="self-center">
            {available ? "Disponibile" : "Finito"}
          </Badge>
        </div>

        {canEdit && (
          <div className="flex items-center gap-3">
            {cambiato && !nuovo && <span className="t-nota">Modifiche non salvate</span>}
            <Button variant="accent" onClick={salva} disabled={!salvabile || inCorso || (!cambiato && !nuovo)}>
              {inCorso ? "Salvo…" : nuovo ? "Crea il piatto" : "Salva modifiche"}
            </Button>
          </div>
        )}
      </header>

      {error && <p className="fissa text-sm text-destructive-soft">{error}</p>}

      {!canEdit && (
        <p className="fissa t-nota">
          Il tuo ruolo può leggere la carta ma non cambiarla.
        </p>
      )}

      <div className="fill-scroll space-y-4 pr-0.5">
        {/* ---------------------------------------------------------------- */}
        {/*  Foto e dati: due colonne da tablet in su, una sul telefono      */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Foto del piatto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="riquadro relative aspect-[4/3] w-full overflow-hidden bg-secondary/40">
                {imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imageUrl} alt={name || "Foto del piatto"} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center gap-2 text-muted-foreground">
                    <UtensilsCrossed className="h-8 w-8 opacity-50" aria-hidden="true" />
                    <span className="text-xs">Nessuna foto</span>
                  </div>
                )}
              </div>

              {canEdit && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={caricando}
                    >
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                      {caricando ? "Carico…" : imageUrl ? "Cambia immagine" : "Carica immagine"}
                    </Button>
                    {imageUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl(null)}>
                        Rimuovi
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={caricaFoto}
                  />
                  <p className="t-nota">
                    Orizzontale, fino a 5 MB. Si vede nella carta di gestione: diventa definitiva quando
                    salvi.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informazioni prodotto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-nome">Nome</Label>
                <Input
                  id="p-nome"
                  value={name}
                  disabled={!canEdit}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Es. Tagliatelle al ragù"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-descrizione">Descrizione</Label>
                <Textarea
                  id="p-descrizione"
                  rows={3}
                  value={description}
                  disabled={!canEdit}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Gli ingredienti, come li racconti al tavolo"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-prezzo">Prezzo (€)</Label>
                  <Input
                    id="p-prezzo"
                    inputMode="decimal"
                    value={prezzo}
                    disabled={!canEdit}
                    onChange={(e) => setPrezzo(e.target.value)}
                    placeholder="14"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-costo">Costo materie prime (€)</Label>
                  <Input
                    id="p-costo"
                    inputMode="decimal"
                    value={costo}
                    disabled={!canEdit}
                    onChange={(e) => setCosto(e.target.value)}
                    placeholder="facoltativo"
                  />
                  {anteprimaMargine ? (
                    <p
                      className={
                        anteprimaMargine.stato === "perdita"
                          ? "text-xs font-medium text-destructive-soft"
                          : anteprimaMargine.stato === "pari"
                            ? "text-xs text-accent-strong"
                            : "t-nota"
                      }
                    >
                      {anteprimaMargine.frase}
                    </p>
                  ) : (
                    <p className="t-nota">Resta qui dentro: nella carta non si legge.</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-categoria">Categoria</Label>
                  <Select value={categoryId} onValueChange={setCategoryId} disabled={!canEdit}>
                    <SelectTrigger id="p-categoria">
                      <SelectValue placeholder="Scegli una categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorie.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {!c.active && " (nascosta)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-disponibile">Disponibilità</Label>
                  <label
                    htmlFor="p-disponibile"
                    className="riquadro flex min-h-[2.25rem] cursor-pointer items-center gap-3 px-3 py-2"
                  >
                    <Switch
                      id="p-disponibile"
                      checked={available}
                      disabled={!canEdit}
                      onCheckedChange={setAvailable}
                    />
                    <span className="text-sm">
                      {available ? "Disponibile" : "Finito — non compare nel menu del cliente"}
                    </span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/*  Vendite                                                         */}
        {/* ---------------------------------------------------------------- */}
        {!nuovo && rendimento && <MenuItemSales dati={rendimento} currency={currency} />}

        {/* ---------------------------------------------------------------- */}
        {/*  Caratteristiche e allergeni                                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Caratteristiche</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 t-nota">Come si mangia: è un&apos;altra domanda dagli allergeni.</p>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(REGIMI) as [Regime, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={regimi.includes(k)}
                    onClick={() => spunta(regimi, setRegimi, k)}
                    className={cn(
                      "min-h-[2.5rem] rounded-full border px-4 text-sm transition-colors disabled:opacity-60",
                      regimi.includes(k)
                        ? "border-sage/60 bg-sage/25 text-ink"
                        : "border-border text-muted-foreground hover:border-line-40 hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Allergeni</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 t-nota">
                I quattordici a dichiarazione obbligatoria. Si spuntano, non si scrivono: su questo un cliente
                celiaco deve potersi fidare.
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(ALLERGENI) as [Allergene, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={allergeni.includes(k)}
                    onClick={() => spunta(allergeni, setAllergeni, k)}
                    className={cn(
                      "min-h-[2.5rem] rounded-full border px-4 text-sm transition-colors disabled:opacity-60",
                      allergeni.includes(k)
                        ? "border-accent bg-pill-selected text-ink"
                        : "border-border text-muted-foreground hover:border-line-40 hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/*  Posizione                                                       */}
        {/* ---------------------------------------------------------------- */}
        {!nuovo && canEdit && fratelli.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Posizione nel menu</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm">
                  <span className="tabular-nums">
                    {posizione}ª su {fratelli.length}
                  </span>{" "}
                  in {categoriaCorrente?.name ?? "questa categoria"}
                </p>
                {/* Si applica adesso, e va detto: è un ordine condiviso, non un
                    campo di questo modulo. */}
                <p className="t-nota">Si applica subito, senza salvare.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={posizione <= 1 || spostando}
                  onClick={() => sposta(-1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" /> Sposta su
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={posizione >= fratelli.length || spostando}
                  onClick={() => sposta(1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" /> Sposta giù
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/*  Eliminazione                                                    */}
        {/* ---------------------------------------------------------------- */}
        {!nuovo && canEdit && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive-soft">Elimina il piatto</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-sm text-muted-foreground">
                Lo toglie dalla carta per sempre. Un piatto già ordinato non si elimina: segnalo{" "}
                <em>finito</em> e sparisce dal menu del cliente restando nei conti.
              </p>
              <Button type="button" variant="destructive" onClick={() => setConfermaElimina(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina piatto
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={confermaElimina} onOpenChange={setConfermaElimina}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminare «{name || "questo piatto"}»?</DialogTitle>
            <DialogDescription>
              Non si può annullare. Se il piatto è solo finito per stasera, chiudi qui e usa
              l&apos;interruttore della disponibilità.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfermaElimina(false)} disabled={inCorso}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={elimina} disabled={inCorso}>
              {inCorso ? "Elimino…" : "Elimina definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
