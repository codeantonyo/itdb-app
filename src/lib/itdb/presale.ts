/**
 * QRS pre-sale allowlist — the ONLY source of early-bird eligibility.
 *
 * Built from the six stellar.expert exports Tony supplied on
 * 2026-09-07 (178 unique transactions across the files, two of
 * which were byte-identical duplicates). Nothing here is read from the
 * chain: a wallet gets the bonuses if and only if it appears below.
 *
 * HOW THE AMOUNTS WERE DERIVED — read before trusting them:
 *
 * 1. The exports record manage-buy-offer OPERATIONS, not settled trades.
 *    `qrsPurchased` is therefore what the wallet OFFERED to buy. An
 *    offer that never filled, or filled only partly, overstates it.
 * 2. In each row the amount is the QRS being bought and the price is
 *    XLM per QRS, so xlmSpent = amount x price. The two dust orders
 *    below confirm this reading: taken the other way round one of them
 *    sells 19,999,999,880 XLM, which no account could hold.
 * 3. "updated buy offer <id>" REVISES an existing offer rather than
 *    adding to it, so only the newest state of each offer id counts.
 *    Summing every row instead would count one wallet's single offer six
 *    times over.
 *
 * To correct any figure, edit it here — nothing downstream is cached.
 */

export interface PresaleEntry {
  wallet: string;
  /** XLM committed in the pre-sale */
  xlmSpent: number;
  /** QRS bought in the pre-sale; the x2 drop pays this much again */
  qrsPurchased: number;
  /** How many offers this total came from */
  offers: number;
}

/** Refund paid on pre-sale spend, as a percentage. */
export const PRESALE_REFUND_PCT = 20;

export const QRS_PRESALE: PresaleEntry[] = [
  { wallet: "GAYCIV6WJA2CDQJ4AHDT5WHG7HWSSJR4KZ7NBBH33B5NKXUB2CIZ7MMR", xlmSpent: 1000.01, qrsPurchased: 100001, offers: 1 },
  { wallet: "GALXTMPTMCRJN2HLYWXNCDRWZYR2Y4RJP367XYIF4UOUU6KSCWVMV2JA", xlmSpent: 1000, qrsPurchased: 100000, offers: 4 },
  { wallet: "GDBZRFRRDIHH6GRRIYJDB2NPE32GKUTRP5PLPA33SKXTU7NU3NN7XJD2", xlmSpent: 550.01, qrsPurchased: 55001, offers: 2 },
  { wallet: "GAPKT4JZRRXZULDPODHM4QXJKLVU4Z75KK4JRGIVJL5MIQQBDHPLLMBX", xlmSpent: 517, qrsPurchased: 51700, offers: 1 },
  { wallet: "GCRCL4SQS5Z372AWCESV3MRGETKIBSBEEQVUUOIZV6MVNJOFN4YD436L", xlmSpent: 500, qrsPurchased: 50000, offers: 1 },
  { wallet: "GCDIY7E3RIZPQPW6GRWSGPCYH3YGJKNA6DCVNGDU3OG4QNEX75XGDCI4", xlmSpent: 421, qrsPurchased: 42100, offers: 2 },
  { wallet: "GB6BCARDXF4UHQLCRF35O66OWCPZSGKI6JYYP55S2QTV2P5ML53GVPKW", xlmSpent: 395.01, qrsPurchased: 39501, offers: 6 },
  { wallet: "GASBGWP7BRKEGGVDZAPFKV7ARJ6VTJVMHNIR3AW2KSX66UOTPFPACXFF", xlmSpent: 318, qrsPurchased: 31800, offers: 4 },
  { wallet: "GA6JVEYX7MNFVYEMH3GRYUE47EO3UUAKQXP5DDV7A72ZGYNTKIILX4GS", xlmSpent: 300.02, qrsPurchased: 30002, offers: 2 },
  { wallet: "GBT433SOKNXDR5QYQDXQLN3IQYOXFH3QYTCBIYMBFYZO4FTCI52XAETC", xlmSpent: 300, qrsPurchased: 30000, offers: 1 },
  { wallet: "GCPWGFPGTGX66DCK4UKMFT6GT3LZAEX5VQ5ZXHB2XD5GOH5TRTXSJD5K", xlmSpent: 250.01, qrsPurchased: 25001, offers: 3 },
  { wallet: "GDKNPGVEULCHPNMMBNF7QMJOZXA56CVOSIQUKRNDT7GQKL5BIVY5IGIU", xlmSpent: 250, qrsPurchased: 25000, offers: 1 },
  { wallet: "GAU45FDWXM54GTDH65AF3LIA2T4T2QBG7E3TIF5Q6AOER6NUFFQXZLWG", xlmSpent: 250, qrsPurchased: 25000, offers: 1 },
  { wallet: "GAZPRUMMEVK4U5AJUV3HGX76LTAG7SFRUTKGGL4MTO7MLDQM6RJ4KX4M", xlmSpent: 212, qrsPurchased: 21200, offers: 2 },
  { wallet: "GBARVDAU6T3VEH6VVNAJIRJIBN4LM3YPPTBHWJKHOBUVFQ2RMY2WOULO", xlmSpent: 200, qrsPurchased: 20000, offers: 1 },
  { wallet: "GCBDXLI6VD4O5K2RG46IEYQWDXHUSMKGRDFV7F4ZONMITCMAYY5DKE2Z", xlmSpent: 200, qrsPurchased: 20000, offers: 1 },
  { wallet: "GDCMAUFRBDPWKSMAJKZ45ED7ELS2LPE7DRB455GCUWBGZNZSTWBVYT5P", xlmSpent: 200, qrsPurchased: 20000, offers: 2 },
  { wallet: "GCX2B7MTBS2GWE3NMRWRQY6MNQBIYF4CYTQUUZP5WW2VT4MYQCSKHAK5", xlmSpent: 180, qrsPurchased: 18000, offers: 1 },
  { wallet: "GBKRGVIBY6XVSZWWDKPH4N42E73OAMO3ILNBRLIPQ4SLMRXJZXO37CQO", xlmSpent: 175, qrsPurchased: 17500, offers: 2 },
  { wallet: "GAXFZWERLHINARJ7XW57WP27ZGCOGG3CFZ5EOEEOFBQRN7EB2IH3ZNTV", xlmSpent: 175, qrsPurchased: 17500, offers: 2 },
  { wallet: "GA7VNSN3QKBIITOV3JZETZOOMYXDB4YNOWUXDNHDAE7LFUJQC4RYCXCY", xlmSpent: 170, qrsPurchased: 17000, offers: 1 },
  { wallet: "GBOX6ONQRR7HD6GF4IMNZJYBZ4KAVYTJDDL7AQMDV4JXDAKNGZYIW3EY", xlmSpent: 167.07, qrsPurchased: 16707, offers: 2 },
  { wallet: "GCXJZ4HWZEZLPN3FORTH6RSLBVK4MKZ2Q22SVA7DDDMJEIZXWBIZW6J3", xlmSpent: 152, qrsPurchased: 15200, offers: 2 },
  { wallet: "GAD5Y7S5ODTMBIM5DMEJUVCQKXSGC7WWO6TS4PETROS4CY53JWSXOZYD", xlmSpent: 151, qrsPurchased: 15100, offers: 2 },
  { wallet: "GAWGQX77TERXWXCRRL2V2APWIJLK3HRAQFDWZCLQR7SEDGITVDZ3GKSJ", xlmSpent: 151, qrsPurchased: 15100, offers: 1 },
  { wallet: "GA5KU277PA37R3UM7MU7RDTAEBSKZMXHD3TRUBGRF6JWF4WMEU37K4K2", xlmSpent: 150.01, qrsPurchased: 15001, offers: 2 },
  { wallet: "GC5KPTQLDGM3Q2S3AHMTG5XT2Q53TGZVD5YQ3P5H2KLE23TOQHEQQBIT", xlmSpent: 150, qrsPurchased: 15000, offers: 3 },
  { wallet: "GCSLFMJOEKWAW3XZD3GTVLMNJVQKQOCRCG6HLG3YTLXMM7SWZGA5DCCM", xlmSpent: 145, qrsPurchased: 14500, offers: 2 },
  { wallet: "GAH3DHVLVSPAPXBZZOG6EKB3RJ2QNXC3X223QSUDO7R3U5U53UGCZ4NR", xlmSpent: 125.51, qrsPurchased: 12551, offers: 2 },
  { wallet: "GAPSAF4ZAHRH2NIFLBWWPGG7JC5BODR3YOKKYFS5H74CAQBHWMRNXXRH", xlmSpent: 125, qrsPurchased: 12500, offers: 2 },
  { wallet: "GAOGAU37JH55EFANDDZ2IPPPCUG5ISFIEV55PGGX75ZVPNHDXLQVRNE4", xlmSpent: 125, qrsPurchased: 12500, offers: 1 },
  { wallet: "GDEAZKJDKE73UMBCP6HK6S3CJPHS26WGOWTKCC5QERPVIWHTHZX432UZ", xlmSpent: 120, qrsPurchased: 12000, offers: 2 },
  { wallet: "GDIGAWQ5FOHNZDMWH3TATQK5GINXXKFDWXX7IVZPMPHBQRFQBGXDAF7I", xlmSpent: 120, qrsPurchased: 12000, offers: 2 },
  { wallet: "GAZHNTEEYTEVGVJZMNYWZ4RK3N7WVOJS3SHJAMEGR52EEMIEXBB32OKE", xlmSpent: 253, qrsPurchased: 11620, offers: 3 },
  { wallet: "GDUMARXV5O23ZDCKIGOXLAJA3NT6T4ZBBBYT7OPYOF36HFSMTTW6A7U7", xlmSpent: 112.51, qrsPurchased: 11251, offers: 2 },
  { wallet: "GC3YXMC3GQRNZ6JNFZWDWI2YWA2S2EASQ3AOPGLJTYEP26V46AP7N6SB", xlmSpent: 111, qrsPurchased: 11100, offers: 3 },
  { wallet: "GAI6RDIJDMFSREVQEQIE77XMBCY3EY4MFE5ALNAXR562QIHLO7V4M5W6", xlmSpent: 110.01, qrsPurchased: 11001, offers: 3 },
  { wallet: "GC4CMPTHK7KVJYAWKGFYLJGB45BFKWAAOHAEVESFNNFYVSIPMH2FUYAS", xlmSpent: 110, qrsPurchased: 11000, offers: 2 },
  { wallet: "GCXXY6VJHIELM4U77TAOBE4EFOMB73SLMIS5YK5NZ5MP45ZM4X7R3VSL", xlmSpent: 110, qrsPurchased: 11000, offers: 2 },
  { wallet: "GCLAAFNZGC5GHTNFIFOO4FGAUVTI7IPQTEBSDEQTLCRM65XPXSFJOH6U", xlmSpent: 105.67, qrsPurchased: 10567, offers: 1 },
  { wallet: "GCUWDELFGHMRC43M5675L562NC2TPM3PZIPQYISTR5FISL2E7RX6H4ZB", xlmSpent: 204, qrsPurchased: 10302, offers: 2 },
  { wallet: "GAVJECDRSFDNBICHTLNYRPSK74TBGTKBFJUVBWX2IU7KBNTVJD6V24NI", xlmSpent: 102, qrsPurchased: 10200, offers: 2 },
  { wallet: "GDAH3236WQVXAUYDGFAV2XVBZVPG2TMFCY2GJ5DUFS25EMCU7SE5U5TI", xlmSpent: 101.22, qrsPurchased: 10122, offers: 3 },
  { wallet: "GAD7PSYQCS57VQIBJFWE2LQC2MYKDRHFG242KYZH2Q22V6BLRXE2XKJ6", xlmSpent: 101, qrsPurchased: 10100, offers: 1 },
  { wallet: "GAHWMWG4BP3AXFLB7KYMEDHZCE4YKQSOI5Z2SUTGLYJVN4CD3NFEL4W5", xlmSpent: 101, qrsPurchased: 10100, offers: 1 },
  { wallet: "GAK3RM5RZ4XRQVYE3YUOUICUN4ITET25VKEBINHUD5JSKLBJVMBWZU2M", xlmSpent: 101, qrsPurchased: 10100, offers: 1 },
  { wallet: "GBGEFMVHGSDOVEPWR2WDCCWEBX6SIFA3WVSLTSTIEPL2BUGM46GDWGCL", xlmSpent: 100.56, qrsPurchased: 10056, offers: 2 },
  { wallet: "GBJ3QPYA23M3ERQOGJSMJLNGVWOQZFKANVGYFMDRMTAG5N3NGK7DRWUM", xlmSpent: 100.1, qrsPurchased: 10010, offers: 1 },
  { wallet: "GALQNP2WQPVMRMC7YS2U5VSJTHFI3QPYDO4RF4BZS44AYTBOMKISFUUJ", xlmSpent: 100.09, qrsPurchased: 10009, offers: 1 },
  { wallet: "GCCAV6ZAFBWF2EJ5VWOU64RCKHIUSHAXSBZIVVSUGCTHZS43YTZ4LHAB", xlmSpent: 100.055, qrsPurchased: 10005.5, offers: 2 },
  { wallet: "GB3YJGLOGDFXWVVRSNBQFICNRVN7XZNCTTNZ5JZROPKKPZRRFEN6RW7O", xlmSpent: 100.01, qrsPurchased: 10001, offers: 1 },
  { wallet: "GBYQG3KIRFN42UFL7TFS4HGPZUBI72WF6WO33LD6ZCOYATNY46IGTK7V", xlmSpent: 100.01, qrsPurchased: 10001, offers: 2 },
  { wallet: "GCBNKYRZZ4YWEHOA335RJKVWEIACQ5FLPV64QEN7ZODCFX6OK4ZVWPSZ", xlmSpent: 100, qrsPurchased: 10000, offers: 1 },
  { wallet: "GDZANTE2ZXNID5AX4YWU4HJCSFJGZTQWFSMHNLWWHIDI7ABIVHFZNMDX", xlmSpent: 100, qrsPurchased: 10000, offers: 1 },
  { wallet: "GCEMX7BQBVDKIMNVZFNPUHWAHT2AJVH7FVGYCJR7SVQSWIF3FNNCPHBP", xlmSpent: 100, qrsPurchased: 10000, offers: 1 },
  { wallet: "GAWCFS3HRBIEVQSBAOCYHA6EXDA5TXGX3OA6I6D3TLUTVJPZEZ5DMRBD", xlmSpent: 100, qrsPurchased: 10000, offers: 1 },
  { wallet: "GAFEJAEG2EIAWOYABTSQNN5O5WGYO7I76THTNVTJUXM7Q24HJCNBYYYY", xlmSpent: 100, qrsPurchased: 10000, offers: 1 },
  { wallet: "GDHEJ6SL5ZOFKGX6LMOSC3T3GEJ26XZC4G4VMDAYHMWCWPFESME4EBZ6", xlmSpent: 100, qrsPurchased: 10000, offers: 1 },
  { wallet: "GCHLZ3TZ5GVIPYI3FNQC5WO2WRGT3HT56TCQEBCIQ22MWYICTWRNEIAQ", xlmSpent: 100, qrsPurchased: 10000, offers: 1 },
  { wallet: "GDZIQOWI6FEJLPKYQCMKT7MQX7DI2ND3XOGQ65NYSQ74JBI4JZN3UMPA", xlmSpent: 100, qrsPurchased: 10000, offers: 1 },
  { wallet: "GBFZKPP7AXVQFWMPE4VNU6WM4RUIADK4WF4FPV46GTMY34CASCX6EZJG", xlmSpent: 99, qrsPurchased: 9900, offers: 1 },
  { wallet: "GCNNBP3XLGRKOFJCZF3PT3ZN3VHYWH7PJP4UQ3V2RPKV4TCIHGCTCS4K", xlmSpent: 81, qrsPurchased: 8100, offers: 2 },
  { wallet: "GBS3KP6P66XMXKQEEZRG5SEQDM5PXCOTDBOGM6WKQ4MZMXLVHFTMWD5L", xlmSpent: 70, qrsPurchased: 7000, offers: 1 },
  { wallet: "GBPNCH5NZWI5PDQBWQE5H46RZ6LEDLYDOZ4FJLI6FKMBPHMR7TMQ7TTA", xlmSpent: 40.01, qrsPurchased: 6701, offers: 3 },
  { wallet: "GDU3DSI2LQ6YQHVATDDXLHHHWONEHUT6VVJCHLTNJU6PLMXGHQTAUFHJ", xlmSpent: 55, qrsPurchased: 5500, offers: 2 },
  { wallet: "GBTRUGNWRDEUBMDXUA2VDRJZGUUGGKU6DBKNO7ZG6Z7A4NX7VN5RP6J2", xlmSpent: 50.17, qrsPurchased: 5017, offers: 1 },
  { wallet: "GBMRDM57KLV4YD4BGHNG7CFRO7XJHQEHSZUBBAHQVITSJ4JSAKFA4DBS", xlmSpent: 50.1, qrsPurchased: 5010, offers: 1 },
  { wallet: "GDVZHZOSNVN3OT4R63A34WCEOZXH35W5AAUGMK3M7V23545EV4PBL7DI", xlmSpent: 50.02, qrsPurchased: 5002, offers: 1 },
  { wallet: "GDDAJF3J4PD5AGPJNUPNY7NV7TDD2TOIMTTYSSNWWD44DNVOMUV2RY7H", xlmSpent: 50.01, qrsPurchased: 5001, offers: 2 },
  { wallet: "GAD5ORA77WUL7DPPBTYPCUSTRGNVOYY7JNPJSQYP2OOEZF24GZGAFEY7", xlmSpent: 50, qrsPurchased: 5000, offers: 1 },
  { wallet: "GAVYLWG3J7KJV3TELV27G2BDB3HHSF3MTMO3ZBGOAYRGO47EOV3OECF3", xlmSpent: 50, qrsPurchased: 5000, offers: 1 },
  { wallet: "GBPMGIP4HNY7VBO7ZT5PAKC4XNWAM5G7LV2WQ2XXREMK2HRRMDKAWIFK", xlmSpent: 50, qrsPurchased: 5000, offers: 1 },
  { wallet: "GDHNUZRUPEGSRXNGGGINW4EOM5Z3RLBLKS6UGFZFEZOSOD7TPYK2PIO2", xlmSpent: 50, qrsPurchased: 5000, offers: 1 },
  { wallet: "GDQ6BZR5KKYIMJMJOOHAJCR2YRAAH6S7QZCLRHF2W6QHVA3PIDTFQRN4", xlmSpent: 38, qrsPurchased: 3800, offers: 1 },
  { wallet: "GDFXKTSM3HLYV472SYFU5BBDZBXG57OVYQPR57LYHOUA6NAAXHIYZJ3V", xlmSpent: 34, qrsPurchased: 3400, offers: 1 },
  { wallet: "GDKNOY2M7Y5PHV2DVDNNZP7JAYIAN3TR563WM62J3OUPZIEY723VHWZN", xlmSpent: 27, qrsPurchased: 2700, offers: 4 },
  { wallet: "GDZJMUXYEODW5MZ7LDQWETSJIKVQ3SROOSSJXNRHSZEW43SGANCZNJ6M", xlmSpent: 23, qrsPurchased: 2300, offers: 2 },
  { wallet: "GAH7BF7JYSAN6AY7KAMAFMH5MMKHXTYGA5Z524CEO435H43LUNBGLNUL", xlmSpent: 17, qrsPurchased: 1700, offers: 1 },
  { wallet: "GBQJSFAQYKLFVDGPZ3XMRZHMIJ7U5OMJTSMWLM3BHHAP7VMJNMFI2ON3", xlmSpent: 15, qrsPurchased: 1500, offers: 1 },
  { wallet: "GA4D5C3M4K5MHPJURJD2LWEIMOXVRE6A3RDMXHZRQMT5DR4XLBPQUMUD", xlmSpent: 11.11, qrsPurchased: 1111, offers: 1 },
  { wallet: "GA2Y4OOJL2BHOTWPVY3PHD6KK7O56D3TP2LH3FBWKWDDKRSP73FJZ5PY", xlmSpent: 11, qrsPurchased: 1100, offers: 1 },
  { wallet: "GCZ6KA2JSOROVROIVA4MYBXU4L6DDQNAVLIE23MOOIDN7ACMA5IMEHNR", xlmSpent: 11, qrsPurchased: 1100, offers: 3 },
  { wallet: "GABG6GJVE7SO73JMQDBANEDROJLIFFMIXOQF6GPWGXAVHW2FDVUZRPHS", xlmSpent: 11, qrsPurchased: 1100, offers: 1 },
  { wallet: "GBTTKA6GV5VK65YJVN32QTEHJ4RCV4PUV7C56MVIHNDX75FCJRWDHK43", xlmSpent: 10, qrsPurchased: 1000, offers: 1 },
  { wallet: "GBBR5B6AJG4LZFZ33GAU5EKC4WTBCNKUII6IP3UHFQZIQ4W3NFYNOZXE", xlmSpent: 10, qrsPurchased: 1000, offers: 1 },
  { wallet: "GDQ5ISFTIT4LTUOLH35ZVSPDFEA3MJ2ZJ2U5WJBN7GA6EUVXHQRATT5Z", xlmSpent: 10, qrsPurchased: 1000, offers: 1 },
  { wallet: "GBQTTL6XPIX4KGHTXCAQ4QC3GSIRWYEEHAS47ZQI6SALGZ42QFHWI7SN", xlmSpent: 10, qrsPurchased: 1000, offers: 1 },
  { wallet: "GATWZQDFYZRIYAJ5VYUKLO4NLNOIYTDVH4KV2ODTHGEHD4P3LFBJAGKW", xlmSpent: 6, qrsPurchased: 600, offers: 2 },
  { wallet: "GCRQAQ2FFLIVFCP6GPTP3UYLTRQYQOBC3LYEAPE66T7663OBAGIOO27Y", xlmSpent: 5, qrsPurchased: 500, offers: 1 },
  { wallet: "GC4YC3B64NNKLWWVESB32B42OQDTJS3OS4TPMJHX5QBSTNGU3WJH2HMK", xlmSpent: 3, qrsPurchased: 300, offers: 1 },
  { wallet: "GCWZGCHT6FGTZCOH3ECXCX5NEMBSF2C2JVZHIMMK6273AZ2QFXPBRDYG", xlmSpent: 2.52, qrsPurchased: 252, offers: 2 },
  { wallet: "GB5KBA3EXAJW4D5Q6DBXFSAH7UX5IM4DJYW3A6QMHK4RIOHBH3F7XOHB", xlmSpent: 2, qrsPurchased: 200, offers: 1 },
  { wallet: "GAZXOC6S2Y642REPYXDSEFA5C24JTUHCHHS26IGNNPQNA7JOOFF56J5Z", xlmSpent: 2, qrsPurchased: 200, offers: 1 },
  { wallet: "GC52445IQ6RIPOXVIPH7XIGSPCYXCPA3KUAXHW5QBM3ZVPJIJMFNYIR5", xlmSpent: 2, qrsPurchased: 200, offers: 1 },
  { wallet: "GBMAGUANOJQXGUAQ67ZPP24QDX3MYM7HK5M3BFWNIV55LQZAD42ARJT4", xlmSpent: 2, qrsPurchased: 200, offers: 2 },
  { wallet: "GDOGEZ3JGGL6JXEIJETOKT2VNDOLOJ6D3A4NYAMXM3Z34CA6HIMXY7ZN", xlmSpent: 1.5, qrsPurchased: 150, offers: 1 },
  { wallet: "GDLGK5SFGY4I6AMMGPQQWYXXCUV5Z7ZVTB2VGKBQEBFKXFUZKE76YA3H", xlmSpent: 1, qrsPurchased: 100, offers: 1 },
];

/**
 * Wallets in the export that are deliberately NOT paid. Kept visible so
 * the decision is reviewable — move an entry into QRS_PRESALE above to
 * include it.
 */
export const QRS_PRESALE_EXCLUDED: (Omit<PresaleEntry, "offers"> & { reason: string })[] = [
  { wallet: "GCJW7DJIDWNVXRS4WXXMBUJXLPE7HSNE3LYKQPC7ILNGPTHALZHA5JGF", xlmSpent: 9.9999999, qrsPurchased: 19999999880, reason: "offered 19999999880 QRS for only 9.9999999 XLM — a lowball order at 5e-10 XLM/QRS, far under the 0.01 sale price" },
  { wallet: "GBMG5OAWHGHTA6SVAQF3FJ6MN4BI7GYISW44HC33OTFEQMBKYVXQ3Z2R", xlmSpent: 10, qrsPurchased: 100000000, reason: "offered 100000000 QRS for only 10 XLM — a lowball order at 1e-07 XLM/QRS, far under the 0.01 sale price" },
];

const BY_WALLET = new Map(QRS_PRESALE.map((e) => [e.wallet, e]));

export interface PresaleTotals {
  /** The member's wallets that appear in the allowlist */
  wallets: string[];
  xlmSpent: number;
  qrsPurchased: number;
}

/**
 * Pre-sale totals across every wallet a member holds. Returns null when
 * none of them bought — those members must not see the bonuses at all.
 */
export function presaleTotals(wallets: string[]): PresaleTotals | null {
  const hits = [...new Set(wallets)].map((w) => BY_WALLET.get(w)).filter((e) => e != null);
  if (hits.length === 0) return null;
  return {
    wallets: hits.map((e) => e.wallet),
    xlmSpent: hits.reduce((s, e) => s + e.xlmSpent, 0),
    qrsPurchased: hits.reduce((s, e) => s + e.qrsPurchased, 0),
  };
}

/** The XLM owed as the 20% refund. */
export function presaleRefundXlm(totals: PresaleTotals): number {
  return (totals.xlmSpent * PRESALE_REFUND_PCT) / 100;
}
