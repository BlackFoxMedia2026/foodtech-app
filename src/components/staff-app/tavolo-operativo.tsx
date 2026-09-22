"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Check,
  ChevronRight,
  Pencil,
  Plus,
  ReceiptText,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/euro";
import { nomeAllergene } from "@/lib/allergeni";
import { riassuntoModifiche } from "@/lib/personalizzazioni";
import { chiedi, ErroreStaff } from "@/lib/staff-fetch";
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { useAvvisi } from "@/components/ui/avvisi";
import type { PermessoStaff } from "@/lib/permessi-staff";
import type { ComandaView, OspiteView } from "@/server/comande/comande";
import type { TavoloAperto } from "@/server/staff-app/tavolo";
import { EtichettaStato } from "./etichetta-stato";
import { TestataRitorno } from "./testata-staff";
import { Foglio } from "./foglio";
import { MenuComanda } from "./menu-comanda";
import { RiepilogoComanda } from "./riepilogo-comanda";

/**
 * **Il tavolo aperto** — §7, §8, §14, §20, §23, §25, §26.
 *
 * ## L'ordine delle sezioni è l'ordine del servizio
 *
 * Richiamo (se c'è) → azione principale → comande → ospiti → note → conto.
 * Non è l'ordine del §8 alla lettera, ed è deliberato: là la comanda è
 * dichiarata «la sezione principale», e il modo di renderla principale su uno
 * schermo da 375 px non è metterla per prima in una lista — è darle **la CTA
 * grande in cima** e lasciare che le sezioni sotto si leggano nell'ordine in
 * cui servono.
 *
 * I piatti pronti scavalcano tutto: sono la cosa per cui ci si alza (§20).
 *
 * ## Il conto in fondo, e con l'aria attorno
 *
 * L'unica azione irreversibile di questa schermata è chiudere il tavolo, e sta
 * in fondo a una sezione che si apre. §37: le conferme si tengono per le
 * operazioni critiche, e questa lo è — ma la protezione migliore per un
 * pulsante che si preme una volta a serata è che non stia accanto a uno che si
 * preme cinquanta volte.
 */

export function TavoloOperativo({
  iniziale,
  permessi,
}: {
  iniziale: TavoloAperto;
  permessi: PermessoStaff[];
}) {
  const avvisi = useAvvisi();
  const [tavolo, setTavolo] = useState(iniziale);
  const [menuAperto, setMenuAperto] = useState(false);
  const [riepilogoAperto, setRiepilogoAperto] = useState(false);
  const [noteAperte, setNoteAperte] = useState(false);
  const [inCorso, setInCorso] = useState(false);

  const puo = (p: PermessoStaff) => permessi.includes(p);

  const ricarica = useCallback(async () => {
    try {
      setTavolo(await chiedi<TavoloAperto>(`/api/staff-app/tavolo/${iniziale.tableId}`));
    } catch {
      /* La sonda che fallisce non svuota la schermata: si tiene l'ultima
         fotografia buona. Vedi il commento in `lista-tavoli.tsx`. */
    }
  }, [iniziale.tableId]);

  useServizioVivo(ricarica);

  async function azione<T>(fn: () => Promise<T>, messaggio?: string): Promise<T | null> {
    if (inCorso) return null;
    setInCorso(true);
    try {
      const esito = await fn();
      await ricarica();
      if (messaggio) avvisi.mostra(messaggio);
      return esito;
    } catch (e) {
      avvisi.problema(
        e instanceof ErroreStaff ? e.message : "Non è stato possibile completare l'operazione.",
      );
      return null;
    } finally {
      setInCorso(false);
    }
  }

  async function apriComanda() {
    const esito = await azione(() =>
      chiedi<{ orderId: string; comanda: ComandaView }>(
        `/api/staff-app/tavolo/${tavolo.tableId}/comanda`,
        { metodo: "POST" },
      ),
    );
    if (esito) setMenuAperto(true);
  }

  function cambiaStato(a: string, testo: string) {
    return azione(
      () =>
        chiedi<TavoloAperto>(`/api/staff-app/tavolo/${tavolo.tableId}/stato`, {
          metodo: "POST",
          corpo: { azione: a },
        }),
      testo,
    );
  }

  async function segnaServiti(comandaId: string) {
    await azione(
      () => chiedi(`/api/staff-app/comande/${comandaId}/servite`, { metodo: "POST", corpo: { righe: [] } }),
      "Segnati come serviti",
    );
  }

  const bozza = tavolo.bozza;
  const inviate = tavolo.comande.filter((c) => c.status !== "BOZZA");
  const pronte = tavolo.comande.filter((c) => c.status === "PRONTA");

  return (
    <div className="schermo">
      <TestataRitorno
        titolo={`Tavolo ${tavolo.label}`}
        sottotitolo={[
          tavolo.seduta ? `${tavolo.seduta.coperti} ospiti` : `${tavolo.posti} posti`,
          tavolo.roomName,
        ]
          .filter(Boolean)
          .join(" · ")}
        indietro="/staff-app/sala"
        tono={tavolo.tono}
        azione={<EtichettaStato stato={tavolo.stato} tono={tavolo.tono} />}
      />

      <div className="fill-scroll space-y-3 px-4 pb-4 pt-3">
        {/* Il richiamo, se c'è: sopra a tutto. */}
        {pronte.length > 0 && (
          <section className="rounded-lg border border-accent/70 bg-accent/15 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-accent-strong">
              <BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />
              {tavolo.piattiPronti === 1
                ? "1 piatto pronto al passe"
                : `${tavolo.piattiPronti} piatti pronti al passe`}
            </p>
            <ul className="mt-2 space-y-0.5">
              {pronte
                .flatMap((c) => c.righe.filter((r) => r.status === "PRONTA"))
                .map((r) => (
                  <li key={r.id} className="t-corpo">
                    {r.quantita > 1 ? `${r.quantita} × ` : ""}
                    {r.nome}
                    {r.ospiteLabel && <span className="t-nota"> · {r.ospiteLabel}</span>}
                  </li>
                ))}
            </ul>
            {puo("edit_orders") && (
              <div className="mt-3 space-y-2">
                {pronte.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={inCorso}
                    onClick={() => segnaServiti(c.id)}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-cream text-sm font-medium text-clay-ink transition-transform active:scale-[0.99] disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Segna come serviti
                    {pronte.length > 1 && <span className="t-nota">(comanda {c.numero})</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Le note importanti: prima di ordinare, non dopo. */}
        {tavolo.note.some((n) => n.importante) && (
          <section className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            {tavolo.note
              .filter((n) => n.importante)
              .map((n, i) => (
                <p key={i} className="flex items-start gap-2 text-sm font-medium text-destructive-soft">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {n.testo}
                </p>
              ))}
          </section>
        )}

        {/* I passaggi di stato che **portano avanti** il servizio. Chiudere il
            tavolo non è fra questi e sta in fondo: vedi `AzioniStato`. */}
        {puo("manage_tables") && (
          <AzioniStato tavolo={tavolo} inCorso={inCorso} onAzione={cambiaStato} />
        )}

        {/* L'azione principale. */}
        {puo("create_orders") && tavolo.seduta && (
          <button
            type="button"
            disabled={inCorso}
            onClick={apriComanda}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-cream px-5 text-base font-medium text-clay-ink transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            {bozza && bozza.articoli > 0
              ? `Continua la comanda · ${bozza.articoli} ${bozza.articoli === 1 ? "articolo" : "articoli"}`
              : "Aggiungi ordine"}
          </button>
        )}

        {/* §23: lo storico delle tranche. */}
        {inviate.length > 0 && (
          <section>
            <h2 className="t-titolo-sezione pb-2">Ordini</h2>
            <ul className="space-y-2">
              {inviate.map((c) => (
                <li key={c.id}>
                  <CardComanda comanda={c} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* §14: i commensali. */}
        {tavolo.ospiti.length > 0 && puo("edit_orders") && (
          <Commensali ospiti={tavolo.ospiti} onRinominato={ricarica} />
        )}

        {/* §25: le note del tavolo. */}
        {puo("manage_tables") && tavolo.seduta && (
          <>
            <button
              type="button"
              onClick={() => setNoteAperte(true)}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-lg border border-border bg-card px-3 text-left"
            >
              <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Note del tavolo</span>
                <span className="t-nota block truncate">
                  {tavolo.note.find((n) => n.origine === "interna")?.testo ?? "Nessuna nota"}
                </span>
              </span>
              <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>

            <FoglioNote
              aperto={noteAperte}
              iniziale={tavolo.note.find((n) => n.origine === "interna")?.testo ?? ""}
              onChiudi={() => setNoteAperte(false)}
              onSalva={async (testo) => {
                await azione(
                  () =>
                    chiedi(`/api/staff-app/tavolo/${tavolo.tableId}/nota`, {
                      metodo: "PATCH",
                      corpo: { testo },
                    }),
                  "Nota salvata",
                );
                setNoteAperte(false);
              }}
            />
          </>
        )}

        {/* §26: il conto. */}
        {puo("view_payments") && tavolo.conto && (
          <SezioneConto
            conto={tavolo.conto}
            puoGestire={puo("manage_payments")}
            inCorso={inCorso}
            onRichiedi={(annulla) =>
              azione(
                () =>
                  chiedi(`/api/staff-app/tavolo/${tavolo.tableId}/conto`, {
                    metodo: "POST",
                    corpo: { azione: annulla ? "annulla_richiesta" : "richiedi" },
                  }),
                annulla ? "Richiesta annullata" : "Conto richiesto",
              )
            }
          />
        )}

        {/*
          L'unica azione irreversibile della schermata, e l'ultima cosa che si
          incontra scorrendo. §37: la conferma resta per ciò che non si annulla
          — ma la protezione che conta è la distanza dal gesto che si fa
          cinquanta volte a sera.
        */}
        {puo("manage_tables") && tavolo.seduta?.status === "SEATED" && (
          <button
            type="button"
            disabled={inCorso}
            onClick={() => {
              const avviso =
                (tavolo.conto?.residuoCents ?? 0) > 0
                  ? `Restano ${euro(tavolo.conto!.residuoCents)} da incassare. Chiudere lo stesso il tavolo?`
                  : "Chiudere il tavolo? La serata risulterà finita e il conto non si potrà più toccare.";
              if (!window.confirm(avviso)) return;
              cambiaStato("libera", "Tavolo chiuso");
            }}
            className="mt-2 min-h-[48px] w-full rounded-full border border-border px-4 text-sm text-muted-foreground transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            Chiudi tavolo
          </button>
        )}
      </div>

      {bozza && (
        <>
          <MenuComanda
            aperto={menuAperto}
            onChiudi={() => {
              setMenuAperto(false);
              ricarica();
            }}
            comandaId={bozza.id}
            ospiti={tavolo.ospiti}
            comanda={bozza}
            onComandaAggiornata={(c) =>
              setTavolo((t) => ({
                ...t,
                bozza: c,
                comande: t.comande.map((x) => (x.id === c.id ? c : x)),
              }))
            }
            onApriRiepilogo={() => setRiepilogoAperto(true)}
          />

          <RiepilogoComanda
            aperto={riepilogoAperto}
            onChiudi={() => setRiepilogoAperto(false)}
            comanda={bozza}
            ospiti={tavolo.ospiti}
            tavolo={tavolo.label}
            puoInviare={puo("send_orders")}
            onAggiornata={(c) =>
              setTavolo((t) => ({
                ...t,
                bozza: c,
                comande: t.comande.map((x) => (x.id === c.id ? c : x)),
              }))
            }
            onInviata={() => {
              setRiepilogoAperto(false);
              setMenuAperto(false);
              ricarica();
            }}
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Gli stati del tavolo                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Le transizioni possibili **adesso**, non tutte.
 *
 * Un tavolo già seduto non mostra «accomoda», e uno libero non mostra
 * «libera». Mostrare tutti i passaggi sempre, con quelli impossibili spenti,
 * sembra più informativo e non lo è: su un telefono sono quattro pulsanti
 * grandi da leggere per trovarne uno premibile.
 */
function AzioniStato({
  tavolo,
  inCorso,
  onAzione,
}: {
  tavolo: TavoloAperto;
  inCorso: boolean;
  onAzione: (azione: string, testo: string) => void;
}) {
  const stato = tavolo.seduta?.status;

  const azioni: { chiave: string; etichetta: string; conferma?: string }[] = [];
  if (!stato || stato === "CONFIRMED" || stato === "PENDING") {
    azioni.push({ chiave: "in_arrivo", etichetta: "È arrivato" });
    azioni.push({ chiave: "accomoda", etichetta: "Accomoda" });
  } else if (stato === "ARRIVED") {
    azioni.push({ chiave: "accomoda", etichetta: "Accomoda" });
  }
  /* `SEATED` non produce niente qui di proposito: l'unica transizione che
     resta a un tavolo seduto è chiuderlo, ed è l'unica azione irreversibile
     della schermata. Un pulsante grande chiamato «Chiudi tavolo» sopra la CTA
     che si preme cinquanta volte a sera è un tavolo chiuso per sbaglio, e una
     conferma non basta a ripararlo — si finisce a premere «sì» per riflesso.
     Sta in fondo, dopo il conto, e si chiama `ChiudiTavolo`. */

  if (azioni.length === 0) return null;

  return (
    <div className="flex gap-2">
      {azioni.map((a) => (
        <button
          key={a.chiave}
          type="button"
          disabled={inCorso}
          onClick={() => {
            /* §37: la conferma **solo** per ciò che non si annulla. Chiudere
               il tavolo lo è; «è arrivato» no, e chiederlo cinquanta volte a
               sera sarebbe cinquanta tap di troppo. */
            if (a.conferma && !window.confirm(a.conferma)) return;
            onAzione(a.chiave, a.etichetta);
          }}
          className="min-h-[48px] flex-1 rounded-full border border-border bg-card px-4 text-sm font-medium transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          {a.etichetta}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Una comanda nello storico                                                 */
/* -------------------------------------------------------------------------- */

const ETICHETTA_STATO: Record<ComandaView["status"], string> = {
  BOZZA: "In composizione",
  INVIATA: "Inviata",
  RICEVUTA: "Ricevuta in cucina",
  IN_PREPARAZIONE: "In preparazione",
  PRONTA: "Pronta",
  SERVITA: "Servita",
  ANNULLATA: "Annullata",
};

function CardComanda({ comanda }: { comanda: ComandaView }) {
  const [aperta, setAperta] = useState(false);
  const urgente = comanda.status === "PRONTA";

  return (
    <div className={cn("rounded-lg border bg-card", urgente ? "border-accent/70" : "border-border")}>
      <button
        type="button"
        onClick={() => setAperta((v) => !v)}
        aria-expanded={aperta}
        className="flex min-h-[56px] w-full items-center gap-3 p-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {ora(comanda.sentAt ?? comanda.createdAt)} · {comanda.articoli}{" "}
            {comanda.articoli === 1 ? "articolo" : "articoli"}
          </span>
          <span className={cn("t-nota block", urgente && "text-accent-strong")}>
            {ETICHETTA_STATO[comanda.status]}
          </span>
        </span>
        <span className="t-dato shrink-0">{euro(comanda.totalCents)}</span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            aperta && "rotate-90",
          )}
          aria-hidden="true"
        />
      </button>

      {aperta && (
        <ul className="border-t border-border px-3 py-2">
          {comanda.righe.map((r) => {
            const variazioni = riassuntoModifiche(r.modifiche);
            const conAllergia = r.allergeni.length > 0 || !!r.notaAllergia;
            return (
              <li key={r.id} className="py-1.5">
                <p
                  className={cn(
                    "text-sm",
                    r.status === "ANNULLATA" && "text-muted-foreground line-through",
                  )}
                >
                  {r.quantita > 1 ? `${r.quantita} × ` : ""}
                  {r.nome}
                  {r.ospiteLabel && <span className="t-nota"> · {r.ospiteLabel}</span>}
                </p>
                {variazioni && <p className="t-nota">{variazioni}</p>}
                {r.note && <p className="t-nota italic">«{r.note}»</p>}
                {conAllergia && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-destructive-soft">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Allergia
                      {r.allergeni.length > 0 && `: ${r.allergeni.map(nomeAllergene).join(", ")}`}
                      {r.notaAllergia && ` — ${r.notaAllergia}`}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
          {comanda.nota && <li className="t-nota border-t border-border pt-2">«{comanda.nota}»</li>}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  I commensali                                                              */
/* -------------------------------------------------------------------------- */

function Commensali({
  ospiti,
  onRinominato,
}: {
  ospiti: OspiteView[];
  onRinominato: () => void | Promise<void>;
}) {
  const avvisi = useAvvisi();
  const [inModifica, setInModifica] = useState<OspiteView | null>(null);
  const [nome, setNome] = useState("");

  async function salva() {
    if (!inModifica) return;
    try {
      await chiedi(`/api/staff-app/ospiti/${inModifica.id}`, {
        metodo: "PATCH",
        corpo: { label: nome.trim() || inModifica.label },
      });
      setInModifica(null);
      await onRinominato();
    } catch (e) {
      avvisi.problema(e instanceof Error ? e.message : "Non è stato possibile rinominare.");
    }
  }

  return (
    <section>
      <h2 className="t-titolo-sezione pb-2">Ospiti</h2>
      <p className="t-nota -mt-1 pb-2">
        Tocca un nome per cambiarlo: serve a dividere il conto e a sapere chi ha ordinato cosa.
      </p>
      <div className="flex flex-wrap gap-2">
        {ospiti.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              setInModifica(o);
              setNome(o.label);
            }}
            className="min-h-[44px] rounded-full border border-border bg-card px-4 text-sm"
          >
            {o.label}
          </button>
        ))}
      </div>

      <Foglio
        aperto={!!inModifica}
        onChiudi={() => setInModifica(null)}
        titolo="Come si chiama"
        sottotitolo={inModifica?.label}
        piede={
          <button
            type="button"
            onClick={salva}
            className="min-h-[52px] w-full rounded-full bg-cream text-base font-medium text-clay-ink"
          >
            Salva
          </button>
        }
      >
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={60}
          autoFocus
          className="min-h-[48px] w-full rounded-md border border-input bg-secondary px-3 text-base"
        />
      </Foglio>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  La nota e il conto                                                        */
/* -------------------------------------------------------------------------- */

function FoglioNote({
  aperto,
  iniziale,
  onChiudi,
  onSalva,
}: {
  aperto: boolean;
  iniziale: string;
  onChiudi: () => void;
  onSalva: (testo: string) => void | Promise<void>;
}) {
  const [testo, setTesto] = useState(iniziale);

  return (
    <Foglio
      aperto={aperto}
      onChiudi={onChiudi}
      titolo="Note del tavolo"
      sottotitolo="Le vede chi lavora, non l'ospite."
      piede={
        <button
          type="button"
          onClick={() => onSalva(testo)}
          className="min-h-[52px] w-full rounded-full bg-cream text-base font-medium text-clay-ink"
        >
          Salva
        </button>
      }
    >
      <textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        rows={4}
        maxLength={1000}
        placeholder="«Compleanno — torta alle 22:30», «Seggiolone», «Hanno fretta»"
        className="w-full rounded-md border border-input bg-secondary px-3 py-2 text-base placeholder:text-muted-foreground"
      />
    </Foglio>
  );
}

function SezioneConto({
  conto,
  puoGestire,
  inCorso,
  onRichiedi,
}: {
  conto: NonNullable<TavoloAperto["conto"]>;
  puoGestire: boolean;
  inCorso: boolean;
  onRichiedi: (annulla: boolean) => void;
}) {
  const chiesto = !!conto.contoRichiestoAt;

  return (
    <section className="riquadro comodo">
      <h2 className="t-etichetta flex items-center gap-1.5">
        <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
        Conto
      </h2>

      <dl className="mt-2 space-y-1.5">
        <Riga etichetta="Totale" valore={euro(conto.totaleCents)} forte />
        {conto.pagatoCents > 0 && <Riga etichetta="Già pagato" valore={euro(conto.pagatoCents)} />}
        {conto.inCorsoCents > 0 && (
          <Riga etichetta="Pagamento in corso" valore={euro(conto.inCorsoCents)} />
        )}
        {(conto.pagatoCents > 0 || conto.inCorsoCents > 0) && (
          <Riga etichetta="Residuo" valore={euro(conto.residuoCents)} forte />
        )}
      </dl>

      {conto.righe === 0 && (
        <p className="t-nota mt-2">
          Nessuna riga battuta: il totale è zero perché non è stato ordinato niente, non perché il
          tavolo non consumi.
        </p>
      )}

      <button
        type="button"
        disabled={inCorso}
        onClick={() => onRichiedi(chiesto)}
        className={cn(
          "mt-3 min-h-[48px] w-full rounded-full border px-4 text-sm font-medium transition-transform active:scale-[0.99] disabled:opacity-60",
          chiesto ? "border-accent/60 bg-accent/15 text-accent-strong" : "border-border",
        )}
      >
        {chiesto ? "Conto richiesto · annulla" : "Richiedi conto"}
      </button>

      {!puoGestire && (
        <p className="t-nota mt-2">
          Il tuo ruolo non consente di chiudere il conto: chiedi a un responsabile di sala.
        </p>
      )}
    </section>
  );
}

function Riga({
  etichetta,
  valore,
  forte,
}: {
  etichetta: string;
  valore: string;
  forte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("t-corpo", !forte && "text-muted-foreground")}>{etichetta}</dt>
      <dd className={cn("t-dato", forte && "text-base font-medium")}>{valore}</dd>
    </div>
  );
}

function ora(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}
