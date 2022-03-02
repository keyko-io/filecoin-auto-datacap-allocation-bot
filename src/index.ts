import { Octokit } from "@octokit/rest";
import { config } from "./config";
import { bytesToiB, anyToBytes } from "./utils";
import { newAllocationRequestComment, statsComment } from "./comments";
import VerifyAPI from "@keyko-io/filecoin-verifier-tools/api/api.js";
import {
  parseReleaseRequest,
  parseApprovedRequestWithSignerAddress,
  parseIssue,
} from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import axios from "axios";
import { createAppAuth } from "@octokit/auth-app";
import { EVENT_TYPE, MetricsApiParams } from "./Metrics";
import { logGeneral, logWarn, logDebug, logError } from './logger/consoleLogger'
const { callMetricsApi, } = require("@keyko-io/filecoin-verifier-tools/metrics/metrics");

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
// const PHASE = `Subsequent Allocation`;

type IssueInfo = {
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
  totalDcGrantedForClientSoFar?: string
  totaldDcRequestedByClient?: string
  deltaTotalDcAndDatacapGranted?: string
  rule?: string
};

const api = new VerifyAPI( // eslint-disable-line
  VerifyAPI.standAloneProvider(
    process.env.NODE_URL,
    null,
    process.env.NETWORK_TYPE !== "Mainnet" // if node != Mainnet => testnet = true
  )
);

const formatPK = () => {
  const BEGIN = config.beginPk;
  const END = config.endPk;
  const splitted = config.privateKey.match(/.{1,64}/g);
  const formatted = `${BEGIN}\n${splitted.join("\n")}\n${END}`;
  return formatted;
};

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    type: "installation",
    installationId: config.installationID,
    appId: config.appId,
    privateKey: formatPK(),
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  },
});

enum LabelsEnum {
  READY_TO_SIGN = "bot:readyToSign",
  NEED_DILIGENCE = "status:needsDiligence",
  ERROR = "status:Error",
  TOTAL_DC_REACHED = "issue:TotalDcReached"
}
const LOG_PREFIX = `Issue number`

const checkLabel = (issue: any) => {
  if (issue.labels.find((item: any) => item.name === LabelsEnum.READY_TO_SIGN)) {
    logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> ${LabelsEnum.READY_TO_SIGN} is present`);
    return false
  }
  if (
    issue.labels.find((item: any) => item.name === LabelsEnum.NEED_DILIGENCE)) {
    logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> ${LabelsEnum.NEED_DILIGENCE} is present`);
    return false
  }
  if (issue.labels.find((item: any) => item.name === LabelsEnum.ERROR)) {
    logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> ${LabelsEnum.ERROR} is present`);
    return false
  }
  if (issue.labels.find((item: any) => item.name === LabelsEnum.TOTAL_DC_REACHED)) {
    logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> ${LabelsEnum.TOTAL_DC_REACHED} is present`);
    return false
  }
  return true
}

const checkRequestAndReturnRequest = (requestListForEachIssue: any[], issue: any) => {

  const requestList = requestListForEachIssue.find((requestItem: any) => requestItem.issueNumber == issue.number).requestList
  const lastRequest = requestList[requestList.length - 1];
  const requestNumber = requestListForEachIssue.length;

  if (lastRequest === undefined) {
    logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> DataCap allocation requested comment is not present`);
    return { isValid: false }
  }
  if (!lastRequest.allocationDatacap && !lastRequest.clientAddress) {
    logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> DataCap allocation requested comment is not present`);
    return { isValid: false }
  }
  if (!lastRequest.clientAddress) {
    logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> clientAddress not found after parsing the comments`);
    return { isValid: false }
  }
  if (!lastRequest.allocationDatacap) {
    logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> datacapAllocated not found after parsing the comments`);
    return { isValid: false }
  }
  return {
    isValid: true,
    lastRequest,
    requestNumber
  }
}

const allocationDatacap = async () => {
  try {
    logGeneral(`${LOG_PREFIX} 0 Subsequent-Allocation-Bot started.`);

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
    logGeneral(`${LOG_PREFIX} 0 Number of fetched comments: ${rawIssues.length}`);
    const promArr = []


    const commentsForEachIssue = await Promise.all(
      rawIssues.map((issue: any) => new Promise<any>(async (resolve, reject) => {
        const comments = await octokit.paginate(octokit.rest.issues.listComments,
          {
            owner,
            repo,
            issue_number: issue.number,
          })
        resolve({ issueNumber: issue.number, comments })
      })
      ))

    const requestListForEachIssue = await Promise.all(
      commentsForEachIssue.map((issue: any) => {
        return new Promise<any>(async (resolve, reject) => {
          const issueNumber = issue.issueNumber
          const requestList = await findDatacapRequested(issue.comments)
          resolve(
            { issueNumber, requestList }
          )
        })
      })
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

    const allClientsFromApi = await Promise.all(cleanedRawIssues.map((issue: any) => {
      return new Promise<any>(async (resolve, reject) => {
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
            // logError(`${LOG_PREFIX} ${issue.number} - the remaining datacap for this issue cannot be retrieved.`)
            resolve({
              issueNumber: issue.number,
              dataCapRemainingBytes: -1
            })
          } else {
            dataCapRemainingBytes = parseInt(checkClient[0].datacap)
          }

        }
        dataCapRemainingBytes = parseInt(clientAllowanceObj.data.allowance);

        resolve({
          issueNumber: issue.number,
          dataCapRemainingBytes
        })
      })
    }))
    const allClientsFromApiCleaned = allClientsFromApi.filter((item: any) => item.dataCapRemainingBytes !== -1)

    for (const issue of cleanedRawIssues) {
      if (!allClientsFromApiCleaned.find((item: any) => item.issueNumber === issue.number)) {
        logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> can't find datacap for this client`);
        continue
      }

      const requestList = requestListForEachIssue.find((requestItem: any) => requestItem.issueNumber === issue.number).requestList
      const lastRequest = requestList[requestList.length - 1];
      const requestNumber = requestList.length;

      const client = clientsByVerifierRes.data.data.find((item: any) => item.address == lastRequest.clientAddress);
      if (!client) {
        logGeneral(`${LOG_PREFIX} ${issue.number} skipped --> dc not allocated yet`);
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

      const margin = dataCapRemainingBytes / dataCapAllocatedBytes;
      logGeneral(`${LOG_PREFIX} ${issue.number} datacap remaining / datacp allocated: ${(margin * 100).toFixed(2)} %`);

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
          await octokit.issues.createComment({
              owner,
              repo,
              issue_number: issue.number,
              body:`The issue reached the total datacap requested. This should be closed`,
            });
          await octokit.issues.addLabels({
                owner,
                repo,
                issue_number: issue.number,
                labels: ["issue:TotalDcReached"],
              });
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
            commentsForEachIssue.find((item: any) => item.issueNumber === issue.number),
            issue.number
          );

          const info: IssueInfo = {
            issueNumber: issue.number,
            msigAddress: lastRequest.notaryAddress,
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

            logGeneral(`CREATE REQUEST COMMENT ${LOG_PREFIX} ${info.issueNumber}`);

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
                labels: ["bot:readyToSign"],
              });
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
            logGeneral(`${LOG_PREFIX} ${issue.number}, posted subsequent allocation comment.`
            );
            issueInfoList.push(info);
          }
          resolve()

        } catch (error) {
          reject(`Erorr, ${LOG_PREFIX} ${issue.number}: ${error}`)
        }
      }))
    }
    await Promise.allSettled(promArr)
    await commentStats(issueInfoList);
    logGeneral(`${LOG_PREFIX} 0 Subsequent-Allocation-Bot ended. ${issueInfoList.length ? issueInfoList.length : 0} issues commented`);
    logGeneral(`${LOG_PREFIX} 0 Subsequent-Allocation-Bot - commented issues number: ${issueInfoList.map((info: any) => info.issueNumber)}, ${issueInfoListClosed.map((num: any) => num)}`);
    logGeneral(`${LOG_PREFIX} 0 Subsequent-Allocation-Bot - issues reaching the total datacap: ${issueInfoListClosed.map((num: any) => num)}`);
  } catch (error) {
    console.log("error listing the issues, generic error in the bot", error)
  }
};

const commentStats = async (list: IssueInfo[]) => {
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
            `Error, stat comment of ${LOG_PREFIX} ${info.issueNumber} failed because the bot couldn't find the correspondent address in the filplus dashboard`
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
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: info.issueNumber,
          body,
        });
        logGeneral(`CREATE STATS COMMENT, issue n ${info.issueNumber}`);
        logGeneral(`Posted stats comment, ${LOG_PREFIX} ${info.issueNumber}`);
        resolve()
      }))
    }

    await Promise.allSettled(promArr)
  } catch (error) {
    logError(error);
  }
};

const calculateAllocationToRequest = (
  requestNumber: number,
  totalDcGrantedForClientSoFar: number,
  totaldDcRequestedByClient: number,
  weeklyDcAllocationBytes: number,
  issueNumber: any
) => {
  logDebug(`${LOG_PREFIX} ${issueNumber} weekly datacap requested by client: ${bytesToiB(weeklyDcAllocationBytes)} ${weeklyDcAllocationBytes}B`)

  logDebug(`${LOG_PREFIX} ${issueNumber} total datacap requested by client: ${bytesToiB(totaldDcRequestedByClient)}, ${totaldDcRequestedByClient}B`)


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
  logDebug(`${LOG_PREFIX} ${issueNumber} sumTotalAmountWithNextRequest (sum next request + total datcap granted to client so far): ${bytesToiB(sumTotalAmountWithNextRequest)}`)

  let retObj: any = {}
  if (sumTotalAmountWithNextRequest > totaldDcRequestedByClient) {
    logDebug(`${LOG_PREFIX} ${issueNumber} sumTotalAmountWithNextRequest is higher than total datacap requested by client (${totaldDcRequestedByClient}, requesting the difference of total dc requested - total datacap granted so far)`)
    // console.log("totaldDcRequestedByClient", totaldDcRequestedByClient)
    // console.log("totalDcGrantedForClientSoFar", totalDcGrantedForClientSoFar)
    nextRequest = totaldDcRequestedByClient - totalDcGrantedForClientSoFar
    // console.log("nextRequest in if", nextRequest)
  }
  if (nextRequest <= 0) {
    logDebug(`${LOG_PREFIX} ${issueNumber} - seems that the client reached the total datacap request in this issue. This should be checked and closed`)
    retObj = { totalDatacapReached: true }
    return retObj
  }


  logDebug(`${LOG_PREFIX} ${issueNumber} nextRequest ${bytesToiB(nextRequest)}`)
  logDebug(`${LOG_PREFIX} ${issueNumber} allocation rule: ${rule}`)
  retObj = {
    amount: bytesToiB(Math.floor(nextRequest)),
    rule,
    totalDatacapReached: false
  }

  return retObj
};

const findDatacapRequested = async (
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

const retrieveLastTwoSigners = (
  issueComments: any,
  issueNumber: any
): string[] => {
  try {
    let requestList: string[] = [];
    for (let i = issueComments.length - 1; i >= 0; i--) {
      if (requestList.length === 2) break;
      const parseRequest = parseApprovedRequestWithSignerAddress(
        issueComments[i].body
      );
      if (parseRequest.approvedMessage) {
      }
      if (parseRequest.correct) {
        requestList.push(parseRequest.signerAddress);
      }
    }
    return requestList;
  } catch (error) {
    logGeneral(`Error, ${LOG_PREFIX} ${issueNumber}, error retrieving the last 2 signers. ${error}`
    );
  }
};

allocationDatacap();
