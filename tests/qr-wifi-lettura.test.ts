import { describe, expect, it } from "vitest";
import { leggiStringaWifi, stringaWifi, type PayloadWifi } from "../src/lib/qr-contenuto";

describe("leggiStringaWifi", () => {
  it("legge il QR come lo stampa un router", () => {
    expect(leggiStringaWifi("WIFI:T:WPA;S:Aurora-Ospiti;P:pane e vino;;")).toEqual({
      ssid: "Aurora-Ospiti",
      password: "pane e vino",
      sicurezza: "WPA",
      nascosta: false,
    });
  });

  it("accetta i campi in qualunque ordine, come «Condividi rete» di Android", () => {
    expect(leggiStringaWifi("WIFI:S:Casa;T:SAE;P:segreto;H:true;;")).toEqual({
      ssid: "Casa",
      password: "segreto",
      sicurezza: "WPA3",
      nascosta: true,
    });
  });

  it("toglie le protezioni dei caratteri speciali", () => {
    expect(leggiStringaWifi("WIFI:T:WPA;S:Bar\\;Sport;P:a\\:b\\\\c\\,d;;")?.password).toBe("a:b\\c,d");
    expect(leggiStringaWifi("WIFI:T:WPA;S:Bar\\;Sport;P:x;;")?.ssid).toBe("Bar;Sport");
  });

  it("riconosce una rete aperta", () => {
    expect(leggiStringaWifi("WIFI:T:nopass;S:Libera;;")).toMatchObject({ ssid: "Libera", password: "", sicurezza: "NONE" });
    expect(leggiStringaWifi("WIFI:S:Libera;;")).toMatchObject({ sicurezza: "NONE" });
  });

  it("rifiuta ciò che non è una rete", () => {
    expect(leggiStringaWifi("https://example.com")).toBeNull();
    expect(leggiStringaWifi("WIFI:T:WPA;P:senza-nome;;")).toBeNull();
  });

  it("rilegge quello che scrive", () => {
    const w: PayloadWifi = { ssid: 'Sala "1"; dietro', password: "p;a:s,s\\", sicurezza: "WPA", nascosta: true };
    expect(leggiStringaWifi(stringaWifi(w))).toEqual(w);
  });
});
