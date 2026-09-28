/**
 * Master Data Record for Customer + Model + Part Number matching.
 * In manufacturing logbooks, Customer, Model, and Part Number belong to unified reference records.
 */

export interface MasterRecord {
  id: string;
  customer: string;
  model: string;
  partNumber: string;
}

export interface MasterMatchResult {
  matched: boolean;
  record?: MasterRecord;
  finalCustomer: string;
  finalModel: string;
  finalPartNumber: string;
  rawCustomer: string;
  rawModel: string;
  rawPartNumber: string;
  customerScore: number;
  modelScore: number;
  partNumberScore: number;
  compositeScore: number;
  matchReason: string;
  decision: "EXACT_PART_NUMBER" | "MASTER_MATCH" | "NO_RELIABLE_MATCH" | "AMBIGUOUS";
}

/**
 * Default Master Catalog built from verified industrial records.
 * Includes representative models (Nikko Shokai, Epson, YIMM, ADM, etc.)
 */
export const DEFAULT_MASTER_RECORDS: MasterRecord[] = [
  {
    id: "ns-lc521tm-001",
    customer: "NIKKO SHOKAI",
    model: "PACKAGE LABEL LC521TM",
    partNumber: "D026BU001",
  },
  {
    id: "epson-maint-01",
    customer: "EPSON",
    model: "MAINTENANCE BOX",
    partNumber: "C13T04D100",
  },
  {
    id: "epson-lb-01",
    customer: "EPSON",
    model: "LB-01",
    partNumber: "1582967",
  },
  {
    id: "yimm-b65-01",
    customer: "YIMM",
    model: "B65",
    partNumber: "B65-F8356-00",
  },
  {
    id: "yimm-2dp-01",
    customer: "YIMM",
    model: "2DP",
    partNumber: "2DP-F835U-00",
  },
  {
    id: "yimm-b8r-01",
    customer: "YIMM",
    model: "B8R",
    partNumber: "B8R-F1721-00",
  },
  {
    id: "yimm-b74-01",
    customer: "YIMM",
    model: "B74",
    partNumber: "B74-F835V-00",
  },
  {
    id: "adm-kap-01",
    customer: "ADM-KAP",
    model: "D26A",
    partNumber: "D26A-82100",
  },
  {
    id: "adm-sap-01",
    customer: "ADM-SAP",
    model: "D03B",
    partNumber: "D03B-71200",
  },
  {
    id: "hpm-honda-01",
    customer: "HPM",
    model: "HONDA BRIO",
    partNumber: "71101-TG1-T00",
  },
  {
    id: "sim-suzuki-01",
    customer: "SIM",
    model: "ERTIGA",
    partNumber: "71711-68R00",
  },
  {
    id: "mmki-mitsubishi-01",
    customer: "MMKI",
    model: "XPANDER",
    partNumber: "6400G841",
  },
];
