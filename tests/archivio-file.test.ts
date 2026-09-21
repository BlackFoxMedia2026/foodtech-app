import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as a from "@/server/archivio-file";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * L'archivio su disco è il ripiego che fa funzionare il caricamento della
 * piantina quando manca `BLOB_READ_WRITE_TOKEN`. Le cose che valgono la pena
 * di fissare sono tre: che il ramo si accenda quando deve, che un nome di file
 * ostile non esca dalla cartella, e che quello che si scrive si rilegga.
 */

const CWD = process.cwd();
let cartella: string;

beforeEach(async () => {
  // `realpath` perché su macOS /tmp è un collegamento a /private/tmp, e
  // `process.cwd()` restituisce sempre la strada vera.
  cartella = await realpath(await mkdtemp(join(tmpdir(), "archivio-")));
  process.chdir(cartella);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.ARCHIVIO_LOCALE;
});

afterEach(async () => {
  process.chdir(CWD);
  await rm(cartella, { recursive: true, force: true });
});

describe("quale archivio si usa", () => {
  it("senza token e fuori produzione ripiega sul disco", async () => {
    expect(a.archivioLocaleAttivo()).toBe(true);
    expect(a.archivioDisponibile()).toBe(true);
  });

  it("con un token vale il remoto, e il disco resta spento", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_finto";
    expect(a.archivioRemotoConfigurato()).toBe(true);
    expect(a.archivioLocaleAttivo()).toBe(false);
  });

  it("uno spazio non è un token", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "   ";
    expect(a.archivioRemotoConfigurato()).toBe(false);
  });
});

describe("percorsi", () => {
  it("l'estensione presa dal nome del file non porta fuori dalla cartella", async () => {
    expect(a.percorsoSicuro("floor-plans/v1/r1/uuid.png/../../.env")).toBe(
      "floor-plans/v1/r1/uuid.png/.env",
    );
    expect(a.fileLocale(`${a.PREFISSO_LOCALE}../../../.env`)).toBe(
      join(cartella, ".archivio-locale/.env"),
    );
  });

  it("un indirizzo remoto non è un file locale", async () => {
    expect(a.fileLocale("https://esempio.public.blob.vercel-storage.com/x.png")).toBeNull();
  });
});

describe("salva, rileggi, elimina", () => {
  it("il file scritto si rilegge dallo stesso indirizzo", async () => {
    const { url } = await a.salvaFile(
      "floor-plans/venue/sala/abc.png",
      new Blob([new Uint8Array([1, 2, 3])]),
    );

    expect(url).toBe("/api/archivio-locale/floor-plans/venue/sala/abc.png");
    expect(new Uint8Array(await readFile(join(cartella, ".archivio-locale", "floor-plans/venue/sala/abc.png")))).toEqual(
      new Uint8Array([1, 2, 3]),
    );

    const riletto = await a.leggiFile(url);
    expect(riletto && new Uint8Array(riletto)).toEqual(new Uint8Array([1, 2, 3]));

    await a.eliminaFile(url);
    expect(await a.leggiFile(url)).toBeNull();
  });

  it("eliminare un file che non c'è non è un errore", async () => {
    await expect(a.eliminaFile("/api/archivio-locale/mai/esistito.png")).resolves.toBeUndefined();
  });

  it("in produzione senza token non si salva niente di nascosto", async () => {
    // `NODE_ENV` è dichiarato in sola lettura dai tipi di Node: qui va scritto
    // davvero, perché è proprio la variabile che decide il ramo.
    const ambiente = process.env as Record<string, string | undefined>;
    ambiente.NODE_ENV = "production";
    expect(a.archivioDisponibile()).toBe(false);
    await expect(a.salvaFile("x/y.png", new Blob(["a"]))).rejects.toThrow("archivio_non_configurato");
    ambiente.NODE_ENV = "test";
  });
});
