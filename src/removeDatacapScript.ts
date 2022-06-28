import { Octokit } from "@octokit/rest";
import { config } from "./config";
import { createAppAuth } from "@octokit/auth-app"

const OWNER = process.env.GITHUB_LDN_REPO_OWNER_TEST;
const REPO = process.env.GITHUB_NOTARY_REPO_TEST;

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

//const issues = [629]

export const removeDatacap = async () => {
    try {
        const test = await octokit.rest.issues.get({
            owner: OWNER,
            repo: REPO,
            issue_number: 629
        });

        console.log(test)
    } catch (error) {
        console.log("yey")
        console.log(error)
    }
}


removeDatacap()