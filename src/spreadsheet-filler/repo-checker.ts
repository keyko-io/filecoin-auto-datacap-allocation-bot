//
/**
 * @info scratch the repository & fill the spreadsheet - ideally this is ran just at the creation of the spreadsheet
 * @info to update a single row in the spreadsheet, create an object using the SpreadsheetData type, and call run() from the tools
 * @info to call run(), you need to pass a SpreadsheetData wrapped within an array
 */

import { Octokit } from "@octokit/rest";
import { config } from "../config";
import {
    runSpreadSheetFiller
} from "../../deps/filecoin-verifier-tools/spreadsheet/spreadsheetFiller"
import { createAppAuth } from "@octokit/auth-app";
import {
    prepareObject
  } from "../../deps/filecoin-verifier-tools/spreadsheet/dataBuilder"

const OWNER = config.githubLDNOwner;
const REPO = config.githubLDNRepo;

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

    const spreadsheetDataArray = prepareObject(octokit, rawIssues)


    runSpreadSheetFiller(spreadsheetDataArray)

}

/**
 * @info used for test, create the issue to be updated and update the row in the spreadsheet
 */
const updateSpreadSheet = async () => {
// const updateSpreadSheet = async (issueNumbers: IssueInfo[]) => {
    const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
      owner: OWNER,
      repo: REPO,
      state: 'all'
    });
    const issuesToUpdate = rawIssues.filter((issue:any)=> issue.number === 1)

    // const issuesToUpdate = rawIssues.filter((issue:any)=> issueNumbers.includes(issue.number))
    const issuesArray = await prepareObject(octokit,issuesToUpdate) 
    // console.log("dataArray",issuesArray)
    runSpreadSheetFiller(issuesArray)
  }


updateSpreadSheet()
