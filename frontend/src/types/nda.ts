export interface MutualNdaFields {
  party1Name: string;
  party1Address: string;
  party2Name: string;
  party2Address: string;
  effectiveDate: string;
  purpose: string;
  mndaTerm: string;
  termOfConfidentiality: string;
  governingLaw: string;
  jurisdiction: string;
}

export type NdaFieldKey = keyof MutualNdaFields;

export const EMPTY_NDA_FIELDS: MutualNdaFields = {
  party1Name: "",
  party1Address: "",
  party2Name: "",
  party2Address: "",
  effectiveDate: "",
  purpose: "",
  mndaTerm: "",
  termOfConfidentiality: "",
  governingLaw: "",
  jurisdiction: "",
};
