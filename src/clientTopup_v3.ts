// import { config } from "./config";
// import { ldnParser } from "@keyko-io/filecoin-verifier-tools"
// import OctokitInitializer from "./initializers/OctokitInitializer";
// import { anyToBytes, calculateAllocationToRequest, checkLabel, getApiClients } from "./utils";
// import { AllowanceArrayElement, DmobClient } from "./types_clientTopup_v3";

// // import { v4 as uuidv4 } from 'uuid';
// const { parseIssue } = ldnParser
// const owner = config.githubLDNOwner;
// const repo = config.githubLDNRepo;
// // const api = ApiInitializer.getInstance()
// const octokit = OctokitInitializer.getInstance()



// /***
//  * @TODO create different phases 
//  */

// /**
//  * @info that's the refactored version of clientTopup
//  * @returns postRequests and postStats
//  */
// export const clientsTopup_v3 = async () => {
//   try {

//     //TODO check data on node and compare to data from dmob to create a sort of alert



//     const dmobClients = await getApiClients()


//     let allOpenGhIssues = await octokit.paginate(octokit.issues.listForRepo, {
//       owner: "filecoin-project",
//       repo: "filecoin-plus-large-datasets",
//       state: "open",
//     });
//     const ghIssuesByLabels = allOpenGhIssues.filter((issue: any) => !checkLabel(issue).skip)



//     //pairing dmob data with issues we got
//     let dmobAndGithubIssues: any = {}
//     //TODO include also addresses from EFIL
    // const MSIG_V3 = "f01858410"
    // const MSIG_V3_1 = "f02049625"
//     console.log("dmobClients.data.data", dmobClients.data.data)

//     //creating the dmobdata+githubbody object for each issue
//     // issuenumber:{dmob, body}[]
//     for (let dmob of dmobClients.data.data) {
//       const d: DmobClient = dmob as unknown as DmobClient
//       let iss
//       if (d.verifierAddressId !== MSIG_V3 && d.verifierAddressId !== MSIG_V3_1) {
//         continue
//       }
//       iss = ghIssuesByLabels.find((issue: any) => issue.body.includes(d.address))
//       if (iss) {
//         const number = iss.number
//         if (dmobAndGithubIssues[`${number}`]) {
//           dmobAndGithubIssues[`${number}`].dmob.allowanceArray = [...d.allowanceArray.filter((a: AllowanceArrayElement) => !a.error)]
//         } else {
//           dmobAndGithubIssues[`${number}`] = { dmob: d, body: iss.body, requestInfo: {} }
//         }
//       }
//     }



//     //get margin
//     const newReqsArray = []
//     for (let issueNumber of Object.keys(dmobAndGithubIssues)) {
//       const dmob: DmobClient = dmobAndGithubIssues[`${issueNumber}`].dmob
//       const body: string = dmobAndGithubIssues[`${issueNumber}`].body

//       // get remaining datacap
//       const remainingDataCap = parseInt(dmob.allowance)

//       // get lastRequest
//       const lastRequest = dmob.allowanceArray.sort()[dmob.allowanceArray.length - 1]

//       //calculate margin
//       let margin = parseInt(lastRequest.allowance) / remainingDataCap
//       if (margin <= 0.25) {
//         //get additional info: datacap request
//         const numberOfAllowancesSoFar = dmob.allowanceArray.length
//         const totalDcGrantedForClientSoFar = dmob.allowanceArray.reduce((acc: any, current: AllowanceArrayElement) => acc += current.allowance, 0)
//         const totaldDcRequestedByClient = anyToBytes(ldnParser.parseIssue(body).datacapRequested)
//         // const weeklyDcAllocationBytes = anyToBytes(ldnParser.parseIssue(body).dataCapWeeklyAllocation)

//         const amountToRequest = calculateAllocationToRequest(numberOfAllowancesSoFar, totalDcGrantedForClientSoFar, totaldDcRequestedByClient, weeklyDcAllocationBytes, issueNumber)
//         // TODO if amountToRequest == totaldDcRequestedByClient post comment totalDC reached

//         // get info: stat comment
//         //msigAddress: setting up 
//         const msigAddress = dmob.verifierAddressId == MSIG_V3 ? MSIG_V3_1 :  dmob.verifierAddressId

//         const statComment = {
//           //  msigAddress: string
//           //   address: string
//           //   topProvider: string
//           //   nDeals: string | number
//           //   previousDcAllocated: string | number
//           //   dcAllocationRequested: string
//           //   nStorageProviders: string | number
//           //   remainingDatacap: string | number// bytesToiB(elem.issue.datacap),
//           //   actorAddress: string
//           //   githubHandles: string[]
//           //   totalDcGrantedForClientSoFar: string
//           //   totaldDcRequestedByClient: string
//           //   deltaTotalDcAndDatacapGranted: string
//           //   rule: string
//         }



//         let requestInfo = { amountToRequest }
//         dmobAndGithubIssues[`${issueNumber}`].requestInfo = requestInfo
//         newReqsArray.push(dmobAndGithubIssues[`${issueNumber}`])
//       } else {
//         //log that the client does not need more Datacap
//       }
//     }

//     //TODO make the requests comments











//   } catch (error) {
//     console.log("error listing the issues, generic error in the bot", error)
//   }
// }

// clientsTopup_v3()

// /**
//  *
//  * @returns filtered issues from github
//  */

// // get verified clients from the node
// // export const getNodeClients = async (): Promise<NodeClient[]> => {
// //   try {
// //     let nodeClients = await api.listVerifiedClients()

// //     nodeClients = await Promise.all(
// //       nodeClients.map((client: any) => new Promise<any>(async (resolve, reject) => {
// //         try {
// //           resolve({
// //             idAddress: client.verified,
// //             address: await api.cachedActorKey(client.verified),
// //             datacap: client.datacap
// //           })
// //         } catch (error) {
// //           reject(error)
// //         }
// //       })
// //       ))
// //     return nodeClients

// //   } catch (error) {
// //     console.log(error)
// //   }
// // }
