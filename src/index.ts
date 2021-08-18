import { Octokit } from "@octokit/rest"
import { createAppAuth } from "@octokit/auth-app"
import { config } from "./config";


const allocationDatacap = async () => {
    const octokit = await new Octokit({
        auth: config.githubToken,
    });

    const rawIssues = await octokit.issues.listForRepo({
        owner: config.githubLDNOwner,
        repo: config.githubLDNRepo,
        state: 'open'
    })

    for (const issue of rawIssues.data) {
        //Parse client address from issue description
        //Parse total datacap requested from Multisig Notary requested comment
        //Check datacap remaining for this address
    }
}


allocationDatacap()
