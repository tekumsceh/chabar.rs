/**
 * Build UI_TEXTS.md — editable catalog of all user-facing copy (no DB data).
 * Run: node scripts/build-ui-texts.js
 */
import fs from "fs";
import path from "path";

const entries = [];

function add({ key, text, file, kind = "other", note = "" }) {
  let t = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const simple =
        String(expr)
          .trim()
          .split(/[^a-zA-Z0-9_]/)
          .filter(Boolean)
          .pop() || "value";
      return `{${simple}}`;
    })
    .trim();
  if (!t) return;
  // skip garbage JSX leftovers (but allow {placeholder} copy)
  if (/\{[a-zA-Z]/.test(t) && !/^[^\{]*\{[a-zA-Z0-9_]+\}/.test(t) && /setPage|transportRsd|=>/.test(t)) return;
  if (/setPage|transportRsd/.test(t) && t.length < 80) return;
  if (t.includes("${")) return; // incomplete nested-template capture
  if (t.length > 500) return;
  entries.push({ key, text: t, file, kind, note });
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(name)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

const files = [
  ...walk("src"),
  ...walk("shared"),
  "server/bands.js",
  "server/googleCalendar.js",
  "server/index.js",
  "server/auth.js",
  "server/users.js",
  "server/exchangeRate.js",
].filter((f) => fs.existsSync(f));

const usedKeys = new Set();
function uniqueKey(base) {
  let k = base;
  let i = 2;
  while (usedKeys.has(k)) {
    k = `${base}_${i++}`;
  }
  usedKeys.add(k);
  return k;
}

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const area = file
    .replace(/^src\//, "")
    .replace(/^shared\//, "shared/")
    .replace(/^server\//, "server/")
    .replace(/\.(jsx|js)$/, "")
    .replace(/\//g, ".");

  // attributes
  for (const m of src.matchAll(
    /\b(aria-label|title|placeholder)=\{?\s*(["'`])((?:(?!\2)[^\\]|\\.)*)\2/g,
  )) {
    const kind = m[1] === "placeholder" ? "placeholder" : m[1] === "aria-label" ? "aria" : "title";
    const text = m[3].replace(/\\n/g, "\n");
    add({
      key: uniqueKey(`${area}.${kind}.${slug(text)}`),
      text,
      file,
      kind,
    });
  }

  // label: "..."
  for (const m of src.matchAll(/\blabel:\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
    add({
      key: uniqueKey(`${area}.option.${slug(m[2])}`),
      text: m[2],
      file,
      kind: "option",
    });
  }

  // pages = [["id","Label"]]
  for (const m of src.matchAll(/\[["']([\w-]+)["']\s*,\s*["']([^"']+)["']\]/g)) {
    add({
      key: uniqueKey(`${area}.nav.${m[1]}`),
      text: m[2],
      file,
      kind: "label",
    });
  }

  // showToast(...) including optional chaining
  for (const m of src.matchAll(
    /showToast\??\.?\(\s*(?:[\w.]+\s*\|\|\s*)?(`[^`]+`|["'][^"']+["'])/g,
  )) {
    const raw = m[1].slice(1, -1);
    add({
      key: uniqueKey(`${area}.toast.${slug(raw)}`),
      text: raw,
      file,
      kind: "toast",
    });
  }
  // ternary toast: cond ? "a" : "b"
  for (const m of src.matchAll(
    /showToast\??\.?\([^;]*\?\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1\s*:\s*(["'`])((?:(?!\3)[^\\]|\\.)*)\3/g,
  )) {
    add({ key: uniqueKey(`${area}.toast.${slug(m[2])}`), text: m[2], file, kind: "toast" });
    add({ key: uniqueKey(`${area}.toast.${slug(m[4])}`), text: m[4], file, kind: "toast" });
  }

  // confirm({ title/message/... })
  for (const m of src.matchAll(
    /\b(title|message|confirmLabel|cancelLabel):\s*(`[^`]+`|["'][^"']+["'])/g,
  )) {
    let raw = m[2].slice(1, -1);
    // multi-line concat right after — handled loosely
    add({
      key: uniqueKey(`${area}.confirm.${m[1]}.${slug(raw)}`),
      text: raw,
      file,
      kind: "confirm",
      note: m[1],
    });
  }

  // string concatenations for confirm messages (line continuations)
  for (const m of src.matchAll(
    /(?:message|title):\s*(?:\n\s*)?(?:["'`][^"'`]*["'`]\s*\+\s*)+["'`][^"'`]*["'`]/g,
  )) {
    const parts = [...m[0].matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((x) => x[2]);
    if (parts.length) {
      const text = parts.join("");
      add({
        key: uniqueKey(`${area}.confirm.message.${slug(text)}`),
        text,
        file,
        kind: "confirm",
        note: "message",
      });
    }
  }

  // setFormError / setError
  for (const m of src.matchAll(/set(?:Form)?Error\(\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
    add({ key: uniqueKey(`${area}.error.${slug(m[2])}`), text: m[2], file, kind: "error" });
  }

  // JSX plain text nodes (conservative)
  for (const m of src.matchAll(
    /<(?:button|h[1-6]|p|span|strong|small|em|label|legend|th|td|li|option)(?:\s[^>]*)?>\s*\n?\s*([^<>{\n][^<>{]{0,160}?)\s*(?:<\/)/g,
  )) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (t.length < 2) continue;
    if (/^[0-9./\s—–-]+$/.test(t)) continue;
    add({ key: uniqueKey(`${area}.text.${slug(t)}`), text: t, file, kind: "label" });
  }

  // <small>children</small>
  for (const m of src.matchAll(/<small>\s*([^<{]+?)\s*<\/small>/g)) {
    add({ key: uniqueKey(`${area}.note.${slug(m[1])}`), text: m[1].trim(), file, kind: "note" });
  }

  // server detail / error Serbian or English user-facing
  if (file.startsWith("server/")) {
    for (const m of src.matchAll(/\b(?:error|detail|message|sourceLabel):\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
      const t = m[2];
      if (t.length < 3) continue;
      if (/^[a-z_]+$/.test(t)) continue;
      add({
        key: uniqueKey(`${area}.api.${slug(t)}`),
        text: t,
        file,
        kind: "error",
        note: m[1] === "detail" || m[0].includes("detail") ? "detail" : "",
      });
    }
    // Grad: / Lokal: description lines
    for (const m of src.matchAll(/`?(Grad:|Lokal:|Cena:|Prevoz:|created via chabar\.rs)[^`'\"]*`?/g)) {
      add({ key: uniqueKey(`${area}.gcal.${slug(m[0])}`), text: m[0].replace(/[`$]/g, ""), file, kind: "note" });
    }
  }
}

// Manual high-value supplements that regex often misses (exact current copy)
const manual = [
  { key: "confirm.defaults.title", text: "Potvrda", file: "src/confirmDialog.jsx", kind: "confirm" },
  { key: "confirm.defaults.alertTitle", text: "Obaveštenje", file: "src/confirmDialog.jsx", kind: "confirm" },
  { key: "confirm.defaults.confirm", text: "Potvrdi", file: "src/confirmDialog.jsx", kind: "confirm" },
  { key: "confirm.defaults.cancel", text: "Otkaži", file: "src/confirmDialog.jsx", kind: "confirm" },
  { key: "confirm.defaults.ok", text: "U redu", file: "src/confirmDialog.jsx", kind: "confirm" },
  { key: "fieldSelect.placeholder", text: "— Izaberi —", file: "src/FieldSelect.jsx", kind: "placeholder" },
  { key: "schedule.filter.upcoming", text: "Buduće", file: "src/SchedulePage.jsx", kind: "option" },
  { key: "schedule.filter.done", text: "Prošle", file: "src/SchedulePage.jsx", kind: "option" },
  { key: "schedule.filter.month", text: "Ovaj mesec", file: "src/SchedulePage.jsx", kind: "option" },
  { key: "schedule.filter.all", text: "Sve", file: "src/SchedulePage.jsx", kind: "option" },
  { key: "report.status.all", text: "Sve stavke", file: "src/ReportPage.jsx", kind: "option" },
  { key: "report.status.done", text: "Samo dospele", file: "src/ReportPage.jsx", kind: "option" },
  { key: "report.status.future", text: "Buduće", file: "src/ReportPage.jsx", kind: "option" },
  { key: "report.status.unpaid", text: "Dospele neplaćene", file: "src/ReportPage.jsx", kind: "option" },
  { key: "report.status.paid", text: "Plaćene", file: "src/ReportPage.jsx", kind: "option" },
  { key: "report.pay.open", text: "Otvoreno", file: "src/ReportPage.jsx", kind: "label" },
  { key: "report.pay.paid", text: "Plaćeno", file: "src/ReportPage.jsx", kind: "label" },
  { key: "report.pay.partial", text: "Delimično", file: "src/ReportPage.jsx", kind: "label" },
  { key: "report.pay.unpaid", text: "Neplaćeno", file: "src/ReportPage.jsx", kind: "label" },
  { key: "shared.role.owner", text: "vlasnik", file: "shared/roles.js", kind: "option" },
  { key: "shared.role.lead", text: "lead", file: "shared/roles.js", kind: "option" },
  { key: "shared.role.member", text: "član", file: "shared/roles.js", kind: "option" },
  { key: "shared.invite.accept", text: "Dozvoli pozivnice", file: "shared/bandLimits.js", kind: "option" },
  { key: "shared.invite.digest", text: "Dnevni pregled (uskoro)", file: "shared/bandLimits.js", kind: "option" },
  { key: "shared.invite.block", text: "Blokiraj pozivnice", file: "shared/bandLimits.js", kind: "option" },
  {
    key: "gcal.event.createdVia",
    text: "created via chabar.rs",
    file: "server/googleCalendar.js",
    kind: "note",
  },
  // Nested template toasts (regex cannot parse nested `)
  { key: "App.toast.kurs_rate_label", text: "Kurs: {rate} ({label}{asOf})", file: "src/App.jsx", kind: "toast", note: "approx template" },
  { key: "App.toast.termin_dodat", text: "Termin dodat: {date}{city}", file: "src/App.jsx", kind: "toast" },
  { key: "App.toast.termin_obrisan", text: "Termin obrisan{label}", file: "src/App.jsx", kind: "toast" },
  { key: "SchedulePage.toast.bend_kreiran", text: "Bend kreiran: {name}", file: "src/SchedulePage.jsx", kind: "toast" },
];
for (const row of manual) {
  usedKeys.add(row.key);
  add(row);
}

// Dedupe by key preferring first
const byKey = new Map();
for (const e of entries) {
  if (!byKey.has(e.key)) byKey.set(e.key, e);
}
const final = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));

const lines = [];
lines.push(`# UI Texts — Chabar`);
lines.push(``);
lines.push(`Editable catalog of **all system / UI copy** (labels, buttons, toasts, confirms, errors, aria, placeholders).`);
lines.push(`**Not included:** database content (band names, cities, venues, notes, amounts, user names/emails).`);
lines.push(``);
lines.push(`## How to use`);
lines.push(``);
lines.push(`1. Edit only the \`TEXT:\` line under an entry (keep \`KEY:\` / \`FILE:\` / \`KIND:\` intact).`);
lines.push(`2. For dynamic bits use \`{name}\`, \`{date}\`, \`{city}\`, etc. — same placeholders the code already interpolates.`);
lines.push(`3. Save this file.`);
lines.push(`4. Tell the agent: **apply UI texts** (or “apply UI_TEXTS.md”).`);
lines.push(`5. The agent will copy each changed \`TEXT\` into the listed \`FILE\` (and related duplicates if any).`);
lines.push(``);
lines.push(`Regenerate this catalog from code (overwrites): \`node scripts/build-ui-texts.js\``);
lines.push(``);
lines.push(`---`);
lines.push(``);
lines.push(`Generated: ${new Date().toISOString().slice(0, 10)} · ${final.length} entries`);
lines.push(``);

let currentArea = "";
for (const e of final) {
  const area = e.key.split(".")[0];
  if (area !== currentArea) {
    currentArea = area;
    lines.push(``);
    lines.push(`## ${area}`);
    lines.push(``);
  }
  lines.push(`### ${e.key}`);
  lines.push(`- KEY: ${e.key}`);
  lines.push(`- FILE: ${e.file}`);
  lines.push(`- KIND: ${e.kind}${e.note ? ` (${e.note})` : ""}`);
  if (e.text.includes("\n")) {
    lines.push(`- TEXT: |`);
    for (const line of e.text.split("\n")) lines.push(`  ${line}`);
  } else {
    lines.push(`- TEXT: ${e.text}`);
  }
  lines.push(``);
}

fs.writeFileSync("UI_TEXTS.md", lines.join("\n"), "utf8");
fs.writeFileSync(
  "scripts/_ui-texts-index.json",
  JSON.stringify(final, null, 2),
  "utf8",
);
console.log(`Wrote UI_TEXTS.md (${final.length} entries) and scripts/_ui-texts-index.json`);
