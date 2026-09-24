/**
 * %Wallet.Secret names are "Collection.Secret" (the class reference documents the form). The
 * list of a collection answers full names; screens show the part after the collection.
 */
export function shortSecretName(name: string | undefined, collection: string): string {
  const n = name ?? '';
  return n.toLowerCase().startsWith(`${collection.toLowerCase()}.`) ? n.slice(collection.length + 1) : n;
}

/** The name to send: "Collection.Secret", whether the user typed the short or the full form. */
export function fullSecretName(collection: string, secret: string): string {
  const s = secret.trim();
  return s.toLowerCase().startsWith(`${collection.toLowerCase()}.`) ? s : `${collection}.${s}`;
}
