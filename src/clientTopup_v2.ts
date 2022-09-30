import { config } from "./config";
import { bytesToiB, anyToBytes, checkRequestAndReturnRequest, commentsForEachIssue } from "./utils";
import { newAllocationRequestComment, statsComment } from "./comments";
import {
  parseReleaseRequest,
  parseApprovedRequestWithSignerAddress,
  parseIssue,
} from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import axios from "axios";
import { EVENT_TYPE, MetricsApiParams } from "./Metrics";
import { logGeneral, logWarn, logDebug, logError } from './logger/consoleLogger'
import { checkLabel } from "./utils";
import { IssueInfo, NodeClient, ParseRequest } from "./types";
import OctokitInitializer from "./initializers/OctokitInitializer";
import ApiInitializer from "./initializers/ApiInitializer";
const { callMetricsApi, } = require("@keyko-io/filecoin-verifier-tools/metrics/metrics");

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const api = ApiInitializer.getInstance()
const octokit = OctokitInitializer.getInstance()

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

/**@todo see if there is somewhere an 'issue' type */
export const matchGithubAndNodeClients = (issues: any[], nodeClients: NodeClient[]): any[] => {
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
      }
    }
  }
  return match
}

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

export const calculateTotalDcGrantedSoFar = (issue: any) => {
  return issue.issue.requests.reduce((acc: any, el: any) => acc + anyToBytes(el.allocationDatacap))
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


  const sumTotalAmountWithNextRequest = nextRequest + totalDcGrantedForClientSoFar
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
    elem.postRequest = false
    let margin = 0
    const last = anyToBytes(elem.issue.lastRequest.allocationDatacap)
    const remaining = parseInt(elem.issue.datacap)

    if (remaining && last)
      margin = remaining / last

    if (margin <= 0.25)
      elem.postRequest = true

    elem.margin = margin;

    postRequest.push(elem)
  }
  return postRequest
}

export const clientsTopup_v2 = async () => {
  try {


    let issues = await octokit.paginate(octokit.issues.listForRepo, {
      owner,
      repo,
      state: "open",
    });

    //need to filter issues by label 
    //need to see what issue already had an allocation request

    issues = issues.filter((issue: any) => !checkLabel(issue).skip)


    // t01005 = t1lxlfkondf4266ofojl3qg2nfjw44mmh7sgmyqna
    // t01019 = t1y6grz7kkjs5wyvg4mp5jqjl3unqt7t5ktqlrf2q
    const nodeClients = await getNodeClients()
    // console.log('clientsAdddress', nodeClients)

    //match issues in repo with same address.
    const match: any[] = matchGithubAndNodeClients(issues, nodeClients)
    // console.log(match)

    // find the history of allocation for each issue
    // find the last request 
    const issuesAndComments = await matchIssuesAndComments(match)
    // console.log('commentsForIssue', issuesAndComments)

    //should check if each issue deserve a new request

    const issuesAndMargin = checkPostNewRequest(issuesAndComments);
    // console.log(issuesAndMargin)

    //I have to try using a client with 0 dc. it is still listed from getNodeClients?
    // should calculate how much dc should be allocated

    const issuesAndNextRequest = matchIssuesAndNextRequest(issuesAndMargin)
    console.log(issuesAndNextRequest) //TODO test with a client with DC = 0

    //should trigger all the requests






























  } catch (error) {
    console.log("error listing the issues, generic error in the bot", error)
  }
};



export const commentStats = async (list: IssueInfo[]) => {
  try {
    const apiClients = await axios({
      method: "GET",
      url: `${config.filpusApi}/getVerifiedClients`,
      headers: {
        "x-api-key": config.filplusApiKey,
      },
    });

    const clients = apiClients.data.data;

    //get stats & comment
    const promArr = []
    for (const info of list) {
      promArr.push(new Promise<void>(async (resolve, reject) => {
        // const apiElement = clients.find((item: any) => item.address === "f1ztll3caq5m3qivovzipywtzqc75ebgpz4vieyiq")
        const apiElement = clients.find(
          (item: any) => item.address === info.address
        );
        if (apiElement === undefined) {
          throw new Error(
            `Error, stat comment of ${config.logPrefix} ${info.issueNumber} failed because the bot couldn't find the correspondent address in the filplus dashboard`
          );
        }

        const verifiers: any = await octokit.request(
          `GET ${config.notariersJsonPath}`
        );
        const notaries = JSON.parse(verifiers.data).notaries;

        const addresses = info.lastTwoSigners;
        const githubHandles = addresses.map(
          (addr: any) =>
            notaries.find(
              (notar: any) => notar.ldn_config.signing_address === addr
            ).github_user[0]
        );

        // console.log("githubHandles", githubHandles)
        const body = statsComment(
          info.msigAddress,
          info.address,
          info.topProvider,
          info.nDeals,
          info.previousDcAllocated,
          info.dcAllocationRequested,
          info.nStorageProviders,
          info.remainingDatacap,
          info.actorAddress,
          githubHandles,
          info.totalDcGrantedForClientSoFar,
          info.totaldDcRequestedByClient,
          info.deltaTotalDcAndDatacapGranted,
          info.rule
        );

        // console.log("CREATE STATS COMMENT", info.issueNumber)
        if (!(process.env.LOGGER_ENVIRONMENT === "test")) {
          await octokit.issues.createComment({
            owner,
            repo,
            issue_number: info.issueNumber,
            body,
          });
        }
        logGeneral(`CREATE STATS COMMENT, issue n ${info.issueNumber}`);
        logGeneral(`Posted stats comment, ${config.logPrefix} ${info.issueNumber}`);
        resolve()
      }))

    }

    await Promise.allSettled(promArr)
  } catch (error) {
    logError(error);
  }
};





export const findDatacapRequested = async (
  issueComments: any[]
): Promise<
  {
    multisigMessage: boolean;
    correct: boolean;
    notaryAddress: string;
    clientAddress: string;
    allocationDatacap: string;
    allocationDataCapAmount: string[];
  }[]
> => {
  try {
    let requestList: any[] = [];
    for (let i = 0; i < issueComments.length; i++) {
      const parseRequest = await parseReleaseRequest(issueComments[i].body); //datacap allocation requested
      if (parseRequest.correct) {
        requestList.push(parseRequest);
      }
    }
    return requestList;
  } catch (error) {
    console.log(error);
  }
};

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
};




