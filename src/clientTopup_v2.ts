import { config } from "./config";
import { bytesToiB, anyToBytes,  findClient } from "./utils";
import {  newAllocationRequestComment_V2, statsComment_v2 } from "./comments";
import {
  parseReleaseRequest,
  parseApprovedRequestWithSignerAddress,
  parseIssue,
} from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import axios from "axios";
import { EVENT_TYPE, MetricsApiParams } from "./Metrics";
import { logGeneral, logWarn, logDebug, logError } from './logger/consoleLogger'
import { checkLabel } from "./utils";
import {  NodeClient, ParseRequest } from "./types";
import OctokitInitializer from "./initializers/OctokitInitializer";
import ApiInitializer from "./initializers/ApiInitializer";
const { callMetricsApi, } = require("@keyko-io/filecoin-verifier-tools/metrics/metrics");

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const api = ApiInitializer.getInstance()
const octokit = OctokitInitializer.getInstance()



/***
 * @TODO post request comments <--- DONE
 * @TODO stats comments <---  DONE
 * @TODO testsuite <---  DONE
 * @TODO edge cases : client has 0 datacap <---  DONE
 * @TODO test Clients API (edge case) <---
 * @TODO insert all logs
 * @TODO send all metrics
 * @TODO documenting 
 * 
 * 
 */

export const clientsTopup_v2 = async () => {
  try {


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
    // console.log('commentsForIssue', issuesAndComments)

    // check if each issue deserve a new request
    const issuesAndMargin = checkPostNewRequest(issuesAndCommentz);
    // console.log(issuesAndMargin)


    // calculate how much dc should be allocated
    const issuesAndNextRequest = matchIssuesAndNextRequest(issuesAndMargin)
    // console.log('issuesAndNextRequest',issuesAndNextRequest) 

    //posts all the requests
    const postRequestz = (await postRequestComments(issuesAndNextRequest)).filter((i: any) => i.status === 'fulfilled').map((i: any) => i.value)
    // console.log('triggerRequest', postRequestz)

    //should post stats comments
    const postStatz = await postStatsComments(issuesAndNextRequest, apiClients)
    // console.log('postStatz', postStatz)

    return {
      postRequestz,
      postStatz
    }

  } catch (error) {
    console.log("error listing the issues, generic error in the bot", error)
  }
}

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
    return issuez;
  } catch (error) {
    console.log(error)
  }
}

// get verified clients from the node
export const getNodeClients = async (): Promise<NodeClient[]> => {
  try {
    let nodeClients = await api.listVerifiedClients()
    // console.log(nodeClients)

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
 * 
 * @edgeCase it retrieves the client from the dmob api if it has 0 dc 
 * @todo test edge case
 */
export const matchGithubAndNodeClients = (issues: any[], nodeClients: NodeClient[], apiClients:any) => {
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
        const dmobClient = findClient(apiClients,i.parsed.address)
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

export const calculateTotalDcGrantedSoFar = (issue: any) => {
  const dc = issue.issue.requests.reduce((acc: any, el: any) => acc + anyToBytes(el.allocationDatacap), 0)
  return dc
}

export const calculateAllocationToRequest = (
  requestNumber: number,
  totalDcGrantedForClientSoFar: number,
  totaldDcRequestedByClient: number,
  weeklyDcAllocationBytes: number,
  issueNumber: any
) => {
  logDebug(`${config.logPrefix} ${issueNumber} weekly datacap requested by client: ${bytesToiB(weeklyDcAllocationBytes)} ${weeklyDcAllocationBytes}B`)

  logDebug(`${config.logPrefix} ${issueNumber} total datacap requested by client: ${bytesToiB(totaldDcRequestedByClient)}, ${totaldDcRequestedByClient}B`)


  let nextRequest = 0;
  let rule = ""
  let condition = true
  // const allocation = weeklyDcAllocationBytes <= tenPercentAllocationBytes ? weeklyDcAllocationBytes : tenPercentAllocationBytes;
  // console.log("req number:", requestNumber)
  switch (requestNumber) {
    case 0: //1nd req (won't never happen here :) - 50%
      condition = weeklyDcAllocationBytes / 2 <= totaldDcRequestedByClient * 0.05
      nextRequest = condition ? weeklyDcAllocationBytes / 2 : totaldDcRequestedByClient * 0.05;
      rule = condition ? `50% of weekly dc amount requested` : `5% of total dc amount requested`
      break;
    case 1: //2nd req - 100% of the amount in the issue
      condition = weeklyDcAllocationBytes <= totaldDcRequestedByClient * 0.1
      nextRequest = condition ? weeklyDcAllocationBytes : totaldDcRequestedByClient * 0.1;
      rule = condition ? `100% of weekly dc amount requested` : `10% of total dc amount requested`
      break;
    case 2: //3rd req - 200% of the amount in the issue
      condition = weeklyDcAllocationBytes * 2 <= totaldDcRequestedByClient * 0.2
      nextRequest = condition ? weeklyDcAllocationBytes * 2 : totaldDcRequestedByClient * 0.2;
      rule = condition ? `200% of weekly dc amount requested` : `20% of total dc amount requested`
      break;
    case 3: //4th req - 400% of the amount in the issue
      condition = weeklyDcAllocationBytes * 4 <= totaldDcRequestedByClient * 0.4
      nextRequest = condition ? weeklyDcAllocationBytes * 4 : totaldDcRequestedByClient * 0.4;
      rule = condition ? `400% of weekly dc amount requested` : `40% of total dc amount requested`
      break;

    default:
      //5th req on - 800% of the amount in the issue
      condition = weeklyDcAllocationBytes * 8 <= totaldDcRequestedByClient * 0.8
      nextRequest = condition ? weeklyDcAllocationBytes * 8 : totaldDcRequestedByClient * 0.8;
      rule = condition ? `800% of weekly dc amount requested` : `80% of total dc amount requested`
      break;
  }


  const sumTotalAmountWithNextRequest = Math.floor(nextRequest + totalDcGrantedForClientSoFar)
  logDebug(`${config.logPrefix} ${issueNumber} sumTotalAmountWithNextRequest (sum next request + total datcap granted to client so far): ${bytesToiB(sumTotalAmountWithNextRequest)}`)

  let retObj: any = {}
  if (sumTotalAmountWithNextRequest > totaldDcRequestedByClient) {
    logDebug(`${config.logPrefix} ${issueNumber} sumTotalAmountWithNextRequest is higher than total datacap requested by client (${totaldDcRequestedByClient}, requesting the difference of total dc requested - total datacap granted so far)`)
    // console.log("totaldDcRequestedByClient", totaldDcRequestedByClient)
    // console.log("totalDcGrantedForClientSoFar", totalDcGrantedForClientSoFar)
    nextRequest = totaldDcRequestedByClient - totalDcGrantedForClientSoFar
    // console.log("nextRequest in if", nextRequest)
  }
  if (nextRequest <= 0) {
    logDebug(`${config.logPrefix} ${issueNumber} - seems that the client reached the total datacap request in this issue. This should be checked and closed`)
    retObj = { totalDatacapReached: true }
    return retObj
  }


  logDebug(`${config.logPrefix} ${issueNumber} nextRequest ${bytesToiB(nextRequest)}`)
  logDebug(`${config.logPrefix} ${issueNumber} allocation rule: ${rule}`)
  retObj = {
    amount: bytesToiB(Math.floor(nextRequest)),
    rule,
    totalDatacapReached: false
  }

  return retObj
}

export const checkPostNewRequest = (issuesAndComments: any[]) => {
  const postRequest = []
  for (let elem of issuesAndComments) {
    // console.log(elem.issue)
    elem.postRequest = false
    let margin = 0
    const last = anyToBytes(elem.issue.lastRequest.allocationDatacap)
    const remaining = parseInt(elem.issue.datacap)
    // console.log('last bytes, ib', elem.issue.number, last, elem.issue.lastRequest.allocationDatacap)
    // console.log('remaining bytes, ib', elem.issue.number, elem.issue.datacap, bytesToiB(elem.issue.datacap))
    if (remaining && last)
      margin = remaining / last

    if (margin <= 0.25)
      elem.postRequest = true

    elem.margin = margin;

    postRequest.push(elem)
  }
  return postRequest
}

export const postRequestComments = async (issuesAndNextRequest: any[]) => {
  return await Promise.allSettled(
    issuesAndNextRequest.filter((elem: any) => elem.postRequest)
      .map((elem: any) => new Promise<any>(async (resolve, reject) => {
        try {
          // console.log(
          //   'elem.issue.',
          //   elem.issue
          // )
          const body = newAllocationRequestComment_V2(
            elem.issue.address,
            elem.amountToRequest.amount,
            elem.issue.lastRequest.notaryAddress,
            elem.issue.numberOfRequests + 1
          );

          let res: any = {};
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


          }
          resolve({ res, body });
          // }
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

    let LENGTH: number = issueComments.comments.length;

    for (let i = LENGTH - 1; i >= 0; i--) {
      if (requestList.length === 2) break;

      const parseRequest: ParseRequest = parseApprovedRequestWithSignerAddress(
        issueComments.comments[i].body
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

export const postStatsComments = async (issuesAndNextRequest: any[], apiClients:any) => {
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

        const addresses = ['addr1', 'addr2'] // get this frommm....???
        const githubHandles = addresses.map(
          (addr: any) =>
            notaries.find(
              (nt: any) => nt.ldn_config.signing_address === addr
            )?.github_user[0]
        )

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
          totalDcGrantedForClientSoFar: 'info.totalDcGrantedForClientSoFar', // info.totalDcGrantedForClientSoFar
          totaldDcRequestedByClient: elem.issue.parsed.datacapRequested,
          deltaTotalDcAndDatacapGranted: 'info.totalDcGrantedForClientSoFar', // info.deltaTotalDcAndDatacapGranted,
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

        }
        )

      } catch (error) {
        reject(error)
      }
    })
    ))

  } catch (error) {
    logError(error);
  }
}



async function getApiClients() {
  return await axios({
    method: "GET",
    url: `${config.filpusApi}/getVerifiedClients`,
    headers: {
      "x-api-key": config.filplusApiKey,
    },
  });
}

