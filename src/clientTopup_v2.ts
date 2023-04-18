import { config } from "./config";
import { bytesToiB, anyToBytes, findClient, getApiClients, getDeltaDcAndDcGranted,  calculateAllocationToRequest, getRemainingDataCap } from "./utils";
import { newAllocationRequestComment_V2, statsComment_v2 } from "./comments";
import { parseIssue, parseApprovedRequestWithSignerAddress} from '@keyko-io/filecoin-verifier-tools/lib/utils/large-issue-parser';
import { EVENT_TYPE, MetricsApiParams } from "./Metrics";
import { logGeneral, logWarn, logDebug, logError } from './logger/consoleLogger'
import { checkLabel } from "./utils";
import { NodeClient, ParseRequest } from "./types/types";
import OctokitInitializer from "./initializers/OctokitInitializer";
import ApiInitializer from "./initializers/ApiInitializer";
import { createHealthCheckComment } from "./createHealthCheck";
import { callMetricsApi } from "@keyko-io/filecoin-verifier-tools/lib/metrics/metrics"
import { v4 as uuidv4 } from 'uuid';
import { AllowanceArrayElement, DmobClient } from "./types/types_clientTopup";
import { ParsedData } from "@keyko-io/filecoin-verifier-tools/lib/utils/ldn-parser-functions/parseApprovedRequestWithSignerAddress";
import { LABELS } from "./labels";

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const api = ApiInitializer.getInstance()
const octokit = OctokitInitializer.getInstance()



/***
 * @TODO create different phases 
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

    // const nodeClientz = await getNodeClients()

    const match = matchGithubAndNodeClients(issuez, apiClients)

    const issuesAndCommentz = await matchIssuesAndRequests(match)

    const issuesAndMargin = await checkPostNewRequest(issuesAndCommentz);

    const issuesAndNextRequest = matchIssuesAndNextRequest(issuesAndMargin)

    const postRequestz = (await postRequestComments(issuesAndNextRequest)).filter((i: any) => i.status === 'fulfilled').map((i: any) => i.value)

    const postStatz = await postStatsComments(issuesAndNextRequest, apiClients)

    const issueCommented = postRequestz.length ? postRequestz.length : 0

    await createHealthCheckComment(issueCommented,postRequestz.map((i: any) => i.issue_number));

    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot ended.`);
    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot issues commented: ${issueCommented}`)
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
    logGeneral(`${config.logPrefix} 0 Issues fetched from github: ${issuez.length}`)
    issuez = issuez.filter((issue: any) => !checkLabel(issue).skip);
    logGeneral(`${config.logPrefix} 0 Issues to be checked: ${issuez.length}`)
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
export const matchGithubAndNodeClients = (issues: any[], apiClients: any) => {
  const parsedIssues = issues.filter((i: any) => parseIssue(i.body).correct)
    .map((i: any) => {
      return {
        parsed: parseIssue(i.body),
        number: i.number
      }
    })

  let match = []

  for (let i of parsedIssues) {
    const dmobClient: DmobClient | boolean = findClient(apiClients, i.parsed.address)

    if (dmobClient) {
      match.push(
        {
          ...i,
          idAddress: dmobClient.addressId,
          address: dmobClient.address,
          datacap: dmobClient.allowance,
          allowanceArray: dmobClient.allowanceArray
        })
    }
  }
  return match

}

/**
 * 
 * @param match 
 * @returns issues matched with all its comments
 */
export const matchIssuesAndRequests = async (match: any[]) => {
  const issuesAndRequests = match.map((issue: any) => {
    const requests = issue.allowanceArray

    const lastRequest = requests[0]

    // issue.comments = comments
    issue.numberOfRequests = requests.length
    issue.lastRequest = lastRequest
    issue.requests = requests

    // resolve({
    return issue
  })
  return issuesAndRequests
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
      const requestNumber = elem.numberOfRequests


      const totalDcGrantedForClientSoFar = parseInt(elem.allowanceArray.reduce((acc: any, current: AllowanceArrayElement) => acc += parseInt(current.allowance), 0))

      const totaldDcRequestedByClient = anyToBytes(elem.parsed.datacapRequested)

      const weeklyDcAllocationBytes = anyToBytes(elem.parsed.dataCapWeeklyAllocation)

      const amountToRequest = calculateAllocationToRequest(requestNumber, totalDcGrantedForClientSoFar, totaldDcRequestedByClient, weeklyDcAllocationBytes, elem.number)
      elem.amountToRequest = amountToRequest
      issuesAndNextRequest.push(elem)
    }
  }
  return issuesAndNextRequest
}

/**
 * 
 * @param issuesAndComments 
 * @returns issuesAndComments + postRequest: boolean, margin: number
 */
export const checkPostNewRequest = async (issuesAndComments: any[]) => {
  const postRequests = []

  const issuesWithRemainingDc = await Promise.allSettled(
    issuesAndComments.map((issue: any) => new Promise(async (resolve, reject) => {
      try {
        issue.remainingDatacap = await getRemainingDataCap(issue.address)
        resolve(issue)
      } catch (error) {
        reject(error)
      }
    }))
  )
  const issues = issuesWithRemainingDc.filter((i: any) => i.status == 'fulfilled').map((i: any) => i.value)

  for (let issue of issues) {
    if (issue.lastRequest && issue.remainingDatacap) {
      let margin = 0
      const last = parseInt(issue.lastRequest.allowance)
      const remaining = parseInt(issue.remainingDatacap)

      if (remaining && last)
        margin = remaining / last

      if (margin <= 0.25) {
        issue.postRequest = true
        postRequests.push(issue)
      }

      logGeneral(`${config.logPrefix} ${issue.number} datacap remaining / datacp allocated: ${(margin * 100).toFixed(2)} %`)
    }
  }
  return postRequests
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
              issue_number: elem.number,
              body: dcReachedBody,
            })
            await octokit.issues.addLabels({
              owner,
              repo,
              issue_number: elem.number,
              labels: [LABELS.TOTAL_DC_REACHED],
            });
            logGeneral(`${config.logPrefix} ${elem.number}, posted close request comment.`)
            resolve({ res, issue_number: elem.number })
            return
          }

          const MSIG_V3 = "f01858410"
          const MSIG_V3_1 = "f02049625"
          const notaryAddress = elem.lastRequest.verifierAddressId == MSIG_V3 ? MSIG_V3_1 : elem.lastRequest.verifierAddressId

          const uuid = uuidv4()
          const body = newAllocationRequestComment_V2(
            elem.address,
            elem.amountToRequest.amount,
            notaryAddress,
            elem.numberOfRequests + 1,
            uuid
          );


          // if (!(process.env.LOGGER_ENVIRONMENT === "test")) {
          res.commentResult = await octokit.issues.createComment({
            owner,
            repo,
            issue_number: elem.number,
            body,
          });

          if (res.commentResult.status === 201) {

            res.removeLabels = await octokit.issues.removeAllLabels({
              owner,
              repo,
              issue_number: elem.number,
            });

            res.addLabels = await octokit.issues.addLabels({
              owner,
              repo,
              issue_number: elem.number,
              labels: [LABELS.READY_TO_SIGN, LABELS.VERIFIED_CLIENT],
            });

            //metrics
            res.metricsParams = {
              name: elem.parsed.name,
              clientAddress: elem.address,
              msigAddress: notaryAddress,
              amount: elem.amountToRequest.amount,
              uuid: uuid
            } as MetricsApiParams

            res.metricsCall = await callMetricsApi(
              elem.number,
              EVENT_TYPE.SUBSEQUENT_DC_REQUEST,
              res.metricsParams
            )


          }
          logGeneral(`CREATE REQUEST COMMENT ${config.logPrefix} ${elem.number}, posted new datacap request comment.`)

          resolve({ res, body, issue_number: elem.number });
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

      const parseRequest: ParsedData = parseApprovedRequestWithSignerAddress(
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
    //GET NOTARIES FROM JSON TODO: restore this
    // let notaries: any = await octokit.request(
    //   `GET ${config.notariersJsonPath}`
    // );
    // notaries = JSON.parse(notaries.data).notaries;
    // console.log(notaries)
    //POST STAT COMMENT
    return await Promise.allSettled(issuesAndNextRequest.map((elem: any) => new Promise<any>(async (resolve, reject) => {
      try {

        let client = findClient(apiClients, elem.address)
        // let client = clients.find((item: any) => item.address === elem.address)

        // const addresses = ['addr1', 'addr2'] // need to make some function for that

        // const allowanceArraySorted : AllowanceArrayElement[]= elem.allowanceArray.sort()

        //TODO find a good way to get the signers
        // const addresses = retrieveLastTwoSigners(
        //   elem.comments,
        //   elem.number
        // )

        // const githubHandles = getGithubHandlesForAddress(allowanceArraySorted[] || ['addr1', 'addr2'], notaries)


        const totalDcGrantedForClientSoFar = parseInt(elem.allowanceArray.reduce((acc: any, current: AllowanceArrayElement) => acc += current.allowance, 0))

        const deltaTotalDcAndDatacapGranted = getDeltaDcAndDcGranted(elem, totalDcGrantedForClientSoFar)

        const content = {
          msigAddress: elem.lastRequest.verifierAddressId,
          address: elem.address,
          topProvider: client ? client.topProvider : 'not found',
          nDeals: client ? client.dealCount : 'not found',
          previousDcAllocated: bytesToiB(elem.lastRequest.allowance),
          dcAllocationRequested: elem.amountToRequest.amount,
          nStorageProviders: client ? client.providerCount : 'not found',
          remainingDatacap: bytesToiB(elem.datacap),
          actorAddress: elem.idAddress,
          // githubHandles: githubHandles ? githubHandles : ['not found'],
          totalDcGrantedForClientSoFar: client ? bytesToiB(totalDcGrantedForClientSoFar) : 'not found',
          totaldDcRequestedByClient: elem.parsed.datacapRequested,
          deltaTotalDcAndDatacapGranted: client ? bytesToiB(deltaTotalDcAndDatacapGranted) : 'not found', // info.deltaTotalDcAndDatacapGranted,
          rule: elem.amountToRequest.rule
        }

        const body = statsComment_v2(content)

        resolve({
          call: await octokit.issues.createComment({
            owner,
            repo,
            issue_number: elem.number,
            body,
          }),
          content
        })
        logGeneral(`CREATE STATS COMMENT ${config.logPrefix} ${elem.number}, posted new stats comment.`)


      } catch (error) {
        reject(error)
      }
    })
    ))

  } catch (error) {
    logError(error);
  }
}


