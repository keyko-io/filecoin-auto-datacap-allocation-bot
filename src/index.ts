import { Octokit } from "@octokit/rest"
import { createAppAuth } from "@octokit/auth-app"
import { config } from "./config";
import { matchGroup, matchAll, bytesToiB, anyToBytes, bytesToB } from "./utils";
import { newAllocationRequestComment, statsComment } from "./comments";
import VerifyAPI from "@keyko-io/filecoin-verifier-tools/api/api.js";
import axios from "axios";




const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;


type IssueInfo = {
    issueNumber: number,
    msigAddress: string,
    address: string,
    actorAddress: string,
    dcAllocationRequested: string,
    dataCapRemaining: string,
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


const allocationDatacap = async () => {
    try {
        const octokit = await new Octokit({
            auth: config.githubToken,
        });

        const rawIssues = await octokit.issues.listForRepo({
            owner,
            repo,
            state: 'open'
        })

        let issueInfoList: IssueInfo[] = []
        for (const issue of rawIssues.data) {
            try {

                //get all comments of a issue
                const issueComments = await octokit.rest.issues.listComments({
                    owner,
                    repo,
                    issue_number: issue.number,
                });

                //Parse client address from issue description
                const regexAddress = /-\s*On-chain\s*address\s*for\s*first\s*allocation:\s*(.*)/m
                const address = matchGroup(regexAddress, issue.body)

                //Parse dc requested notary address and 
                const { dataCapAllocated, msigAddress } = await findDatacapRequested(issueComments)
                console.log("dataCapAllocated", dataCapAllocated, "msigAddress", msigAddress)
                if (!dataCapAllocated) { continue }

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
                    dataCapRemaining: bytesToiB(dataCapRemainingBytes)
                }

                if (margin <= 0.75) {
                    const body = newAllocationRequestComment(info.address, info.dcAllocationRequested, info.dataCapRemaining, info.msigAddress)

                    console.info("CREATE REQUEST COMMENT")
                    await octokit.issues.createComment({
                        owner,
                        repo,
                        issue_number: info.issueNumber,
                        body
                    });

                    issueInfoList.push(info)
                }

                console.log(info);

            } catch (error) {
                continue
            }
        }

        commentStats(issueInfoList)
    } catch (error) {
        console.warn(error)
    }

}

//Previous DC allocated,- allowanceArray[arr.length-1].allowance  #deals-dealCount, #storage providers-providerCount, % deal allocation
const FILPLUS_URL_API = "https://api.filplus.d.interplanetary.one/public/api"
const API_KEY = "5c993a17-7b18-4ead-a8a8-89dad981d87e"
const commentStats = async (list: IssueInfo[]) => {

    try {

        const apiClients = await axios({
            method: "GET",
            url: `${FILPLUS_URL_API}/getVerifiedClients`,
            headers: {
                "x-api-key": API_KEY
            }
        })

        const clients = apiClients.data.data;

        const octokit = await new Octokit({
            auth: config.githubToken,
        });

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

            //TODO: add verifierAddressId (notary) (link), verifierName(notary name), name (client name)

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
                info.nStorageProviders
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

allocationDatacap()
// commentStats()

const findDatacapRequested = async (issueComments: any): Promise<{ dataCapAllocated: any; msigAddress: any; }> => {
    try {
        const regexNotaryAddress = /####\s*Multisig\s*Notary\s*address\s*>\s*(.*)/g
        const regexAllocationDatacap = /####\s*DataCap\s*allocation\s*requested\s*\n>\s*(.*)/g

        let filteredBody = []
        for(let item of issueComments.data){
            const exDc = regexAllocationDatacap.exec(item.body)
            const exMsig = regexNotaryAddress.exec(item.body)
            const dcc = matchGroup(regexAllocationDatacap,exDc?.input)
            matchGroup(regexNotaryAddress,item.body)
            if (exMsig && exDc) {
                filteredBody.push({comment: item.body })
            }
           continue;
        }

        const exDc = regexAllocationDatacap.exec(filteredBody[filteredBody.length - 1]?.comment)
        const exMsig = regexNotaryAddress.exec(filteredBody[filteredBody.length - 1]?.comment)
        console.log(".........")
        return {
            dataCapAllocated: exDc ? exDc[1] : null,
            msigAddress: exMsig ? exMsig[1] : null
        }
    } catch (error) {
        console.log(error)
    }


}




