import { Octokit } from "@octokit/rest";
import { config } from "./config";
import { createAppAuth } from "@octokit/auth-app"
import { matchGroupLargeNotary } from "@keyko-io/filecoin-verifier-tools/utils/common-utils"

const OWNER = process.env.GITHUB_LDN_REPO_OWNER;
const REPO = process.env.GITHUB_NOTARY_REPO;

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

//TODOS
//get the issues with spesific number,
//parse the address
//create comment with the structure in the github 

const issuesToRemoveDatacap = [242, 271]

export const removeDatacap = async (issues: number[]) => {
    for (let issue of issues) {
        try {
            const issueContent = await octokit.rest.issues.get({
                owner: OWNER,
                repo: REPO,
                issue_number: issue
            });

            const regexAddress = /-\s*On-chain\s*Address\(es\)\s*to\s*be\s*Notarized:\s*(.*)/mi
            const address = matchGroupLargeNotary(regexAddress, issueContent.data.body)

            await octokit.issues.createComment({
                owner: OWNER,
                repo: REPO,
                issue_number: issue,
                body: `\r\n## Request Approved\r\n#### Address\r\n> ${address}\r\n#### Datacap Allocated\r\n> 0TiB\r\n`
            });

        } catch (error) {
            console.log(error)
        }
    }

}


removeDatacap(issuesToRemoveDatacap)