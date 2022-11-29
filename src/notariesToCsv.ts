import { Octokit } from "@octokit/rest";
import { config } from "./config";
import { createAppAuth } from "@octokit/auth-app"
import { matchGroupLargeNotary } from "@keyko-io/filecoin-verifier-tools/utils/common-utils"
import {
    parseIssue,
} from "@keyko-io/filecoin-verifier-tools/utils/notary-issue-parser"
import fs from 'fs'
import path from "path";
import { stringify } from "csv-stringify"

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


const headers = [
    "number",
    "name",
    "organization",
    "address",
    "country",
    "region",
    "useCases",
    "datacapRequested",
    "behalf",
    "website",
    "q#1",
    "q#2",
    "q#3",
    "q#4",
    "q#5",
    "q#6",
    "q#7",
    "q#8",
    "q#9",
    "q#10",
    "q#11",
    "q#12",
    "q#13",
    "q#14",
    "q#15",
    "q#16",
    "q#17",
    "q#18",
    "q#19",
]

const createCsv = async () => {

    const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
        owner: OWNER,
        repo: REPO,
        state: 'all',
        labels: "Round 4 Notary"
    });

    const csv = {
        rows: [
            headers
        ]
    }

    const wrongs = []
    for (let issue of rawIssues) {
        console.log(issue.number)

        const issueData = [issue.number.toString()]
        const parsedIssue = parseIssue(issue.body)

        issueData.push(parsedIssue.name)
        issueData.push(parsedIssue.organization)
        issueData.push(parsedIssue.address)
        issueData.push(parsedIssue.country)
        issueData.push(parsedIssue.region)
        issueData.push(parsedIssue.useCases)
        issueData.push(parsedIssue.datacapRequested)
        issueData.push(parsedIssue.behalf)
        issueData.push(parsedIssue.website)


        const spl = issue.body.split("```")
        const rg = /(\r\n)(.*?)(\r\n)/m
        for (let i = 0; i < spl.length; i++) {
            if (i % 2 != 0) {
                if (!spl[i].match(rg)) {
                    console.log('wrong issue:', issue.number)
                    wrongs.push(issue.number)
                    continue
                }
                console.log(spl[i].match(rg[2]))
                issueData.push(spl[i].match(rg).input)
            }
        }
        csv.rows.push(issueData)
    }

    stringify(csv.rows, function (err, output) {
        fs.writeFile('notaries.csv', output, 'utf8', function (err) {
            if (err) {
                console.log('Some error occured - file either not saved or corrupted file saved.');
            } else {
                console.log('It\'s saved!');
            }
        });
    });


}