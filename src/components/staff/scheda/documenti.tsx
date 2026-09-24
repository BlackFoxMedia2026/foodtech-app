"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileText, FolderOpen, Image as ImageIcon, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import type { StaffDocumentCategory } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAvvisi } from "@/components/ui/avvisi";
import { readApiError } from "@/lib/api-client";
import {
  CATEGORIE_DOCUMENTO,
  STATO_SCADENZA_LABEL,
  STATO_SCADENZA_TONE,
  categoriaDocumentoLabel,
  dataBreve,
  descriviScadenza,
  perCampoData,
  statoScadenza,
} from "@/lib/scheda-dipendente";
import { staffContractTypeLabel } from "@/lib/staff-contracts";
import { formatNumber } from "@/lib/utils";
import { CampoModulo, Sezione } from "./sezione";
import type { ContrattoDTO, DocumentoDTO, PersonaDTO } from "./tipi";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;

function pesoLeggibile(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${formatNumber(mb)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function tipoFile(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime === "image/jpeg") return "JPG";
  if (mime === "image/png") return "PNG";
  if (mime === "image/webp") return "WebP";
  return mime;
}

function controllaFile(file: File): string | null {
  if (!ACCEPT.split(",").includes(file.type)) return "Carica un file PDF, JPG, PNG o WebP.";
  if (file.size > MAX_BYTES) return "Il file supera i 10 MB.";
  return null;
}

type Meta = { name: string; category: StaffDocumentCategory; expiresAt: string; notes: string };

/**
 * I documenti della persona: un archivio, non un elenco di allegati.
 *
 * Ogni riga dice cosa è, di che categoria, quando è stato caricato, se e
 * quando scade, e in che stato è. Le azioni — vedi, scarica, sostituisci,
 * elimina — stanno dietro un menu, tranne «Visualizza» che è quella che si
 * fa davvero.
 *
 * I documenti dei **contratti** compaiono in cima, in sola lettura: vivono
 * nella tabella dei contratti (un rinnovo, un documento) e si gestiscono
 * dalla linguetta «Lavoro». Qui si vedono perché la domanda «dov'è il
 * contratto firmato di Marco?» deve avere una risposta anche in questa
 * pagina.
 */
export function Documenti({
  persona,
  documenti,
  contratti,
  canManage,
}: {
  persona: PersonaDTO;
  documenti: DocumentoDTO[];
  contratti: ContrattoDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [caricaAperto, setCaricaAperto] = useState(false);
  const [inModifica, setInModifica] = useState<DocumentoDTO | null>(null);
  const [daEliminare, setDaEliminare] = useState<DocumentoDTO | null>(null);
  const [anteprima, setAnteprima] = useState<{ url: string; nome: string; mime: string } | null>(null);
  const [sostituisco, setSostituisco] = useState<string | null>(null);
  const sostituisciRef = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(false);

  if (!canManage) {
    return (
      <Sezione titolo="Documenti" icona={FolderOpen}>
        <p className="text-base text-muted-foreground">I documenti sono riservati a chi gestisce i contratti del locale.</p>
      </Sezione>
    );
  }

  const contrattiConDocumento = contratti.filter((c) => c.document);
  const oggi = new Date();

  async function sostituisci(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const id = sostituisco;
    setSostituisco(null);
    if (!file || !id) return;
    const errore = controllaFile(file);
    if (errore) return avvisi.problema(errore);
    setInCorso(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/waiters/${persona.id}/documents/${id}`, { method: "POST", body: fd });
    setInCorso(false);
    if (!res.ok) return avvisi.problema(await readApiError(res, "Impossibile sostituire il documento."));
    avvisi.mostra("Documento sostituito");
    router.refresh();
  }

  async function elimina() {
    if (!daEliminare) return;
    setInCorso(true);
    const res = await fetch(`/api/waiters/${persona.id}/documents/${daEliminare.id}`, { method: "DELETE" });
    setInCorso(false);
    setDaEliminare(null);
    if (!res.ok) return avvisi.problema(await readApiError(res, "Impossibile eliminare il documento."));
    avvisi.mostra("Documento eliminato");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Sezione
        id="documenti"
        titolo="Documenti"
        icona={FolderOpen}
        descrizione={
          documenti.length === 0
            ? "Carta d'identità, permesso di soggiorno, buste paga, attestati: tutto in un posto."
            : `${documenti.length} ${documenti.length === 1 ? "documento caricato" : "documenti caricati"}${contrattiConDocumento.length ? `, più ${contrattiConDocumento.length === 1 ? "il contratto firmato" : `${contrattiConDocumento.length} contratti firmati`}` : ""}.`
        }
        azione={
          <Button type="button" variant="accent" onClick={() => setCaricaAperto(true)}>
            <Upload className="h-4 w-4" aria-hidden="true" /> Carica documento
          </Button>
        }
      >
        {documenti.length === 0 && contrattiConDocumento.length === 0 ? (
          <div className="riquadro tratteggiato p-10 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-tertiary-foreground" aria-hidden="true" />
            <p className="text-base font-medium">Nessun documento caricato</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              PDF o immagini, fino a 10 MB. Con una data di scadenza, il documento compare fra le scadenze della Panoramica.
            </p>
          </div>
        ) : (
          <ul className="-mx-2 divide-y divide-border/60">
            {contrattiConDocumento.map((c) => {
              const url = `/api/waiters/${persona.id}/contracts/${c.id}/document`;
              return (
                <RigaDocumento
                  key={`contratto-${c.id}`}
                  nome={`Contratto · ${staffContractTypeLabel(c.contractType)}`}
                  categoria="Contratto di lavoro"
                  mime={c.document!.mimeType}
                  file={c.document!.originalFileName}
                  peso={c.document!.fileSize}
                  caricatoIl={c.document!.createdAt}
                  scadeIl={c.endDate}
                  oggi={oggi}
                  onVedi={() => setAnteprima({ url, nome: c.document!.originalFileName, mime: c.document!.mimeType })}
                  urlScarica={`${url}?download=1`}
                  nota="Si gestisce dalla linguetta Lavoro."
                />
              );
            })}
            {documenti.map((d) => {
              const url = `/api/waiters/${persona.id}/documents/${d.id}`;
              return (
                <RigaDocumento
                  key={d.id}
                  nome={d.name}
                  categoria={categoriaDocumentoLabel(d.category)}
                  mime={d.mimeType}
                  file={d.originalFileName}
                  peso={d.fileSize}
                  caricatoIl={d.createdAt}
                  scadeIl={d.expiresAt}
                  oggi={oggi}
                  onVedi={() => setAnteprima({ url, nome: d.originalFileName, mime: d.mimeType })}
                  urlScarica={`${url}?download=1`}
                  menu={
                    <>
                      <DropdownMenuItem onSelect={() => setInModifica(d)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica nome e scadenza
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setSostituisco(d.id);
                          // Il click sull'input deve partire dopo che il menu ha chiuso.
                          window.setTimeout(() => sostituisciRef.current?.click(), 0);
                        }}
                      >
                        <Upload className="h-4 w-4" aria-hidden="true" /> Sostituisci file
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setDaEliminare(d)} className="text-destructive-soft">
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina
                      </DropdownMenuItem>
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
        <input ref={sostituisciRef} type="file" accept={ACCEPT} className="hidden" onChange={sostituisci} />
      </Sezione>

      <DialogoCarica
        open={caricaAperto}
        onOpenChange={setCaricaAperto}
        waiterId={persona.id}
        onFatto={() => {
          avvisi.mostra("Documento caricato");
          router.refresh();
        }}
      />

      {inModifica && (
        <DialogoMeta
          documento={inModifica}
          waiterId={persona.id}
          onClose={() => setInModifica(null)}
          onFatto={() => {
            avvisi.mostra("Documento aggiornato");
            router.refresh();
          }}
        />
      )}

      <Dialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminare «{daEliminare?.name}»?</DialogTitle>
            <DialogDescription>Il file viene cancellato definitivamente. Se è l&apos;attestato di un corso, il corso resta senza attestato.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDaEliminare(null)} disabled={inCorso}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" onClick={elimina} disabled={inCorso}>
              {inCorso ? "Elimino…" : "Elimina documento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!anteprima} onOpenChange={(o) => !o && setAnteprima(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">{anteprima?.nome}</DialogTitle>
            <DialogDescription>{anteprima ? tipoFile(anteprima.mime) : ""}</DialogDescription>
          </DialogHeader>
          {anteprima && (
            <div className="overflow-hidden riquadro bg-muted">
              {anteprima.mime === "application/pdf" ? (
                <iframe src={anteprima.url} title={anteprima.nome} className="h-[65vh] w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={anteprima.url} alt={anteprima.nome} className="max-h-[65vh] w-full object-contain" />
              )}
            </div>
          )}
          {anteprima && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" asChild>
                <a href={`${anteprima.url}?download=1`} download={anteprima.nome}>
                  <Download className="h-4 w-4" aria-hidden="true" /> Scarica
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RigaDocumento({
  nome,
  categoria,
  mime,
  file,
  peso,
  caricatoIl,
  scadeIl,
  oggi,
  onVedi,
  urlScarica,
  menu,
  nota,
}: {
  nome: string;
  categoria: string;
  mime: string;
  file: string;
  peso: number;
  caricatoIl: string;
  scadeIl: string | null;
  oggi: Date;
  onVedi: () => void;
  urlScarica: string;
  menu?: React.ReactNode;
  nota?: string;
}) {
  const scadenza = scadeIl ? new Date(scadeIl) : null;
  const stato = scadenza ? statoScadenza(scadenza, oggi) : null;
  return (
    <li className="flex flex-col gap-3 px-2 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-veil-6 text-muted-foreground" aria-hidden="true">
          {mime === "application/pdf" ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="break-words text-base font-medium text-foreground md:text-lg">{nome}</p>
          <p className="text-sm text-muted-foreground">
            {categoria} · {tipoFile(mime)} · {pesoLeggibile(peso)} · caricato il {dataBreve(caricatoIl)}
          </p>
          <p className="mt-0.5 text-sm">
            {scadenza && stato ? (
              <span className={stato === "scaduto" ? "text-destructive-soft" : stato === "in_scadenza" ? "text-accent-strong" : "text-muted-foreground"}>
                Scade il {dataBreve(scadenza)} · {descriviScadenza(scadenza, oggi).toLowerCase()}
              </span>
            ) : (
              <span className="text-tertiary-foreground">Senza scadenza</span>
            )}
            {nota && <span className="text-tertiary-foreground"> · {nota}</span>}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {stato && <Badge tone={STATO_SCADENZA_TONE[stato]}>{STATO_SCADENZA_LABEL[stato]}</Badge>}
        <Button type="button" variant="outline" size="sm" onClick={onVedi}>
          <Eye className="h-4 w-4" aria-hidden="true" /> Visualizza
        </Button>
        <Button type="button" variant="ghost" size="icon" asChild>
          <a href={urlScarica} download={file} aria-label={`Scarica ${nome}`}>
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
        {menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={`Altre azioni per ${nome}`}>
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {menu}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

function CampiMeta({ valori, onChange, idPrefix }: { valori: Meta; onChange: (m: Meta) => void; idPrefix: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <CampoModulo etichetta="Nome del documento" htmlFor={`${idPrefix}-name`} largo>
        <Input id={`${idPrefix}-name`} value={valori.name} onChange={(e) => onChange({ ...valori, name: e.target.value })} placeholder="Es. Carta d'identità" />
      </CampoModulo>
      <CampoModulo etichetta="Categoria" htmlFor={`${idPrefix}-category`}>
        <Select value={valori.category} onValueChange={(v) => onChange({ ...valori, category: v as StaffDocumentCategory })}>
          <SelectTrigger id={`${idPrefix}-category`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIE_DOCUMENTO.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CampoModulo>
      <CampoModulo etichetta="Data di scadenza" htmlFor={`${idPrefix}-expiresAt`} nota="Facoltativa. Comparirà fra le scadenze.">
        <Input id={`${idPrefix}-expiresAt`} type="date" value={valori.expiresAt} onChange={(e) => onChange({ ...valori, expiresAt: e.target.value })} />
      </CampoModulo>
      <CampoModulo etichetta="Note" htmlFor={`${idPrefix}-notes`} largo>
        <Textarea id={`${idPrefix}-notes`} value={valori.notes} onChange={(e) => onChange({ ...valori, notes: e.target.value })} className="min-h-[60px]" />
      </CampoModulo>
    </div>
  );
}

function DialogoCarica({
  open,
  onOpenChange,
  waiterId,
  onFatto,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  waiterId: string;
  onFatto: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta>({ name: "", category: "ALTRO", expiresAt: "", notes: "" });
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [trascino, setTrascino] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function scegli(f: File | undefined) {
    if (!f) return;
    const err = controllaFile(f);
    if (err) return setErrore(err);
    setErrore(null);
    setFile(f);
    if (!meta.name) setMeta((m) => ({ ...m, name: f.name.replace(/\.[^.]+$/, "") }));
  }

  function chiudi(o: boolean) {
    if (!o) {
      setFile(null);
      setMeta({ name: "", category: "ALTRO", expiresAt: "", notes: "" });
      setErrore(null);
    }
    onOpenChange(o);
  }

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return setErrore("Scegli un file da caricare.");
    if (!meta.name.trim()) return setErrore("Dai un nome al documento.");
    setInCorso(true);
    setErrore(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", meta.name.trim());
    fd.set("category", meta.category);
    if (meta.expiresAt) fd.set("expiresAt", meta.expiresAt);
    if (meta.notes.trim()) fd.set("notes", meta.notes.trim());
    const res = await fetch(`/api/waiters/${waiterId}/documents`, { method: "POST", body: fd });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile caricare il documento."));
    chiudi(false);
    onFatto();
  }

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Carica un documento</DialogTitle>
          <DialogDescription>PDF, JPG, PNG o WebP, fino a 10 MB.</DialogDescription>
        </DialogHeader>
        <form onSubmit={invia} className="space-y-4" noValidate>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setTrascino(true);
            }}
            onDragLeave={() => setTrascino(false)}
            onDrop={(e) => {
              e.preventDefault();
              setTrascino(false);
              scegli(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors ${trascino ? "border-accent bg-accent/5" : "border-border"}`}
          >
            {file ? (
              <>
                <FileText className="h-6 w-6 text-accent-strong" aria-hidden="true" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tipoFile(file.type)} · {pesoLeggibile(file.size)}
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                  Scegli un altro file
                </Button>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Trascina qui il file, oppure</p>
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  Scegli un file
                </Button>
              </>
            )}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => scegli(e.target.files?.[0])} />
          </div>
          <CampiMeta valori={meta} onChange={setMeta} idPrefix="nuovo" />
          {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => chiudi(false)} disabled={inCorso}>
              Annulla
            </Button>
            <Button type="submit" variant="accent" disabled={inCorso}>
              {inCorso ? "Carico…" : "Carica documento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoMeta({
  documento,
  waiterId,
  onClose,
  onFatto,
}: {
  documento: DocumentoDTO;
  waiterId: string;
  onClose: () => void;
  onFatto: () => void;
}) {
  const [meta, setMeta] = useState<Meta>({
    name: documento.name,
    category: documento.category,
    expiresAt: perCampoData(documento.expiresAt),
    notes: documento.notes ?? "",
  });
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!meta.name.trim()) return setErrore("Dai un nome al documento.");
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/waiters/${waiterId}/documents/${documento.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: meta.name.trim(), category: meta.category, expiresAt: meta.expiresAt || null, notes: meta.notes.trim() || null }),
    });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile salvare."));
    onClose();
    onFatto();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifica documento</DialogTitle>
          <DialogDescription>{documento.originalFileName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={salva} className="space-y-4" noValidate>
          <CampiMeta valori={meta} onChange={setMeta} idPrefix="modifica" />
          {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={inCorso}>
              Annulla
            </Button>
            <Button type="submit" variant="accent" disabled={inCorso}>
              {inCorso ? "Salvo…" : "Salva modifiche"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
