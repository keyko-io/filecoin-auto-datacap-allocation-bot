export const newAllocationRequestComment = (
    address: string,
    lastDatacapAllocated: string,
    dataCapRemaining: string,
    msigAddress: string,
    requestNumber: number
    //other data
): string => {
    // #### Remaining dataCap\r> ${dataCapRemaining}\r
    return `
## DataCap Allocation requested\r\n
### Request number ${requestNumber + 1}
#### Multisig Notary address\r\n> ${msigAddress}\r\n
#### Client address\r\n> ${address}\r\n
#### DataCap allocation requested\r\n> ${lastDatacapAllocated}`
}

export const statsComment = (
    msigAddress: string,
    address: string,
    topProvider: string,
    nDeals: string,
    previousDcAllocated: string,
    dcAllocationRequested: string,
    nStorageProviders: string,
    remainingDatacap: string,
    actorAddress: string,
    githubHandles: string[],
    totalDcGrantedForClientSoFar: string,
    totaldDcRequestedByClient: string,
    deltaTotalDcAndDatacapGranted:string,
    rule:string
): string => {
    return `\r## Stats & Info for DataCap Allocation
    \r#### Multisig Notary address\r\n> ${msigAddress}
    \r#### Client address\r\n> ${address} \r\n
    \r#### Last two approvers\r\n> **${githubHandles[0] ? githubHandles[0] : 'not found'}** & **${githubHandles[1] ? githubHandles[1] : 'not found'}** \r\n
    \r#### Rule to calculate the allocation request amount\n> ${rule}
    \r#### DataCap allocation requested\n> ${dcAllocationRequested}
    \r#### Total DataCap granted for client so far\n> ${totalDcGrantedForClientSoFar}
    \r#### Datacap to be granted to reach the total amount requested by the client (${totaldDcRequestedByClient})\n> ${deltaTotalDcAndDatacapGranted}
    \r#### **[Stats](https://filplus.d.interplanetary.one/clients?filter=${actorAddress} "Go to stats")**
| Number of deals  | Number of storage providers | Previous DC Allocated  |  Top provider | Remaining DC
|---|---|---|---|---|
| ${nDeals}  | ${nStorageProviders}  |  ${previousDcAllocated} | ${topProvider}  | ${remainingDatacap}
    `
}


export const multisigApprovalComment = (address: string, dataCap: string): string => {
    return `\r\n## Request Approved\r\n#### Address\r\n> ${address}\r\n#### Datacap Allocated\r\n> ${dataCap}\r\n`
}