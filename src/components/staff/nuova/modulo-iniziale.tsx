"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, ChevronLeft, ChevronRight, CreditCard, FileSignature, House, Phone, Save, UserRound } from "lucide-react";
import type { StaffCapability, StaffPrimaryRole } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVenueToday } from "@/components/shell/venue-time-provider";
import { CapabilityPicker } from "@/components/staff/capability-picker";
import { CampoLuogo } from "@/components/staff/campo-luogo";
import { ContractFields } from "@/components/staff/contract-fields";
import { CampoModulo, GrigliaCampi, Sezione } from "@/components/staff/scheda/sezione";
import {
  Anteprima,
  BarraPassiCompatta,
  GuidaPassi,
  ImpaginazioneNuova,
  TestataNuova,
  type SottoPasso,
} from "@/components/staff/nuova/passi";
import { CLASSE_AVANTI, CLASSE_INDIETRO, PiedePassi } from "@/components/staff/nuova/piede-passi";
import { BozzeInSospeso } from "@/components/staff/nuova/bozze-in-sospeso";
import type { BozzaStaff } from "@/server/staff-bozze";
import { readApiError } from "@/lib/api-client";
import { calcolaEta } from "@/lib/scheda-dipendente";
import { formattaIban, lunghezzaIban, normalizzaIban, validaIban } from "@/lib/validazione/iban";
import { incoerenzeCf, normalizzaCf, validaCodiceFiscale } from "@/lib/validazione/codice-fiscale";
import { ROLE_OPTIONS_BY_DEPARTMENT, staffDepartmentLabel } from "@/lib/staff-departments";
import { DEFAULT_CAPABILITIES_BY_ROLE, STAFF_ROLE_DESCRIPTIONS, staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import {
  EMPTY_CONTRACT_FORM,
  contractFormToPayload,
  isContractFormDirty,
  validateContractForm,
  type ContractFormErrors,
} from "@/lib/contract-form";

type Valori = {
  firstName: string;
  lastName: string;
  birthday: string;
  fiscalCode: string;
  birthPlace: string;
  nationality: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  phone: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  hireDate: string;
  iban: string;
};

const VUOTO: Valori = {
  firstName: "",
  lastName: "",
  birthday: "",
  fiscalCode: "",
  birthPlace: "",
  nationality: "",
  address: "",
  postalCode: "",
  city: "",
  province: "",
  phone: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  hireDate: "",
  iban: "",
};

type Errori = Partial<Record<keyof Valori | "primaryRole", string>>;

type Sotto = Extract<SottoPasso, "anagrafica" | "contatti" | "residenza" | "ruolo" | "pagamento" | "contratto">;

function telefonoValido(phone: string) {
  const t = phone.trim();
  return /^\+?[0-9\s()-]{6,20}$/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 6;
}

/**
 * I primi due passi di «Nuova persona»: anagrafica e lavoro, divisi in
 * sotto-passi da tre-sei campi — Anagrafica, Contatti, Residenza, Ruolo,
 * Contratto — perché ogni schermata stia nell'altezza dello schermo senza
 * scorrere.
 *
 * Sono gli unici che si compilano **prima** che la persona esista: tutto il
 * resto — documenti, corsi, accesso — si attacca a una scheda, quindi la
 * scheda nasce alla fine del Lavoro («Registra e continua») e da lì in poi si
 * lavora sulle sezioni vere della scheda, le stesse che si ritrovano
 * aprendola dopo.
 */
export function ModuloIniziale({
  canManageContracts,
  bozza,
  bozze,
}: {
  canManageContracts: boolean;
  /** La registrazione salvata a metà da riprendere (`?bozza=…`). */
  bozza: BozzaStaff | null;
  /** Le altre in sospeso, da proporre a chi apre «Nuova persona». */
  bozze: BozzaStaff[];
}) {
  const router = useRouter();
  const oggi = useVenueToday();
  const ordine: Sotto[] = canManageContracts
    ? ["anagrafica", "contatti", "residenza", "ruolo", "pagamento", "contratto"]
    : ["anagrafica", "contatti", "residenza", "ruolo", "pagamento"];
  const d = bozza?.dati;
  const [sotto, setSotto] = useState<Sotto>(() =>
    bozza && (ordine as string[]).includes(bozza.passo) ? (bozza.passo as Sotto) : "anagrafica",
  );
  const [valori, setValori] = useState<Valori>(() => ({ ...VUOTO, ...(d?.valori ?? {}) }));
  /** Il codice catastale del comune di nascita scelto dai suggerimenti. */
  const [codiceComune, setCodiceComune] = useState<string | null>(d?.codiceComune ?? null);
  const [errori, setErrori] = useState<Errori>({});
  const [primaryRole, setPrimaryRole] = useState<StaffPrimaryRole | null>((d?.primaryRole as StaffPrimaryRole | null) ?? null);
  const [capabilities, setCapabilities] = useState<StaffCapability[]>((d?.capabilities as StaffCapability[] | undefined) ?? []);
  const capabilityToccate = useRef(!!d?.primaryRole);
  const [contratto, setContratto] = useState(() => ({ ...EMPTY_CONTRACT_FORM, ...(d?.contratto ?? {}) }) as typeof EMPTY_CONTRACT_FORM);
  /** La bozza su cui si sta lavorando: nasce al primo «Salva». */
  const idBozza = useRef<string | null>(bozza?.id ?? null);
  const [salvataAlle, setSalvataAlle] = useState<string | null>(null);
  const [salvandoBozza, setSalvandoBozza] = useState(false);
  const [appenaSalvata, setAppenaSalvata] = useState(false);
  const [ibanToccato, setIbanToccato] = useState(false);
  const [erroriContratto, setErroriContratto] = useState<ContractFormErrors>({});
  const [erroreForm, setErroreForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const indice = ordine.indexOf(sotto);
  const ultimo = indice === ordine.length - 1;
  const passo = sotto === "ruolo" || sotto === "pagamento" || sotto === "contratto" ? "lavoro" : "personali";
  const eta = calcolaEta(valori.birthday || null);
  const reparto = staffDepartmentOf({ primaryRole, department: null });
  const mostraCapability = reparto === "SALA" || reparto === "BAR" || reparto === "DIREZIONE";
  const nascondi: SottoPasso[] = canManageContracts ? [] : ["contratto"];
  const imposta = (k: keyof Valori) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValori((v) => ({ ...v, [k]: e.target.value }));

  function cambiaRuolo(next: StaffPrimaryRole) {
    setPrimaryRole(next);
    if (!capabilityToccate.current) setCapabilities(DEFAULT_CAPABILITIES_BY_ROLE[next]);
  }

  /*
    Tutti i campi della registrazione sono obbligatori, tranne il contratto:
    una scheda nata a metà è una scheda che nessuno completa dopo. Si
    controllano solo i campi del sotto-passo aperto, così l'errore si vede
    dove si sta scrivendo.
  */
  function controlla(): boolean {
    const err: Errori = {};
    const manca = (k: keyof Valori, msg: string) => {
      if (!valori[k].trim()) err[k] = msg;
    };
    if (sotto === "anagrafica") {
      manca("firstName", "Inserisci il nome.");
      manca("lastName", "Inserisci il cognome.");
      if (!valori.birthday) err.birthday = "Inserisci la data di nascita.";
      else if (valori.birthday > oggi) err.birthday = "La data di nascita non può essere futura.";
      manca("birthPlace", "Inserisci il luogo di nascita.");
      manca("nationality", "Inserisci la nazionalità.");
      if (!valori.fiscalCode.trim()) err.fiscalCode = "Inserisci il codice fiscale.";
      else if (!cfFormale.valido) err.fiscalCode = cfFormale.errore;
      else if (incoerenze.length) err.fiscalCode = `Non corrisponde a: ${incoerenze.join(", ")}.`;
    }
    if (sotto === "contatti") {
      if (!valori.phone.trim()) err.phone = "Inserisci il numero di telefono.";
      else if (!telefonoValido(valori.phone)) err.phone = "Numero di telefono non valido.";
      if (!valori.email.trim()) err.email = "Inserisci l'email: serve per l'invito al gestionale.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valori.email.trim())) err.email = "Indirizzo email non valido.";
      // L'emergenza è facoltativa: si controlla solo il numero, se c'è.
      if (valori.emergencyContactPhone.trim() && !telefonoValido(valori.emergencyContactPhone)) err.emergencyContactPhone = "Numero non valido.";
    }
    if (sotto === "residenza") {
      if (!valori.address.trim()) err.address = "Inserisci l'indirizzo.";
      else if (!/\d/.test(valori.address)) err.address = "Manca il numero civico.";
      manca("city", "Inserisci il comune.");
      if (!valori.postalCode.trim()) err.postalCode = "Inserisci il CAP.";
      else if (!/^\d{5}$/.test(valori.postalCode.trim()) && valori.province.trim().toUpperCase() !== "EE") err.postalCode = "Il CAP ha 5 cifre.";
      manca("province", "Inserisci la provincia.");
    }
    if (sotto === "ruolo") {
      if (!primaryRole) err.primaryRole = "Seleziona un ruolo.";
      manca("hireDate", "Inserisci la data di assunzione.");
    }
    if (sotto === "pagamento") {
      if (!valori.iban.trim()) err.iban = "Inserisci l'IBAN.";
      else {
        const ib = validaIban(valori.iban);
        if (!ib.valido) err.iban = ib.errore;
      }
    }
    setErrori(err);
    if (sotto === "contratto") {
      const errC = contrattoIniziato ? validateContractForm(contratto) : {};
      setErroriContratto(errC);
      if (Object.keys(errC).length) return false;
    }
    return Object.keys(err).length === 0;
  }

  /*
    Il codice fiscale, controllato mentre si scrive: appena ha 16 caratteri
    si dice se è sbagliato — il carattere di controllo, o un pezzo che non
    torna con nome, cognome, data o comune di nascita. Prima l'errore
    compariva solo premendo «Avanti», e un codice sbagliato sembrava giusto.
  */
  const cfCompleto = normalizzaCf(valori.fiscalCode).length >= 16;
  const cfFormale = validaCodiceFiscale(valori.fiscalCode);
  const incoerenze = cfFormale.valido
    ? incoerenzeCf(valori.fiscalCode, {
        cognome: valori.lastName,
        nome: valori.firstName,
        dataNascita: valori.birthday,
        codiceComune,
      })
    : [];
  const cfValido = cfFormale.valido && incoerenze.length === 0;
  const erroreCfDalVivo = !cfCompleto
    ? undefined
    : !cfFormale.valido
      ? cfFormale.errore
      : incoerenze.length
        ? `Non corrisponde a: ${incoerenze.join(", ")}.`
        : undefined;
  // Il contratto è facoltativo: conta come iniziato solo se si è scritto
  // qualcosa oltre alla mansione, che si propone da sola dal ruolo.
  const contrattoIniziato = isContractFormDirty({ ...contratto, contractualRole: "" });
  const ibanEsito = valori.iban.trim() ? validaIban(valori.iban) : null;
  /*
    Anche l'IBAN si controlla mentre si scrive: l'errore compare quando è
    lungo quanto deve essere per il suo paese (27 caratteri in Italia), o
    uscendo dal campo — non a metà, quando è incompleto per forza.
  */
  const ibanCompatto = normalizzaIban(valori.iban);
  const ibanLungo = ibanCompatto.length >= (lunghezzaIban(ibanCompatto.slice(0, 2)) ?? 34);
  const erroreIbanDalVivo = ibanEsito && !ibanEsito.valido && (ibanLungo || ibanToccato) ? ibanEsito.errore : undefined;
  // Corretto l'IBAN, l'errore di «Avanti» non resta appeso.
  const erroreIban = ibanEsito?.valido ? undefined : (erroreIbanDalVivo ?? errori.iban);

  /*
    «Salva»: la registrazione resta com'è, senza controlli — una bozza è a
    metà per definizione — e si riprende da «Nuova persona», dal passo in
    cui la si è lasciata. Si resta sulla pagina: chi vuole chiude, chi
    voleva solo mettere al sicuro quel che ha scritto continua.
  */
  async function salvaBozza() {
    setErroreForm(null);
    setSalvandoBozza(true);
    const corpo = JSON.stringify({
      passo: sotto,
      dati: {
        valori,
        codiceComune,
        primaryRole,
        capabilities,
        ...(canManageContracts ? { contratto } : {}),
      },
    });
    const intestazioni = { "content-type": "application/json" };
    let res = idBozza.current
      ? await fetch(`/api/staff/bozze/${idBozza.current}`, { method: "PUT", headers: intestazioni, body: corpo })
      : null;
    // Mai salvata, o eliminata da un'altra parte nel frattempo: se ne fa una nuova.
    if (!res || res.status === 404) res = await fetch("/api/staff/bozze", { method: "POST", headers: intestazioni, body: corpo });
    setSalvandoBozza(false);
    if (!res.ok) {
      setErroreForm(await readApiError(res, "Non è stato possibile salvare. Riprova."));
      return;
    }
    const salvata = (await res.json()) as BozzaStaff;
    if (idBozza.current !== salvata.id) {
      idBozza.current = salvata.id;
      // Ricaricando la pagina si riapre questa bozza, non un modulo vuoto.
      window.history.replaceState(null, "", `/staff/nuova?bozza=${salvata.id}`);
    }
    setSalvataAlle(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    // Sul telefono la nota del piede non si vede: lo dice il pulsante.
    setAppenaSalvata(true);
    window.setTimeout(() => setAppenaSalvata(false), 2500);
  }

  function avanti() {
    if (!controlla()) return;
    if (ultimo) void registra();
    else {
      const prossimo = ordine[indice + 1];
      // Il contratto propone come mansione il ruolo scelto prima: quasi
      // sempre coincidono, e si cambia dalla tendina se no.
      if (prossimo === "contratto" && primaryRole && !contratto.contractualRole) {
        setContratto((c) => ({ ...c, contractualRole: staffPrimaryRoleLabel(primaryRole) }));
      }
      setSotto(prossimo);
    }
  }

  async function registra() {
    const contrattoCompilato = canManageContracts && contrattoIniziato;
    setErroreForm(null);
    setSalvando(true);

    const res = await fetch("/api/waiters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: valori.firstName.trim(),
        lastName: valori.lastName.trim(),
        birthday: valori.birthday,
        phone: valori.phone.trim(),
        email: valori.email.trim() || null,
        fiscalCode: normalizzaCf(valori.fiscalCode) || null,
        birthPlace: valori.birthPlace,
        nationality: valori.nationality,
        address: valori.address,
        postalCode: valori.postalCode,
        city: valori.city,
        province: valori.province.trim() || null,
        emergencyContactName: valori.emergencyContactName,
        emergencyContactPhone: valori.emergencyContactPhone,
        hireDate: valori.hireDate || null,
        primaryRole,
        capabilities: mostraCapability ? capabilities : [],
        iban: valori.iban.trim() || null,
      }),
    });
    if (!res.ok) {
      setSalvando(false);
      setErroreForm(await readApiError(res, "Impossibile registrare la persona. Controlla i dati e riprova."));
      return;
    }
    const creata = (await res.json()) as { id: string };
    // Registrata: la bozza non serve più. Se la cancellazione non riesce,
    // resta in elenco e si elimina a mano — la persona c'è comunque.
    if (idBozza.current) await fetch(`/api/staff/bozze/${idBozza.current}`, { method: "DELETE" }).catch(() => null);

    if (contrattoCompilato) {
      const r = await fetch(`/api/waiters/${creata.id}/contracts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(contractFormToPayload(contratto)),
      });
      if (!r.ok) {
        // La persona c'è già: si va avanti comunque, e il contratto si
        // ritrova da aggiungere nel passo Lavoro.
        router.replace(`/staff/nuova?id=${creata.id}&passo=lavoro&contratto=errore`);
        return;
      }
    }
    router.replace(`/staff/nuova?id=${creata.id}&passo=documenti`);
  }

  const etichettaAvanti = !ultimo ? "Avanti" : salvando ? "Registro…" : "Registra e continua";

  return (
    <ImpaginazioneNuova
      testata={<TestataNuova titolo="Nuova persona" sottotitolo="Registra un nuovo assunto, un passo alla volta." />}
      colonna={<GuidaPassi attivo={passo} sotto={sotto} idPersona={null} nascondi={nascondi} />}
      sottoColonna={
        <Anteprima
          nome={valori.firstName}
          cognome={valori.lastName}
          ruolo={primaryRole ? staffPrimaryRoleLabel(primaryRole) : null}
          telefono={valori.phone}
          email={valori.email}
        />
      }
      barraCompatta={<BarraPassiCompatta attivo={passo} sotto={sotto} nascondi={nascondi} />}
      piede={
        <PiedePassi
          indietro={
            indice > 0 ? (
              <button type="button" onClick={() => setSotto(ordine[indice - 1])} className={CLASSE_INDIETRO}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Indietro
              </button>
            ) : null
          }
          errore={erroreForm}
          nota={
            salvataAlle ? (
              <span className="inline-flex items-center gap-1.5 text-[hsl(var(--turno-sala))]">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Salvata alle {salvataAlle}: puoi chiudere e riprenderla da «Nuova persona».
              </span>
            ) : ultimo
              ? "Con «Registra» la persona entra in organico. Documenti, formazione e accesso vengono dopo."
              : `${indice + 1} di ${ordine.length} prima della registrazione`
          }
        >
          <button type="button" onClick={() => void salvaBozza()} disabled={salvando || salvandoBozza} className={CLASSE_INDIETRO}>
            {appenaSalvata ? <Check className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {salvandoBozza ? "Salvo…" : appenaSalvata ? "Salvata" : "Salva"}
          </button>
          <button type="submit" form="passo-corrente" disabled={salvando} className={CLASSE_AVANTI}>
            {etichettaAvanti}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </PiedePassi>
      }
    >
      {!bozza && bozze.length > 0 && <BozzeInSospeso bozze={bozze} />}
      <form
        id="passo-corrente"
        key={sotto}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          avanti();
        }}
        className="animate-fade-in"
      >
        {sotto === "anagrafica" && (
          <Sezione
            titolo="Anagrafica"
            icona={UserRound}
            descrizione="Tutti i campi sono obbligatori. Il codice fiscale si controlla mentre scrivi."
          >
            <GrigliaCampi colonne={2}>
              <CampoModulo etichetta="Nome *" htmlFor="firstName" errore={errori.firstName}>
                <Input id="firstName" value={valori.firstName} onChange={imposta("firstName")} autoFocus placeholder="Es. Marco" aria-invalid={!!errori.firstName} />
              </CampoModulo>
              <CampoModulo etichetta="Cognome *" htmlFor="lastName" errore={errori.lastName}>
                <Input id="lastName" value={valori.lastName} onChange={imposta("lastName")} placeholder="Es. Rossi" aria-invalid={!!errori.lastName} />
              </CampoModulo>
              <CampoModulo
                etichetta="Data di nascita *"
                htmlFor="birthday"
                errore={errori.birthday}
                nota={eta !== null ? `${eta} anni, calcolati dalla data.` : "L'età si calcola da sola."}
              >
                <Input id="birthday" type="date" max={oggi} value={valori.birthday} onChange={imposta("birthday")} aria-invalid={!!errori.birthday} />
              </CampoModulo>
              <CampoModulo etichetta="Luogo di nascita *" htmlFor="birthPlace" errore={errori.birthPlace} nota="Scrivi le prime lettere e scegli il comune.">
                <CampoLuogo
                  id="birthPlace"
                  tipo="comune"
                  valore={valori.birthPlace}
                  onCambia={(t) => {
                    // Scritto a mano, il comune non ha più un codice certo.
                    setCodiceComune(null);
                    setValori((v) => ({ ...v, birthPlace: t }));
                  }}
                  onScegli={(l) => {
                    setCodiceComune(l.codiceCatastale ?? null);
                    setValori((v) => ({
                      ...v,
                      birthPlace: l.etichetta,
                      // Nato in Italia: la nazionalità più probabile si propone, si cambia se serve.
                      nationality: v.nationality || (l.stato ? v.nationality : "Italiana"),
                    }));
                  }}
                  placeholder="Es. Torino"
                  invalido={!!errori.birthPlace}
                />
              </CampoModulo>
              <CampoModulo etichetta="Nazionalità *" htmlFor="nationality" errore={errori.nationality}>
                <Input id="nationality" value={valori.nationality} onChange={imposta("nationality")} placeholder="Es. Italiana" aria-invalid={!!errori.nationality} />
              </CampoModulo>
              {/* Per ultimo: si controlla contro tutto quello che sta sopra —
                  nome, cognome, data e comune di nascita. */}
              <CampoModulo
                etichetta="Codice fiscale *"
                htmlFor="fiscalCode"
                errore={cfValido ? undefined : (erroreCfDalVivo ?? errori.fiscalCode)}
                nota={
                  cfValido ? (
                    <span className="text-[hsl(var(--turno-sala))]">
                      Codice fiscale valido{codiceComune ? ", e corrisponde ai dati qui sopra" : ""}.
                    </span>
                  ) : (
                    "Si controlla con nome, cognome, data e luogo di nascita."
                  )
                }
              >
                <Input
                  id="fiscalCode"
                  value={valori.fiscalCode}
                  onChange={imposta("fiscalCode")}
                  className="font-mono uppercase tracking-wide"
                  maxLength={16}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="RSSMRA80A01L219X"
                  aria-invalid={!cfValido && !!(erroreCfDalVivo ?? errori.fiscalCode)}
                />
              </CampoModulo>
            </GrigliaCampi>
          </Sezione>
        )}

        {sotto === "contatti" && (
          <Sezione
            titolo="Contatti"
            icona={Phone}
            descrizione="All'email, all'ultimo passo, arriva l'invito per scegliere la password del gestionale."
          >
            <div className="space-y-7">
              <GrigliaCampi colonne={2}>
                <CampoModulo etichetta="Telefono *" htmlFor="phone" errore={errori.phone}>
                  <Input id="phone" type="tel" value={valori.phone} onChange={imposta("phone")} autoFocus placeholder="Es. +39 333 1234567" aria-invalid={!!errori.phone} />
                </CampoModulo>
                <CampoModulo etichetta="Email *" htmlFor="email" errore={errori.email}>
                  <Input id="email" type="email" value={valori.email} onChange={imposta("email")} placeholder="nome@esempio.it" aria-invalid={!!errori.email} />
                </CampoModulo>
              </GrigliaCampi>
              <div>
                <h3 className="t-etichetta mb-4 border-b border-border/60 pb-2 font-medium">In caso di emergenza <span className="font-normal normal-case tracking-normal text-muted-foreground">· facoltativo</span></h3>
                <GrigliaCampi colonne={2}>
                  <CampoModulo etichetta="Chi chiamare" htmlFor="emergencyContactName" errore={errori.emergencyContactName}>
                    <Input id="emergencyContactName" value={valori.emergencyContactName} onChange={imposta("emergencyContactName")} placeholder="Es. Laura Bellini (moglie)" aria-invalid={!!errori.emergencyContactName} />
                  </CampoModulo>
                  <CampoModulo etichetta="Numero" htmlFor="emergencyContactPhone" errore={errori.emergencyContactPhone}>
                    <Input id="emergencyContactPhone" type="tel" value={valori.emergencyContactPhone} onChange={imposta("emergencyContactPhone")} aria-invalid={!!errori.emergencyContactPhone} />
                  </CampoModulo>
                </GrigliaCampi>
              </div>
            </div>
          </Sezione>
        )}

        {sotto === "residenza" && (
          <Sezione
            titolo="Residenza"
            icona={House}
            descrizione="Scrivi via e numero civico e scegli il suggerimento: CAP, comune e provincia si compilano da soli."
          >
            <GrigliaCampi colonne={2}>
              <CampoModulo etichetta="Indirizzo e civico *" htmlFor="address" largo errore={errori.address}>
                <CampoLuogo
                  id="address"
                  tipo="indirizzo"
                  autoFocus
                  valore={valori.address}
                  onCambia={(t) => setValori((v) => ({ ...v, address: t }))}
                  onScegli={(l) =>
                    setValori((v) => ({
                      ...v,
                      address: l.via,
                      city: l.comune || v.city,
                      postalCode: l.cap || v.postalCode,
                      province: l.provincia || v.province,
                    }))
                  }
                  placeholder="Es. Via Roma 12, Torino"
                  invalido={!!errori.address}
                />
              </CampoModulo>
              <CampoModulo etichetta="Comune *" htmlFor="city" errore={errori.city}>
                <Input id="city" value={valori.city} onChange={imposta("city")} placeholder="Es. Torino" aria-invalid={!!errori.city} />
              </CampoModulo>
              <div className="grid grid-cols-2 gap-4">
                <CampoModulo etichetta="CAP *" htmlFor="postalCode" errore={errori.postalCode}>
                  <Input id="postalCode" value={valori.postalCode} onChange={imposta("postalCode")} inputMode="numeric" maxLength={16} placeholder="10121" aria-invalid={!!errori.postalCode} />
                </CampoModulo>
                <CampoModulo etichetta="Provincia *" htmlFor="province" errore={errori.province}>
                  <Input id="province" value={valori.province} onChange={imposta("province")} className="uppercase" maxLength={8} placeholder="TO" aria-invalid={!!errori.province} />
                </CampoModulo>
              </div>
            </GrigliaCampi>
          </Sezione>
        )}

        {sotto === "ruolo" && (
          <Sezione titolo="Ruolo" icona={Briefcase} descrizione="Il ruolo decide il reparto e dove la persona compare in sala e nei turni.">
            <GrigliaCampi colonne={2}>
              <CampoModulo
                etichetta="Ruolo *"
                htmlFor="primaryRole"
                errore={errori.primaryRole}
                nota={primaryRole ? STAFF_ROLE_DESCRIPTIONS[primaryRole] : undefined}
              >
                <Select value={primaryRole ?? undefined} onValueChange={(v) => cambiaRuolo(v as StaffPrimaryRole)}>
                  <SelectTrigger id="primaryRole" aria-invalid={!!errori.primaryRole}>
                    <SelectValue placeholder="Seleziona un ruolo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS_BY_DEPARTMENT.map((gruppo) => (
                      <SelectGroup key={gruppo.department}>
                        <SelectLabel>{gruppo.label}</SelectLabel>
                        {gruppo.roles.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </CampoModulo>
              <CampoModulo
                etichetta="Data di assunzione *"
                htmlFor="hireDate"
                errore={errori.hireDate}
                nota={primaryRole ? `Reparto: ${staffDepartmentLabel(reparto)}` : "Il reparto segue il ruolo."}
              >
                <Input id="hireDate" type="date" value={valori.hireDate} onChange={imposta("hireDate")} aria-invalid={!!errori.hireDate} />
              </CampoModulo>
              {mostraCapability && (
                <CampoModulo etichetta="Competenze operative" largo nota="Decidono a quali ruoli al tavolo può essere assegnata.">
                  <CapabilityPicker
                    value={capabilities}
                    onChange={(next) => {
                      capabilityToccate.current = true;
                      setCapabilities(next);
                    }}
                  />
                </CampoModulo>
              )}
            </GrigliaCampi>
          </Sezione>
        )}

        {sotto === "pagamento" && (
          <Sezione titolo="Pagamento" icona={CreditCard} descrizione="Il conto su cui ricevere stipendio e rimborsi.">
            <GrigliaCampi colonne={2}>
              <CampoModulo
                etichetta="IBAN *"
                htmlFor="iban"
                largo
                errore={erroreIban}
                nota={
                  ibanEsito?.valido ? (
                    <span className="text-[hsl(var(--turno-sala))]">IBAN valido ({ibanEsito.paese}).</span>
                  ) : undefined
                }
              >
                <Input
                  id="iban"
                  value={valori.iban}
                  autoFocus
                  onChange={(e) => setValori((v) => ({ ...v, iban: e.target.value.toUpperCase() }))}
                  onBlur={() => {
                    setIbanToccato(true);
                    if (ibanEsito?.valido) setValori((v) => ({ ...v, iban: formattaIban(v.iban) }));
                  }}
                  className="font-mono tracking-wide"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="IT60 X054 2811 1010 0000 0123 456"
                  aria-invalid={!!erroreIban}
                />
              </CampoModulo>
            </GrigliaCampi>
          </Sezione>
        )}

        {sotto === "contratto" && (
          <Sezione titolo="Contratto" icona={FileSignature} descrizione="Facoltativo: se non lo hai sotto mano, lascia vuoto e aggiungilo dalla scheda.">
            <ContractFields idPrefix="nuova-contratto" value={contratto} onChange={setContratto} errors={erroriContratto} />
          </Sezione>
        )}
      </form>
    </ImpaginazioneNuova>
  );
}
