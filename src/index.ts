import { Octokit } from "@octokit/rest"
import { config } from "./config";
import { bytesToiB, anyToBytes } from "./utils";
import { newAllocationRequestComment, statsComment } from "./comments";
import VerifyAPI from "@keyko-io/filecoin-verifier-tools/api/api.js";
import { parseReleaseRequest, parseIssue } from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import axios from "axios";
import { createAppAuth } from "@octokit/auth-app";

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;

type IssueInfo = {
    issueNumber: number,
    msigAddress: string,
    address: string,
    actorAddress: string,
    dcAllocationRequested: string,
    remainingDatacap: string,
    previousDcAllocated?: string,
    nDeals?: string,
    nStorageProviders?: string,
    verifierAddressId?: string
    verifierName?: string
    clientName?: string
    topProvider?: string
}

const api = new VerifyAPI( // eslint-disable-line
    VerifyAPI.standAloneProvider(
        process.env.NODE_URL,
        null,
        process.env.NETWORK_TYPE !== "Mainnet" // if node != Mainnet => testnet = true
    ));

const formatPK = () => {
    const BEGIN = config.beginPk
    const END = config.endPk
    const splitted = config.privateKey.match(/.{1,64}/g);
    const formatted = `${BEGIN}\n${splitted.join("\n")}\n${END}`
    return formatted;
}



const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
        type: "installation",
        installationId: 16461975,
        appId: config.appId,
        privateKey: formatPK(),
        clientId: config.clientId,
        clientSecret: config.clientSecret
    }
});


const allocationDatacap = async () => {
    try {
        console.log("Welcome to the auto-datacap-allocation-bot.")
        const rawIssues = await octokit.issues.listForRepo({
            owner,
            repo,
            state: 'open'
        })

        let issueInfoList: IssueInfo[] = []
        console.log(`Number of fetched comments: ${rawIssues.data.length}`)
        for (const issue of rawIssues.data) {
            try {
                if (issue.labels.find((item: any) => item.name === "bot:readyToSign")) {
                    console.log(`Issue number ${issue.number} skipped --> bot:readyToSign is present`)
                    continue
                }

                //get all comments of a issue
                const issueComments = await octokit.rest.issues.listComments({
                    owner,
                    repo,
                    issue_number: issue.number,
                });

                //parse weeklhy dc in issue
                const weeklyDcAllocation = parseIssue(issue.body).dataCapWeeklyAllocation;

                //Parse dc requested msig notary address and  client address
                const requestList = await findDatacapRequested(issueComments)
                const lastRequest = requestList[requestList.length - 1]
                const requestNumber = requestList.length

                if (!lastRequest.allocationDatacap && !lastRequest.clientAddress) {
                    console.log(`Issue number ${issue.number} skipped --> DataCap allocation requested comment is not present`)
                    continue
                }
                if (!lastRequest.clientAddress) {
                    console.log(`Issue number ${issue.number} skipped --> clientAddressnot found after parsing the comments`)
                    continue
                }
                if (!lastRequest.allocationDatacap) {
                    console.log(`Issue number ${issue.number} skipped --> datacapAllocated not found after parsing the comments`)
                    continue
                }



                //Check datacap remaining for this address 
                // TODO check if dc on comment has really been allocated
                let actorAddress: any = ""
                if (lastRequest.clientAddress.startsWith("f1")) {
                    actorAddress = await api.actorAddress(lastRequest.clientAddress)
                } else {
                    actorAddress = await api.cachedActorAddress(lastRequest.clientAddress)
                }

                const checkClient = await api.checkClient(actorAddress)
                console.log("checkClient", checkClient)

                const dataCapAllocatedConvert = lastRequest.allocationDatacap.endsWith("B") ? anyToBytes(lastRequest.allocationDatacap) : lastRequest.allocationDatacap
                const dataCapAllocatedBytes = Number(dataCapAllocatedConvert)
                const dataCapRemainingBytes = Number(checkClient[0].datacap)

                const margin = dataCapRemainingBytes / dataCapAllocatedBytes
                console.log("Margin", margin)


                const dcAllocationRequested = calculateAllocationToRequest(weeklyDcAllocation, requestNumber)

                const info: IssueInfo = {
                    issueNumber: issue.number,
                    msigAddress: lastRequest.notaryAddress,
                    address: lastRequest.clientAddress,
                    actorAddress,
                    dcAllocationRequested,
                    remainingDatacap: bytesToiB(dataCapRemainingBytes)
                }

                if (margin <= 0.75) {
                // if (issue.number === 80) {
                    const body = newAllocationRequestComment(info.address, info.dcAllocationRequested, info.remainingDatacap, info.msigAddress)

                    console.log("CREATE REQUEST COMMENT")
                    const commentResult = await octokit.issues.createComment({
                        owner,
                        repo,
                        issue_number: info.issueNumber,
                        body
                    });
                    if (commentResult.status === 201) {
                        await octokit.issues.addLabels({
                            owner,
                            repo,
                            issue_number: info.issueNumber,
                            labels: ['bot:readyToSign']
                        })
                    }

                    issueInfoList.push(info)
                }

                console.log("Info", info);

            } catch (error) {
                console.log(`Error with the issue n ${issue.number}:`)
                console.log(error)
                console.log(`**Please, check that the datacap for the issue client has been granted**`)
                continue
            }
        }
        commentStats(issueInfoList)
        console.log(`Auto-datacap-allocation-bot ended. Number of issues commented: ${issueInfoList.length}`)
    } catch (error) {
        console.error("error listing the issues, generic error in the bot")
        console.error(error)
    }

}

const commentStats = async (list: IssueInfo[]) => {
    try {
        const apiClients = await axios({
            method: "GET",
            url: `${config.filpusApi}/getVerifiedClients`,
            headers: {
                "x-api-key": config.filplusApiKey
            }
        })

        const clients = apiClients.data.data;

        //get stats & comment
        for (const info of list) {


            const apiElement = clients.find((item: any) => item.address === info.address)

            info.topProvider = apiElement.top_provider || "0"
            info.nDeals = apiElement.dealCount || "0"
            info.previousDcAllocated = info.dcAllocationRequested || "not found"
            // info.previousDcAllocated = bytesToiB(apiElement.allowanceArray[apiElement.allowanceArray.length - 1].allowance) || "not found"
            info.nStorageProviders = apiElement.providerCount || "0"
            info.clientName = apiElement.name || "not found"
            info.verifierAddressId = apiElement.verifierAddressId || "not found"
            info.verifierName = apiElement.verifierName || "not found"


            const body = statsComment(
                info.msigAddress,
                info.address,
                info.clientName,
                info.verifierAddressId,
                info.verifierName,
                info.topProvider,
                info.nDeals,
                info.previousDcAllocated,
                info.dcAllocationRequested,
                info.nStorageProviders,
                info.remainingDatacap,
                info.actorAddress,
            )
            await octokit.issues.createComment({
                owner,
                repo,
                issue_number: info.issueNumber,
                body
            });

        }


    } catch (error) {
        console.error(error)
    }


}



const calculateAllocationToRequest = (allocationDatacap: string, requestNumber: number) => {
    // transform in bytes
    const bytesAllocationDatacap = allocationDatacap.endsWith("B") ? anyToBytes(allocationDatacap) : parseInt(allocationDatacap)

    // if it is the 2nd request (requestNumber = 1 ), assign 100% of the amount in the issue
    // from the 3rd request on, assign 200% of the amount in the issue
    console.log("requestNumber", requestNumber)
    const dcAmountBytes = requestNumber == 1 ? bytesAllocationDatacap  :
        requestNumber >= 2 ? bytesAllocationDatacap*2 : bytesAllocationDatacap/2

    const dcAmountiB = bytesToiB(dcAmountBytes)
    return dcAmountiB
}

const findDatacapRequested = async (issueComments: any): Promise<
    {
        multisigMessage: boolean,
        correct: boolean,
        notaryAddress: string,
        clientAddress: string,
        allocationDatacap: string,
        allocationDataCapAmount: string[]
    }[]
> => {
    try {

        let requestList: any[] = []
        for (let i = 0; i < issueComments.data.length; i++) {
            const parseRequest = await parseReleaseRequest(issueComments.data[i].body)
            if (parseRequest.correct) {
                requestList.push(parseRequest)
            }
        }
        return requestList
    } catch (error) {
        console.log(error)
    }


}

allocationDatacap()
