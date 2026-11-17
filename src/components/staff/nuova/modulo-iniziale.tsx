"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, ChevronLeft, ChevronRight, CreditCard, FileSignature, House, Phone, UserRound } from "lucide-react";
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
import { readApiError } from "@/lib/api-client";
import { calcolaEta } from "@/lib/scheda-dipendente";
import { formattaIban, validaIban } from "@/lib/validazione/iban";
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
export function ModuloIniziale({ canManageContracts }: { canManageContracts: boolean }) {
  const router = useRouter();
  const oggi = useVenueToday();
  const ordine: Sotto[] = canManageContracts
    ? ["anagrafica", "contatti", "residenza", "ruolo", "pagamento", "contratto"]
    : ["anagrafica", "contatti", "residenza", "ruolo", "pagamento"];
  const [sotto, setSotto] = useState<Sotto>("anagrafica");
  const [valori, setValori] = useState<Valori>(VUOTO);
  const [errori, setErrori] = useState<Errori>({});
  const [primaryRole, setPrimaryRole] = useState<StaffPrimaryRole | null>(null);
  const [capabilities, setCapabilities] = useState<StaffCapability[]>([]);
  const capabilityToccate = useRef(false);
  const [contratto, setContratto] = useState(EMPTY_CONTRACT_FORM);
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
      if (!valori.fiscalCode.trim()) err.fiscalCode = "Inserisci il codice fiscale.";
      else {
        const cf = validaCodiceFiscale(valori.fiscalCode);
        if (!cf.valido) err.fiscalCode = cf.errore;
      }
      manca("birthPlace", "Inserisci il luogo di nascita.");
      manca("nationality", "Inserisci la nazionalità.");
    }
    if (sotto === "contatti") {
      if (!valori.phone.trim()) err.phone = "Inserisci il numero di telefono.";
      else if (!telefonoValido(valori.phone)) err.phone = "Numero di telefono non valido.";
      if (!valori.email.trim()) err.email = "Inserisci l'email: serve per l'invito al gestionale.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valori.email.trim())) err.email = "Indirizzo email non valido.";
      manca("emergencyContactName", "Indica chi chiamare in caso di emergenza.");
      if (!valori.emergencyContactPhone.trim()) err.emergencyContactPhone = "Inserisci il numero.";
      else if (!telefonoValido(valori.emergencyContactPhone)) err.emergencyContactPhone = "Numero non valido.";
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
      const errC = isContractFormDirty(contratto) ? validateContractForm(contratto) : {};
      setErroriContratto(errC);
      if (Object.keys(errC).length) return false;
    }
    return Object.keys(err).length === 0;
  }

  /** Cosa del codice fiscale non torna con nome, cognome e nascita: un avviso, non un blocco. */
  const cfValido = validaCodiceFiscale(valori.fiscalCode).valido;
  const incoerenze = cfValido
    ? incoerenzeCf(valori.fiscalCode, { cognome: valori.lastName, nome: valori.firstName, dataNascita: valori.birthday })
    : [];
  const ibanEsito = valori.iban.trim() ? validaIban(valori.iban) : null;

  function avanti() {
    if (!controlla()) return;
    if (ultimo) void registra();
    else setSotto(ordine[indice + 1]);
  }

  async function registra() {
    const contrattoCompilato = canManageContracts && isContractFormDirty(contratto);
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
            ultimo
              ? "Con «Registra» la persona entra in organico. Documenti, formazione e accesso vengono dopo."
              : `${indice + 1} di ${ordine.length} prima della registrazione`
          }
        >
          <button type="submit" form="passo-corrente" disabled={salvando} className={CLASSE_AVANTI}>
            {etichettaAvanti}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </PiedePassi>
      }
    >
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
              <CampoModulo
                etichetta="Codice fiscale *"
                htmlFor="fiscalCode"
                errore={errori.fiscalCode}
                nota={
                  incoerenze.length ? (
                    <span className="text-accent-strong">Valido, ma non torna con: {incoerenze.join(", ")}. Controlla.</span>
                  ) : cfValido ? (
                    <span className="text-[hsl(var(--turno-sala))]">Codice fiscale valido.</span>
                  ) : (
                    "Si controllano formato e carattere di controllo."
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
                  aria-invalid={!!errori.fiscalCode}
                />
              </CampoModulo>
              <CampoModulo etichetta="Luogo di nascita *" htmlFor="birthPlace" errore={errori.birthPlace} nota="Scrivi le prime lettere e scegli il comune.">
                <CampoLuogo
                  id="birthPlace"
                  tipo="comune"
                  valore={valori.birthPlace}
                  onCambia={(t) => setValori((v) => ({ ...v, birthPlace: t }))}
                  onScegli={(l) =>
                    setValori((v) => ({
                      ...v,
                      birthPlace: l.etichetta,
                      // Nato in Italia: la nazionalità più probabile si propone, si cambia se serve.
                      nationality: v.nationality || (l.stato ? v.nationality : "Italiana"),
                    }))
                  }
                  placeholder="Es. Torino"
                  invalido={!!errori.birthPlace}
                />
              </CampoModulo>
              <CampoModulo etichetta="Nazionalità *" htmlFor="nationality" errore={errori.nationality}>
                <Input id="nationality" value={valori.nationality} onChange={imposta("nationality")} placeholder="Es. Italiana" aria-invalid={!!errori.nationality} />
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
                <h3 className="t-etichetta mb-4 border-b border-border/60 pb-2 font-medium">In caso di emergenza</h3>
                <GrigliaCampi colonne={2}>
                  <CampoModulo etichetta="Chi chiamare *" htmlFor="emergencyContactName" errore={errori.emergencyContactName}>
                    <Input id="emergencyContactName" value={valori.emergencyContactName} onChange={imposta("emergencyContactName")} placeholder="Es. Laura Bellini (moglie)" aria-invalid={!!errori.emergencyContactName} />
                  </CampoModulo>
                  <CampoModulo etichetta="Numero *" htmlFor="emergencyContactPhone" errore={errori.emergencyContactPhone}>
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
                errore={errori.iban}
                nota={
                  ibanEsito?.valido ? (
                    <span className="text-[hsl(var(--turno-sala))]">IBAN valido ({ibanEsito.paese}).</span>
                  ) : (
                    "Si controllano paese, lunghezza e cifra di controllo. Non dice che il conto esista né di chi sia."
                  )
                }
              >
                <Input
                  id="iban"
                  value={valori.iban}
                  autoFocus
                  onChange={(e) => setValori((v) => ({ ...v, iban: e.target.value.toUpperCase() }))}
                  onBlur={() => ibanEsito?.valido && setValori((v) => ({ ...v, iban: formattaIban(v.iban) }))}
                  className="font-mono tracking-wide"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="IT60 X054 2811 1010 0000 0123 456"
                  aria-invalid={!!errori.iban}
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
