/** Stable, unique referral code per wallet — shared by client and server. */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const REFERRAL_PREFIX = "ITDB";
export const REFERRAL_RE = /^ITDB-[A-Z0-9]{4,8}$/i;

export function referralCodeFor(address: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < address.length; i++) {
    h1 = Math.imul(h1 ^ address.charCodeAt(i), 0x1000193);
    h2 = Math.imul(h2 + address.charCodeAt(i), 0x85ebca6b);
  }
  let code = "";
  let n = Math.abs(h1 ^ (h2 >>> 3));
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[n % CODE_ALPHABET.length];
    n = Math.floor(n / CODE_ALPHABET.length) + Math.abs(h2 >> (i * 4));
  }
  return `${REFERRAL_PREFIX}-${code}`;
}
