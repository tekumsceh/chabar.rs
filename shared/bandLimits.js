/**
 * Band ownership limits and invite preferences (account-level).
 */

export const DEFAULT_GROUP_OWNER_LIMIT = 5;
export const MAX_BAND_CREATES_PER_DAY = 3;
export const MAX_INVITES_PER_DAY = 20;
export const MAX_PENDING_INVITES_PER_BAND = 30;

export const INVITE_PREFERENCES = ["accept", "digest", "block"];

export const INVITE_PREFERENCE_LABELS = {
  accept: "Dozvoli pozivnice",
  digest: "Dnevni pregled (uskoro)",
  block: "Blokiraj pozivnice",
};

export function normalizeInvitePreference(value) {
  const next = String(value || "accept").toLowerCase();
  return INVITE_PREFERENCES.includes(next) ? next : "accept";
}

export function ownerBandLimit(extraGrants = 0) {
  const grants = Math.max(0, Number(extraGrants) || 0);
  return DEFAULT_GROUP_OWNER_LIMIT + grants;
}
