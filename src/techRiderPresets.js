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

export const OUTPUT_GEAR_PRESETS = [
  "Sennheiser IEM G4",
  "Shure PSM1000",
  "dB Technologies Wedge",
  "QSC K12.2",
  "In-Ear Transmitter",
  "Active Wedge",
];

export const emptyTechChannel = (kind = "input") => ({
  kind,
  label: "",
  gear: "",
  cable: "",
  hardware: "",
  phantom48v: false,
  pad: false,
  stereo: false,
  levelDb: null,
  notes: "",
});
