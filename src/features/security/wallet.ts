import { api, result } from '@/api/hooks';
import type { Schemas } from '@/api/types';

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

/** The kinds of secret a collection can hold, as the create form offers them. */
export type SecretType = NonNullable<Schemas['WalletSecret']['Type']>;

export const SECRET_TYPES: { value: SecretType; label: string }[] = [
  { value: '%Wallet.KeyValue', label: 'Key/value (%Wallet.KeyValue): credentials, API keys' },
  { value: '%Wallet.SymmetricKey', label: 'Symmetric key (%Wallet.SymmetricKey)' },
  { value: '%Wallet.RSA', label: 'RSA key pair (%Wallet.RSA)' },
];
export const USAGES = ['HTTP', 'SOAP', 'SQL'];

export const readCollection = (name: string) =>
  result(api().GET('/v2/wallet/collection', { params: { query: { name } } }));

export function collectionRules(v: string): string | null {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(v) ? null : 'Letters, digits, _ and - ; starts with a letter';
}
export function resourceRules(v: string): string | null {
  return /^%?[A-Za-z0-9_%]+(:[A-Za-z]+)?$/.test(v.trim())
    ? null
    : 'A resource, optionally with :USE, :READ or :WRITE';
}
