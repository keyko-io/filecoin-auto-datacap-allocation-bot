import { Octokit } from "@octokit/rest"
import { config } from "./config";
import { bytesToiB, anyToBytes } from "./utils";
import { newAllocationRequestComment, statsComment } from "./comments";
import VerifyAPI from "@keyko-io/filecoin-verifier-tools/api/api.js";
import { parseReleaseRequest, parseApprovedRequestWithSignerAddress, parseIssue, parseMultisigReconnectComment } from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import axios from "axios";
import { createAppAuth } from "@octokit/auth-app";
import { EVENT_TYPE, MetricsApiParams } from "./Metrics"
const { callMetricsApi } = require('@keyko-io/filecoin-verifier-tools/metrics/metrics')

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const PHASE = "Subsequent Allocation"

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
    topProvider?: string,
    lastTwoSigners?: string[]
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
        installationId: config.installationID,
        appId: config.appId,
        privateKey: formatPK(),
        clientId: config.clientId,
        clientSecret: config.clientSecret
    }
});

const checkLabels = (issue: any) => {
    if (issue.labels.find((item: any) => item.name === "bot:readyToSign")) {
        console.log(`[${PHASE}] Issue number ${issue.number} skipped --> bot:readyToSign is present`)
        return false
    }
    if (issue.labels.find((item: any) => item.name === "status:needsDiligence")) {
        console.log(`[${PHASE}] Issue number ${issue.number} skipped -->status:needsDiligence is present`)
        return false
    }
    if (issue.labels.find((item: any) => item.name === "status:Error")) {
        console.log(`[${PHASE}] Issue number ${issue.number} skipped --> status:Error is present`)
        return false
    }
}

const checkLastRequest = (lastRequest: any, issue: any) => {
    if (lastRequest === undefined) {
        console.log(`[${PHASE}] Issue number ${issue.number} skipped --> DataCap allocation requested comment is not present`)
        return false
    }
    if (!lastRequest.allocationDatacap && !lastRequest.clientAddress) {
        console.log(`[${PHASE}] Issue number ${issue.number} skipped --> DataCap allocation requested comment is not present`)
        return false
    }
    if (!lastRequest.clientAddress) {
        console.log(`[${PHASE}] Issue number ${issue.number} skipped --> clientAddressnot found after parsing the comments`)
        return false
    }
    if (!lastRequest.allocationDatacap) {
        console.log(`[${PHASE}] Issue number ${issue.number} skipped --> datacapAllocated not found after parsing the comments`)
        return false
    }
}

const getClientFromApi = async (clientAddress: any, issue: any) => {
    try {
        const clientsByVerifierRes = await axios({
            method: "GET",
            url: `${config.filpusApi}/getVerifiedClients`,
            headers: {
                "x-api-key": config.filplusApiKey
            }
        })

        const client = clientsByVerifierRes.data.data.find((item: any) => item.address == clientAddress)
        if (!client) {
            console.log(`[${PHASE}] Issue number ${issue.number} skipped --> dc not allocated yet`);
            return false
        }

        const clientAllowanceObj = await axios({
            method: "GET",
            url: `${config.filpusApi}/getAllowanceForAddress/${clientAddress}`,
            headers: {
                "x-api-key": config.filplusApiKey
            }
        })

        return {
            client,
            clientAllowanceObj
        }
    } catch (error) {
        console.error(`[${PHASE}] Issue number ${issue.number} Error --> ${error}`);
    }
}

const allocationDatacap = async () => {
    try {
        console.log(`[${PHASE}] Issue number 0 Subsequent-Allocation-Bot started.`)

        const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
            owner,
            repo,
            state: 'open'
        })

        let issueInfoList: IssueInfo[] = []
        console.log(`Number of fetched issues: ${rawIssues.length}`)
        for (const issue of rawIssues) {
            try {

                //get all comments of a issue
                const issueComments = await octokit.paginate(octokit.rest.issues.listComments, {
                    owner,
                    repo,
                    issue_number: issue.number
                });

                //start the flow to retrieve a lost issue
                if (issue.labels.find((item: any) => item.name === "bot:reconnectedIssue")) {
                    console.log(`[${PHASE}] Issue number ${issue.number} starting flow for retrieved issue --> bot:reconnectedIssue is present`)

                    const reconnectFlow = reconnectIssueFlow(issue, issueComments, issueInfoList)
                    if (!reconnectFlow) {
                        console.log(`[${PHASE}] Issue number ${issue.number} client not found - error`)
                        continue
                    }
                    console.log("issueInfoList", issueInfoList)
                    continue
                }

                if (!checkLabels(issue)) continue

                // the amount to take into account is expected weekly usage rate or 5% of total dc requested (the lower)
                // in this case I compare the entire weekly amount and 10% of total datacap requested
                const weeklyDcAllocationBytes = anyToBytes(parseIssue(issue.body).dataCapWeeklyAllocation.toString())
                const tenPercentAllocationBytes = anyToBytes(parseIssue(issue.body).datacapRequested.toString()) * 0.1
                // needed for the allocation comment
                const allocation = weeklyDcAllocationBytes <= tenPercentAllocationBytes ? weeklyDcAllocationBytes : tenPercentAllocationBytes

                //Parse dc requested msig notary address and  client address
                const requestList = await findDatacapRequested(issueComments)
                const lastRequest = requestList[requestList.length - 1]
                const requestNumber = requestList.length

                if (!checkLastRequest) continue

                const retrieveClient = await getClientFromApi(lastRequest.clientAddress, issue)
                if (!retrieveClient) continue

                const dataCapAllocatedConvert = lastRequest.allocationDatacap.endsWith("B") ? anyToBytes(lastRequest.allocationDatacap) : lastRequest.allocationDatacap
                const dataCapAllocatedBytes = Number(dataCapAllocatedConvert)
                const dataCapRemainingBytes: number = retrieveClient.clientAllowanceObj.data.allowance

                const margin = dataCapRemainingBytes / dataCapAllocatedBytes
                console.log(`[${PHASE}] Issue n ${issue.number} margin:`, margin)


                const dcAllocationRequested = calculateAllocationToRequest(allocation, requestNumber)

                // retrieve last 2 signers to put in stat comment
                const lastTwoSigners: string[] = retrieveLastTwoSigners(issueComments, issue.number)
                // console.log("issue.number",issue.number,"lastTwoSigners",lastTwoSigners)
                const info: IssueInfo = {
                    issueNumber: issue.number,
                    msigAddress: lastRequest.notaryAddress,
                    address: lastRequest.clientAddress,
                    actorAddress: retrieveClient.client.addressId ? retrieveClient.client.addressId : retrieveClient.client.address,
                    dcAllocationRequested,
                    remainingDatacap: bytesToiB(dataCapRemainingBytes),
                    lastTwoSigners,
                    topProvider: retrieveClient.client.topProvider || "0",
                    nDeals: retrieveClient.client.dealCount || "0",
                    previousDcAllocated: lastRequest.allocationDatacap || "not found",
                    // info.previousDcAllocated = bytesToiB(apiElement.allowanceArray[apiElement.allowanceArray.length - 1].allowance) || "not found"
                    nStorageProviders: retrieveClient.client.providerCount || "0",
                    clientName: retrieveClient.client.name || "not found",
                    verifierAddressId: retrieveClient.client.verifierAddressId || "not found",
                    verifierName: retrieveClient.client.verifierName || "not found"
                }

                if (margin <= 0.25) {
                    // if (issue.number === 84) {// ***USED FOR TEST***
                    // createAllocationRequestComment(info)
                    issueInfoList.push(info)
                }

            } catch (error) {
                console.log(`[${PHASE}] Error, issue n ${issue.number}: ${error}`)
                console.log(`**Please, check that the datacap for the issue client has been granted**`)
                continue
            }
        }
        await commentStats(issueInfoList)
        console.log(`[${PHASE}] Issue number 0 Subsequent-Allocation-Bot ended. Number of issues commented: ${issueInfoList.length}`)
        console.log(`[${PHASE}] Issue number 0 Subsequent-Allocation-Bot - issues commented: ${issueInfoList.map((info: any) => info.issueNumber)}`)

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
            // const apiElement = clients.find((item: any) => item.address === "f1ztll3caq5m3qivovzipywtzqc75ebgpz4vieyiq")
            const apiElement = clients.find((item: any) => item.address === info.address)
            if (apiElement === undefined) {
                throw new Error(`[${PHASE}] Error, stat comment of issue n ${info.issueNumber} failed because the bot couldn't find the correspondent address in the filplus dashboard`)
            }



            const verifiers: any = await octokit.request(`GET ${config.notariersJsonPath}`)
            const notaries = JSON.parse(verifiers.data).notaries

            const addresses = info.lastTwoSigners
            const githubHandles = addresses.map((addr: any) => notaries.find((notar: any) => notar.ldn_config.signing_address === addr).github_user[0])


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
            )

            try {
                // console.log("CREATE STATS COMMENT", info.issueNumber)
                console.log(`[${PHASE}] CREATE STATS COMMENT, issue n ${info.issueNumber}`)
                await octokit.issues.createComment({
                    owner,
                    repo,
                    issue_number: info.issueNumber,
                    body
                });

            } catch (error) {
                console.error(error)
                continue

            }

        }


    } catch (error) {
        console.error(error)
    }


}

const calculateAllocationToRequest = (allocationDatacap: number, requestNumber: number) => {

    // if it is the 2nd request (requestNumber = 1 ), assign 100% of the amount in the issue
    // from the 3rd request on, assign 200% of the amount in the issue
    const dcAmountBytes = requestNumber == 1 ? allocationDatacap :
        requestNumber >= 2 ? allocationDatacap * 2 : allocationDatacap / 2
    return bytesToiB(Math.floor(dcAmountBytes))
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
        for (let i = 0; i < issueComments.length; i++) {
            const parseRequest = await parseReleaseRequest(issueComments[i].body) //datacap allocation requested
            if (parseRequest.correct) {
                requestList.push(parseRequest)
            }
        }
        return requestList
    } catch (error) {
        console.log(error)
    }
}

const retrieveLastTwoSigners = (issueComments: any, issueNumber: any): string[] => {
    try {

        let requestList: string[] = []
        for (let i = issueComments.length - 1; i >= 0; i--) {
            if (requestList.length === 2) break
            const parseRequest = parseApprovedRequestWithSignerAddress(issueComments[i].body)
            if (parseRequest.approvedMessage) {
            }
            if (parseRequest.correct) {
                requestList.push(parseRequest.signerAddress)
            }
        }
        return requestList
    } catch (error) {
        console.log(`[${PHASE}] Error, issue n ${issueNumber}, error retrieving the last 2 signers. ${error}`)
    }
}

const reconnectIssueFlow = async (issue: any, issueComments: any[], issueInfoList: any[]) => {
    try {
        // TODO get client address
        const reconnComment = issueComments.find((comment: any) => parseMultisigReconnectComment(comment.body).correct).body
        const clientAddress = parseMultisigReconnectComment(reconnComment).clientAddress
        console.log("clientAddress",clientAddress)
        const msigAddress = parseMultisigReconnectComment(reconnComment).msigAddress
        console.log("msigAddress",msigAddress)

        //get client
        const retrieveClient = await getClientFromApi(clientAddress, issue)
        if (!retrieveClient) return false
        console.log("retrieveClient.client", retrieveClient.client)
        const datacapRemaining = retrieveClient.client.allowance

        const previousDcAllocated = retrieveClient.client.allowanceArray[retrieveClient.client.allowanceArray.length - 1].allowance
        const initialAllowance = retrieveClient.client.initialAllowance

        // calculate dc to request
        const requestNumber = retrieveClient.client.allowanceArray.length
        const datacapToRequest = calculateAllocationToRequest(initialAllowance * 2, requestNumber)
        const lastTwoSigners: string[] = retrieveLastTwoSigners(issueComments, issue.number)

        const info: IssueInfo = {
            issueNumber: issue.number,
            msigAddress,
            address: clientAddress,
            actorAddress: clientAddress,
            dcAllocationRequested: datacapToRequest,
            remainingDatacap: datacapRemaining,
            lastTwoSigners,
            topProvider: retrieveClient.client.topProvider || "0",
            nDeals: retrieveClient.client.dealCount || "0",
            previousDcAllocated: bytesToiB(previousDcAllocated),
            nStorageProviders: retrieveClient.client.providerCount || "0",
            clientName: retrieveClient.client.name || "not found",
            verifierAddressId: retrieveClient.client.verifierAddressId || "not found",
            verifierName: retrieveClient.client.verifierName || "not found"
        }
        console.log("INFO", info)

        const margin = datacapRemaining / previousDcAllocated
        console.log("MARGIN", margin)
        if (margin <= 0.25) {
            console.log("CREATE RECONNECT COMMENT")
            createAllocationRequestComment(info)
            issueInfoList.push(info)
        }
    } catch (error) {
        console.log(error)
    }

}

const createAllocationRequestComment = async (info: any) => {
    const body = newAllocationRequestComment(info.address, info.dcAllocationRequested, "90TiB", info.msigAddress)

    console.log(`[${PHASE}] CREATE REQUEST COMMENT issue number ${info.issueNumber}`)
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
        await octokit.issues.removeLabel({
            owner,
            repo,
            issue_number: info.issueNumber,
            name: "state:Granted"
        })
    }

    //METRICS
    const params: MetricsApiParams = {
        name: info.clientName,
        clientAddress: info.address,
        msigAddress: info.msigAddress,
        amount: info.dcAllocationRequested
    }
    await callMetricsApi(info.issueNumber, EVENT_TYPE.SUBSEQUENT_DC_REQUEST, params)
    console.log(`[${PHASE}] issue n ${info.issueNumber}, posted subsequent allocation comment.`)
}



allocationDatacap()
