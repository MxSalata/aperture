/**
 * One browser tab per JWT session. Duplicating a tab copies its sessionStorage, and with it the
 * refresh token; IRIS rotates refresh tokens and, when one that was already used is presented
 * again, revokes every token of the session. Two tabs sharing a session therefore sign each other
 * out within a minute (the access token lives 60 s on IRIS 2026.2).
 *
 * The tab that signed in holds a Web Lock named after its session for as long as its page lives;
 * a copy finds the lock taken and gives up its copy of the tokens (locally: a remote logout would
 * end the original tab's session too). A reload keeps the session, because the old page's lock is
 * released when it unloads. Where Web Locks do not exist (old browsers, tests), every tab is an owner.
 */
type Claim = 'owner' | 'taken' | 'unsupported';

interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}

let held: { key: string; release: () => void } | null = null;
/** A claim in progress: a second claim for the same key while it runs must not compete with it. */
let pending: { key: string; claim: Promise<Claim> } | null = null;

/**
 * How long a lock that is not available is asked for again before this page counts as a copy. A
 * reload or navigation can start the new page before the old one has released its lock; a copied
 * tab's original holds it for as long as it lives.
 */
const GRACE_MS = [150, 300, 500, 700];

function locks(): LockManagerLike | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { locks?: LockManagerLike }).locks;
}

function tryLock(manager: LockManagerLike, key: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    void manager.request(`aperture.session.${key}`, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return;
      }
      // Held until released: the promise the callback returns is the lock's lifetime.
      return new Promise<void>((release) => {
        held = { key, release };
        resolve(true);
      });
    });
  });
}

/** Claim the session `key` for this page: 'taken' means another live tab holds it. */
export function claimSession(key: string): Promise<Claim> {
  if (held?.key === key) return Promise.resolve('owner');
  if (pending?.key === key) return pending.claim;
  const manager = locks();
  if (!manager) return Promise.resolve('unsupported');
  releaseSession();
  const claim = (async (): Promise<Claim> => {
    if (await tryLock(manager, key)) return 'owner';
    for (const wait of GRACE_MS) {
      await new Promise((r) => setTimeout(r, wait));
      if (await tryLock(manager, key)) return 'owner';
    }
    return 'taken';
  })();
  pending = { key, claim };
  void claim.finally(() => {
    if (pending?.claim === claim) pending = null;
  });
  return claim;
}

/** Give up this page's claim (sign-out, or before claiming a new session). */
export function releaseSession(): void {
  held?.release();
  held = null;
}

export function newSessionKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Why a copied tab was signed out; shown on the sign-in page. */
export const DUPLICATE_TAB_REASON =
  'This tab is a copy of another tab that is signed in. Sign in again here: two tabs sharing one session would sign each other out.';
