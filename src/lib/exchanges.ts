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
