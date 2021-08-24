export const newAllocationRequestComment = (
    address: string,
    lastDatacapAllocated: string,
    dataCapRemaining: string,
    msigAddress: string
    //other data
): string => {
    // #### Remaining dataCap\r> ${dataCapRemaining}\r
    return `
## DataCap Allocation requested\r\n
#### Multisig Notary address\r\n> ${msigAddress}\r\n
#### Client address\r\n> ${address}\r\n
#### DataCap allocation requested\r\n> ${lastDatacapAllocated}`
}

export const statsComment = (
            msigAddress: string,
            address: string,
            clientName: string,
            notaryId: string,
            notaryName: string,
            topProvider: string,
            nDeals: string,
            previousDcAllocated: string,
            dcAllocationRequested: string,
            nStorageProviders: string,
    //other data
    ): string => {
    // \r#### Notary address\r\n> ${notaryId}
    // \r#### Notary name\r\n> ${notaryName}
    // \r#### Client name\r\n> ${clientName} \r\n
    return `\r## Stats for DataCap Allocation
    \r#### Multisig Notary address\r\n> ${msigAddress}
    \r#### Client address\r\n> ${address} \r\n
    \r#### DataCap allocation requested\n> ${dcAllocationRequested}
    \r#### Stats
| Number of deals  | Number of storage providers | Previous DataCap Allocated  |  Top provider |
|---|---|---|---|
| ${nDeals}  | ${nStorageProviders}  |  ${previousDcAllocated} | ${topProvider}  |
    `
}

