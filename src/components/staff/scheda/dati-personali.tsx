"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAvvisi } from "@/components/ui/avvisi";
import { useVenueToday } from "@/components/shell/venue-time-provider";
import { readApiError } from "@/lib/api-client";
import { calcolaEta, dataLunga, perCampoData } from "@/lib/scheda-dipendente";
import { Campo, CampoModulo, GrigliaCampi, PiedeModifica, Sezione } from "./sezione";
import type { PersonaDTO } from "./tipi";

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
};

type Errori = Partial<Record<keyof Valori, string>>;

function daPersona(p: PersonaDTO): Valori {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    birthday: perCampoData(p.birthday),
    fiscalCode: p.fiscalCode ?? "",
    birthPlace: p.birthPlace ?? "",
    nationality: p.nationality ?? "",
    address: p.address ?? "",
    postalCode: p.postalCode ?? "",
    city: p.city ?? "",
    province: p.province ?? "",
    phone: p.phone,
    email: p.email ?? "",
    emergencyContactName: p.emergencyContactName ?? "",
    emergencyContactPhone: p.emergencyContactPhone ?? "",
  };
}

function telefonoValido(phone: string) {
  const t = phone.trim();
  return /^\+?[0-9\s()-]{6,20}$/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 6;
}

/**
 * I dati personali. A riposo si leggono; con «Modifica» la sezione intera
 * diventa un modulo, con «Annulla / Salva modifiche» in fondo.
 *
 * L'età si calcola dalla data di nascita, come prima, e si vede anche mentre
 * si digita la data: è il controllo più semplice contro un anno sbagliato.
 */
export function DatiPersonali({
  persona,
  canEdit,
  modificaIniziale = false,
}: {
  persona: PersonaDTO;
  canEdit: boolean;
  modificaIniziale?: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const oggi = useVenueToday();
  const [modifica, setModifica] = useState(modificaIniziale);
  const [valori, setValori] = useState<Valori>(() => daPersona(persona));
  const [errori, setErrori] = useState<Errori>({});
  const [erroreForm, setErroreForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const eta = calcolaEta(modifica ? valori.birthday : persona.birthday);
  const imposta = (k: keyof Valori) => (e: React.ChangeEvent<HTMLInputElement>) => setValori((v) => ({ ...v, [k]: e.target.value }));

  function inizia() {
    setValori(daPersona(persona));
    setErrori({});
    setErroreForm(null);
    setModifica(true);
  }

  function annulla() {
    setModifica(false);
    setErrori({});
    setErroreForm(null);
  }

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err: Errori = {};
    if (!valori.firstName.trim()) err.firstName = "Inserisci il nome.";
    if (!valori.lastName.trim()) err.lastName = "Inserisci il cognome.";
    if (!valori.birthday) err.birthday = "Inserisci la data di nascita.";
    else if (valori.birthday > oggi) err.birthday = "La data di nascita non può essere futura.";
    if (!valori.phone.trim()) err.phone = "Inserisci il numero di telefono.";
    else if (!telefonoValido(valori.phone)) err.phone = "Numero di telefono non valido.";
    if (valori.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valori.email)) err.email = "Indirizzo email non valido.";
    if (valori.fiscalCode && !/^[A-Za-z0-9]{1,32}$/.test(valori.fiscalCode.trim())) err.fiscalCode = "Solo lettere e numeri.";
    if (valori.emergencyContactPhone && !telefonoValido(valori.emergencyContactPhone)) err.emergencyContactPhone = "Numero non valido.";
    if (Object.keys(err).length) {
      setErrori(err);
      return;
    }
    setErrori({});
    setSalvando(true);
    setErroreForm(null);
    const res = await fetch(`/api/waiters/${persona.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: valori.firstName.trim(),
        lastName: valori.lastName.trim(),
        birthday: valori.birthday,
        phone: valori.phone.trim(),
        email: valori.email.trim() || null,
        fiscalCode: valori.fiscalCode.trim() || null,
        birthPlace: valori.birthPlace,
        nationality: valori.nationality,
        address: valori.address,
        postalCode: valori.postalCode,
        city: valori.city,
        province: valori.province.trim() || null,
        emergencyContactName: valori.emergencyContactName,
        emergencyContactPhone: valori.emergencyContactPhone,
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      setErroreForm(await readApiError(res, "Impossibile salvare le modifiche. Verifica i dati e riprova."));
      return;
    }
    setModifica(false);
    avvisi.mostra("Dati personali aggiornati");
    router.refresh();
  }

  const indirizzo = [persona.address, [persona.postalCode, persona.city].filter(Boolean).join(" "), persona.province]
    .filter(Boolean)
    .join(", ");

  if (!modifica) {
    return (
      <Sezione
        id="dati-personali"
        titolo="Dati personali"
        icona={UserRound}
        descrizione="Anagrafica, recapiti e contatto di emergenza."
        azione={
          canEdit && (
            <Button type="button" variant="outline" onClick={inizia}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica
            </Button>
          )
        }
      >
        <div className="space-y-8">
          <GrigliaCampi>
            <Campo etichetta="Nome" valore={persona.firstName} />
            <Campo etichetta="Cognome" valore={persona.lastName} />
            <Campo etichetta="Codice fiscale" valore={persona.fiscalCode} />
            <Campo etichetta="Data di nascita" valore={dataLunga(persona.birthday)} nota={eta !== null ? `${eta} anni` : undefined} />
            <Campo etichetta="Luogo di nascita" valore={persona.birthPlace} />
            <Campo etichetta="Nazionalità" valore={persona.nationality} />
          </GrigliaCampi>

          <div>
            <h3 className="t-etichetta mb-4 border-b border-border/60 pb-2 font-medium">Residenza</h3>
            <GrigliaCampi>
              <Campo etichetta="Indirizzo" valore={indirizzo || null} largo />
            </GrigliaCampi>
          </div>

          <div>
            <h3 className="t-etichetta mb-4 border-b border-border/60 pb-2 font-medium">Recapiti</h3>
            <GrigliaCampi>
              <Campo etichetta="Telefono" valore={persona.phone} href={`tel:${persona.phone}`} />
              <Campo etichetta="Email personale" valore={persona.email} href={persona.email ? `mailto:${persona.email}` : undefined} />
            </GrigliaCampi>
          </div>

          <div>
            <h3 className="t-etichetta mb-4 border-b border-border/60 pb-2 font-medium">Contatto di emergenza</h3>
            <GrigliaCampi>
              <Campo etichetta="Nome" valore={persona.emergencyContactName} />
              <Campo
                etichetta="Numero"
                valore={persona.emergencyContactPhone}
                href={persona.emergencyContactPhone ? `tel:${persona.emergencyContactPhone}` : undefined}
              />
            </GrigliaCampi>
          </div>
        </div>
      </Sezione>
    );
  }

  return (
    <form onSubmit={salva} noValidate>
      <Sezione id="dati-personali" titolo="Dati personali" icona={UserRound} descrizione="Stai modificando l'anagrafica.">
        <div className="space-y-8">
          <GrigliaCampi>
            <CampoModulo etichetta="Nome" htmlFor="firstName" errore={errori.firstName}>
              <Input id="firstName" value={valori.firstName} onChange={imposta("firstName")} autoFocus aria-invalid={!!errori.firstName} />
            </CampoModulo>
            <CampoModulo etichetta="Cognome" htmlFor="lastName" errore={errori.lastName}>
              <Input id="lastName" value={valori.lastName} onChange={imposta("lastName")} aria-invalid={!!errori.lastName} />
            </CampoModulo>
            <CampoModulo etichetta="Codice fiscale" htmlFor="fiscalCode" errore={errori.fiscalCode}>
              <Input id="fiscalCode" value={valori.fiscalCode} onChange={imposta("fiscalCode")} className="uppercase" maxLength={32} />
            </CampoModulo>
            <CampoModulo
              etichetta="Data di nascita"
              htmlFor="birthday"
              errore={errori.birthday}
              nota={eta !== null ? `${eta} anni, calcolati dalla data.` : "L'età si calcola da sola."}
            >
              <Input id="birthday" type="date" max={oggi} value={valori.birthday} onChange={imposta("birthday")} aria-invalid={!!errori.birthday} />
            </CampoModulo>
            <CampoModulo etichetta="Luogo di nascita" htmlFor="birthPlace">
              <Input id="birthPlace" value={valori.birthPlace} onChange={imposta("birthPlace")} placeholder="Es. Bergamo" />
            </CampoModulo>
            <CampoModulo etichetta="Nazionalità" htmlFor="nationality">
              <Input id="nationality" value={valori.nationality} onChange={imposta("nationality")} placeholder="Es. Italiana" />
            </CampoModulo>
          </GrigliaCampi>

          <div>
            <h3 className="t-etichetta mb-4 border-b border-border/60 pb-2 font-medium">Residenza</h3>
            <GrigliaCampi colonne={4}>
              <CampoModulo etichetta="Indirizzo" htmlFor="address">
                <Input id="address" value={valori.address} onChange={imposta("address")} placeholder="Via, numero" />
              </CampoModulo>
              <CampoModulo etichetta="CAP" htmlFor="postalCode">
                <Input id="postalCode" value={valori.postalCode} onChange={imposta("postalCode")} inputMode="numeric" maxLength={16} />
              </CampoModulo>
              <CampoModulo etichetta="Comune" htmlFor="city">
                <Input id="city" value={valori.city} onChange={imposta("city")} />
              </CampoModulo>
              <CampoModulo etichetta="Provincia" htmlFor="province">
                <Input id="province" value={valori.province} onChange={imposta("province")} className="uppercase" maxLength={8} placeholder="Es. MI" />
              </CampoModulo>
            </GrigliaCampi>
          </div>

          <div>
            <h3 className="t-etichetta mb-4 border-b border-border/60 pb-2 font-medium">Recapiti</h3>
            <GrigliaCampi>
              <CampoModulo etichetta="Telefono" htmlFor="phone" errore={errori.phone}>
                <Input id="phone" type="tel" value={valori.phone} onChange={imposta("phone")} aria-invalid={!!errori.phone} />
              </CampoModulo>
              <CampoModulo etichetta="Email personale" htmlFor="email" errore={errori.email} nota="Facoltativa. Serve anche per creare l'accesso al gestionale.">
                <Input id="email" type="email" value={valori.email} onChange={imposta("email")} aria-invalid={!!errori.email} />
              </CampoModulo>
            </GrigliaCampi>
          </div>

          <div>
            <h3 className="t-etichetta mb-4 border-b border-border/60 pb-2 font-medium">Contatto di emergenza</h3>
            <GrigliaCampi>
              <CampoModulo etichetta="Nome" htmlFor="emergencyContactName">
                <Input id="emergencyContactName" value={valori.emergencyContactName} onChange={imposta("emergencyContactName")} placeholder="Es. Laura Bellini (moglie)" />
              </CampoModulo>
              <CampoModulo etichetta="Numero" htmlFor="emergencyContactPhone" errore={errori.emergencyContactPhone}>
                <Input id="emergencyContactPhone" type="tel" value={valori.emergencyContactPhone} onChange={imposta("emergencyContactPhone")} />
              </CampoModulo>
            </GrigliaCampi>
          </div>
        </div>

        <PiedeModifica onAnnulla={annulla} salvando={salvando} errore={erroreForm} />
      </Sezione>
    </form>
  );
}
