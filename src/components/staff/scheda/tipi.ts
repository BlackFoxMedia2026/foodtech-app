import type {
  StaffCapability,
  StaffContractType,
  StaffDepartment,
  StaffDocumentCategory,
  StaffMedicalFitness,
  StaffPermission,
  StaffPrimaryRole,
  StaffRole,
  StaffTrainingKind,
  WaiterStatus,
} from "@prisma/client";
import type { WaiterScheda } from "@/server/waiters";

/**
 * Le forme che attraversano la scheda: quello che il server legge, reso
 * serializzabile (le date sono stringhe ISO) per i componenti client.
 *
 * Un tipo solo per la persona e uno per ogni elenco, così ogni tab riceve la
 * stessa persona e non una sua versione ridotta diversa dalle altre.
 */

export type PersonaDTO = {
  id: string;
  firstName: string;
  lastName: string;
  birthday: string;
  phone: string;
  email: string | null;
  role: string;
  primaryRole: StaffPrimaryRole | null;
  department: StaffDepartment | null;
  capabilities: StaffCapability[];
  status: WaiterStatus;
  hireDate: string | null;
  photoUrl: string | null;
  fiscalCode: string | null;
  birthPlace: string | null;
  nationality: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  skills: string[];
  managerId: string | null;
  manager: { id: string; nome: string; primaryRole: StaffPrimaryRole | null } | null;
  createdAt: string;
  account: AccountDTO | null;
};

export type AccountDTO = {
  userId: string;
  email: string;
  name: string | null;
  lastLoginAt: string | null;
  /** Vero quando c'è un link di reset ancora valido. */
  resetAperto: boolean;
  /** L'appartenenza a **questo** locale. Nulla se l'account esiste ma non ha
   * (più) accesso qui. */
  membership: {
    id: string;
    role: StaffRole;
    permissions: StaffPermission[];
    customPermissions: boolean;
    disabledAt: string | null;
  } | null;
};

export type DocumentoContrattoDTO = {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
};

export type ContrattoDTO = {
  id: string;
  contractType: StaffContractType;
  startDate: string;
  endDate: string | null;
  weeklyHours: number | null;
  contractualRole: string | null;
  level: string | null;
  workingDays: number[];
  probationEndDate: string | null;
  notes: string | null;
  document: DocumentoContrattoDTO | null;
};

export type AllegatoDTO = { id: string; name: string; originalFileName: string; mimeType: string } | null;

export type CorsoDTO = {
  id: string;
  kind: StaffTrainingKind;
  name: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  provider: string | null;
  certificateNumber: string | null;
  notes: string | null;
  certificate: AllegatoDTO;
};

export type VisitaDTO = {
  id: string;
  examinedAt: string;
  fitness: StaffMedicalFitness;
  expiresAt: string | null;
  doctorName: string | null;
  notes: string | null;
  certificate: AllegatoDTO;
};

export type DocumentoDTO = {
  id: string;
  category: StaffDocumentCategory;
  name: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type NotaDTO = {
  id: string;
  body: string;
  authorLabel: string;
  createdAt: string;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function aPersonaDTO(w: WaiterScheda): PersonaDTO {
  const membership = w.user?.venueMemberships[0] ?? null;
  return {
    id: w.id,
    firstName: w.firstName,
    lastName: w.lastName,
    birthday: w.birthday.toISOString(),
    phone: w.phone,
    email: w.email,
    role: w.role,
    primaryRole: w.primaryRole,
    department: w.department,
    capabilities: w.capabilities,
    status: w.status,
    hireDate: iso(w.hireDate),
    photoUrl: w.photoUrl,
    fiscalCode: w.fiscalCode,
    birthPlace: w.birthPlace,
    nationality: w.nationality,
    address: w.address,
    postalCode: w.postalCode,
    city: w.city,
    province: w.province,
    emergencyContactName: w.emergencyContactName,
    emergencyContactPhone: w.emergencyContactPhone,
    skills: w.skills,
    managerId: w.managerId,
    manager: w.manager ? { id: w.manager.id, nome: `${w.manager.firstName} ${w.manager.lastName}`, primaryRole: w.manager.primaryRole } : null,
    createdAt: w.createdAt.toISOString(),
    account: w.user
      ? {
          userId: w.user.id,
          email: w.user.email,
          name: w.user.name,
          lastLoginAt: iso(w.user.lastLoginAt),
          resetAperto: !!w.user.passwordResetExpiresAt && w.user.passwordResetExpiresAt.getTime() > Date.now(),
          membership: membership
            ? {
                id: membership.id,
                role: membership.role,
                permissions: membership.permissions,
                customPermissions: membership.customPermissions,
                disabledAt: iso(membership.disabledAt),
              }
            : null,
        }
      : null,
  };
}

export function aContrattiDTO(w: WaiterScheda): ContrattoDTO[] {
  return w.contracts.map((c) => ({
    id: c.id,
    contractType: c.contractType,
    startDate: c.startDate.toISOString(),
    endDate: iso(c.endDate),
    weeklyHours: c.weeklyHours,
    contractualRole: c.contractualRole,
    level: c.level,
    workingDays: c.workingDays,
    probationEndDate: iso(c.probationEndDate),
    notes: c.notes,
    document: c.document ? { ...c.document, createdAt: c.document.createdAt.toISOString() } : null,
  }));
}

export function aCorsiDTO(w: WaiterScheda): CorsoDTO[] {
  return w.trainings.map((t) => ({
    id: t.id,
    kind: t.kind,
    name: t.name,
    completedAt: iso(t.completedAt),
    expiresAt: iso(t.expiresAt),
    provider: t.provider,
    certificateNumber: t.certificateNumber,
    notes: t.notes,
    certificate: t.certificate,
  }));
}

export function aVisiteDTO(w: WaiterScheda): VisitaDTO[] {
  return w.medicalChecks.map((m) => ({
    id: m.id,
    examinedAt: m.examinedAt.toISOString(),
    fitness: m.fitness,
    expiresAt: iso(m.expiresAt),
    doctorName: m.doctorName,
    notes: m.notes,
    certificate: m.certificate,
  }));
}

export function aDocumentiDTO(w: WaiterScheda): DocumentoDTO[] {
  return w.documents.map((d) => ({
    id: d.id,
    category: d.category,
    name: d.name,
    originalFileName: d.originalFileName,
    mimeType: d.mimeType,
    fileSize: d.fileSize,
    expiresAt: iso(d.expiresAt),
    notes: d.notes,
    createdAt: d.createdAt.toISOString(),
  }));
}

export function nomeCompleto(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}
