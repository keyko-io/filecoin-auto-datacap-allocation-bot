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
import { IssueInfo, ParseRequest } from "./types";
import OctokitInitializer from "./initializers/OctokitInitializer";
import ApiInitializer from "./initializers/ApiInitializer";
const { callMetricsApi, } = require("@keyko-io/filecoin-verifier-tools/metrics/metrics");

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const api = ApiInitializer.getInstance()
const octokit = OctokitInitializer.getInstance()

export const clientsTopup = async () => {
  try {
    console.log('ldn repo:',config.githubLDNRepo )
    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot started - check issues and clients DataCap.`);


//TO TEST, let's avoid this
    const clientsByVerifierRes = await axios({
      method: "GET",
      url: `${config.filpusApi}/getVerifiedClients`,
      headers: {
        "x-api-key": config.filplusApiKey,
      },
    });

    const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
      owner,
      repo,
      state: "open",
    });

    let issueInfoList: IssueInfo[] = [];
    let issueInfoListClosed = [];
    logGeneral(`${config.logPrefix} 0 Number of fetched comments: ${rawIssues.length}`);
    const promArr = []


    const commentsEachIssue = await commentsForEachIssue(octokit, rawIssues)

    const requestListForEachIssue = await Promise.all(
      commentsEachIssue.map(async (issue: any) => {
        return {
          issueNumber: issue.issueNumber,
          requestList: await findDatacapRequested(issue.comments)
        }
      }
      )
    )

    const cleanedRawIssues = rawIssues.filter((issue: any) => checkLabel(issue) && checkRequestAndReturnRequest(requestListForEachIssue, issue).isValid)

    const datacapRequestedByEachClientArr = cleanedRawIssues.map((issue: any) => {
      return {
        issueNumber: issue.number,
        totaldDcRequestedByClient: parseIssue(issue.body).datacapRequested,
        totaldDcRequestedByClientBytes: anyToBytes(parseIssue(issue.body).datacapRequested.toString()),
        weeklyAllocationRequestedByClient: parseIssue(issue.body).dataCapWeeklyAllocation,
        weeklyDcAllocationBytes: anyToBytes(parseIssue(issue.body).dataCapWeeklyAllocation.toString())
      }
    })

    const allClientsFromApi = await Promise.all(cleanedRawIssues.map(async (issue: any) => {
      try {
        const clientAllowanceObj = await axios({
          method: "GET",
          url: `${config.filpusApi}/getAllowanceForAddress/${parseIssue(issue.body).address}`,
          headers: {
            "x-api-key": config.filplusApiKey,
          },
        });

        let dataCapRemainingBytes = parseInt(clientAllowanceObj.data.allowance);

        if (!clientAllowanceObj?.data || !clientAllowanceObj.data.allowance) {

          let actorAddress: any = ""
          if (parseIssue(issue.body).address.startsWith("f1")) {
            actorAddress = await api.actorAddress(parseIssue(issue.body).address)
          } else {
            actorAddress = await api.cachedActorAddress(parseIssue(issue.body).address)
          }
          const checkClient = await api.checkClient(actorAddress)

          if (!checkClient[0]) {
            logWarn(`${config.logPrefix} ${issue.number} - It looks like the client has 0B datacap remaining.`)
            dataCapRemainingBytes = 0
          } else {
            dataCapRemainingBytes = parseInt(checkClient[0].datacap)
          }
        }

        return {
          issueNumber: issue.number,
          dataCapRemainingBytes
        }

      } catch (error) {
        console.log(error)
        return
      }
    }
    ))

    const allClientsFromApiCleaned = allClientsFromApi
      .filter((item: any) => item)
      .filter((item: any) => item.dataCapRemainingBytes !== -1)

    for (const issue of cleanedRawIssues) {

      const requestList = requestListForEachIssue.find((requestItem: any) => requestItem.issueNumber === issue.number).requestList
      const lastRequest = requestList[requestList.length - 1];
      const requestNumber = requestList.length;
      const isCustomNotary = parseIssue(issue.body).isCustomNotary
      const client = clientsByVerifierRes.data.data.find((item: any) => item.address == lastRequest.clientAddress);
      if (!client) {
        logGeneral(`${config.logPrefix} ${issue.number} skipped --> dc not allocated yet`);
        continue
      }

      // somehow the api return sometimes a worng allowance array with duplicates alloowances, filter this array to contain only one object each msgCID
      const set = new Set();
      const totalDcGrantedForClientSoFar = client.allowanceArray
        .filter((item: any) => {
          if (set.has(item.msgCID)) return false;
          set.add(item.msgCID);
          return true;
        })
        .reduce((s: number, item: any) => s + parseInt(item.allowance), 0)

      const lastRequestDataCapAllocatedConvert = lastRequest.allocationDatacap.endsWith("B") ? anyToBytes(lastRequest.allocationDatacap) : lastRequest.allocationDatacap;

      const dataCapAllocatedBytes = Number(lastRequestDataCapAllocatedConvert);
      const dataCapRemainingBytes = allClientsFromApiCleaned.find((item: any) => item.issueNumber === issue.number).dataCapRemainingBytes

      let margin = 0
      if (dataCapRemainingBytes > 0) {
        margin = dataCapRemainingBytes / dataCapAllocatedBytes;
      }

      logGeneral(`${config.logPrefix} ${issue.number} datacap remaining / datacp allocated: ${(margin * 100).toFixed(2)} %`);

      const dcAllocationRequested = calculateAllocationToRequest(
        requestNumber,
        totalDcGrantedForClientSoFar,
        datacapRequestedByEachClientArr.find((item: any) => item.issueNumber === issue.number).totaldDcRequestedByClientBytes,
        datacapRequestedByEachClientArr.find((item: any) => item.issueNumber === issue.number).weeklyDcAllocationBytes,
        issue.number
      );

      if (dcAllocationRequested.totalDatacapReached) {
        console.log("The issue reached the total datacap requested. This should be closed")
        issueInfoListClosed.push(issue.number)

        promArr.push(new Promise<void>(async (resolve, reject) => {
          if (!(process.env.LOGGER_ENVIRONMENT === "test")) {
            await octokit.issues.createComment({
              owner,
              repo,
              issue_number: issue.number,
              body: `The issue reached the total datacap requested. This should be closed`,
            });
            await octokit.issues.addLabels({
              owner,
              repo,
              issue_number: issue.number,
              labels: ["issue:TotalDcReached"],
            });
          }
          //METRICS
          // const params: MetricsApiParams = {
          //   name: info.clientName,
          //   clientAddress: info.address,
          //   msigAddress: info.msigAddress,
          //   amount: info.dcAllocationRequested,
          // };
          // await callMetricsApi(
          //   info.issueNumber,
          //   EVENT_TYPE.TOTAL_DATACAP_REACHED,
          //   params
          // );
          resolve()
        }))
        continue
      }

      promArr.push(new Promise<void>(async (resolve, reject) => {
        try {

          // retrieve last 2 signers to put in stat comment
          const lastTwoSigners: string[] = retrieveLastTwoSigners(
            commentsEachIssue.find((item: any) => item.issueNumber === issue.number),
            issue.number
          );

          const info: IssueInfo = {
            issueNumber: issue.number,
            msigAddress: isCustomNotary ? lastRequest.notaryAddress : config.v3MultisigAddress,
            address: lastRequest.clientAddress,
            actorAddress: client.addressId ? client.addressId : client.address,
            dcAllocationRequested: dcAllocationRequested.amount,
            remainingDatacap: bytesToiB(dataCapRemainingBytes),
            lastTwoSigners,
            topProvider: client.topProvider || "0",
            nDeals: client.dealCount || "0",
            previousDcAllocated: lastRequest.allocationDatacap || "not found",
            nStorageProviders: client.providerCount || "0",
            clientName: client.name || "not found",
            verifierAddressId: client.verifierAddressId || "not found",
            verifierName: client.verifierName || "not found",
            totalDcGrantedForClientSoFar: bytesToiB(totalDcGrantedForClientSoFar),
            totaldDcRequestedByClient: datacapRequestedByEachClientArr.find((item: any) => item.issueNumber === issue.number).totaldDcRequestedByClient,
            deltaTotalDcAndDatacapGranted: bytesToiB(
              anyToBytes(datacapRequestedByEachClientArr.find((item: any) => item.issueNumber === issue.number).totaldDcRequestedByClient) - totalDcGrantedForClientSoFar),
            rule: dcAllocationRequested.rule

          };

          if (margin <= 0.25) {
            // if (issue.number === 84) {// ***USED FOR TEST***

            const body = newAllocationRequestComment(
              info.address,
              info.dcAllocationRequested,
              "90TiB",
              info.msigAddress,
              requestNumber
            );

            logGeneral(`CREATE REQUEST COMMENT ${config.logPrefix} ${info.issueNumber}`);

            if (!(process.env.LOGGER_ENVIRONMENT === "test")) {
              const commentResult = await octokit.issues.createComment({
                owner,
                repo,
                issue_number: info.issueNumber,
                body,
              });
              if (commentResult.status === 201) {
                await octokit.issues.removeAllLabels({
                  owner,
                  repo,
                  issue_number: info.issueNumber,
                });

                await octokit.issues.addLabels({
                  owner,
                  repo,
                  issue_number: info.issueNumber,
                  labels: ["bot:readyToSign", "state:Approved"],
                });
              }
            }

            // //METRICS
            const params: MetricsApiParams = {
              name: info.clientName,
              clientAddress: info.address,
              msigAddress: info.msigAddress,
              amount: info.dcAllocationRequested,
            };
            await callMetricsApi(
              info.issueNumber,
              EVENT_TYPE.SUBSEQUENT_DC_REQUEST,
              params
            );
            logGeneral(`${config.logPrefix} ${issue.number}, posted subsequent allocation comment.`
            );
            issueInfoList.push(info);
          }
          resolve()

        } catch (error) {
          reject(`Erorr, ${config.logPrefix} ${issue.number}: ${error}`)
        }
      }))
    }

    await Promise.allSettled(promArr)
    await commentStats(issueInfoList);

    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot ended. ${issueInfoList.length ? issueInfoList.length : 0} issues commented`);
    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot - commented issues number: ${issueInfoList.map((info: any) => info.issueNumber)}, ${issueInfoListClosed.map((num: any) => num)}`);
    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot - issues reaching the total datacap: ${issueInfoListClosed.map((num: any) => num)}`);
    return {
      status: 'ok'
    }
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
  console.log("req number:", requestNumber)
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

