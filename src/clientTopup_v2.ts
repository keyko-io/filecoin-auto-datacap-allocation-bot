import { config } from "./config";
import { bytesToiB, anyToBytes, findClient, getApiClients, getDeltaDcAndDcGranted, getTotalDcGrantedSoFar, getGithubHandlesForAddress, calculateTotalDcGrantedSoFar, calculateAllocationToRequest } from "./utils";
import { newAllocationRequestComment_V2, statsComment_v2 } from "./comments";
import {
  parseReleaseRequest,
  parseApprovedRequestWithSignerAddress,
  parseIssue,
} from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import axios from "axios";
import { EVENT_TYPE, MetricsApiParams } from "./Metrics";
import { logGeneral, logWarn, logDebug, logError } from './logger/consoleLogger'
import { checkLabel } from "./utils";
import { NodeClient, ParseRequest } from "./types";
import OctokitInitializer from "./initializers/OctokitInitializer";
import ApiInitializer from "./initializers/ApiInitializer";
const { callMetricsApi, } = require("@keyko-io/filecoin-verifier-tools/metrics/metrics");

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const api = ApiInitializer.getInstance()
const octokit = OctokitInitializer.getInstance()



/***
 * @TODO testProduction 
 */

/**
 * @info that's the refactored version of clientTopup
 * @returns postRequests and postStats
 */
export const clientsTopup_v2 = async () => {
  try {
    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot started - check issues and clients DataCap.`)

    const apiClients = await getApiClients()

    let issuez = await getIssuez();

    const nodeClientz = await getNodeClients()

    //match issues in repo with same address.
    // if a client has 0 dc, it is not retrieved by getNodeClients
    // so I should find a way to include also issues with at least 1 allocation.... 
    const match = matchGithubAndNodeClients(issuez, nodeClientz, apiClients)

    // find the history of allocation for each issue
    // find the last request 
    const issuesAndCommentz = await matchIssuesAndComments(match)

    // check if each issue deserve a new request
    const issuesAndMargin = checkPostNewRequest(issuesAndCommentz);


    // calculate how much dc should be allocated
    const issuesAndNextRequest = matchIssuesAndNextRequest(issuesAndMargin)

    //posts all the requests
    const postRequestz = (await postRequestComments(issuesAndNextRequest)).filter((i: any) => i.status === 'fulfilled').map((i: any) => i.value)

    //should post stats comments
    const postStatz = await postStatsComments(issuesAndNextRequest, apiClients)


    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot ended.`);
    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot issues commented: ${postRequestz.length ? postRequestz.length : 0}`)
    if (postRequestz.length)
      logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot - issues numbers: ${postRequestz.map((i: any) => i.issue_number)}`);

    return {
      postRequestz,
      postStatz
    }

  } catch (error) {
    console.log("error listing the issues, generic error in the bot", error)
  }
}

/**
 * 
 * @returns filtered issues from github
 */
export const getIssuez = async () => {
  try {
    let issuez = await octokit.paginate(octokit.issues.listForRepo, {
      owner,
      repo,
      state: "open",
    });

    //need to filter issues by label 
    //need to see what issue already had an allocation request
    issuez = issuez.filter((issue: any) => !checkLabel(issue).skip);
    logGeneral(`${config.logPrefix} 0 Issues fetched: ${issuez.length}`)
    return issuez;
  } catch (error) {
    console.log(error)
  }
}

// get verified clients from the node
export const getNodeClients = async (): Promise<NodeClient[]> => {
  try {
    let nodeClients = await api.listVerifiedClients()

    nodeClients = await Promise.all(
      nodeClients.map((client: any) => new Promise<any>(async (resolve, reject) => {
        try {
          resolve({
            idAddress: client.verified,
            address: await api.cachedActorKey(client.verified),
            datacap: client.datacap
          })
        } catch (error) {
          reject(error)
        }
      })
      ))
    return nodeClients

  } catch (error) {
    console.log(error)
  }
}

/** 
 * @returns info from issue + info from node
 * @edgeCase it retrieves the client from the dmob api if it has 0 dc 
 */
export const matchGithubAndNodeClients = (issues: any[], nodeClients: NodeClient[], apiClients: any) => {
  const parsedIssues = issues.filter((i: any) => parseIssue(i.body).correct)
    .map((i: any) => {
      return {
        parsed: parseIssue(i.body),
        number: i.number
      }
    })

  let match = []

  for (let i of parsedIssues) {
    for (let n of nodeClients) {

      if (n.address === i.parsed.address || n.idAddress === i.parsed.address) {

        match.push(
          {
            ...i,
            ...n
          }
        )
        // continue
      }
      else {
        //edge case
        logWarn(`${config.logPrefix} ${i.number} - It looks like the client has 0B datacap remaining.`)
        const dmobClient = findClient(apiClients, i.parsed.address)
        if (dmobClient) {
          match.push(
            {
              ...i,
              idAddress: dmobClient.addressId,
              address: dmobClient.address,
              datacap: dmobClient.allowance
            })
        }

      }
    }
  }
  return match

}

/**
 * 
 * @param match 
 * @returns issues matched with all its comments
 */
export const matchIssuesAndComments = async (match: any[]) => {
  return await Promise.all(
    match.map((issue: any) => new Promise<any>(async (resolve, reject) => {
      try {
        const comments = await octokit.paginate(octokit.rest.issues.listComments,
          {
            owner,
            repo,
            issue_number: issue.number,
          });

        const requests = comments.filter(
          (c: any) => parseReleaseRequest(c.body).correct
        ).map((c: any) => parseReleaseRequest(c.body))

        const lastRequest = requests[requests.length - 1]

        issue.comments = comments
        issue.numberOfRequests = requests.length
        issue.lastRequest = lastRequest
        issue.requests = requests

        resolve({
          issue
        });
      } catch (error) {
        reject(error);
      }
    }))
  );
}

/**
 * 
 * @param issues 
 * @returns issue with amountToRequest object
 */
export const matchIssuesAndNextRequest = (issues: any[]) => {
  const issuesAndNextRequest = []
  for (let elem of issues) {
    console.log(elem)
    if (elem.postRequest) {
      const requestNumber = elem.issue.numberOfRequests
      const totalDcGrantedForClientSoFar = calculateTotalDcGrantedSoFar(elem)
      const totaldDcRequestedByClient = anyToBytes(elem.issue.parsed.datacapRequested)
      const weeklyDcAllocationBytes = anyToBytes(elem.issue.parsed.dataCapWeeklyAllocation)
      const amountToRequest = calculateAllocationToRequest(requestNumber, totalDcGrantedForClientSoFar, totaldDcRequestedByClient, weeklyDcAllocationBytes, elem.issue.number)
      elem.amountToRequest = amountToRequest
      issuesAndNextRequest.push(elem)
    }
  }
  return issuesAndNextRequest
}

// export const calculateTotalDcGrantedSoFar = (issue: any) => {
//   const dc = issue.issue.requests.reduce((acc: any, el: any) => acc + anyToBytes(el.allocationDatacap), 0)
//   return dc
// }

// export const calculateAllocationToRequest = (
//   requestNumber: number,
//   totalDcGrantedForClientSoFar: number,
//   totaldDcRequestedByClient: number,
//   weeklyDcAllocationBytes: number,
//   issueNumber: any
// ) => {
//   logDebug(`${config.logPrefix} ${issueNumber} weekly datacap requested by client: ${bytesToiB(weeklyDcAllocationBytes)} ${weeklyDcAllocationBytes}B`)

//   logDebug(`${config.logPrefix} ${issueNumber} total datacap requested by client: ${bytesToiB(totaldDcRequestedByClient)}, ${totaldDcRequestedByClient}B`)


//   let nextRequest = 0;
//   let rule = ""
//   let condition = true
//   switch (requestNumber) {
//     case 0: //1nd req (won't never happen here :) - 50%
//       condition = weeklyDcAllocationBytes / 2 <= totaldDcRequestedByClient * 0.05
//       nextRequest = condition ? weeklyDcAllocationBytes / 2 : totaldDcRequestedByClient * 0.05;
//       rule = condition ? `50% of weekly dc amount requested` : `5% of total dc amount requested`
//       break;
//     case 1: //2nd req - 100% of the amount in the issue
//       condition = weeklyDcAllocationBytes <= totaldDcRequestedByClient * 0.1
//       nextRequest = condition ? weeklyDcAllocationBytes : totaldDcRequestedByClient * 0.1;
//       rule = condition ? `100% of weekly dc amount requested` : `10% of total dc amount requested`
//       break;
//     case 2: //3rd req - 200% of the amount in the issue
//       condition = weeklyDcAllocationBytes * 2 <= totaldDcRequestedByClient * 0.2
//       nextRequest = condition ? weeklyDcAllocationBytes * 2 : totaldDcRequestedByClient * 0.2;
//       rule = condition ? `200% of weekly dc amount requested` : `20% of total dc amount requested`
//       break;
//     case 3: //4th req - 400% of the amount in the issue
//       condition = weeklyDcAllocationBytes * 4 <= totaldDcRequestedByClient * 0.4
//       nextRequest = condition ? weeklyDcAllocationBytes * 4 : totaldDcRequestedByClient * 0.4;
//       rule = condition ? `400% of weekly dc amount requested` : `40% of total dc amount requested`
//       break;

//     default:
//       //5th req on - 800% of the amount in the issue
//       condition = weeklyDcAllocationBytes * 8 <= totaldDcRequestedByClient * 0.8
//       nextRequest = condition ? weeklyDcAllocationBytes * 8 : totaldDcRequestedByClient * 0.8;
//       rule = condition ? `800% of weekly dc amount requested` : `80% of total dc amount requested`
//       break;
//   }


//   const sumTotalAmountWithNextRequest = Math.floor(nextRequest + totalDcGrantedForClientSoFar)
//   logDebug(`${config.logPrefix} ${issueNumber} sumTotalAmountWithNextRequest (sum next request + total datcap granted to client so far): ${bytesToiB(sumTotalAmountWithNextRequest)}`)

//   let retObj: any = {}
//   if (sumTotalAmountWithNextRequest > totaldDcRequestedByClient) {
//     logDebug(`${config.logPrefix} ${issueNumber} sumTotalAmountWithNextRequest is higher than total datacap requested by client (${totaldDcRequestedByClient}, requesting the difference of total dc requested - total datacap granted so far)`)
//     nextRequest = totaldDcRequestedByClient - totalDcGrantedForClientSoFar
//   }
//   if (nextRequest <= 0) {
//     logDebug(`${config.logPrefix} ${issueNumber} - seems that the client reached the total datacap request in this issue. This should be checked and closed`)
//     retObj = {
//       amount: 0,
//       rule: 'total dc reached',
//       totalDatacapReached: false
//     }
//     return retObj
//   }


//   logDebug(`${config.logPrefix} ${issueNumber} nextRequest ${bytesToiB(nextRequest)}`)
//   logDebug(`${config.logPrefix} ${issueNumber} allocation rule: ${rule}`)
//   retObj = {
//     amount: bytesToiB(Math.floor(nextRequest)),
//     rule,
//     totalDatacapReached: false
//   }

//   return retObj
// }

/**
 * 
 * @param issuesAndComments 
 * @returns issuesAndComments + postRequest: boolean, margin: number
 */
export const checkPostNewRequest = (issuesAndComments: any[]) => {
  const postRequest = []
  for (let elem of issuesAndComments) {
    elem.postRequest = false
    let margin = 0
    const last = anyToBytes(elem.issue.lastRequest.allocationDatacap)
    const remaining = parseInt(elem.issue.datacap)
    if (remaining && last)
      margin = remaining / last

    if (margin <= 0.25)
      elem.postRequest = true

    elem.margin = margin;
    logGeneral(`${config.logPrefix} ${elem.issue.number} datacap remaining / datacp allocated: ${(margin * 100).toFixed(2)} %`)

    postRequest.push(elem)
  }
  return postRequest
}

/**
 * 
 * @param issuesAndNextRequest 
 * @returns the posted request comments
 * @sends SUBSEQUENT_DC_REQUEST event to dmob
 * @todo test this part: if (elem.amountToRequest.totalDatacapReached) { 
 * @todo test metrics sending 
 */
export const postRequestComments = async (issuesAndNextRequest: any[]) => {
  return await Promise.allSettled(
    issuesAndNextRequest.filter((elem: any) => elem.postRequest)
      .map((elem: any) => new Promise<any>(async (resolve, reject) => {
        try {
          let res: any = {};
          if (elem.amountToRequest.totalDatacapReached) {
            const dcReachedBody = `The issue reached the total datacap requested. This should be closed`
            res.commentResult = await octokit.issues.createComment({
              owner,
              repo,
              issue_number: elem.issue.number,
              body: dcReachedBody,
            })
            await octokit.issues.addLabels({
              owner,
              repo,
              issue_number: elem.issue.number,
              labels: ["issue:TotalDcReached"],
            });
            logGeneral(`${config.logPrefix} ${elem.issue.number}, posted close request comment.`)
            resolve({ res, issue_number: elem.issue.number })
          }


          const body = newAllocationRequestComment_V2(
            elem.issue.address,
            elem.amountToRequest.amount,
            elem.issue.lastRequest.notaryAddress,
            elem.issue.numberOfRequests + 1
          );


          // if (!(process.env.LOGGER_ENVIRONMENT === "test")) {
          res.commentResult = await octokit.issues.createComment({
            owner,
            repo,
            issue_number: elem.issue.number,
            body,
          });

          if (res.commentResult.status === 201) {

            res.removeLabels = await octokit.issues.removeAllLabels({
              owner,
              repo,
              issue_number: elem.issue.number,
            });

            res.addLabels = await octokit.issues.addLabels({
              owner,
              repo,
              issue_number: elem.issue.number,
              labels: ["bot:readyToSign", "state:Approved"],
            });

            //metrics
            res.metrics.params = {
              name:  elem.issue.parsed.name,
              clientAddress: elem.issue.address,
              msigAddress:  elem.issue.lastRequest.notaryAddress,
              amount: elem.amountToRequest.amount,
            } as MetricsApiParams

            res.metrics.call  = await callMetricsApi(
              elem.issue.number,
              EVENT_TYPE.SUBSEQUENT_DC_REQUEST,
              res.metrics.params
            );


          }
          logGeneral(`CREATE REQUEST COMMENT ${config.logPrefix} ${elem.issue.number}, posted new datacap request comment.`)

          resolve({ res, body, issue_number: elem.issue.number });
        } catch (error) {
          reject(error);
        }
      }))
  )
}


export const retrieveLastTwoSigners = (
  issueComments: any,
  issueNumber: number
): string[] => {
  try {
    let requestList: string[] = [];

    let len: number = issueComments.length;

    for (let i = len - 1; i >= 0; i--) {
      if (requestList.length === 2) break;

      const parseRequest: ParseRequest = parseApprovedRequestWithSignerAddress(
        issueComments[i].body
      );

      if (parseRequest.correct) {
        requestList.push(parseRequest.signerAddress);
      }
    }

    return requestList;
  } catch (error) {
    logGeneral(
      `Error, ${config.logPrefix} ${issueNumber}, error retrieving the last 2 signers. ${error}`
    );
  }
}


/**
 * 
 * @param issuesAndNextRequest 
 * @param apiClients 
 * @returns the created stat comments
 */
export const postStatsComments = async (issuesAndNextRequest: any[], apiClients: any) => {
  try {



    const clients = apiClients.data.data;

    //GET NOTARIES FROM JSON
    let notaries: any = await octokit.request(
      `GET ${config.notariersJsonPath}`
    );
    notaries = JSON.parse(notaries.data).notaries;

    //POST STAT COMMENT
    return await Promise.allSettled(issuesAndNextRequest.map((elem: any) => new Promise<any>(async (resolve, reject) => {
      try {

        let client = clients.find((item: any) => item.address === elem.issue.address)

        // const addresses = ['addr1', 'addr2'] // need to make some function for that
        const addresses = retrieveLastTwoSigners(
          elem.issue.comments,
          elem.issue.number
        )
        const githubHandles = getGithubHandlesForAddress(addresses || ['addr1', 'addr2'], notaries)


        const totalDcGrantedForClientSoFar = client ? getTotalDcGrantedSoFar(client) : 1000
        const deltaTotalDcAndDatacapGranted = getDeltaDcAndDcGranted(elem, totalDcGrantedForClientSoFar)

        const content = {
          msigAddress: elem.issue.lastRequest.notaryAddress,
          address: elem.issue.address,
          topProvider: client ? client.topProvider : 'not found',
          nDeals: client ? client.nDeals : 'not found',
          previousDcAllocated: elem.issue.lastRequest.allocationDatacap,
          dcAllocationRequested: elem.amountToRequest.amount,
          nStorageProviders: client ? client.nStorageProviders : 'not found',
          remainingDatacap: bytesToiB(elem.issue.datacap),
          actorAddress: elem.issue.idAddress,
          githubHandles: githubHandles ? githubHandles : ['not found'],
          totalDcGrantedForClientSoFar: client ? bytesToiB(totalDcGrantedForClientSoFar) : 'not found',
          totaldDcRequestedByClient: elem.issue.parsed.datacapRequested,
          deltaTotalDcAndDatacapGranted: client ? bytesToiB(deltaTotalDcAndDatacapGranted) : 'not found', // info.deltaTotalDcAndDatacapGranted,
          rule: elem.amountToRequest.rule
        }

        const body = statsComment_v2(content)

        resolve({
          call: await octokit.issues.createComment({
            owner,
            repo,
            issue_number: elem.issue.number,
            body,
          }),
          content
        })
        logGeneral(`CREATE STATS COMMENT ${config.logPrefix} ${elem.issue.number}, posted new stats comment.`)


      } catch (error) {
        reject(error)
      }
    })
    ))

  } catch (error) {
    logError(error);
  }
}

// export const getTotalDcGrantedSoFar = (client: any) => {
//   const set = new Set();
//   return client.allowanceArray
//     .filter((item: any) => {
//       if (set.has(item.msgCID))
//         return false;
//       set.add(item.msgCID);
//       return true;
//     })
//     .reduce((s: number, item: any) => s + parseInt(item.allowance), 0);
// }

// export const getDeltaDcAndDcGranted = (elem: any, totalDcGrantedForClientSoFar: any) => {
//   return anyToBytes(elem.issue.parsed.datacapRequested) - totalDcGrantedForClientSoFar;
// }

// export const getGithubHandlesForAddress = (addresses: string[], notaries: any) => {
//   return addresses.map(
//     (addr: any) => notaries.find(
//       (nt: any) => nt.ldn_config.signing_address === addr
//     )?.github_user[0]
//   );
// }

// export const getApiClients = async () => {
//   return await axios({
//     method: "GET",
//     url: `${config.filpusApi}/getVerifiedClients`,
//     headers: {
//       "x-api-key": config.filplusApiKey,
//     },
//   });
// }

