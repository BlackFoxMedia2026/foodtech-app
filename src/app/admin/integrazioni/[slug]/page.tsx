import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { resolveActiveVenue } from "@/lib/tenant";
import { voceDi, requisitiMancanti } from "@/server/integrations/registry";
import { adattatoreDi } from "@/server/integrations/adapters";
import { custodiaPronta } from "@/server/integrations/credenziali";
import { motivoNonInstallabile } from "@/server/integrations/installazioni";
import { panoramicaCertificazione } from "@/server/integrations/certificazione/accesso";
import { ETICHETTA_CERTIFICAZIONE, ETICHETTA_RILASCIO } from "@/server/integrations/certificazione/livelli";
import { richiesteAperte } from "@/server/integrations/richieste";
import { vistaVoceCliente } from "@/server/integrations/cliente";
import { CAPACITA, ETICHETTA_AUTENTICAZIONE, ETICHETTA_CATEGORIA, type Capacita } from "@/server/integrations/tipi";
import { ConsoleCertificazione } from "@/components/integrations/console-certificazione";
import { PannelloIntegrazioniAdmin } from "@/components/integrations/pannello-integrazioni-admin";
import { RichiesteIntegrazioni } from "@/components/integrations/richieste-integrazioni";

export const dynamic = "force-dynamic";

/**
 * **Un fornitore visto da Foodtech.** Solo Super Admin (il layout di /admin
 * risponde «non esiste» a tutti gli altri).
 *
 * Qui sta tutto ciò che la pagina del cliente non mostra più: adattatore,
 * autenticazione e permessi, eventi e firma dei webhook, variabili della
 * piattaforma, campi di configurazione con il loro aiuto tecnico, matrice
 * delle risorse con ciò che resta DA VERIFICARE, cosa manca per operare,
 * rilascio, accessi beta, richieste. E, sul **locale attivo** del Super
 * Admin, lo stato grezzo dell'installazione, il registro con i riferimenti
 * di correlazione e la console di certificazione.
 */
export default async function AdminIntegrazionePage({ params }: { params: { slug: string } }) {
  const voce = voceDi(params.slug);
  if (!voce) notFound();

  const adattatore = adattatoreDi(voce.slug);
  const mancanti = requisitiMancanti(voce);
  const motivo = motivoNonInstallabile(voce);
  const [panoramica, richieste, attivo] = await Promise.all([
    adattatore ? panoramicaCertificazione() : Promise.resolve([]),
    richiesteAperte(),
    resolveActiveVenue(),
  ]);
  const fornitore = panoramica.find((f) => f.slug === voce.slug) ?? null;
  const cliente = vistaVoceCliente(voce);

  const locale = attivo.state === "ok" ? attivo.context : null;
  const inst = locale
    ? await db.integrationInstallation.findFirst({
        where: { venueId: locale.venueId, integrationSlug: voce.slug },
        include: { credential: { select: { kind: true, scopes: true, accessTokenExpiresAt: true, refreshTokenExpiresAt: true, rotatedAt: true } } },
      })
    : null;
  const [registro, mappature] = inst
    ? await Promise.all([
        db.integrationSyncLog.findMany({
          where: { installationId: inst.id, venueId: inst.venueId },
          orderBy: { startedAt: "desc" },
          take: 30,
          select: { id: true, operation: true, trigger: true, status: true, startedAt: true, itemsSucceeded: true, itemsFailed: true, errorCode: true, correlationId: true },
        }),
        db.externalEntityMapping.groupBy({ by: ["entityType"], where: { installationId: inst.id, venueId: inst.venueId }, _count: { _all: true } }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <Link href="/admin/integrazioni" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Integrazioni
      </Link>

      <header className="space-y-1">
        <p className="t-etichetta">
          {ETICHETTA_CATEGORIA[voce.categoria]} · {voce.fornitore} · <code>{voce.slug}</code>
        </p>
        <h1 className="t-titolo-pagina">{voce.nome}</h1>
        <p className="t-nota">
          Implementazione {voce.implementazione} · disponibilità {voce.disponibilita}
          {fornitore && ` · rilascio ${ETICHETTA_RILASCIO[fornitore.fase as keyof typeof ETICHETTA_RILASCIO]} · certificazione ${ETICHETTA_CERTIFICAZIONE[fornitore.certificazione as keyof typeof ETICHETTA_CERTIFICAZIONE]}`}
          {` · adattatore ${voce.versioneAdattatore ?? "assente"}`}
        </p>
        {motivo && <p className="text-sm text-accent-strong">Non installabile: {motivo.codice} — {motivo.messaggio}</p>}
      </header>

      <Sezione titolo="Adattatore e accesso">
        <Tabella
          righe={[
            ["Autenticazione", `${voce.autenticazione.modalita} — ${ETICHETTA_AUTENTICAZIONE[voce.autenticazione.modalita]}${voce.autenticazione.verificata ? "" : " (non verificata sulla documentazione)"}`],
            ["Scope chiesti", voce.autenticazione.scope?.join(", ") || "—"],
            ["Capacità dichiarate", voce.capacita.map((c) => `${c} (${CAPACITA[c as Capacita]?.label ?? c})`).join(", ") || "—"],
            ["Webhook: eventi", voce.webhook.eventi.join(", ") || "—"],
            ["Webhook: autenticità", voce.webhook.autenticazione ?? "—"],
            ["Webhook configurato dal cliente", voce.webhook.configurazioneManuale ? "sì" : "no"],
            ["Variabili della piattaforma", voce.requisitiPiattaforma.length ? voce.requisitiPiattaforma.map((n) => `${n}${mancanti.includes(n) ? " (MANCA)" : " ✓"}`).join(", ") : "nessuna"],
            ["Custodia delle credenziali", custodiaPronta() ? "pronta" : "NON pronta (manca la chiave di cifratura)"],
            ["Nota d'installazione (interna)", voce.notaInstallazione ?? "—"],
          ]}
        />
        {voce.documentazione && (
          <a href={voce.documentazione} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
            Documentazione ufficiale <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        {voce.mancaPerOperare.length > 0 && (
          <div>
            <p className="t-etichetta mb-1">Cosa manca per operare</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {voce.mancaPerOperare.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </Sezione>

      {voce.configurazione.length > 0 && (
        <Sezione titolo="Campi di configurazione" nota="A sinistra la chiave dell'adattatore; l'etichetta del cliente è quella di `cliente.campi` nel catalogo.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="t-etichetta">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">Chiave</th>
                  <th className="py-1.5 pr-3 font-normal">Etichetta tecnica</th>
                  <th className="py-1.5 pr-3 font-normal">Cliente vede</th>
                  <th className="py-1.5 pr-3 font-normal">Tipo · fase</th>
                  <th className="py-1.5 font-normal">Aiuto tecnico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 align-top">
                {voce.configurazione.map((c) => {
                  const v = [...cliente.campiAccesso, ...cliente.campiSede].find((x) => x.chiave === c.chiave);
                  return (
                    <tr key={c.chiave}>
                      <td className="py-1.5 pr-3 font-mono">{c.chiave}</td>
                      <td className="py-1.5 pr-3">{c.etichetta}</td>
                      <td className="py-1.5 pr-3">{v?.etichetta}</td>
                      <td className="py-1.5 pr-3">
                        {c.tipo}
                        {c.fase ? ` · ${c.fase}` : ""}
                        {c.opzioniDa ? ` · ${c.opzioniDa}` : ""}
                        {c.obbligatorio ? "" : " · facoltativo"}
                      </td>
                      <td className="py-1.5 text-muted-foreground">{c.aiuto ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Sezione>
      )}

      {voce.risorse && voce.risorse.length > 0 && (
        <Sezione titolo="Cosa permette l'API" nota="Dalla documentazione ufficiale: DOCUMENTATA non vuol dire provata.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="t-etichetta">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">Risorsa</th>
                  <th className="py-1.5 pr-3 font-normal">L · S · W</th>
                  <th className="py-1.5 pr-3 font-normal">Direzione</th>
                  <th className="py-1.5 pr-3 font-normal">Usata da</th>
                  <th className="py-1.5 pr-3 font-normal">Verifica</th>
                  <th className="py-1.5 font-normal">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 align-top">
                {voce.risorse.map((r) => (
                  <tr key={r.risorsa}>
                    <td className="py-1.5 pr-3">{r.risorsa}</td>
                    <td className="py-1.5 pr-3 font-mono">
                      {r.api.lettura ? "L" : "·"}
                      {r.api.scrittura ? "S" : "·"}
                      {r.api.webhook ? "W" : "·"}
                    </td>
                    <td className="py-1.5 pr-3">{r.direzione}</td>
                    <td className="py-1.5 pr-3">{r.usataDa ?? "—"}</td>
                    <td className={`py-1.5 pr-3 ${r.verifica === "DA_VERIFICARE" ? "text-accent-strong" : ""}`}>{r.verifica}</td>
                    <td className="py-1.5 text-muted-foreground">{r.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sezione>
      )}

      {fornitore && <PannelloIntegrazioniAdmin fornitori={JSON.parse(JSON.stringify([fornitore]))} />}

      <Sezione titolo="Richieste dei locali">
        <RichiesteIntegrazioni richieste={richieste.filter((r) => r.slug === voce.slug)} />
      </Sezione>

      <Sezione
        titolo={locale ? `Sul locale attivo: ${locale.venue.name}` : "Locale attivo"}
        nota="Stato grezzo, registro e console riguardano il locale scelto nel gestionale (il locale di prova)."
      >
        {!locale ? (
          <p className="text-sm text-muted-foreground">Nessun locale attivo per questo account.</p>
        ) : !inst || inst.status === "NOT_INSTALLED" ? (
          <p className="text-sm text-muted-foreground">Non installata su questo locale.</p>
        ) : (
          <div className="space-y-4">
            <Tabella
              righe={[
                ["Stato", `${inst.status} · salute ${inst.healthStatus}${inst.healthMessage ? ` — ${inst.healthMessage}` : ""}`],
                ["Ultimo errore", inst.lastErrorCode ? `${inst.lastErrorCode} — ${inst.lastError ?? ""} (${inst.lastErrorAt?.toISOString() ?? ""})` : "—"],
                ["Account / sede esterni", `${inst.externalAccountId ?? "—"} (${inst.externalAccountName ?? "—"}) · ${inst.externalLocationId ?? "—"} (${inst.externalLocationName ?? "—"})`],
                ["Capacità accese", inst.enabledCapabilities.join(", ") || "—"],
                ["Configurazione", JSON.stringify(inst.configuration)],
                ["Metadati", JSON.stringify(inst.metadata)],
                ["Credenziali", inst.credential ? `${inst.credential.kind} · scope ${inst.credential.scopes.join(", ") || "—"} · accesso fino a ${inst.credential.accessTokenExpiresAt?.toISOString() ?? "—"}` : "nessuna"],
                ["Versione adattatore installata", inst.adapterVersion ?? "—"],
                ["Mappature", mappature.map((m) => `${m.entityType} ${m._count._all}`).join(" · ") || "—"],
              ]}
            />
            {registro.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="t-etichetta">
                    <tr>
                      <th className="py-1.5 pr-3 font-normal">Quando</th>
                      <th className="py-1.5 pr-3 font-normal">Operazione · trigger</th>
                      <th className="py-1.5 pr-3 font-normal">Esito</th>
                      <th className="py-1.5 pr-3 font-normal">Elementi</th>
                      <th className="py-1.5 font-normal">Correlation ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {registro.map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{r.startedAt.toLocaleString("it-IT")}</td>
                        <td className="py-1.5 pr-3">
                          {r.operation} · {r.trigger}
                        </td>
                        <td className="py-1.5 pr-3">
                          {r.status}
                          {r.errorCode ? ` · ${r.errorCode}` : ""}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {r.itemsSucceeded}
                          {r.itemsFailed ? ` · ${r.itemsFailed} scartati` : ""}
                        </td>
                        <td className="py-1.5 font-mono text-muted-foreground">{r.correlationId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Sezione>

      {adattatore && locale && (
        <section className="space-y-3">
          <h2 className="t-titolo-sezione">Console di certificazione</h2>
          <ConsoleCertificazione slug={voce.slug} />
        </section>
      )}
    </div>
  );
}

function Sezione({ titolo, nota, children }: { titolo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="riquadro comodo space-y-3">
      <div>
        <h2 className="t-titolo-sezione">{titolo}</h2>
        {nota && <p className="t-nota mt-1">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

function Tabella({ righe }: { righe: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[220px_1fr]">
      {righe.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
