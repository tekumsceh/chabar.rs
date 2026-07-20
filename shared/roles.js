/**
 * Website (profiles.role) vs band (band_members.member_role) — independent systems.
 */

export const WEB_ROLES = ["superadmin", "admin", "assistant", "editor", "member"];

/** Band roles — never use web "admin" here; band elevated role is "lead". */
export const BAND_ROLES = ["owner", "lead", "member"];

export const BAND_ROLE_LABELS = {
  owner: "vlasnik",
  lead: "lead",
  member: "član",
};

export function normalizeWebRole(role) {
  const value = String(role || "member").toLowerCase();
  if (value === "user") return "member";
  if (WEB_ROLES.includes(value)) return value;
  return "member";
}

export function isSuperadmin(webRole) {
  return normalizeWebRole(webRole) === "superadmin";
}

export function isWebAdmin(webRole) {
  const role = normalizeWebRole(webRole);
  return role === "superadmin" || role === "admin";
}

/** Owner or lead of a band (band roles only). */
export function isBandLead(bandRole) {
  return bandRole === "owner" || bandRole === "lead";
}

export function bandRoleLabel(role) {
  return BAND_ROLE_LABELS[role] || role || "član";
}
