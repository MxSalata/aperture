/**
 * The credentials `/api/aperture` refused in a session signed in with an escalation role
 * (`api/logs.ts`): not sent there again until the password changes or the session ends.
 */
let refused: string | null = null;

export const logsRefusal = {
  get: () => refused,
  set: (basic: string) => {
    refused = basic;
  },
  forget: () => {
    refused = null;
  },
};
