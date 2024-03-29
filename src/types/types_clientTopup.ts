export type DmobClient = {
  id: number,
  addressId: string,
  address: string,
  retries: 3,
  auditTrail: string,
  name: string,
  orgName: string,
  region: string,
  website: string,
  industry: string,
  initialAllowance: string // '281474976710656',
  allowance: string // '304530361155584', -- REMAINING DATACAP
  verifierAddressId: string, //'f01858410',
  createdAtHeight: number,
  issueCreateTimestamp: any,
  createMessageTimestamp: number //1677829860,
  verifierName: string //'LDN v3 multisig',
  dealCount: any //null,
  providerCount: any // null,
  topProvider: any //null,
  receivedDatacapChange: string // '562949953421312',
  usedDatacapChange: string // '505534830608384',
  allowanceArray: AllowanceArrayElement[]
}

export type AllowanceArrayElement = { // --> sum of it: total datacap granted so far
  id: number // 5160,
  error: string // allocation event not found,
  height: number // 2705021,
  msgCID: string //bafy2bzacecjpejuzmxolhrqxgaa4owf7pmob372stq46zgfaf77dkdck6idwi,
  retries: number// 0,
  addressId: string // f02041788,
  allowance: string //109951162777600,
  auditTrail: string //https://github.com/filecoin-project/filecoin-plus-large-datasets/issues/1538,
  allowanceTTD: any //null,
  usedAllowance: string // 0,
  isLdnAllowance: boolean //true,
  isEFilAllowance: boolean //false,
  verifierAddressId: string //f02049625,
  isFromAutoverifier: boolean // false,
  searchedByProposal: boolean //true,
  issueCreateTimestamp: number //1673055536,
  hasRemainingAllowance: boolean //true,
  createMessageTimestamp: number//1679457030
}

export type StatsComment = {
  msigAddress: string
  address: string
  topProvider: string
  nDeals: string | number
  previousDcAllocated: string | number
  dcAllocationRequested: string
  nStorageProviders: string | number
  remainingDatacap: string | number// bytesToiB(elem.issue.datacap),
  actorAddress: string
  githubHandles: string[]
  totalDcGrantedForClientSoFar: string
  totaldDcRequestedByClient: string 
  deltaTotalDcAndDatacapGranted: string
  rule: string
} 