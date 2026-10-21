/**
 * Accende il tema Carta sulla pagina che lo contiene.
 *
 * È un segnaposto e non un attributo sul contenitore perché il tema vive su
 * `:root` (`:root:has([data-tema="carta"])` in `globals.css`): dialog, menu e
 * tooltip si montano dentro `<body>`, fuori da qualunque contenitore, e
 * devono cambiare colore anche loro. Dove sta il segnaposto non conta; conta
 * che ci sia.
 *
 * Lo portano il gestionale, l'amministrazione, l'accesso e la landing. La
 * Staff App e le pagine degli ospiti no: restano al buio.
 */
export function TemaCarta() {
  return <span data-tema="carta" hidden aria-hidden="true" />;
}
