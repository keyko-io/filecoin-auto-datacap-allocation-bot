// //COmmented cause we're not using it anymore
// /**
//  * @info scratch the repository & fill the spreadsheet - ideally this is ran just at the creation of the spreadsheet
//  * @info to update a single row in the spreadsheet, create an object using the SpreadsheetData type, and call run() from the tools
//  * @info to call run(), you need to pass a SpreadsheetData wrapped within an array
//  */

// import { Octokit } from "@octokit/rest";
// import { config } from "../config";
// import {
//     runSpreadSheetFiller
// } from "../../deps/filecoin-verifier-tools/spreadsheet/spreadsheetFiller"
// import { createAppAuth } from "@octokit/auth-app"
// import { SpreadsheetData } from "../types/types"
// import {
//     parseReleaseRequest,
//     parseIssue,
// } from "@keyko-io/filecoin-verifier-tools/lib/utils/large-issue-parser.js"
// import { commentsForEachIssue } from '../utils'

// const OWNER = config.githubLDNOwner;
// const REPO = config.githubLDNRepo;

// //TODO make those common
// const formatPK = () => {
//     const BEGIN = config.beginPk;
//     const END = config.endPk;
//     const splitted = config.privateKey.match(/.{1,64}/g);
//     const formatted = `${BEGIN}\n${splitted.join("\n")}\n${END}`;
//     return formatted;
// };

// const octokit = new Octokit({
//     authStrategy: createAppAuth,
//     auth: {
//         type: "installation",
//         installationId: config.installationID,
//         appId: config.appId,
//         privateKey: formatPK(),
//         clientId: config.clientId,
//         clientSecret: config.clientSecret,
//     },
// });

// const fillSpreadsheet = async () => {


//     const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
//         owner: OWNER,
//         repo: REPO,
//         state: 'all'
//     });

//     const commentsEachIssue: any = await commentsForEachIssue(octokit, rawIssues)

//     //loop each issue and check each event
//     const spreadsheetDataArray =
//         await Promise.all(
//             rawIssues.map(async (issue: any) => {
//                 const { number, body, title, labels, user, state, assignee, created_at, updated_at, closed_at } = issue

//                 const parsedIssue = parseIssue(body)
//                 let msigAddress = ""
//                 let requestCount = 0
//                 let comment: any = {}
//                 const issueCommentsAndNumber: any = commentsEachIssue.find((item: any) => item.issueNumber === number)
//                 for (comment of issueCommentsAndNumber.comments) {
//                     const msigComment = await parseReleaseRequest(comment.body);
//                     if (msigComment.correct) {
//                         msigAddress = msigComment.notaryAddress
//                         requestCount++
//                     }
//                 }


//                 const spreadsheetData: SpreadsheetData = {
//                     issueNumber: number,
//                     status: labels?.map((label: any) => label.name).toString() || "",
//                     author: user?.login || "",
//                     title,
//                     isOpen: state === 'open'? 'yes':'no',
//                     assignee: assignee?.login || "",
//                     created_at,
//                     updated_at,
//                     closed_at: closed_at ? closed_at : "",
//                     clientName: parsedIssue?.name || "",
//                     clientAddress: parsedIssue?.address || "",
//                     msigAddress,
//                     totalDataCapRequested: parsedIssue?.datacapRequested || "",
//                     weeklyDataCapRequested: parsedIssue?.dataCapWeeklyAllocation || "",
//                     numberOfRequests: String(requestCount),

//                 }
//                 return spreadsheetData
//             })
//         )


//         runSpreadSheetFiller(spreadsheetDataArray)

// }


//   fillSpreadsheet()
