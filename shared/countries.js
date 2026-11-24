const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AL", "AM", "AO", "AR", "AT", "AU", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BN", "BO", "BR", "BS", "BT", "BW", "BY", "BZ",
  "CA", "CD", "CF", "CG", "CH", "CI", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "ER", "ES", "ET",
  "FI", "FJ", "FM", "FR",
  "GA", "GB", "GD", "GE", "GH", "GM", "GN", "GQ", "GR", "GT", "GW", "GY",
  "HK", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IN", "IQ", "IR", "IS", "IT",
  "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MG", "MH", "MK", "ML", "MM", "MN", "MR", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NE", "NG", "NI", "NL", "NO", "NP", "NR", "NZ",
  "OM",
  "PA", "PE", "PG", "PH", "PK", "PL", "PS", "PT", "PW", "PY",
  "QA",
  "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SY", "SZ",
  "TD", "TG", "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "US", "UY", "UZ",
  "VA", "VC", "VE", "VN", "VU",
  "WS",
  "XK",
  "YE",
  "ZA", "ZM", "ZW",
];

export function countryCodes() {
  return COUNTRY_CODES;
}

const CODE_SET = new Set(countryCodes());

export function isCountryCode(value) {
  return CODE_SET.has(String(value || "").trim().toUpperCase());
}

export function countryName(code, locale = "sr") {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return "";
  try {
    const label = new Intl.DisplayNames([locale === "en" ? "en" : "sr"], { type: "region" }).of(normalized);
    return label || normalized;
  } catch {
    return normalized;
  }
}

/** Serbia first, then the localized name. `search` also matches the English name and the code. */
export function countryOptions(locale = "sr") {
  return countryCodes()
    .map((code) => {
      const label = countryName(code, locale);
      const english = countryName(code, "en");
      return { id: code, label, search: `${label} ${english} ${code}` };
    })
    .sort((a, b) => {
      if (a.id === "RS") return -1;
      if (b.id === "RS") return 1;
      return a.label.localeCompare(b.label, locale === "en" ? "en" : "sr");
    });
}
