import { config } from "./config";
import { bytesToiB } from "./utils";
import { multisigApprovalComment, newAllocationRequestComment, statsComment } from "./comments";
import axios from "axios";
import { logGeneral, logWarn, logDebug, logError } from './logger/consoleLogger'
import { checkLabel } from "./utils";
import OctokitInitializer from "./initializers/OctokitInitializer";
import ApiInitializer from "./initializers/ApiInitializer";

const api = ApiInitializer.getInstance()
const octokit = OctokitInitializer.getInstance()


export const multisigMonitoring = async () => {
    logGeneral(`${config.LOG_PREFIX} 0 Subsequent-Allocation-Bot started - check V3 multisig address DataCap`);
    //Steps:

    // use env var to store the issue number of the V3 msig
    const V3_MULTISIG_ADDRESS = config.V3_MULTISIG_ADDRESS



    // vars with BASELINE means that this is the base datacap to be assignes. 
    // it can be more if the usage is more than 2 weeks is bigger than the baseline amount
    const V3_MULTISIG_BASELINE_DATACAP_ALLOWANCE_BYTES = config.V3_MULTISIG_DATACAP_ALLOWANCE_BYTES
    const V3_MARGIN_COMPARISON_PERCENTAGE = config.V3_MARGIN_COMPARISON_PERCENTAGE
    const V3_MULTISIG_ISSUE_NUMBER: number = config.V3_MULTISIG_ISSUE_NUMBER

    const issue = await octokit.issues.get({
        owner: config.githubLDNOwner,
        repo: config.githubNotaryRepo,
        issue_number: V3_MULTISIG_ISSUE_NUMBER,
    });

    if (!checkLabel(issue.data)) {
        return
    }



    // get datacap remaining and parse from b to tib
    // use getAllowanceForAddress
    let dataCapRemainingBytes = 0
    if (config.networkType !== "test") {
        const v3MultisigAllowance = await axios({
            method: "GET",
            url: `${config.filpusApi}/getAllowanceForAddress/${V3_MULTISIG_ADDRESS}`,
            headers: {
                "x-api-key": config.filplusApiKey,
            },
        });
        dataCapRemainingBytes = v3MultisigAllowance.data.allowance
    }
    else {
        dataCapRemainingBytes = await api.checkVerifier(V3_MULTISIG_ADDRESS).datacap
    }

    // calculate margin ( dc remaining / 25PiB) --> remember to convert to bytes first
    let margin = 0
    if (dataCapRemainingBytes > 0) {
        margin = dataCapRemainingBytes / V3_MULTISIG_BASELINE_DATACAP_ALLOWANCE_BYTES;
    }

    // if margin < 0.25 post a comment to request the dc
    let createAllocationComment
    if (margin < V3_MARGIN_COMPARISON_PERCENTAGE) {
        try {

            const datacapToBeRequested =
                config.networkType == 'test' ?
                    config.V3_MULTISIG_DATACAP_ALLOWANCE :
                    await checkV3LastTwoWeeksAndReturnDatacapToBeRequested(V3_MULTISIG_BASELINE_DATACAP_ALLOWANCE_BYTES)

            const body = multisigApprovalComment(V3_MULTISIG_ADDRESS, datacapToBeRequested)
            createAllocationComment = await octokit.issues.createComment({
                owner: config.githubLDNOwner,
                repo: config.githubNotaryRepo,
                issue_number: V3_MULTISIG_ISSUE_NUMBER,
                body
            });
            await octokit.issues.addLabels({
                owner: config.githubLDNOwner,
                repo: config.githubNotaryRepo,
                issue_number: V3_MULTISIG_ISSUE_NUMBER,
                labels: ["status:Approved"],
            });


            //check all the labels, if addedOnChain exist remove it
            const issueContent = await octokit.rest.issues.get({
                owner: config.githubLDNOwner,
                repo: config.githubNotaryRepo,
                issue_number: V3_MULTISIG_ISSUE_NUMBER,
            });

            const allLabels = issueContent.data.labels

            const addedOnchainExist = allLabels.find((item: any) => item.name === "status:AddedOnchain")

            if (addedOnchainExist) {
                await octokit.rest.issues.removeLabel({
                    owner: config.githubLDNOwner,
                    repo: config.githubNotaryRepo,
                    issue_number: V3_MULTISIG_ISSUE_NUMBER,
                    name: "status:AddedOnchain"
                });
            }

            logGeneral(`${config.LOG_PREFIX} 0 Subsequent-Allocation-Bot dc request for v3 msig triggered.`);
        } catch (error) {
            console.log(error)
        }
        return createAllocationComment
    } else {
        logGeneral(`${config.LOG_PREFIX} 0 Subsequent-Allocation-Bot dc request for v3 msig not triggered. DataCap remaining is: ${bytesToiB(dataCapRemainingBytes)}.`);
    }
}


export const checkV3LastTwoWeeksAndReturnDatacapToBeRequested = async (baselineAllowanceBytes: number) => {
    try {
        const allowanceAssignedToLdnV3InLast2Weeks: any = await axios({
            method: "GET",
            url: `${config.filpusApi}/getAllowanceAssignedToLdnV3InLast2Weeks`,
            headers: {
                "x-api-key": config.filplusApiKey,
            },
        });


        if (allowanceAssignedToLdnV3InLast2Weeks.data.allowance > baselineAllowanceBytes) {
            // console.log('RETURN allowanceAssignedToLdnV3InLast2Weeks.allowance', allowanceAssignedToLdnV3InLast2Weeks.data.allowance)
            logDebug(`${config.LOG_PREFIX} 0 Subsequent-Allocation-Bot - datacap spent in last 2 weeks is bigger than the baseline datacap amount. requesting the 2 weeks amount.`)
            return bytesToiB(allowanceAssignedToLdnV3InLast2Weeks.allowance)
        }
        logDebug(`${config.LOG_PREFIX} 0 Subsequent-Allocation-Bot - datacap spent in last 2 weeks is less than the baseline datacap amount. requesting the baseline amount (25PiB).`)
        // console.log('RETURN baselineAllowanceBytes', baselineAllowanceBytes)
        return bytesToiB(baselineAllowanceBytes)

    } catch (error) {
        console.log('error in checkV3LastTwoWeeksAndReturnDatacapToBeRequested', error)
    }
}