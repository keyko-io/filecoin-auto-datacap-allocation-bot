export type SpreadsheetData = {
    //TODO update verifiet tools
    issueNumber: string;
    clientName?: string; //from body
    clientAddress?: string; //from body
    msigAddress?: string; //from body
    totalDataCapRequested?: string; //from body
    weeklyDataCapRequested?: string; //from body
    numberOfRequests?: string; //from body
    status?: string;
    region?: string; //from body
    author?: string;
    title?: string;
    isOpen?: string;
    assignee?: string;
    created_at?: string;
    updated_at?: string;
    closed_at?: string;
};

export type IssueInfo = {
    issueNumber: number;
    msigAddress: string;
    address: string;
    actorAddress: string;
    dcAllocationRequested: string;
    remainingDatacap: string;
    previousDcAllocated?: string;
    nDeals?: string;
    nStorageProviders?: string;
    verifierAddressId?: string;
    verifierName?: string;
    clientName?: string;
    topProvider?: string;
    lastTwoSigners?: string[];
    totalDcGrantedForClientSoFar?: string;
    totaldDcRequestedByClient?: string;
    deltaTotalDcAndDatacapGranted?: string;
    rule?: string;
};

export interface ParseRequest {
    approvedMessage: boolean;
    correct: boolean;
    address: string;
    datacap: string;
    signerAddress: string;
    message: string;
    errorMessage: string;
    errorDetails: string;
}
