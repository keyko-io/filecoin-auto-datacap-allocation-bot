//
/**
 * @info scratch the repository & fill the spreadsheet - ideally this is ran just at the creation of the spreadsheet
 * @info to update a single row in the spreadsheet, create an object using the SpreadsheetData type, and call run() from the tools
 * @info to call run(), you need to pass a SpreadsheetData wrapped within an array
 */

import { Octokit } from "@octokit/rest";
import { config } from "../config";
import { SpreadsheetData } from '../types'
import {
    parseReleaseRequest,
    parseIssue,
} from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import {
    run
} from "../../deps/filecoin-verifier-tools/metrics/spreadsheetFiller"
import { createAppAuth } from "@octokit/auth-app";
import { commentsForEachIssue } from '../utils'


const credentials = {
    "type": "service_account",
    "project_id": "vaulted-hangout-342008",
    "private_key_id": "71e5d905ba2e6c04d0d55c90b8df2fe650a3b8f0",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCpskGQtnevpTyr\nZRqLqJl5oq15eH0/6/FEk4J1PLke/vUlkZ1ualqGxDSnt7PtdU+wWbU/FdwlYI9W\n9u5kZwy3Yy3+z+fz6zpDe8IQcRR0A8yLrh2MSgKi+PbID1rv9a8/S5asm0ogfDw7\ntUZXjLgCEw5HvzfSWElRA/+VGahEn7TLHekLFPLfpoxomBmDXEKN1ixjCHs1AkWj\nlJpjKd5pd0pE/xcEeqbPZjUa5RK69MeF1t+uUOOexehKbLboqqpkrP5cL2zmSYyS\nxIKdneY8scOVrXXYcEosLAnIyvLmprw330nfGCOSdVv46unWhi9INNU5zJZaMlvB\ncnG4A+MjAgMBAAECggEABNveRbr7xVM5X/z2nB4ZOuLeDbbV+0ERuPFyUFILSOhq\n84buV42DBw3SJiU76SYtQHLpHiPNmGJh6E8Mt2I9+nhEBmJElXbcRbdi8J6UQ9gi\nALPdE7nAxpLTWhoac/l4aZsL9uhBYJm+DcWcfIBCeoi6JXLDsemmO8QeCtJfv4s5\nK3ATMm+5jftyz/wxQM7NeigK3+RnKCxHJQ1viQC301eGqgZFY3KF5nctfxb9K06l\nWRaper2Nrwx7z0X19l2tAE8E2K+4NiNxZOaF8bBQoZxi0SBvwR63pWq4DfUkcTOQ\nW0NLq69PNTR4nU4KnQzpQL20Tfo+kY19twRihVOCoQKBgQDY/3znB2xpzZ0tqZCD\n009JPCEbJQW/tR7jwwm4ldnIm9GSYuInYZnK0fTGB8O3ChIOqKrFT48ei33l9vkW\nO9AjVVPxh+jMxf0/v5rrpIhQMRh+yH6wK3ysrCfIhMEoyLmyQSAUAmz1A4jpeass\nTAN3E0RZuDwkgxbl4lu/qI+iQwKBgQDIMlKult7m1Xa9+rbs7lIaIoB4upin6Y7B\niJssOtOwkYEn4XCTc7AKTr3Etm6bbcpH8OJbQM6sGILCTtg1VUAdD3tFfEX1EdDm\nZELH/RLQYHPDD3NF+Y7C7iEc0QF7N4EwDMI4hmISuc37KA16rkAaaVUFVoQGF8Oi\njJtLcMndoQKBgEmht+I09KaaLIF4Dh+NLlQtYRZy45Z/gPHMFppZzsJxjRVdFFxE\nlAjsYWBo9hJACoyK0xeMvYWh06Cawz62IRQ8OfW1JluFuz9MZucat15uql8q7UIe\nH3oAGKfD1D9gjRJdYuMnR42EG4sNy/WF/Y8ELKc9Crtg9/4dZwCL0+E9AoGBAKjM\n3bB+X8Ys+Sko6/KM5EdLDh4935e9M/R1VbmOhI3dshRJXx3FLwsR56qk1FBT23qb\nXpDo7RpotGBYEK+viRa3xg4JwgbolcadhT2RYrq2iQVQ0raOvNQZ62ubw278lv5H\n07/Ld4goiMibtfnaUQy0Ac81aq6kfP1jJ1IN8PfhAoGAZq+KwXph61881s3w/1ol\n9p7KoZh34eqAP3nAajeF7LtWRrYTAEnSi1bJwu2CT3FwYNcghQgLFINE5XLbuylI\nlMBawoZFNRSdF7p10t3djokCugpsFEb3cH9N67ByD7QsWuL5scU4C7tNASgVuC9S\nM8wLh1AhZrubVu6NKStOW1s=\n-----END PRIVATE KEY-----\n",
    "client_email": "ldn-bot@vaulted-hangout-342008.iam.gserviceaccount.com",
    "client_id": "109429165558693272524",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/ldn-bot%40vaulted-hangout-342008.iam.gserviceaccount.com"
}

const OWNER = config.githubLDNOwner;
const REPO = config.githubLDNRepo;
const SPREADSHEET_ID = '1VPp7ijhJYuDl1xNqosV1jm0sGkyKOGmcK4ujYtG8qZE'
const SHEET_NAME = 'TestSheet'

//TODO make those common
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

const fillSpreadsheet = async () => {


    const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
        owner: OWNER,
        repo: REPO,
        state: 'all'
    });

    const commentsEachIssue: any = await commentsForEachIssue(octokit, rawIssues)

    //loop each issue and check each event
    const spreadsheetDataArray =
        await Promise.all(
            rawIssues.map(async (issue: any) => {
                const { number, body, title, labels, user, state, assignee, created_at, updated_at, closed_at } = issue

                const parsedIssue = parseIssue(body)
                let msigAddress = ""
                let requestCount = 0
                let comment: any = {}
                const issueCommentsAndNumber: any = commentsEachIssue.find((item: any) => item.issueNumber === number)
                for (comment of issueCommentsAndNumber.comments) {
                    const msigComment = await parseReleaseRequest(comment.body);
                    if (msigComment.correct) {
                        msigAddress = msigComment.notaryAddress
                        requestCount++
                    }
                }


                const spreadsheetData: SpreadsheetData = {
                    issueNumber: number,
                    status: labels?.map((label: any) => label.name).toString() || "",
                    author: user?.login || "",
                    title,
                    isOpen: state === 'open'? 'yes':'no',
                    assignee: assignee?.login || "",
                    created_at,
                    updated_at,
                    closed_at: closed_at ? closed_at : "",
                    clientName: parsedIssue?.name || "",
                    clientAddress: parsedIssue?.address || "",
                    msigAddress,
                    totalDataCapRequested: parsedIssue?.datacapRequested || "",
                    weeklyDataCapRequested: parsedIssue?.dataCapWeeklyAllocation || "",
                    numberOfRequests: String(requestCount),

                }
                return spreadsheetData
            })
        )


    run(spreadsheetDataArray)

}


fillSpreadsheet()
