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

const formatPK = () =>{
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
        console.info("Welcome to the auto-datacap-allocation-bot.")
        const rawIssues = await octokit.issues.listForRepo({
            owner,
            repo,
            state: 'open'
        })

        let issueInfoList: IssueInfo[] = []
        for (const issue of rawIssues.data) {
            try {
               
                if (issue.labels.find((item: any) => item.name === "bot:readyToSign")) { 
                    continue }

                //get all comments of a issue
                const issueComments = await octokit.rest.issues.listComments({
                    owner,
                    repo,
                    issue_number: issue.number,
                });

                //Parse client address from issue description
                const address = await parseIssue(issue.body).address

                //Parse dc requested notary address and 
                const { dataCapAllocated, msigAddress } = await findDatacapRequested(issueComments)
                // console.log("dataCapAllocated", dataCapAllocated, "msigAddress", msigAddress, "address", address)
                if (!dataCapAllocated || !address) { continue }

                //Check datacap remaining for this address
                let actorAddress: any = await api.actorAddress(address) ? await api.actorAddress(address) : false

                const checkClient = actorAddress ? await api.checkClient(actorAddress) : null
                if (!checkClient) { continue }

                const dataCapAllocatedConvert = dataCapAllocated.endsWith("B") ? anyToBytes(dataCapAllocated) : dataCapAllocated
                const dataCapAllocatedBytes = Number(dataCapAllocatedConvert)
                const dataCapRemainingBytes = Number(checkClient[0].datacap)

                const margin = dataCapRemainingBytes / dataCapAllocatedBytes
                console.log("margin", margin)

                const info: IssueInfo = {
                    issueNumber: issue.number,
                    msigAddress,
                    address: address,
                    actorAddress,
                    dcAllocationRequested: !dataCapAllocated.endsWith("B") ? bytesToiB(dataCapAllocated) : dataCapAllocated,
                    remainingDatacap: bytesToiB(dataCapRemainingBytes)
                }

                if (margin <= 0.75) {
                    const body = newAllocationRequestComment(info.address, info.dcAllocationRequested, info.remainingDatacap, info.msigAddress)

                    console.info("CREATE REQUEST COMMENT")
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

                console.log(info);

            } catch (error) {
                continue
            }
        }
        commentStats(issueInfoList)
        console.info(`auto-datacap-allocation-bot ended. number of issues commented: ${issueInfoList.length}`)
    } catch (error) {
        console.warn(error)
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
            info.previousDcAllocated = bytesToiB(apiElement.allowanceArray[apiElement.allowanceArray.length - 1].allowance) || "not found"
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

const findDatacapRequested = async (issueComments: any): Promise<{ dataCapAllocated: any; msigAddress: any; }> => {
    try {

        let dc = ""
        let msigAddress = ""

        for (let i = issueComments.data.length - 1; i >= 0; i--) {
            const parseRequest = await parseReleaseRequest(issueComments.data[i].body)
            if (parseRequest.correct) {
                dc = parseRequest.allocationDatacap
                msigAddress = parseRequest.notaryAddress
                break;
            }
        }

        return {
            dataCapAllocated: dc,
            msigAddress
        }

    } catch (error) {
        console.log(error)
    }


}

allocationDatacap()
