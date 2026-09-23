/**
 * Le risposte di Oracle Simphony STS Gen2 usate dalle prove, costruite sullo
 * `swagger.json` ufficiale (2026.08.15): nomi e tipi dei campi dagli schemi,
 * valori dagli esempi dei campi (`tfoinc`, `fdmnh144`, il `checkRef`
 * `929aacee…`, gli `orderTypes` «Eat In»/«Take Out», le righe di
 * `printedLines`) e, per le notifiche, gli esempi integrali della pagina
 * «Webhook REST Endpoints». Lo swagger non contiene esempi di risposta
 * completi: nessuna di queste è una risposta vera.
 */

export const HOST_STS = "https://tfoinc-stsg2.oracleindustry.com";
export const HOST_AUTH = "https://tfoinc-idm.oracleindustry.com";

export const ORACLE = {
  token: (n = 1) => ({
    access_token: "non-usato",
    token_type: "Bearer",
    expires_in: "1209600",
    id_token: `id-token-${n}`,
    refresh_token: `refresh-${n}`,
  }),
  organizations: { limit: 0, offset: 0, count: 1, organization: [{ orgShortName: "tfoinc", name: "TFO Inc" }] },
  locations: {
    count: 2,
    location: [
      { orgShortName: "tfoinc", locRef: "fdmnh144", name: "Ristorante Torino", currency: "EUR", posPlatform: { name: "Simphony", version: "2" } },
      { orgShortName: "tfoinc", locRef: "milano01", name: "Ristorante Milano", currency: "EUR", posPlatform: { name: "Simphony", version: "2" } },
    ],
  },
  rvc: (locRef = "fdmnh144", rvcRef = 42, nome = "Sala") => ({
    orgShortName: "tfoinc",
    locRef,
    rvcRef,
    name: nome,
    orderTypes: [
      { orderTypeRef: 1, name: "Eat In", serviceLevelTime: 0, suggestedTips: [] },
      { orderTypeRef: 2, name: "Take Out", serviceLevelTime: 0, suggestedTips: [] },
    ],
    orderChannels: [{ orderChannelId: 1, name: { "en-US": "Default" }, isDefault: true, serviceLevelTime: 0 }],
    tables: ["B2", "B3", "B4"],
  }),
  rvcs: (locRef: string) => ({ count: 1, revenueCenter: [ORACLE.rvc(locRef, locRef === "fdmnh144" ? 42 : 7, locRef === "fdmnh144" ? "Sala" : "Bar")] }),
  menuSummary: { items: [{ orgShortName: "tfoinc", locRef: "fdmnh144", rvcRef: 42, menuId: "tfoinc:fdmnh144:42", name: "Cena" }] },
  menu: {
    orgShortName: "tfoinc",
    locRef: "fdmnh144",
    rvcRef: 42,
    menuId: "tfoinc:fdmnh144:42",
    name: "Cena",
    familyGroups: [
      { familyGroupItemId: 10, name: { "en-US": "Starters", "it-IT": "Antipasti" } },
      { familyGroupItemId: 20, name: { "en-US": "Desserts", "it-IT": "Dolci" } },
    ],
    menuItems: [
      {
        menuItemId: 101,
        name: { "en-US": "House starter", "it-IT": "Antipasto della casa" },
        familyGroupRef: 10,
        definitions: [{ definitionSequence: 1, name: { "it-IT": "Antipasto della casa" }, name2: {}, taxClassRef: 1, prices: [{ priceSequence: 1, price: 9.5, level: 0 }] }],
      },
      {
        menuItemId: 102,
        name: { "it-IT": "Primo del giorno" },
        familyGroupRef: 10,
        definitions: [{ definitionSequence: 1, name: {}, name2: {}, prices: [{ priceSequence: 1, price: 12, level: 0 }] }],
      },
      {
        menuItemId: 201,
        name: { "it-IT": "Tiramisù" },
        familyGroupRef: 20,
        definitions: [{ definitionSequence: 1, name: {}, name2: {}, prices: [{ priceSequence: 1, price: 6, level: 0 }] }],
      },
      {
        menuItemId: 202,
        name: { "it-IT": "Caffè" },
        familyGroupRef: 20,
        definitions: [{ definitionSequence: 1, name: {}, name2: {}, prices: [{ priceSequence: 1, price: 1.5, level: 0 }] }],
      },
      {
        menuItemId: 301,
        name: { "it-IT": "Bistecca" },
        familyGroupRef: 10,
        definitions: [
          {
            definitionSequence: 1,
            name: { "it-IT": "Bistecca" },
            name2: {},
            prices: [{ priceSequence: 1, price: 25, level: 0 }],
            condimentGroupRules: [{ condimentGroupRef: 900, minimumCount: 1, maximumCount: 1 }],
          },
        ],
      },
    ],
    condimentItems: [
      { condimentId: 901, name: { "it-IT": "Al sangue" }, familyGroupRef: 10, definitions: [{ definitionSequence: 1, name: {}, name2: {}, prices: [] }] },
    ],
    condimentGroups: [{ condimentGroupId: 900, name: { "it-IT": "Cottura" }, condimentItemRefs: [901] }],
  },
  nonDisponibili: { orgShortName: "tfoinc", locRef: "fdmnh144", rvcRef: 42, items: [{ menuItemId: 102, definitions: [{ definitionSequence: 1 }] }] },
  taxes: {
    taxClasses: [{ taxClassId: 1, activeTaxRateRefs: [1] }],
    taxRates: [
      { taxRateId: 1, percentage: 10, taxType: "includedPercent", name: { "it-IT": "IVA 10%" } },
      { taxRateId: 2, percentage: 22, taxType: "includedPercent", name: { "it-IT": "IVA 22%" } },
      { taxRateId: 3, percentage: 0, taxType: "disabled", name: { "it-IT": "Spenta" } },
    ],
  },
  tenders: {
    items: [
      { tenderId: 1, name: "Contanti", type: "payment" },
      { tenderId: 2, name: "Carta", type: "payment" },
      { tenderId: 9, name: "Servizio", type: "serviceTotal" },
    ],
  },
  discounts: { items: [{ discountId: 5, type: "percentage", value: 0.1, name: { "it-IT": "Sconto 10%" } }, { discountId: 6, type: "amount", name: { "it-IT": "Sconto aperto" } }] },
  serviceCharges: { items: [{ serviceChargeId: 3, type: "percentage", value: 0.1, name: { "it-IT": "Servizio 10%" } }] },
  employee: { employeeNumber: 900 },
  /** Un check come lo descrive `CheckResponse`. */
  check: (over: { header?: Record<string, unknown>; menuItems?: unknown[]; tenders?: unknown[]; totals?: Record<string, unknown>; extensions?: unknown[] } = {}) => ({
    header: {
      orgShortName: "tfoinc",
      locRef: "fdmnh144",
      rvcRef: 42,
      checkRef: "929aacee2c6d42c78ae877e824c28eed00000431",
      checkNumber: 75,
      checkEmployeeRef: 900,
      orderTypeRef: 1,
      tableName: "B2",
      guestCount: 2,
      status: "open",
      preparationStatus: "Submitted",
      idempotencyId: "0".repeat(32),
      ...over.header,
    },
    menuItems: over.menuItems ?? [
      { menuItemId: 101, definitionSequence: 1, name: "Antipasto della casa", quantity: 2, total: 19 },
      { menuItemId: 102, definitionSequence: 1, name: "Primo del giorno", quantity: 2, total: 24 },
    ],
    tenders: over.tenders ?? [],
    extensions: over.extensions ?? [],
    totals: { subtotal: 43, subtotalDiscountTotal: 0, autoServiceChargeTotal: 0, serviceChargeTotal: 0, taxTotal: 0, paymentTotal: 0, totalDue: 43, ...over.totals },
  }),
  /** Dall'esempio di `printedLines` dello swagger. */
  printed: {
    items: [
      "12 STS                            Page 2",
      "----------------------------------------",
      "CHK 75                          TBL 2/1",
      "  2 Antipasto della casa          19.00",
      "  Subtotal                        43.00",
      "  Payment                         43.00",
      "  Change Due                       0.00",
      "------------ Check Closed -------------",
    ],
  },
  /** Gli esempi integrali della pagina «Webhook REST Endpoints». */
  notifica: {
    check: {
      messages: [
        {
          id: "8253c2a5-5b3c-497d-a87f-f8bb2e250ba7",
          creationDate: "2021-08-13T15:40:43.511Z",
          messageType: { id: "CheckNotification" },
          resource: { orgShortName: "tfoinc", locRef: "fdmnh144", rvcRef: "42", checkRef: "929aacee2c6d42c78ae877e824c28eed00000431" },
          data: { status: "Submitted", timeStampUtc: "2021-08-13T15:40:44.501Z" },
        },
      ],
    },
    configurazione: {
      messages: [
        {
          id: "e640d141-642e-4cba-9f94-bf4fe395c7b7",
          creationDate: "2025-05-30T13:54:41.7491187Z",
          messageType: { id: "ConfigurationNotification" },
          resource: { orgShortName: "tfoinc", locRef: "fdmnh144", rvcRef: "26" },
          data: { ResourceVersion: "V2", ResourceType: "Menus", ResourceAction: "changed" },
        },
      ],
    },
    organizzazione: {
      messages: [
        {
          id: "8d001964-56b8-46ae-b607-a742f12deff4",
          creationDate: "2025-11-14T10:39:09.2625517Z",
          messageType: { id: "OrganizationsNotification" },
          resource: { orgShortName: "tfoinc", locRef: "fdmnh144", rvcRef: "2" },
          data: { ResourceAction: "changed" },
        },
      ],
    },
    dipendenti: {
      messages: [
        {
          id: "701f995a-14fc-4d9f-889f-a72395d9f1a9",
          creationDate: "2025-11-14T12:39:21.3898405Z",
          messageType: { id: "EmployeesNotification" },
          resource: { orgShortName: "tfoinc", locRef: "fdmnh144" },
          data: { ResourceAction: "changed" },
        },
      ],
    },
  },
};
