export const GEAR_CATEGORIES = [
  { id: "dynamic", label: "Dynamic" },
  { id: "condenser", label: "Condenser" },
  { id: "di", label: "DI" },
  { id: "wireless", label: "Wireless" },
];

export const POPULAR_GEAR = {
  dynamic: ["Shure SM58", "Shure SM57", "Shure Beta 52A", "Shure Beta 91A", "Audix D6", "Sennheiser e904", "Sennheiser e935"],
  condenser: ["Neumann KMS 105", "Shure Beta 87A", "AKG C414", "Shure KSM9"],
  di: ["Radial J48", "Radial ProDI", "Darkglass Active DI", "Countryman Type 85"],
  wireless: ["Shure ULXD Handheld", "Sennheiser SKM G4", "Sennheiser IEM G4"],
};

/** Most-used general mics when source name is not recognized. */
export const DEFAULT_MIC_PRESETS = [
  "Shure SM58",
  "Shure SM57",
  "Sennheiser e935",
  "Shure Beta 87A",
  "Neumann KMS 105",
  "Radial J48",
  "Radial ProDI",
  "Shure ULXD Handheld",
];

/**
 * Instrument → common gear. `match` tests the source/label string.
 * Options are listed most-used first; use as separate picks or comma-separated alts.
 */
export const INSTRUMENT_GEAR_HINTS = [
  {
    id: "kick",
    label: "Kick",
    match: /\b(kick|bass\s*drum|\bbd\b|bubanj)\b/i,
    options: ["Audix D6", "Shure Beta 52A", "Shure Beta 91A", "AKG D112"],
  },
  {
    id: "snare",
    label: "Snare",
    match: /\b(snare|doboš|dobos)\b/i,
    options: ["Shure SM57", "Sennheiser e904", "Shure Beta 56A"],
  },
  {
    id: "hat",
    label: "Hi-hat",
    match: /\b(hi[\s-]?hat|hat|činele|cinele)\b/i,
    options: ["Neumann KM184", "AKG C451", "Shure SM81"],
  },
  {
    id: "tom",
    label: "Tom",
    match: /\b(tom|floor\s*tom|rack\s*tom)\b/i,
    options: ["Sennheiser e904", "Sennheiser e604", "Shure Beta 98"],
  },
  {
    id: "oh",
    label: "Overheads",
    match: /\b(oh|over\s*head|overhead|činele\s*oh|cymbal)\b/i,
    options: ["AKG C414", "Neumann KM184", "Shure KSM137"],
  },
  {
    id: "vocal",
    label: "Vocal",
    match: /\b(vocal|vox|vokal|lead\s*v|bv|backing|choir|mic\s*stand)\b/i,
    options: ["Shure SM58", "Sennheiser e935", "Shure Beta 87A", "Neumann KMS 105", "Shure ULXD Handheld"],
  },
  {
    id: "guitar_amp",
    label: "Guitar amp",
    match: /\b(gtr|guitar|gitara|amp|marshall|fender|vox\s*ac)\b/i,
    options: ["Shure SM57", "Sennheiser e609", "Sennheiser MD421", "Royer R-121"],
  },
  {
    id: "bass",
    label: "Bass",
    match: /\b(bass|bas(?!\s*drum)|bass\s*di|bass\s*amp)\b/i,
    options: ["Radial J48", "Darkglass Active DI", "Countryman Type 85", "AKG D112"],
  },
  {
    id: "keys",
    label: "Keys / synth",
    match: /\b(key|keys|klavir|piano|synth|nord|rhodes|organ)\b/i,
    options: ["Radial ProDI", "Radial J48", "Countryman Type 85", "Direct Box"],
  },
  {
    id: "acoustic",
    label: "Acoustic",
    match: /\b(acoustic|akustik|akusti[cč]na|violin|čelo|cello|mandolin)\b/i,
    options: ["DPA 4099", "Neumann KM184", "Shure SM81", "Radial J48"],
  },
  {
    id: "brass",
    label: "Horn / brass",
    match: /\b(sax|trumpet|trombone|horn|brass|truba|saksofon)\b/i,
    options: ["Sennheiser MD421", "Shure SM57", "Neumann KMS 105"],
  },
  {
    id: "dj",
    label: "DJ / playback",
    match: /\b(dj|playback|laptop|track|click|ableton)\b/i,
    options: ["Radial ProDI", "Radial J48", "DI stereo pair", "XLR from desk"],
  },
];

export const CABLE_PRESETS = [
  "XLR 3-Pin",
  "XLR Balanced",
  "XLR Gold Shield",
  "1/4\" TRS",
  "1/4\" Instrument",
  "XLR -> Cat6 Snake",
  "Cat6 EtherCON",
  "Dante",
  "Wireless HH",
];

export const HARDWARE_PRESETS = [
  "Tall Boom",
  "Short Boom",
  "Straight Stand",
  "Disk Base",
  "Rim Clip",
  "Boundary / Internal",
  "Direct Box",
  "Claw",
];

/** Monitor / output destination type (industry terms, keep English). */
export const OUTPUT_GEAR_PRESETS = ["Wedge", "IEM RF"];

export function suggestGearForSource(label, kind = "input") {
  if (kind === "output") {
    return {
      groupLabel: "Outputs",
      matched: false,
      options: [...OUTPUT_GEAR_PRESETS],
      packValue: OUTPUT_GEAR_PRESETS.slice(0, 3).join(", "),
    };
  }

  const source = String(label || "").trim();
  const hit = INSTRUMENT_GEAR_HINTS.find((item) => item.match.test(source));
  if (hit) {
    return {
      groupLabel: hit.label,
      matched: true,
      options: [...hit.options],
      packValue: hit.options.join(", "),
    };
  }

  return {
    groupLabel: "Common",
    matched: false,
    options: [...DEFAULT_MIC_PRESETS],
    packValue: DEFAULT_MIC_PRESETS.slice(0, 4).join(", "),
  };
}

export const emptyTechChannel = (kind = "input") => ({
  kind,
  label: "",
  gear: "",
  cable: "",
  hardware: "",
  phantom48v: false,
  pad: false,
  stereo: false,
  isEmpty: false,
  levelDb: null,
  notes: "",
});
