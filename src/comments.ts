import { v4 as uuidv4 } from 'uuid';

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

export const newAllocationRequestComment_V2 = (
    address: string,
    amountToRequest: string,
    msigAddress: string,
    requestNumber: number
    //other data
): string => {
    // #### Remaining dataCap\r> ${dataCapRemaining}\r
    return `
## DataCap Allocation requested\r\n
### Request number ${requestNumber}
#### Multisig Notary address\r\n> ${msigAddress}\r\n
#### Client address\r\n> ${address}\r\n
#### DataCap allocation requested\r\n> ${amountToRequest}\r\n
#### Id\r\n> ${uuidv4()}`
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
    deltaTotalDcAndDatacapGranted: string,
    rule: string
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
export const statsComment_v2 = (comment: {
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
    deltaTotalDcAndDatacapGranted: string,
    rule: string
}
): string => {
    return `\r## Stats & Info for DataCap Allocation
    \r#### Multisig Notary address\r\n> ${comment.msigAddress}
    \r#### Client address\r\n> ${comment.address} \r\n
    \r#### Last two approvers\r\n> **${comment.githubHandles[0] ? comment.githubHandles[0] : 'not found'}** & **${comment.githubHandles[1] ? comment.githubHandles[1] : 'not found'}** \r\n
    \r#### Rule to calculate the allocation request amount\n> ${comment.rule}
    \r#### DataCap allocation requested\n> ${comment.dcAllocationRequested}
    \r#### Total DataCap granted for client so far\n> ${comment.totalDcGrantedForClientSoFar}
    \r#### Datacap to be granted to reach the total amount requested by the client (${comment.totaldDcRequestedByClient})\n> ${comment.deltaTotalDcAndDatacapGranted}
    \r#### **[Stats](https://filplus.d.interplanetary.one/clients?filter=${comment.actorAddress} "Go to stats")**
| Number of deals  | Number of storage providers | Previous DC Allocated  |  Top provider | Remaining DC
|---|---|---|---|---|
| ${comment.nDeals}  | ${comment.nStorageProviders}  |  ${comment.previousDcAllocated} | ${comment.topProvider}  | ${comment.remainingDatacap}
    `
}


export const multisigApprovalComment = (address: string, dataCap: string): string => {
    return `\r\n## Request Approved\r\n#### Address\r\n> ${address}\r\n#### Datacap Allocated\r\n> ${dataCap}\r\n`
}