/**
 * Le risposte di Tilby usate dalle prove, costruite sugli **esempi e sugli
 * schemi OpenAPI** del reference ufficiale (developer.tilby.com): sessione,
 * sale con tavoli, prodotti con price1…price10, categorie, IVA, metodi di
 * pagamento, vendite, notifiche webhook («Models and examples»). Nessuna è
 * una risposta vera.
 */
export const TILBY = {
  sessione: {
    id: 12,
    username: "integrazione",
    client_id: "foodtech_client",
    shop: { id: 345, name: "Trattoria Tilby", uuid: "0f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f" },
  },
  /* Forma paginata, come l'esempio di GET /rooms. */
  rooms: {
    page: 0,
    pages: 1,
    per_page: 100,
    results: [
      {
        id: 1,
        name: "Sala1",
        floor: "parquet_light",
        height: 10,
        width: 10,
        tables: [
          { id: 1, name: "B2", covers: 4, room_id: 1, order_type: "single", shape: "rect1x1" },
          { id: 2, name: "12", covers: 2, room_id: 1, order_type: "single", shape: "rect1x1" },
        ],
      },
    ],
  },
  /* Forma ad array semplice, come l'esempio di GET /categories. */
  categories: [
    { id: 1, name: "Pizze", display: true, index: 1 },
    { id: 2, name: "Dolci", display: true, index: 2 },
  ],
  items: [
    { id: 334, name: "Antipasto della casa", price1: 9, price2: 11, category_id: 1, department_id: 10, vat_perc: 10, department: { id: 10, name: "Cucina" }, on_sale: true, sku: "ANT-1" },
    { id: 335, name: "Tiramisù", price1: 6, category_id: 2, department_id: 10, vat_perc: 10, on_sale: true },
    { id: 336, name: "Caffè", price1: 1.5, category_id: 2, department_id: 4, vat_perc: 22, on_sale: true },
  ],
  vat: [{ code: "N1", id: 4, value: 22 }, { code: "N2", id: 3, value: 10 }],
  payment_methods: [
    { id: 1, name: "Contanti", payment_method_type_id: 1, enable_sum: true, hidden: false, unclaimed: false },
    { id: 2, name: "Carta", payment_method_type_id: 3, enable_sum: true, hidden: false, unclaimed: false },
  ],
  customers: [{ id: 7, first_name: "Mario", last_name: "Rossi", email: "mario@example.com", uuid: "c1" }],
  /** Una vendita come quella restituita da POST /sales (201) e GET /sales/{id}. */
  vendita: (over: Record<string, unknown> = {}) => ({
    id: 29,
    uuid: "235f2cd2-4cf1-4550-acab-b6248ad99dfc",
    external_id: "ft-comanda-1",
    name: "Tavolo B2",
    status: "open",
    currency: "EUR",
    table_id: 1,
    table_name: "B2",
    room_id: 1,
    room_name: "Sala1",
    final_amount: 18,
    sale_items: [
      { uuid: "u-1", item_id: 334, name: "Antipasto della casa", price: 9, final_price: 9, final_net_price: 8.18, quantity: 2, vat_perc: 10, department_id: 10, exit: 1, seller_id: 0, seller_name: "Foodtech", type: "sale" },
    ],
    payments: [],
    sale_documents: [],
    ...over,
  }),
  /** L'evento CREATED di «Models and examples». */
  notifica: (over: Record<string, unknown> = {}) => ({
    type: "CLOSED",
    entity_name: "sales",
    time: "2022-03-24T10:25:03.499Z",
    notification_uuid: "625bd8dc-f13c-4d43-9ca7-39c9a26c8f9c",
    environment_id: "s3_e2e_restaurant",
    client_id: "SclobyElectron3",
    from_user: "mario.rossi@gmail.com",
    entities: [{ id: 29, uuid: "235f2cd2-4cf1-4550-acab-b6248ad99dfc", external_id: "ft-comanda-1", status: "closed" }],
    nRetry: 0,
    ...over,
  }),
};
