import crypto from "node:crypto";
import { clearMembershipCache, pickBandColor } from "./auth.js";
import { query } from "./db.js";
import {
  getBandCalendarLink,
  getGoogleAccountStatus,
  googleCalendarConfigured,
  countGoogleImportedEvents,
} from "./googleCalendar.js";
import {
  MAX_BAND_CREATES_PER_DAY,
  MAX_INVITES_PER_DAY,
  MAX_PENDING_INVITES_PER_BAND,
  normalizeInvitePreference,
  ownerBandLimit,
} from "../shared/bandLimits.js";
import { isBandLead } from "../shared/roles.js";

function makeInviteToken() {
  return crypto.randomBytes(18).toString("base64url");
}

export function bandIdFromParams(req, _res, next) {
  req.headers["x-band-id"] = req.params.id;
  next();
}

function canManage(memberRole) {
  return isBandLead(memberRole);
}

async function getUsedBandColors() {
  const result = await query(`SELECT DISTINCT lower(color) AS color FROM bands WHERE color IS NOT NULL`);
  return result.rows.map((row) => row.color);
}

async function getOwnerQuota(userId) {
  const result = await query(
    `SELECT
       COALESCE(p.extra_band_grants, 0) AS extra_band_grants,
       (
         SELECT COUNT(*)::int
         FROM band_members bm
         JOIN bands b ON b.id = bm.band_id
         WHERE bm.user_id = :userId
           AND bm.member_role = 'owner'
           AND b.kind = 'group'
       ) AS owned_group_bands
     FROM profiles p
     WHERE p.id = :userId
     LIMIT 1`,
    { userId },
  );
  const row = result.rows[0] || { extra_band_grants: 0, owned_group_bands: 0 };
  const limit = ownerBandLimit(row.extra_band_grants);
  return {
    ownedGroupBands: row.owned_group_bands,
    extraBandGrants: row.extra_band_grants,
    ownerLimit: limit,
    canCreate: row.owned_group_bands < limit,
  };
}

/** List pending band invites for this user (no auto-join). */
export async function listPendingInvitesForUser(user) {
  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  if (!email) return [];

  const invites = await query(
    `SELECT i.id, i.band_id, i.member_role, i.created_at, i.email,
            b.name AS band_name, b.color AS band_color,
            p.display_name AS invited_by_name, p.email AS invited_by_email
     FROM band_invites i
     JOIN bands b ON b.id = i.band_id
     LEFT JOIN profiles p ON p.id = i.invited_by
     WHERE lower(i.email) = :email
     ORDER BY i.created_at DESC`,
    { email },
  );

  return invites.rows.map((row) => ({
    id: row.id,
    bandId: row.band_id,
    bandName: row.band_name,
    bandColor: row.band_color,
    memberRole: row.member_role || "member",
    createdAt: row.created_at,
    invitedByName: row.invited_by_name || row.invited_by_email?.split("@")[0] || "Neko",
  }));
}

/** Accept a pending invite addressed to this user's email. */
export async function acceptInvite(req, res, next) {
  try {
    const inviteId = String(req.params.inviteId || "").trim();
    const email = String(req.user.email || "")
      .trim()
      .toLowerCase();
    if (!inviteId || !email) {
      return res.status(400).json({ error: "Invalid invite" });
    }

    const invite = await query(
      `SELECT id, band_id, member_role, email
       FROM band_invites
       WHERE id = :inviteId AND lower(email) = :email
       LIMIT 1`,
      { inviteId, email },
    );
    if (!invite.rows[0]) {
      return res.status(404).json({ error: "Not found", detail: "Pozivnica nije pronađena." });
    }

    const row = invite.rows[0];
    await query(
      `INSERT INTO band_members (band_id, user_id, member_role)
       VALUES (:bandId, :userId, :role)
       ON CONFLICT (band_id, user_id) DO NOTHING`,
      { bandId: row.band_id, userId: req.user.id, role: row.member_role || "member" },
    );
    await query(`DELETE FROM band_invites WHERE id = :id`, { id: row.id });
    clearMembershipCache();

    const band = await query(`SELECT id, name, kind, color FROM bands WHERE id = :bandId LIMIT 1`, {
      bandId: row.band_id,
    });
    res.json({
      status: "accepted",
      band: band.rows[0]
        ? {
            id: band.rows[0].id,
            name: band.rows[0].name,
            kind: band.rows[0].kind,
            color: band.rows[0].color,
            memberRole: row.member_role || "member",
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
}

/** Decline / dismiss a pending invite. */
export async function declineInvite(req, res, next) {
  try {
    const inviteId = String(req.params.inviteId || "").trim();
    const email = String(req.user.email || "")
      .trim()
      .toLowerCase();
    if (!inviteId || !email) {
      return res.status(400).json({ error: "Invalid invite" });
    }

    const result = await query(
      `DELETE FROM band_invites
       WHERE id = :inviteId AND lower(email) = :email
       RETURNING id`,
      { inviteId, email },
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Not found", detail: "Pozivnica nije pronađena." });
    }
    res.json({ status: "declined", id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
}

/** Create a group band; caller becomes owner. Personal bands are created at signup only. */
export async function createBand(req, res, next) {
  try {
    const name = String(req.body?.name || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
    if (!name) {
      return res.status(400).json({ error: "Invalid name", detail: "Unesi ime benda." });
    }

    const quota = await getOwnerQuota(req.user.id);
    if (!quota.canCreate) {
      return res.status(403).json({
        error: "Owner limit",
        detail: `Možeš biti vlasnik najviše ${quota.ownerLimit} grupnih bendova. Zatraži grant za više.`,
        ownedGroupBands: quota.ownedGroupBands,
        ownerLimit: quota.ownerLimit,
      });
    }

    const createdToday = await query(
      `SELECT COUNT(*)::int AS n
       FROM bands
       WHERE created_by = :userId
         AND kind = 'group'
         AND created_at >= NOW() - INTERVAL '1 day'`,
      { userId: req.user.id },
    );
    if ((createdToday.rows[0]?.n || 0) >= MAX_BAND_CREATES_PER_DAY) {
      return res.status(429).json({
        error: "Rate limit",
        detail: `Možeš kreirati najviše ${MAX_BAND_CREATES_PER_DAY} benda dnevno.`,
      });
    }

    const color = pickBandColor(`${req.user.id}:${name}:${Date.now()}`, await getUsedBandColors());
    const created = await query(
      `INSERT INTO bands (name, kind, color, created_by)
       VALUES (:name, 'group', :color, :userId)
       RETURNING id, name, kind, color, created_at`,
      { name, color, userId: req.user.id },
    );
    const band = created.rows[0];
    await query(
      `INSERT INTO band_members (band_id, user_id, member_role)
       VALUES (:bandId, :userId, 'owner')`,
      { bandId: band.id, userId: req.user.id },
    );
    clearMembershipCache();

    res.status(201).json({
      id: band.id,
      name: band.name,
      kind: band.kind,
      color: band.color,
      memberRole: "owner",
      ownedGroupBands: quota.ownedGroupBands + 1,
      ownerLimit: quota.ownerLimit,
    });
  } catch (error) {
    next(error);
  }
}

/** Band home: meta, members, events for calendar. */
export async function getBandHome(req, res, next) {
  try {
    const bandId = req.params.id;
    const bandResult = await query(
      `SELECT id, name, kind, color FROM bands WHERE id = :bandId LIMIT 1`,
      { bandId },
    );
    if (!bandResult.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    const band = bandResult.rows[0];
    const isOwner = req.memberRole === "owner";
    const isLead = req.memberRole === "lead";
    const manage = canManage(req.memberRole);
    const isGroup = band.kind !== "personal";

    const selfFlags = await query(
      `SELECT can_invite FROM band_members
       WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
      { bandId, userId: req.user.id },
    );
    const selfCanInvite = selfFlags.rows[0]?.can_invite !== false;

    const [membersResult, eventsResult, invitesResult] = await Promise.all([
      query(
        `SELECT bm.user_id, bm.member_role, bm.can_invite, p.email, p.display_name
         FROM band_members bm
         JOIN profiles p ON p.id = bm.user_id
         WHERE bm.band_id = :bandId
         ORDER BY
           CASE bm.member_role WHEN 'owner' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END,
           p.display_name, p.email`,
        { bandId },
      ),
      query(
        `SELECT id, event_date_text, city, venue, note
         FROM events
         WHERE band_id = :bandId
         ORDER BY sort_order, id`,
        { bandId },
      ),
      manage || selfCanInvite
        ? query(
            `SELECT id, email, member_role, created_at
             FROM band_invites
             WHERE band_id = :bandId
             ORDER BY created_at DESC`,
            { bandId },
          )
        : Promise.resolve({ rows: [] }),
    ]);

    res.json({
      band: {
        id: band.id,
        name: band.name,
        kind: band.kind,
        color: band.color,
        memberRole: req.memberRole,
      },
      members: membersResult.rows.map((row) => ({
        id: row.user_id,
        name: row.display_name || row.email?.split("@")[0] || "Član",
        email: manage ? row.email || "" : undefined,
        memberRole: row.member_role,
        canInvite: row.can_invite !== false,
      })),
      events: eventsResult.rows.map((row) => ({
        id: row.id,
        bandId: band.id,
        date: row.event_date_text,
        city: row.city || "",
        venue: row.venue || "",
        note: row.note || "",
        color: band.color || null,
      })),
      invites: invitesResult.rows.map((row) => ({
        id: row.id,
        email: row.email,
        memberRole: row.member_role,
        createdAt: row.created_at,
      })),
      permissions: {
        canManage: manage && isGroup,
        canInvite: isGroup && (isOwner || selfCanInvite),
        canKick: manage && isGroup,
        canAssignRoles: manage && isGroup,
        canTransfer: isOwner && isGroup,
        canDelete: isOwner && isGroup,
        isOwner,
        isLead,
      },
      googleCalendar: await buildGoogleCalendarPayload(bandId, req.user.id),
    });
  } catch (error) {
    next(error);
  }
}

async function buildGoogleCalendarPayload(bandId, userId) {
  const [account, link, importedCount] = await Promise.all([
    getGoogleAccountStatus(userId),
    getBandCalendarLink(bandId),
    countGoogleImportedEvents(bandId),
  ]);
  return {
    configured: googleCalendarConfigured(),
    account,
    link,
    importedCount,
    canManageLink: !link || link.connectedByUserId === userId,
  };
}

async function assertCanInvite(req) {
  // Owner always invites; lead/member need can_invite (revocable per member).
  if (req.memberRole === "owner") return true;
  const flags = await query(
    `SELECT can_invite FROM band_members
     WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
    { bandId: req.bandId, userId: req.user.id },
  );
  return flags.rows[0]?.can_invite !== false;
}

/** Invite by userId or email — always pending until the invitee accepts. */
export async function addBandMember(req, res, next) {
  try {
    const allowed = await assertCanInvite(req);
    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Nemaš dozvolu za pozivnice u ovom bendu.",
      });
    }

    const bandMeta = await query(`SELECT kind FROM bands WHERE id = :bandId LIMIT 1`, {
      bandId: req.bandId,
    });
    if (!bandMeta.rows[0]) return res.status(404).json({ error: "Not found" });
    if (bandMeta.rows[0].kind === "personal") {
      return res.status(400).json({ error: "Invalid band", detail: "Lični bend nema članove za dodavanje." });
    }

    const invitesToday = await query(
      `SELECT COUNT(*)::int AS n
       FROM band_invites
       WHERE invited_by = :userId
         AND created_at >= NOW() - INTERVAL '1 day'`,
      { userId: req.user.id },
    );
    if ((invitesToday.rows[0]?.n || 0) >= MAX_INVITES_PER_DAY) {
      return res.status(429).json({
        error: "Rate limit",
        detail: `Najviše ${MAX_INVITES_PER_DAY} pozivnica dnevno.`,
      });
    }

    const pendingCount = await query(
      `SELECT COUNT(*)::int AS n FROM band_invites WHERE band_id = :bandId`,
      { bandId: req.bandId },
    );
    if ((pendingCount.rows[0]?.n || 0) >= MAX_PENDING_INVITES_PER_BAND) {
      return res.status(429).json({
        error: "Rate limit",
        detail: `Bend već ima ${MAX_PENDING_INVITES_PER_BAND} otvorenih pozivnica.`,
      });
    }

    const userIdInput = String(req.body?.userId || "").trim();
    const emailInput = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    let profile = null;
    if (userIdInput) {
      const byId = await query(
        `SELECT id, email, invite_preference FROM profiles WHERE id = :userId LIMIT 1`,
        { userId: userIdInput },
      );
      profile = byId.rows[0] || null;
      if (!profile) {
        return res.status(404).json({ error: "Not found", detail: "Korisnik nije pronađen." });
      }
    } else if (emailInput && emailInput.includes("@")) {
      const byEmail = await query(
        `SELECT id, email, invite_preference FROM profiles WHERE lower(email) = :email LIMIT 1`,
        { email: emailInput },
      );
      profile = byEmail.rows[0] || null;
    } else {
      return res.status(400).json({
        error: "Invalid input",
        detail: "Izaberi korisnika iz pretrage ili unesi validan email.",
      });
    }

    const inviteEmail = String(profile?.email || emailInput || "")
      .trim()
      .toLowerCase();
    if (!inviteEmail || !inviteEmail.includes("@")) {
      return res.status(400).json({ error: "Invalid email", detail: "Potreban je validan email." });
    }

    if (profile) {
      if (profile.id === req.user.id) {
        return res.status(400).json({ error: "Invalid user", detail: "Ne možeš pozvati sebe." });
      }
      const already = await query(
        `SELECT 1 FROM band_members WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
        { bandId: req.bandId, userId: profile.id },
      );
      if (already.rows[0]) {
        return res.status(400).json({ error: "Already member", detail: "Korisnik je već član benda." });
      }

      const preference = normalizeInvitePreference(profile.invite_preference);
      if (preference === "block") {
        return res.status(403).json({
          error: "Invites blocked",
          detail: "Ovaj nalog ne prima pozivnice u bendove.",
        });
      }
    }

    const invite = await query(
      `INSERT INTO band_invites (band_id, email, member_role, invited_by)
       VALUES (:bandId, :email, 'member', :invitedBy)
       ON CONFLICT (band_id, email) DO UPDATE
         SET invited_by = EXCLUDED.invited_by,
             created_at = NOW()
       RETURNING id, email, member_role, created_at`,
      { bandId: req.bandId, email: inviteEmail, invitedBy: req.user.id },
    );

    res.status(201).json({
      status: "invited",
      id: invite.rows[0].id,
      email: invite.rows[0].email,
      memberRole: invite.rows[0].member_role,
      createdAt: invite.rows[0].created_at,
      registered: Boolean(profile),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Owner: set lead/member.
 * Lead: can promote member → lead (not demote other leads; not touch owner).
 */
export async function updateMemberRole(req, res, next) {
  try {
    if (!canManage(req.memberRole)) {
      return res.status(403).json({ error: "Forbidden", detail: "Samo vlasnik ili lead može menjati uloge." });
    }

    const targetUserId = String(req.params.userId || "").trim();
    const nextRole = String(req.body?.memberRole || "").toLowerCase();
    if (!targetUserId) {
      return res.status(400).json({ error: "Missing user" });
    }
    if (nextRole !== "lead" && nextRole !== "member") {
      return res.status(400).json({ error: "Invalid role", detail: "Dozvoljeno: lead ili member." });
    }
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: "Invalid role", detail: "Ne možeš menjati sopstvenu ulogu ovde." });
    }

    const target = await query(
      `SELECT member_role FROM band_members WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
      { bandId: req.bandId, userId: targetUserId },
    );
    if (!target.rows[0]) {
      return res.status(404).json({ error: "Not found", detail: "Član nije pronađen." });
    }
    if (target.rows[0].member_role === "owner") {
      return res.status(400).json({ error: "Invalid role", detail: "Uloga vlasnika se ne menja ovde — koristi prenos vlasništva." });
    }

    if (req.memberRole === "lead") {
      if (target.rows[0].member_role === "lead" && nextRole === "member") {
        return res.status(403).json({
          error: "Forbidden",
          detail: "Lead ne može sniziti drugog lead-a. To radi vlasnik.",
        });
      }
      if (nextRole !== "lead") {
        return res.status(403).json({
          error: "Forbidden",
          detail: "Lead može samo unaprediti člana u lead.",
        });
      }
    }

    await query(
      `UPDATE band_members SET member_role = :role WHERE band_id = :bandId AND user_id = :userId`,
      { role: nextRole, bandId: req.bandId, userId: targetUserId },
    );
    clearMembershipCache();
    res.json({ userId: targetUserId, memberRole: nextRole });
  } catch (error) {
    next(error);
  }
}

/** Owner/lead: toggle can_invite for one member (not bulk). */
export async function updateMemberInvitePrivilege(req, res, next) {
  try {
    if (!canManage(req.memberRole)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Samo vlasnik ili lead može menjati dozvolu za pozivnice.",
      });
    }

    const targetUserId = String(req.params.userId || "").trim();
    const canInvite = Boolean(req.body?.canInvite);
    if (!targetUserId) {
      return res.status(400).json({ error: "Missing user" });
    }
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: "Invalid user", detail: "Sopstvenu dozvolu ne menjaš ovde." });
    }

    const target = await query(
      `SELECT member_role FROM band_members WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
      { bandId: req.bandId, userId: targetUserId },
    );
    if (!target.rows[0]) {
      return res.status(404).json({ error: "Not found", detail: "Član nije pronađen." });
    }
    if (target.rows[0].member_role === "owner") {
      return res.status(400).json({ error: "Invalid user", detail: "Vlasnik uvek može da poziva." });
    }
    if (req.memberRole === "lead" && target.rows[0].member_role === "lead") {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Lead ne može menjati dozvole drugog lead-a.",
      });
    }

    await query(
      `UPDATE band_members SET can_invite = :canInvite
       WHERE band_id = :bandId AND user_id = :userId`,
      { canInvite, bandId: req.bandId, userId: targetUserId },
    );
    res.json({ userId: targetUserId, canInvite });
  } catch (error) {
    next(error);
  }
}

/** Owner/lead: remove a member. Lead can only kick regular members. */
export async function removeBandMember(req, res, next) {
  try {
    if (!canManage(req.memberRole)) {
      return res.status(403).json({ error: "Forbidden", detail: "Samo vlasnik ili lead može uklanjati članove." });
    }

    const bandMeta = await query(`SELECT kind FROM bands WHERE id = :bandId LIMIT 1`, {
      bandId: req.bandId,
    });
    if (!bandMeta.rows[0] || bandMeta.rows[0].kind === "personal") {
      return res.status(400).json({ error: "Invalid band", detail: "Lični bend se ne uređuje ovako." });
    }

    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) {
      return res.status(400).json({ error: "Missing user" });
    }
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: "Invalid user", detail: "Ne možeš ukloniti sebe ovde." });
    }

    const target = await query(
      `SELECT member_role FROM band_members WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
      { bandId: req.bandId, userId: targetUserId },
    );
    if (!target.rows[0]) {
      return res.status(404).json({ error: "Not found", detail: "Član nije pronađen." });
    }
    if (target.rows[0].member_role === "owner") {
      return res.status(400).json({ error: "Invalid user", detail: "Vlasnik se ne može ukloniti — prenesi vlasništvo." });
    }
    if (req.memberRole === "lead" && target.rows[0].member_role !== "member") {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Lead može ukloniti samo obične članove.",
      });
    }

    await query(`DELETE FROM band_members WHERE band_id = :bandId AND user_id = :userId`, {
      bandId: req.bandId,
      userId: targetUserId,
    });
    clearMembershipCache();
    res.json({ status: "removed", userId: targetUserId });
  } catch (error) {
    next(error);
  }
}

/** Owner-only: transfer ownership to an existing member; previous owner becomes lead. */
export async function transferBandOwnership(req, res, next) {
  try {
    if (req.memberRole !== "owner") {
      return res.status(403).json({ error: "Forbidden", detail: "Samo vlasnik može preneti vlasništvo." });
    }

    const bandMeta = await query(`SELECT kind, name FROM bands WHERE id = :bandId LIMIT 1`, {
      bandId: req.bandId,
    });
    if (!bandMeta.rows[0] || bandMeta.rows[0].kind === "personal") {
      return res.status(400).json({ error: "Invalid band", detail: "Lični bend nema prenos vlasništva." });
    }

    const targetUserId = String(req.body?.userId || "").trim();
    if (!targetUserId) {
      return res.status(400).json({ error: "Missing user", detail: "Izaberi člana." });
    }
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: "Invalid user", detail: "Već si vlasnik." });
    }

    const target = await query(
      `SELECT member_role FROM band_members WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
      { bandId: req.bandId, userId: targetUserId },
    );
    if (!target.rows[0]) {
      return res.status(404).json({ error: "Not found", detail: "Član mora već biti u bendu." });
    }

    const quota = await getOwnerQuota(targetUserId);
    if (!quota.canCreate) {
      return res.status(403).json({
        error: "Owner limit",
        detail: `Taj nalog već ima ${quota.ownedGroupBands}/${quota.ownerLimit} grupnih bendova kao vlasnik.`,
      });
    }

    await query(
      `UPDATE band_members SET member_role = 'lead', can_invite = TRUE
       WHERE band_id = :bandId AND user_id = :userId`,
      { bandId: req.bandId, userId: req.user.id },
    );
    await query(
      `UPDATE band_members SET member_role = 'owner', can_invite = TRUE
       WHERE band_id = :bandId AND user_id = :userId`,
      { bandId: req.bandId, userId: targetUserId },
    );
    clearMembershipCache();

    res.json({
      status: "transferred",
      bandId: req.bandId,
      bandName: bandMeta.rows[0].name,
      newOwnerId: targetUserId,
      previousOwnerId: req.user.id,
    });
  } catch (error) {
    next(error);
  }
}

/** Owner-only: permanently delete a group band. */
export async function deleteBand(req, res, next) {
  try {
    if (req.memberRole !== "owner") {
      return res.status(403).json({ error: "Forbidden", detail: "Samo vlasnik može obrisati bend." });
    }

    const bandMeta = await query(`SELECT id, name, kind FROM bands WHERE id = :bandId LIMIT 1`, {
      bandId: req.bandId,
    });
    if (!bandMeta.rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }
    if (bandMeta.rows[0].kind === "personal") {
      return res.status(400).json({ error: "Invalid band", detail: "Lični bend se ne briše." });
    }

    const name = bandMeta.rows[0].name;
    await query(`DELETE FROM bands WHERE id = :bandId`, { bandId: req.bandId });
    clearMembershipCache();

    res.json({ status: "deleted", id: req.bandId, name });
  } catch (error) {
    next(error);
  }
}

/** Ensure one share link per group band; create if missing. */
export async function getInviteLink(req, res, next) {
  try {
    const allowed = await assertCanInvite(req);
    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Nemaš dozvolu za deljenje pozivnice.",
      });
    }

    const bandMeta = await query(`SELECT id, name, kind FROM bands WHERE id = :bandId LIMIT 1`, {
      bandId: req.bandId,
    });
    if (!bandMeta.rows[0]) return res.status(404).json({ error: "Not found" });
    if (bandMeta.rows[0].kind === "personal") {
      return res.status(400).json({
        error: "Invalid band",
        detail: "Lični bend nema link za deljenje.",
      });
    }

    let row = (
      await query(
        `SELECT token, member_role, created_at FROM band_invite_links WHERE band_id = :bandId LIMIT 1`,
        { bandId: req.bandId },
      )
    ).rows[0];

    if (!row) {
      const token = makeInviteToken();
      const inserted = await query(
        `INSERT INTO band_invite_links (band_id, token, member_role, created_by)
         VALUES (:bandId, :token, 'member', :userId)
         ON CONFLICT (band_id) DO UPDATE
           SET token = EXCLUDED.token,
               member_role = 'member',
               created_by = EXCLUDED.created_by,
               created_at = NOW()
         RETURNING token, member_role, created_at`,
        { bandId: req.bandId, token, userId: req.user.id },
      );
      row = inserted.rows[0];
    }

    res.json({
      token: row.token,
      memberRole: "member",
      createdAt: row.created_at,
      bandId: req.bandId,
      bandName: bandMeta.rows[0].name,
    });
  } catch (error) {
    next(error);
  }
}

/** Invalidate old link and issue a new token. */
export async function rotateInviteLink(req, res, next) {
  try {
    const allowed = await assertCanInvite(req);
    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
        detail: "Nemaš dozvolu za deljenje pozivnice.",
      });
    }

    const bandMeta = await query(`SELECT id, name, kind FROM bands WHERE id = :bandId LIMIT 1`, {
      bandId: req.bandId,
    });
    if (!bandMeta.rows[0]) return res.status(404).json({ error: "Not found" });
    if (bandMeta.rows[0].kind === "personal") {
      return res.status(400).json({
        error: "Invalid band",
        detail: "Lični bend nema link za deljenje.",
      });
    }

    const token = makeInviteToken();
    const result = await query(
      `INSERT INTO band_invite_links (band_id, token, member_role, created_by)
       VALUES (:bandId, :token, 'member', :userId)
       ON CONFLICT (band_id) DO UPDATE
         SET token = EXCLUDED.token,
             member_role = 'member',
             created_by = EXCLUDED.created_by,
             created_at = NOW()
       RETURNING token, member_role, created_at`,
      { bandId: req.bandId, token, userId: req.user.id },
    );

    res.json({
      token: result.rows[0].token,
      memberRole: "member",
      createdAt: result.rows[0].created_at,
      bandId: req.bandId,
      bandName: bandMeta.rows[0].name,
    });
  } catch (error) {
    next(error);
  }
}

/** Public preview — band name only (no auth). */
export async function getJoinPreview(req, res, next) {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(400).json({ error: "Missing token" });

    const result = await query(
      `SELECT l.band_id, b.name AS band_name, b.kind
       FROM band_invite_links l
       JOIN bands b ON b.id = l.band_id
       WHERE l.token = :token
       LIMIT 1`,
      { token },
    );
    if (!result.rows[0] || result.rows[0].kind === "personal") {
      return res.status(404).json({ error: "Not found", detail: "Link nije važeći ili je istekao." });
    }

    res.json({
      bandId: result.rows[0].band_id,
      bandName: result.rows[0].band_name,
      memberRole: "member",
    });
  } catch (error) {
    next(error);
  }
}

/** Auth: open share link → become band member immediately. */
export async function acceptJoinLink(req, res, next) {
  try {
    const { ensureProfileAndPersonalBand } = await import("./auth.js");
    await ensureProfileAndPersonalBand(req.user);

    const token = String(req.params.token || "").trim();
    if (!token) return res.status(400).json({ error: "Missing token" });

    const link = await query(
      `SELECT l.band_id, l.member_role, b.name AS band_name, b.kind
       FROM band_invite_links l
       JOIN bands b ON b.id = l.band_id
       WHERE l.token = :token
       LIMIT 1`,
      { token },
    );
    if (!link.rows[0] || link.rows[0].kind === "personal") {
      return res.status(404).json({ error: "Not found", detail: "Link nije važeći ili je istekao." });
    }

    const bandId = link.rows[0].band_id;
    const bandName = link.rows[0].band_name;

    const existing = await query(
      `SELECT member_role FROM band_members
       WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
      { bandId, userId: req.user.id },
    );
    if (existing.rows[0]) {
      return res.json({
        status: "already_member",
        bandId,
        bandName,
        memberRole: existing.rows[0].member_role,
      });
    }

    await query(
      `INSERT INTO band_members (band_id, user_id, member_role)
       VALUES (:bandId, :userId, 'member')
       ON CONFLICT (band_id, user_id) DO NOTHING`,
      { bandId, userId: req.user.id },
    );
    // Drop any pending email invite for this user/band
    const email = String(req.user.email || "")
      .trim()
      .toLowerCase();
    if (email) {
      await query(`DELETE FROM band_invites WHERE band_id = :bandId AND lower(email) = :email`, {
        bandId,
        email,
      });
    }
    clearMembershipCache();

    res.json({
      status: "joined",
      bandId,
      bandName,
      memberRole: "member",
    });
  } catch (error) {
    next(error);
  }
}

