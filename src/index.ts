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
import { logGeneral, logWarn, logDebug, logError} from './logger/ConsoleLogger'
const {
  callMetricsApi,
} = require("@keyko-io/filecoin-verifier-tools/metrics/metrics");

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
    console.log(`Number of fetched comments: ${rawIssues.length}`);
    for (const issue of rawIssues) {
      try {
        if (issue.labels.find((item: any) => item.name === "bot:readyToSign")) {
          logGeneral(`Issue number ${issue.number} skipped --> bot:readyToSign is present`
          );
          continue;
        }
        if (
          issue.labels.find(
            (item: any) => item.name === "status:needsDiligence"
          )
        ) {
          logGeneral(`Issue number ${issue.number} skipped -->status:needsDiligence is present`
          );
          continue;
        }
        if (issue.labels.find((item: any) => item.name === "status:Error")) {
          logGeneral(`Issue number ${issue.number} skipped --> status:Error is present`
          );
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
        const weeklyDcAllocationBytes = anyToBytes(
          parseIssue(issue.body).dataCapWeeklyAllocation.toString()
        );
        const tenPercentAllocationBytes =
          anyToBytes(parseIssue(issue.body).datacapRequested.toString()) * 0.1;

        const allocation =
          weeklyDcAllocationBytes <= tenPercentAllocationBytes
            ? weeklyDcAllocationBytes
            : tenPercentAllocationBytes;

        //Parse dc requested msig notary address and  client address
        const requestList = await findDatacapRequested(issueComments);
        const lastRequest = requestList[requestList.length - 1];
        const requestNumber = requestList.length;

        if (lastRequest === undefined) {
          logGeneral(`Issue number ${issue.number} skipped --> DataCap allocation requested comment is not present`
          );
          continue;
        }
        if (!lastRequest.allocationDatacap && !lastRequest.clientAddress) {
          logGeneral(`Issue number ${issue.number} skipped --> DataCap allocation requested comment is not present`
          );
          continue;
        }
        if (!lastRequest.clientAddress) {
          logGeneral(`Issue number ${issue.number} skipped --> clientAddressnot found after parsing the comments`
          );
          continue;
        }
        if (!lastRequest.allocationDatacap) {
          logGeneral(`Issue number ${issue.number} skipped --> datacapAllocated not found after parsing the comments`
          );
          continue;
        }

        //Check datacap remaining for this address

        const client = clientsByVerifierRes.data.data.find(
          (item: any) => item.address == lastRequest.clientAddress
        );
        if (!client) {
          logGeneral(`Issue number ${issue.number} skipped --> dc not allocated yet`
          );
          continue;
        }

        // let actorAddress: any = "";
        // if (lastRequest.clientAddress.startsWith("f1")) {
        //   actorAddress = await api.actorAddress(lastRequest.clientAddress);
        // } else {
        //   actorAddress = await api.cachedActorAddress(
        //     lastRequest.clientAddress
        //   );
        // }

        // const checkClient = aswait api.checkClient(actorAddress)
        const clientAllowanceObj = await axios({
          method: "GET",
          url: `${config.filpusApi}/getAllowanceForAddress/${lastRequest.clientAddress}`,
          headers: {
            "x-api-key": config.filplusApiKey,
          },
        });
        // console.log("checkClient", checkClient)
        // console.log("clP", clientAllowanceObj.data.allowance)

        const dataCapAllocatedConvert = lastRequest.allocationDatacap.endsWith(
          "B"
        )
          ? anyToBytes(lastRequest.allocationDatacap)
          : lastRequest.allocationDatacap;
        const dataCapAllocatedBytes = Number(dataCapAllocatedConvert);
        const dataCapRemainingBytes: number = clientAllowanceObj.data.allowance;

        // if(checkClient[0]?.datacap != dataCapRemainingBytes){
        //     logError(`issue number ${issue.number}, actoraddress ${actorAddress} - address ${lastRequest.clientAddress} values from node (${checkClient[0]?.datacap}) and values from API (${client.allowance} don't match`)
        //     continue
        // }

        // console.log("dataCapRemaining, dataCapAllocated", "checkClient" ,bytesToiB(dataCapRemainingBytes) ,bytesToiB(dataCapAllocatedBytes), checkClient[0]?.datacap)
        const margin = dataCapRemainingBytes / dataCapAllocatedBytes;
        logGeneral(`Issue n ${issue.number} margin: ${margin}`);

        const dcAllocationRequested = calculateAllocationToRequest(
          allocation,
          requestNumber
        );

        // retrieve last 2 signers to put in stat comment
        const lastTwoSigners: string[] = retrieveLastTwoSigners(
          issueComments,
          issue.number
        );
        // console.log("issue.number",issue.number,"lastTwoSigners",lastTwoSigners)
        const info: IssueInfo = {
          issueNumber: issue.number,
          msigAddress: lastRequest.notaryAddress,
          address: lastRequest.clientAddress,
          actorAddress: client.addressId ? client.addressId : client.address,
          dcAllocationRequested,
          remainingDatacap: bytesToiB(dataCapRemainingBytes),
          lastTwoSigners,
          topProvider: client.topProvider || "0",
          nDeals: client.dealCount || "0",
          previousDcAllocated: lastRequest.allocationDatacap || "not found",
          // info.previousDcAllocated = bytesToiB(apiElement.allowanceArray[apiElement.allowanceArray.length - 1].allowance) || "not found"
          nStorageProviders: client.providerCount || "0",
          clientName: client.name || "not found",
          verifierAddressId: client.verifierAddressId || "not found",
          verifierName: client.verifierName || "not found",
        };

        if (margin <= 0.25) {
          // if (issue.number === 84) {// ***USED FOR TEST***

          const body = newAllocationRequestComment(
            info.address,
            info.dcAllocationRequested,
            "90TiB",
            info.msigAddress
          );

          logGeneral(`CREATE REQUEST COMMENT issue number ${info.issueNumber}`
          );
          // console.log("info", info)
          // console.log("client", client)
          const commentResult = await octokit.issues.createComment({
            owner,
            repo,
            issue_number: info.issueNumber,
            body,
          });
          if (commentResult.status === 201) {
            await octokit.issues.addLabels({
              owner,
              repo,
              issue_number: info.issueNumber,
              labels: ["bot:readyToSign"],
            });
            await octokit.issues.removeAllLabels({
              owner,
              repo,
              issue_number: info.issueNumber,
            });
          }

          //METRICS
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
          ); //TEST
          logGeneral(`issue n ${issue.number}, posted subsequent allocation comment.`
          );
          issueInfoList.push(info);
        }
      } catch (error) {
        logGeneral(` Error, issue n ${issue.number}: ${error}`);
        console.log(
          `**Please, check that the datacap for the issue client has been granted**`
        );
        continue;
      }
    }
    await commentStats(issueInfoList);
    logGeneral(`Issue number 0 Subsequent-Allocation-Bot ended. Number of issues commented: ${issueInfoList.length}`
    );
    logGeneral(`Issue number 0 Subsequent-Allocation-Bot - issues commented: ${issueInfoList.map(
        (info: any) => info.issueNumber
      )}`
    );
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
        githubHandles
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
  allocationDatacap: number,
  requestNumber: number
) => {

  let dcAmountBytes = 0;
  console.log("req number:", requestNumber)
  switch (requestNumber) {
    case 0: //1nd req (won't never happen here :) - 50%
      dcAmountBytes = allocationDatacap / 2;
      break;
    case 1: //2nd req - 100% of the amount in the issue
      dcAmountBytes = allocationDatacap;
      break;
    case 2: //3rd req - 200% of the amount in the issue
      dcAmountBytes = allocationDatacap * 2;
      break;
    case 3: //4th req - 400% of the amount in the issue
      dcAmountBytes = allocationDatacap * 4;
      break;

    default:
      //5th req on - 800% of the amount in the issue
      dcAmountBytes = allocationDatacap * 8;
      break;
  }

  return bytesToiB(Math.floor(dcAmountBytes));
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
