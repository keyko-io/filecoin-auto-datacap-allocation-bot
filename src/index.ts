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

const allocationDatacap = async () => {
  try {
    logGeneral(`Issue number 0 Subsequent-Allocation-Bot started.`);

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
    logGeneral(`issue n 0 Number of fetched comments: ${rawIssues.length}`);
    for (const issue of rawIssues) {
      try {
        if (issue.labels.find((item: any) => item.name === "bot:readyToSign")) {
          logGeneral(`Issue number ${issue.number} skipped --> bot:readyToSign is present`);
          continue;
        }
        if (
          issue.labels.find((item: any) => item.name === "status:needsDiligence")) {
          logGeneral(`Issue number ${issue.number} skipped -->status:needsDiligence is present`);
          continue;
        }
        if (issue.labels.find((item: any) => item.name === "status:Error")) {
          logGeneral(`Issue number ${issue.number} skipped --> status:Error is present`);
          continue;
        }

        //get all comments of a issue
        const issueComments = await octokit.paginate(
          octokit.rest.issues.listComments,
          {
            owner,
            repo,
            issue_number: issue.number,
          }
        );


        //parse weeklhy dc in issue
        // the amount to take into account is expected weekly usage rate or 5% of total dc requested (the lower)
        // in this case I compare the entire weekly amount and 10% of total datacap requested
        const totaldDcRequestedByClient = parseIssue(issue.body).datacapRequested
        const weeklyAllocationRequestedByClient = parseIssue(issue.body).dataCapWeeklyAllocation
        const weeklyDcAllocationBytes = anyToBytes(weeklyAllocationRequestedByClient.toString());
        const totaldDcRequestedByClientBytes = anyToBytes(totaldDcRequestedByClient.toString());
        // const tenPercentAllocationBytes = anyToBytes(totaldDcRequestedByClient.toString()) * 0.1;
        // const allocation = weeklyDcAllocationBytes <= tenPercentAllocationBytes ? weeklyDcAllocationBytes : tenPercentAllocationBytes;
        // const allocationRule = weeklyDcAllocationBytes <= tenPercentAllocationBytes ? "weekly" : "percentageDatacap";

        //Parse dc requested msig notary address and  client address
        const requestList = await findDatacapRequested(issueComments);
        const lastRequest = requestList[requestList.length - 1];
        const requestNumber = requestList.length;

        if (lastRequest === undefined) {
          logGeneral(`Issue number ${issue.number} skipped --> DataCap allocation requested comment is not present`);
          continue;
        }
        if (!lastRequest.allocationDatacap && !lastRequest.clientAddress) {
          logGeneral(`Issue number ${issue.number} skipped --> DataCap allocation requested comment is not present`);
          continue;
        }
        if (!lastRequest.clientAddress) {
          logGeneral(`Issue number ${issue.number} skipped --> clientAddress not found after parsing the comments`);
          continue;
        }
        if (!lastRequest.allocationDatacap) {
          logGeneral(`Issue number ${issue.number} skipped --> datacapAllocated not found after parsing the comments`);
          continue;
        }

        //Check datacap remaining for this address

        const client = clientsByVerifierRes.data.data.find((item: any) => item.address == lastRequest.clientAddress);
        if (!client) {
          logGeneral(`Issue number ${issue.number} skipped --> dc not allocated yet`);
          continue;
        }

        const totalDcGrantedForClientSoFar = client.allowanceArray.reduce((s: number, item: any) => s + parseInt(item.allowance), 0)
        // console.log("reduce", totalDcGrantedForClientSoFar)

        //get remaining datacap for the client
        let clientAllowanceObj: any = {}
        try {
          clientAllowanceObj = await axios({
            method: "GET",
            url: `${config.filpusApi}/getAllowanceForAddress/${lastRequest.clientAddress}`,
            headers: {
              "x-api-key": config.filplusApiKey,
            },
          });

        } catch (error) {
          console.log(error)
        }

        const dataCapAllocatedConvert = lastRequest.allocationDatacap.endsWith("B") ? anyToBytes(lastRequest.allocationDatacap) : lastRequest.allocationDatacap;

        const dataCapAllocatedBytes = Number(dataCapAllocatedConvert);
        let dataCapRemainingBytes = 0

        if (!clientAllowanceObj?.data || !clientAllowanceObj.data.allowance) {
          let actorAddress: any = ""
          if (lastRequest.clientAddress.startsWith("f1")) {
            actorAddress = await api.actorAddress(lastRequest.clientAddress)
          } else {
            actorAddress = await api.cachedActorAddress(lastRequest.clientAddress)
          }
          const checkClient = await api.checkClient(actorAddress)
          dataCapRemainingBytes = parseInt(checkClient[0].datacap)
          if (!dataCapRemainingBytes) {
            logError(`Issue n ${issue.number} - the remaining datacap for this issue cannot be retrieved.`)
            continue
          }
        }else{
          dataCapRemainingBytes = parseInt(clientAllowanceObj.data.allowance);
        }

        const margin = dataCapRemainingBytes / dataCapAllocatedBytes;
        logGeneral(`Issue n ${issue.number} margin: ${margin}`);

        const dcAllocationRequested = calculateAllocationToRequest(
          requestNumber,
          totalDcGrantedForClientSoFar,
          totaldDcRequestedByClientBytes,
          weeklyDcAllocationBytes,
          issue.number
        );

        // retrieve last 2 signers to put in stat comment
        const lastTwoSigners: string[] = retrieveLastTwoSigners(
          issueComments,
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
          totaldDcRequestedByClient,
          deltaTotalDcAndDatacapGranted: bytesToiB(anyToBytes(totaldDcRequestedByClient.toString()) - totalDcGrantedForClientSoFar),
          rule: dcAllocationRequested.rule

        };

        // if (margin <= 0.25) {
        //   // if (issue.number === 84) {// ***USED FOR TEST***

        //   const body = newAllocationRequestComment(
        //     info.address,
        //     info.dcAllocationRequested,
        //     "90TiB",
        //     info.msigAddress,
        //     requestNumber
        //   );

        //   logGeneral(`CREATE REQUEST COMMENT issue number ${info.issueNumber}`);

        //   const commentResult = await octokit.issues.createComment({
        //     owner,
        //     repo,
        //     issue_number: info.issueNumber,
        //     body,
        //   });

        //   if (commentResult.status === 201) {
        //     await octokit.issues.removeAllLabels({
        //       owner,
        //       repo,
        //       issue_number: info.issueNumber,
        //     });

        //     await octokit.issues.addLabels({
        //       owner,
        //       repo,
        //       issue_number: info.issueNumber,
        //       labels: ["bot:readyToSign"],
        //     });
        //   }

        //   //METRICS
        //   const params: MetricsApiParams = {
        //     name: info.clientName,
        //     clientAddress: info.address,
        //     msigAddress: info.msigAddress,
        //     amount: info.dcAllocationRequested,
        //   };
        //   await callMetricsApi(
        //     info.issueNumber,
        //     EVENT_TYPE.SUBSEQUENT_DC_REQUEST,
        //     params
        //   ); //TEST
        //   logGeneral(`issue n ${issue.number}, posted subsequent allocation comment.`
        //   );
        //   issueInfoList.push(info);
        // }
      } catch (error) {
        logError(` Error, issue n ${issue.number}: ${error} - **Please, check that the datacap for the issue client has been granted**`);
        continue;
      }
    }
    // await commentStats(issueInfoList);
    logGeneral(`Issue number 0 Subsequent-Allocation-Bot ended. Number of issues commented: ${issueInfoList.length}`);
    logGeneral(`Issue number 0 Subsequent-Allocation-Bot - issues commented: ${issueInfoList.map((info: any) => info.issueNumber)}`);
  } catch (error) {
    logError("error listing the issues, generic error in the bot");
    logError(error);
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
    for (const info of list) {
      // const apiElement = clients.find((item: any) => item.address === "f1ztll3caq5m3qivovzipywtzqc75ebgpz4vieyiq")
      const apiElement = clients.find(
        (item: any) => item.address === info.address
      );
      if (apiElement === undefined) {
        throw new Error(
          `Error, stat comment of issue n ${info.issueNumber} failed because the bot couldn't find the correspondent address in the filplus dashboard`
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

      try {
        // console.log("CREATE STATS COMMENT", info.issueNumber)
        logGeneral(`CREATE STATS COMMENT, issue n ${info.issueNumber}`
        );
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: info.issueNumber,
          body,
        });
      } catch (error) {
        logError(error);
        continue;
      }
    }
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
  logDebug(`issue n ${issueNumber} weekly datacap requested by client: ${bytesToiB(weeklyDcAllocationBytes)} ${weeklyDcAllocationBytes}B`)

  logDebug(`issue n ${issueNumber} total datacap requested by client: ${bytesToiB(totaldDcRequestedByClient)}, ${totaldDcRequestedByClient}B`)


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
  logDebug(`issue n ${issueNumber} sumTotalAmountWithNextRequest (sum next request + total datcap granted to client so far): ${bytesToiB(sumTotalAmountWithNextRequest)}`)

  if (sumTotalAmountWithNextRequest > totaldDcRequestedByClient) {
    logDebug(`issue n ${issueNumber} sumTotalAmountWithNextRequest is higher than total datacap requested by client (${totaldDcRequestedByClient}, requesting the difference of total dc requested - total datacap granted so far)`)
    nextRequest = totaldDcRequestedByClient - totalDcGrantedForClientSoFar
  }

  logDebug(`issue n ${issueNumber} nextRequest ${bytesToiB(Math.floor(nextRequest))}`)
  logDebug(`issue n ${issueNumber} allocation rule: ${rule}`)
  const retObj = {
    amount: bytesToiB(Math.floor(nextRequest)),
    rule
  }

  return retObj
};

const findDatacapRequested = async (
  issueComments: any
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
    logGeneral(`Error, issue n ${issueNumber}, error retrieving the last 2 signers. ${error}`
    );
  }
};

allocationDatacap();
