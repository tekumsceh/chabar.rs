/** Mixing desks grouped by maker — input + aux counts set rider limits. */
export const MIXING_CONSOLE_GROUPS = [
  {
    maker: "Allen & Heath",
    consoles: [
      { id: "sq7", model: "SQ-7", inputChannels: 48, outputChannels: 24 },
      { id: "sq5", model: "SQ-5", inputChannels: 48, outputChannels: 16 },
      { id: "sq6", model: "SQ-6", inputChannels: 32, outputChannels: 16 },
    ],
  },
  {
    maker: "Behringer",
    consoles: [
      { id: "wing", model: "WING", inputChannels: 48, outputChannels: 16 },
      { id: "wing-compact", model: "WING Compact", inputChannels: 48, outputChannels: 16 },
      { id: "wing-rack", model: "WING Rack", inputChannels: 48, outputChannels: 16 },
      { id: "x32", model: "X32", inputChannels: 32, outputChannels: 16 },
      { id: "x32-rack", model: "X32 Rack", inputChannels: 32, outputChannels: 16 },
    ],
  },
  {
    maker: "DiGiCo",
    consoles: [{ id: "sd9", model: "SD9", inputChannels: 48, outputChannels: 24 }],
  },
  {
    maker: "Midas",
    consoles: [{ id: "m32", model: "M32", inputChannels: 32, outputChannels: 16 }],
  },
  {
    maker: "Soundcraft",
    consoles: [{ id: "vi1", model: "Vi1", inputChannels: 96, outputChannels: 32 }],
  },
  {
    maker: "Yamaha",
    consoles: [
      { id: "cl5", model: "CL5", inputChannels: 72, outputChannels: 24 },
      { id: "ql5", model: "QL5", inputChannels: 64, outputChannels: 16 },
      { id: "dm3", model: "DM3", inputChannels: 24, outputChannels: 12 },
    ],
  },
];

export const MIXING_CONSOLES = MIXING_CONSOLE_GROUPS.flatMap((group) =>
  group.consoles.map((console) => ({
    ...console,
    maker: group.maker,
    name: `${group.maker} ${console.model}`,
  })),
);

const CONSOLE_BY_ID = new Map(MIXING_CONSOLES.map((item) => [item.id, item]));

export function normalizeConsoleIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    const id = String(raw || "").trim();
    if (!id || !CONSOLE_BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function resolveConsoleLimits(consoleIds) {
  const ids = normalizeConsoleIds(consoleIds);
  if (!ids.length) {
    return { inputMax: 0, outputMax: 0, consoles: [] };
  }
  const consoles = ids.map((id) => CONSOLE_BY_ID.get(id)).filter(Boolean);
  return {
    inputMax: Math.max(...consoles.map((item) => item.inputChannels)),
    outputMax: Math.max(...consoles.map((item) => item.outputChannels)),
    consoles,
  };
}
