/**
 * Le risposte di Cassa in Cloud usate dalle prove, costruite **solo** con i
 * nomi di campo dei modelli di https://api-doc.cassanova.com/ (SalesPoint,
 * Room, Table, Category, Product, Price, Department, Tax, SalesMode, Order,
 * Receipt, Payment, BatchCreateResponse). Nessuna è una risposta vera.
 */
export const FIXTURE = {
  token: { access_token: "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiI5MiJ9.firma-di-prova", expires_in: 3600, token_type: "Bearer" },
  salespoint: {
    salesPoint: [
      { id: 101, name: "Torino Centro", city: "Torino", country: "IT", vatNumber: "01234567890" },
      { id: 102, name: "Milano Navigli", city: "Milano", country: "IT" },
    ],
    totalCount: 2,
  },
  rooms: { rooms: [{ id: "room-1", name: "Sala interna", idSalesPoint: 101 }], totalCount: 1 },
  tables: {
    tables: [
      { id: "tab-12", name: "12", idSalesPoint: 101, seatsAvailable: 4, externalId: null, idRoom: "room-1" },
      { id: "tab-99", name: "99", idSalesPoint: 101, seatsAvailable: 2, idRoom: "room-1" },
    ],
    totalCount: 2,
  },
  categories: { categories: [{ id: "cat-1", description: "Pizze", enableForRisto: true }], totalCount: 1 },
  products: {
    products: [
      {
        id: "prod-1",
        description: "Margherita",
        idCategory: "cat-1",
        idDepartment: "dep-1",
        department: { id: "dep-1", description: "Cucina", idTax: "tax-10", tax: { id: "tax-10", description: "IVA 10%", rate: 10 } },
        multivariant: false,
        enableForRisto: true,
        prices: [{ value: 8.5 }, { idSalesMode: "sm-asporto", value: 7.5 }],
      },
      {
        id: "prod-2",
        description: "Birra",
        idCategory: "cat-1",
        multivariant: true,
        variants: [{ id: "var-media", description: "Media 0,4" }],
        prices: [{ value: 5 }],
      },
    ],
    totalCount: 2,
  },
  salesModes: { salesModes: [{ id: "sm-asporto", description: "Asporto" }], totalCount: 1 },
  taxes: { taxes: [{ id: "tax-10", description: "IVA 10%", rate: 10 }], totalCount: 1 },
  batchCreato: (externalId: string, id = "ord-cic-1") => ({ batchResponse: { createDetails: [{ index: 0, id, externalId }] } }),
  ordine: (externalId: string, id = "ord-cic-1") => ({
    id,
    externalId,
    status: "NOT_PROCESSED",
    externalWorkflowStatus: "ACCEPTED",
    idTable: "tab-12",
    document: { idSalesPoint: 101, amount: 10, rows: [{ idProductVariant: "var-media", quantity: 2, price: 5 }] },
  }),
  receipts: {
    receipts: [
      {
        id: "rec-1",
        number: 42,
        document: {
          idSalesPoint: 101,
          amount: 10,
          payments: [{ paymentType: "CREDITCARD", amount: 10 }],
          documentConnectionSources: { orders: [{ id: "ord-cic-1", externalId: "ft-comanda-1" }] },
        },
      },
    ],
    totalCount: 1,
  },
};
