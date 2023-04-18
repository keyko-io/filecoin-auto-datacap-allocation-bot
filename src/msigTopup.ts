import { config } from "./config";
import { anyToBytes, bytesToiB } from "./utils";
import { multisigApprovalComment } from "./comments";
import axios from "axios";
import { logGeneral, logDebug } from './logger/consoleLogger'
import { checkLabel } from "./utils";
import OctokitInitializer from "./initializers/OctokitInitializer";
import ApiInitializer from "./initializers/ApiInitializer";
import { V3Exception } from "./types/types"
import fvc from "filecoin-verfier-common"
const { ISSUE_LABELS } = fvc



const api = ApiInitializer.getInstance()
const octokit = OctokitInitializer.getInstance()
const exceptions = config.exceptionJson


export const msigTopup = async () => {
    try {
        logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot started - check V3 multisig address DataCap`);

        // use env var to store the issue number of the V3 msig
        // vars with BASELINE means that this is the base datacap to be assignes. 
        // it can be more if the usage is more than 2 weeks is bigger than the baseline amount
        const address = config.v3MultisigAddress
        const dcAllowanceBytes = config.v3MultisigDatacapAllowanceBytes
        const marginPercentage = config.v3MarginComparisonPercentage
        const issueNumber: number = config.v3MultisigIssueNumber

        const issue = await octokit.issues.get({
            owner: config.githubLDNOwner,
            repo: config.githubNotaryRepo,
            issue_number: issueNumber,
        });

        if (checkLabel(issue.data).skip) {
            return false
        }



        // get datacap remaining and parse from b to tib
        // use getAllowanceForAddress
        let dataCapRemainingBytes: number = 0
        const v3MultisigAllowance = await axios({
            method: "GET",
            url: `${config.filpusApi}/getAllowanceForAddress/${address}`,
            headers: {
                "x-api-key": config.filplusApiKey,
            },
        });
        dataCapRemainingBytes = v3MultisigAllowance.data.allowance as number

        // calculate margin ( dc remaining / 25PiB) --> remember to convert to bytes first
        let margin = 0
        if (dataCapRemainingBytes > 0) {
            margin = dataCapRemainingBytes / dcAllowanceBytes;
        }

        // if margin < 0.25 post a comment to request the dc
        let createAllocationComment
        if (margin < marginPercentage) {
            // try {

            const datacapToBeRequested =
                config.networkType == 'test' ?
                    config.v3MultisigDatacapAllowance :
                    await checkV3LastTwoWeeksAndReturnDatacapToBeRequested(dcAllowanceBytes)

            const body = multisigApprovalComment(address, datacapToBeRequested)
            createAllocationComment = await octokit.issues.createComment({
                owner: config.githubLDNOwner,
                repo: config.githubNotaryRepo,
                issue_number: issueNumber,
                body
            })
            const removeAllLabels = await octokit.issues.removeAllLabels({
                owner: config.githubLDNOwner,
                repo: config.githubNotaryRepo,
                issue_number: issueNumber,

            })
            if (removeAllLabels) {
                await octokit.issues.addLabels({
                    owner: config.githubLDNOwner,
                    repo: config.githubNotaryRepo,
                    issue_number: issueNumber,
                    labels: [ISSUE_LABELS.READY_TO_SIGN, "Notary Application"],
                });
            }

            logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot dc request for v3 msig triggered. issue ${config.v3MultisigIssueNumber}`);
            return createAllocationComment
        } else {
            logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot dc request for v3 msig not triggered. DataCap remaining is: ${bytesToiB(dataCapRemainingBytes)}.`);
        }
    } catch (error) {
        console.log(error)
    }

}


/**
 * 
 */
export const checkV3LastTwoWeeksAndReturnDatacapToBeRequested = async (baselineAllowanceBytes: number) => {
    try {
        const allowanceAssignedToLdnV3InLast2Weeks: any = await axios({
            method: "GET",
            url: `${config.filpusApi}/getAllowanceAssignedToLdnV3InLast2Weeks`,
            headers: {
                "x-api-key": config.filplusApiKey,
            },
        });

        const apiAllowance = (allowanceAssignedToLdnV3InLast2Weeks.data.allowance as number) * 2


        if (apiAllowance > baselineAllowanceBytes) {
            logDebug(`${config.logPrefix} 0 Subsequent-Allocation-Bot - datacap spent in last 2 weeks is bigger than the baseline datacap amount. requesting the 2 weeks amount.`)
            return bytesToiB(apiAllowance)
        }
        logDebug(`${config.logPrefix} 0 Subsequent-Allocation-Bot - datacap spent in last 2 weeks is less than the baseline datacap amount. requesting the baseline amount (25PiB).`)
        return bytesToiB(baselineAllowanceBytes)

    } catch (error) {
        console.log('error in checkV3LastTwoWeeksAndReturnDatacapToBeRequested', error)
    }
}


// TODO use if (!checkLabel(issue.data)) {
//     return
// } to check labels

export const exceptionMsigTopup = async () => {
    if (!config.exceptionJson.length) {
        logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot there are no exception msig to check.`);
        return {
            status: 400,
            message: 'there are no exception msig to check.'
        }
    }
    // else console.log(config.exceptionJson)
    // return
    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot Checking v3 exception msig, started`);

    return await Promise.allSettled(
        exceptions.map((exception: V3Exception) => new Promise<any>(
            async (resolve, reject) => {
                try {
                    //Steps:

                    // use env var to store the issue number of the V3 msig
                    const address = exception.notary_msig
                    const dcAllowance = exception.notary_msig_datacap
                    const dcAllowanceBytes = anyToBytes(exception.notary_msig_datacap)
                    const marginPercentage = config.v3MarginComparisonPercentage
                    const issueNumber = parseInt(exception.notary_msig_issue_number)

                    const issue = await octokit.issues.get({
                        owner: config.githubLDNOwner,
                        repo: config.githubNotaryRepo,
                        issue_number: issueNumber,
                    });

                    if (checkLabel(issue.data).skip) {
                        resolve(false)
                        return
                    }

                    // get datacap remaining and parse from b to tib
                    // use getAllowanceForAddress

                    let dataCapRemainingBytes = 0
                    const v3MultisigAllowance = await axios({
                        method: "GET",
                        url: `${config.filpusApi}/getAllowanceForAddress/${address}`,
                        headers: {
                            "x-api-key": config.filplusApiKey,
                        },
                    });
                    dataCapRemainingBytes = v3MultisigAllowance.data.allowance

                    dataCapRemainingBytes = dataCapRemainingBytes ? dataCapRemainingBytes : 0

                    // calculate margin ( dc remaining / 25PiB) --> remember to convert to bytes first
                    let margin = 0
                    if (dataCapRemainingBytes > 0) {
                        margin = dataCapRemainingBytes / dcAllowanceBytes;
                    }

                    // if margin < 0.25 post a comment to request the dc
                    let createdRequestComment
                    if (margin < marginPercentage) {
                        const body = multisigApprovalComment(address, dcAllowance)
                        createdRequestComment = await octokit.issues.createComment({
                            owner: config.githubLDNOwner,
                            repo: config.githubNotaryRepo,
                            issue_number: issueNumber,
                            body
                        });
                        const removeAllLabels = await octokit.issues.removeAllLabels({
                            owner: config.githubLDNOwner,
                            repo: config.githubNotaryRepo,
                            issue_number: issueNumber,

                        })
                        if (removeAllLabels) {
                            await octokit.issues.addLabels({
                                owner: config.githubLDNOwner,
                                repo: config.githubNotaryRepo,
                                issue_number: issueNumber,
                                labels: [ISSUE_LABELS.READY_TO_SIGN, "Notary Application"],
                            });
                        }


                        logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot posted dc request for v3 specific multisig triggered. Address ${address}, issue #${issueNumber}`);

                        resolve({
                            createdRequestComment,
                            dataCapRemainingBytes
                        })
                    } else {
                        logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot dc request for v3 specific multisigs not triggered. 
                        Address ${address}, issue #${issueNumber}.
                        DataCap remaining is: ${bytesToiB(dataCapRemainingBytes)}.`);
                        resolve(false)
                    }
                } catch (error) {
                    reject(error)
                }
            }
        ))
    )


}

export const addVerifiedClientLabel = async () => {

    const allIssues = await octokit.paginate(octokit.issues.listForRepo, {
        owner: config.githubLDNOwner,
        repo: config.githubLDNRepo,
        state: "open",
        labels: ISSUE_LABELS.READY_TO_SIGN
    });
    console.log("allIssues", allIssues.map((i: any) => i.number))
    const toChange = []
    for (let issue of allIssues) {
        // console.log(issue)


        const prom = new Promise(async (resolve, reject) => {
            try {
                const allComments = await octokit.paginate(
                    octokit.issues.listComments,
                    {
                        owner: config.githubLDNOwner,
                        repo: config.githubLDNRepo,
                        issue_number: issue.number,
                    })
                const filtered = allComments.filter((c: any) => c.body.startsWith("## Request Approved"))
                // resolve(filtered.length >0)
                if (filtered.length > 0) {
                    await octokit.issues.addLabels({
                        owner: config.githubLDNOwner,
                        repo: config.githubLDNRepo,
                        issue_number: issue.number,
                        labels: [ISSUE_LABELS.VERIFIED_CLIENT]
                    })
                }
            } catch (error) {
                reject(error)
            }
        })
        toChange.push(prom)
        // const prom = new Promise(async (resolve, reject) => {
        //     resolve(await octokit.issues.addLabels({
        //         owner: config.githubLDNOwner,
        //         repo: config.githubLDNRepo,
        //         issue_number: issue.number,
        //         labels: [ISSUE_LABELS.VERIFIED_CLIENT]
        //     }))
        // })
        // promArr.push(prom)
    }
    // console.log("verified filtered", verified, verified.length)
    // console.log("readyToSign filtered", readyToSign, readyToSign.length)
    console.log("PROMS", await Promise.allSettled(toChange))


}