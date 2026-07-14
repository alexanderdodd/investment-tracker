// Yahoo Finance returns terse exchange codes (e.g. "NMS", "NYQ", "EBS") in a
// quote's `exchangeName`. Map the common ones to human-readable names; fall
// back to the raw code (still informative) for anything unmapped.
const EXCHANGE_NAMES: Record<string, string> = {
  // United States
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NIM: "NASDAQ",
  NAS: "NASDAQ",
  NYQ: "NYSE",
  NYE: "NYSE",
  ASE: "NYSE American",
  PCX: "NYSE Arca",
  BATS: "Cboe BZX",
  BTS: "Cboe BZX",
  PNK: "OTC Markets",
  OTC: "OTC Markets",
  // Europe
  LSE: "London Stock Exchange",
  IOB: "LSE (Intl Order Book)",
  GER: "Xetra",
  FRA: "Frankfurt",
  BER: "Berlin",
  STU: "Stuttgart",
  MUN: "Munich",
  DUS: "Düsseldorf",
  HAM: "Hamburg",
  PAR: "Euronext Paris",
  AMS: "Euronext Amsterdam",
  BRU: "Euronext Brussels",
  LIS: "Euronext Lisbon",
  EBS: "SIX Swiss",
  VTX: "SIX Swiss",
  MIL: "Borsa Italiana",
  MCE: "BME Madrid",
  STO: "Nasdaq Stockholm",
  CPH: "Nasdaq Copenhagen",
  HEL: "Nasdaq Helsinki",
  ICE: "Nasdaq Iceland",
  OSL: "Oslo Børs",
  VIE: "Vienna",
  ATH: "Athens",
  WSE: "Warsaw",
  // Asia-Pacific
  HKG: "Hong Kong",
  TYO: "Tokyo",
  JPX: "Tokyo",
  SHH: "Shanghai",
  SHZ: "Shenzhen",
  KSC: "Korea Exchange",
  KOE: "KOSDAQ",
  TAI: "Taiwan",
  TWO: "Taipei",
  SES: "Singapore",
  ASX: "ASX",
  NSI: "NSE India",
  BSE: "BSE India",
  SET: "Thailand",
  IDX: "Indonesia",
  KLS: "Bursa Malaysia",
  // Americas (ex-US)
  TOR: "Toronto",
  VAN: "TSX Venture",
  CNQ: "Canadian Securities",
  NEO: "Cboe Canada",
  SAO: "B3 (Brazil)",
  BUE: "Buenos Aires",
  MEX: "Mexico",
  SGO: "Santiago",
  // Middle East / Africa
  TLV: "Tel Aviv",
  JNB: "Johannesburg",
  SAU: "Saudi Exchange",
  DFM: "Dubai",
};

/** Human-readable exchange name from a Yahoo `exchangeName` code. */
export function friendlyExchange(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  return EXCHANGE_NAMES[key] ?? code.trim();
}

// Yahoo exchange codes (from search + quote APIs) that sit in the UK/EU/EEA
// region we want to cover. Used to admit European listings that the app
// otherwise skips (search) and to seed the screener sweep universe.
const EUROPEAN_EXCHANGE_CODES = new Set<string>([
  // UK & Ireland
  "LSE", "IOB", "ISE",
  // Germany
  "GER", "FRA", "BER", "STU", "MUN", "DUS", "HAM", "XETRA",
  // Euronext
  "PAR", "AMS", "BRU", "LIS",
  // Switzerland
  "EBS", "VTX", "SWX",
  // Southern Europe
  "MIL", "MCE", "BME",
  // Nordics
  "STO", "CPH", "HEL", "ICE", "OSL",
  // Central/Eastern Europe
  "VIE", "ATH", "WSE", "PRA", "BUD",
]);

// Yahoo ticker suffixes for the same region (e.g. "SHEL.L", "MC.PA", "SAP.DE").
const EUROPEAN_TICKER_SUFFIXES = new Set<string>([
  "L", "IL", "PA", "AS", "BR", "LS", "DE", "F", "BE", "SG", "MU", "DU", "HM",
  "SW", "VX", "MI", "MC", "ST", "CO", "HE", "IC", "OL", "VI", "AT", "WA",
  "PR", "BD", "IR",
]);

/** Whether a Yahoo exchange code belongs to the UK/EU/EEA region we cover. */
export function isEuropeanExchange(code: string | null | undefined): boolean {
  if (!code) return false;
  return EUROPEAN_EXCHANGE_CODES.has(code.trim().toUpperCase());
}

/** Whether a Yahoo ticker's suffix (part after the dot) is a European venue. */
export function isEuropeanTicker(symbol: string | null | undefined): boolean {
  if (!symbol || !symbol.includes(".")) return false;
  const suffix = symbol.split(".").pop()?.trim().toUpperCase();
  return !!suffix && EUROPEAN_TICKER_SUFFIXES.has(suffix);
}
