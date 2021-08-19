import { Octokit } from "@octokit/rest"
import { createAppAuth } from "@octokit/auth-app"
import { config } from "./config";
import { matchGroup, matchAll, bytesToiB, anyToBytes, bytesToB } from "./utils";
const VerifyAPI = require("@keyko-io/filecoin-verifier-tools/api/api.js");




const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;

type issueInfo = {
    issueNumber: number,
    address: string,
    dataCapRequested: string,
    dataCapRemaining: string,
}

const allocationDatacap = async () => {
    try {
        const octokit = await new Octokit({
            auth: config.githubToken,
        });

        const api = new VerifyAPI( // eslint-disable-line
            VerifyAPI.standAloneProvider(
                process.env.NODE_URL,
                null,
                process.env.NETWORK_TYPE !== "Mainnet" // if node != Mainnet => testnet = true
            ));

        const rawIssues = await octokit.issues.listForRepo({
            owner,
            repo,
            state: 'open'
        })

        for (const issue of rawIssues.data) {
            try {
                const issueComments = await octokit.rest.issues.listComments({
                    owner,
                    repo,
                    issue_number: issue.number,
                });


                //Parse client address from issue description
                const regexAddress = /-\s*On-chain\s*address\s*for\s*first\s*allocation:\s*(.*)/m
                const address = matchGroup(regexAddress, issue.body)

                //Parse total datacap requested from Multisig Notary requested comment
                const regexTotalDatacap = /####\s*Total\s*DataCap\s*requested\s*(.*)\n>\s*(.*)/g
                const filteredBody = issueComments.data.find((item: any) => regexTotalDatacap.test(item.body))?.body
                regexTotalDatacap.exec(filteredBody)
                const datacapRequested = filteredBody ? matchAll(regexTotalDatacap, filteredBody)[0] : "DataCap not requested yet"

                //Check datacap remaining for this address

                let actorAddress: any = await api.actorAddress(address) ? await api.actorAddress(address) : false
                // console.log("actorAddress after catch", actorAddress)


                const checkClient = actorAddress ? await api.checkClient(actorAddress) : null
                // console.log("checkClient", checkClient)
                // console.log("checkClient.datacap[0]", checkClient[0].datacap)
                // console.log("anyToBytes(checkClient.dataCap)", bytesToiB(checkClient[0].datacap))



                const info: issueInfo = {
                    issueNumber: issue.number,
                    address: address,
                    dataCapRequested: datacapRequested,
                    dataCapRemaining: bytesToiB(checkClient[0].datacap),
                }
                console.log(info);

            } catch (error) {
                continue
            }





        }
    } catch (error) {
        console.warn(error)
    }

}


allocationDatacap()
