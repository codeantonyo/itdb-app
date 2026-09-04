/**
 * Curated token registry — the three Stellar assets ITDB displays.
 * Metadata, prices and charts resolve automatically from Horizon + each
 * issuer's stellar.toml (SEP-1) with a StellarExpert fallback. Nothing
 * about price, logo or domain is hard-coded.
 */

export interface RegistryToken {
  code: string;
  issuer: string;
  /** Expected home domain — display hint only; the chain is the source */
  expectedDomain: string;
}

export const ITDB_TOKEN: RegistryToken = {
  code: "ITDB",
  issuer: "GAOMNM2FIHY4KI52DW7UNME4LBZTYFGDH6VKZSWBY77IFZ4HZ7ANITDB",
  expectedDomain: "itdb-qfs.org",
};

export const ITDBONE_TOKEN: RegistryToken = {
  code: "ITDBONE",
  issuer: "GDO4VXPGNHNVAR7SBC33PGO4HEAIO6MIU5TUYHRYSOYSVDXMXOUVEQH3",
  expectedDomain: "itdb-one.org",
};

export const QRS_TOKEN: RegistryToken = {
  code: "QRS",
  issuer: "GD5YLDEYUBJGXEE26WYTTHRWZF4VCSBBCUUKIH5A2UYIZE4VS2NL5QRS",
  expectedDomain: "itdb-qrs.com",
};

export const TOKEN_REGISTRY: RegistryToken[] = [
  ITDB_TOKEN,
  ITDBONE_TOKEN,
  QRS_TOKEN,
];

export const marketUrl = (t: { code: string; issuer: string }) =>
  `https://lobstr.co/trade/${t.code}:${t.issuer}`;

export const explorerUrl = (t: { code: string; issuer: string }) =>
  `https://stellar.expert/explorer/public/asset/${t.code}-${t.issuer}`;

/** Stellar asset type discriminator by code length */
export function assetType(code: string): "credit_alphanum4" | "credit_alphanum12" {
  return code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
}
