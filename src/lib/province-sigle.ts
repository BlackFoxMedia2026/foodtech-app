/**
 * Dal nome della provincia come lo scrive OpenStreetMap («Alessandria»,
 * «Città metropolitana di Torino», «Monza e della Brianza») alla sigla.
 * I nomi si confrontano senza accenti, maiuscole, spazi e punteggiatura.
 */

const SIGLE: Record<string, string> = {
  agrigento: "AG", alessandria: "AL", ancona: "AN", aosta: "AO", valledaosta: "AO", arezzo: "AR",
  ascolipiceno: "AP", asti: "AT", avellino: "AV", bari: "BA", barlettaandriatrani: "BT", belluno: "BL",
  benevento: "BN", bergamo: "BG", biella: "BI", bologna: "BO", bolzano: "BZ", bozen: "BZ", bolzanobozen: "BZ",
  altoadige: "BZ", sudtirol: "BZ", brescia: "BS", brindisi: "BR", cagliari: "CA", caltanissetta: "CL",
  campobasso: "CB", caserta: "CE", catania: "CT", catanzaro: "CZ", chieti: "CH", como: "CO", cosenza: "CS",
  cremona: "CR", crotone: "KR", cuneo: "CN", enna: "EN", fermo: "FM", ferrara: "FE", firenze: "FI",
  foggia: "FG", forlicesena: "FC", frosinone: "FR", genova: "GE", gorizia: "GO", grosseto: "GR",
  imperia: "IM", isernia: "IS", laquila: "AQ", laspezia: "SP", latina: "LT", lecce: "LE", lecco: "LC",
  livorno: "LI", lodi: "LO", lucca: "LU", macerata: "MC", mantova: "MN", massacarrara: "MS", matera: "MT",
  messina: "ME", milano: "MI", modena: "MO", monzaedellabrianza: "MB", monzabrianza: "MB", napoli: "NA",
  novara: "NO", nuoro: "NU", oristano: "OR", padova: "PD", palermo: "PA", parma: "PR", pavia: "PV",
  perugia: "PG", pesaroeurbino: "PU", pescara: "PE", piacenza: "PC", pisa: "PI", pistoia: "PT",
  pordenone: "PN", potenza: "PZ", prato: "PO", ragusa: "RG", ravenna: "RA", reggiocalabria: "RC",
  reggiodicalabria: "RC", reggioemilia: "RE", reggionellemilia: "RE", rieti: "RI", rimini: "RN", roma: "RM",
  rovigo: "RO", salerno: "SA", sassari: "SS", savona: "SV", siena: "SI", siracusa: "SR", sondrio: "SO",
  sudsardegna: "SU", taranto: "TA", teramo: "TE", terni: "TR", torino: "TO", trapani: "TP", trento: "TN",
  trentino: "TN", treviso: "TV", trieste: "TS", udine: "UD", varese: "VA", venezia: "VE",
  verbanocusioossola: "VB", vercelli: "VC", verona: "VR", vibovalentia: "VV", vicenza: "VI", viterbo: "VT",
};

const PREFISSI = /^(provinciaautonomadi|provinciadi|provincia|cittametropolitanadi|liberoconsorziocomunaledi|entedidecentramentoregionaledi)/;

function chiave(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(PREFISSI, "");
}

export function siglaProvincia(nome: string | undefined): string {
  if (!nome) return "";
  const k = chiave(nome);
  if (SIGLE[k]) return SIGLE[k];
  // Nomi doppi («Valle d'Aosta / Vallée d'Aoste», «Bolzano - Bozen»): basta l'inizio.
  const trovata = Object.keys(SIGLE).find((s) => s.length >= 4 && k.startsWith(s));
  return trovata ? SIGLE[trovata] : "";
}
