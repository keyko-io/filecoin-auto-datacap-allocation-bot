/**
 * @dev scrape github repo to send events to DMOB db
 */
import { Octokit } from "@octokit/rest";
import { config } from "./config";
import {
    runSpreadSheetFiller
} from "../deps/filecoin-verifier-tools/spreadsheet/spreadsheetFiller"
import { createAppAuth } from "@octokit/auth-app"
import { SpreadsheetData } from "./types"
import {
    parseReleaseRequest,
    parseIssue,
    parseMultisigNotaryRequest,
    parseApprovedRequestWithSignerAddress
} from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js"
import { commentsForEachIssue } from './utils'
import { EVENT_TYPE, MetricsApiParams } from "./Metrics";
import { parse } from "dotenv";
const { callMetricsApi } = require('@keyko-io/filecoin-verifier-tools/metrics/metrics')


const OWNER = config.githubLDNOwner;
const REPO = config.githubLDNRepo;

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


// CREATE_APPLICATION = "create_application",
// APPLICATION_HAS_ERRORS = "application_has_errors"
// APPLICATION_IS_GOOD = "application_is_good",
// MULTISIG_CREATION = "multisig_creation",
// MULTISIG_APPROVED= "multisig_approved",
// FIRST_DC_REQUEST = "first_datacap_request",
// DC_ALLOCATION = "datacap_allocation",
// SUBSEQUENT_DC_REQUEST = "subsequent_datacap_request",

// 4 catalin
//   FIRST_DC_REQUEST = 'first_datacap_request',
//   DC_ALLOCATION = 'datacap_allocation',
//   SUBSEQUENT_DC_REQUEST = 'subsequent_datacap_request',
const filterComments = (issues: any[], fn: any): any[] => {
    return issues
        .map((i: any) => {
            return {
                issue_number: i.issue_number,
                issue: i.issue,
                parsedIssue: i.parsedIssue,
                comments: i.comments.filter((c: any) => {
                    return fn(c.body).correct
                })

            }
        })
        .filter((el: any) => el.comments.length)
}

const scrape = async () => {
    try {

        console.log('und', (await octokit.request('GET /rate_limit', {})).data.resources.search)
        process.exit(0)

        let counter = 0
        const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
            owner: OWNER,
            repo: REPO,
            state: 'all',
        });

        // console.log('rawIssues', rawIssues[0])

        //GETTING COMMENTS
        const issueAndComments: any = (
            await Promise.allSettled(
                rawIssues.map(
                    (issue: any) =>
                        new Promise<any>(async (resolve, reject) => {
                            try {
                                const parsedIssue = parseIssue(issue.body);
                                // console.log(issue.number, data
                                let rawLargeClientComments
                                if (parsedIssue.correct) {
                                    rawLargeClientComments =
                                        await octokit.paginate(
                                            octokit.issues.listComments,
                                            {
                                                owner: OWNER,
                                                repo: REPO,
                                                issue_number: issue.number,
                                            }
                                        );

                                }
                                resolve({
                                    issue_number: issue.number,
                                    issue,
                                    comments: rawLargeClientComments,
                                    isIssueCorrect: parsedIssue.correct,
                                    parsedIssue
                                })

                            } catch (err) {
                                reject(err)
                            }
                        })
                )
            )
        ).map((i: any) => i.value)


        // console.log('comments', issueAndComments)   17063806

        // const und = issueAndComments.filter((i: any) => !i)
        
        const incorrectIssues = issueAndComments.filter((i: any) => !i.isIssueCorrect)

        //EVENT_TYPE.APPLICATION_HAS_ERRORS
        const incorrectData: any = (
            await Promise.allSettled(
                incorrectIssues.map(
                    (issue: any) =>
                        new Promise<any>(async (resolve, reject) => {
                            try {

                                const params = {
                                    issue_number: issue.issue_number,
                                    missingName: !issue.parsedIssue.name ? true : false,
                                    missingAddress: !issue.parsedIssue.address ? true : false
                                }

                                const resp = await callMetricsApi(issue.issue_number, EVENT_TYPE.APPLICATION_HAS_ERRORS, params)
                                resolve(resp)



                            } catch (err) {
                                reject(err)
                            }
                        })
                )
            )
        )


        // console.log('incorrectData',incorrectData)
        const correctIssues = issueAndComments.filter((i: any) => i.isIssueCorrect)


        //EVENT_TYPE.CREATE_APPLICATION
        const createApplication: any = (
            await Promise.allSettled(
                correctIssues.map(
                    (issue: any) =>
                        new Promise<any>(async (resolve, reject) => {
                            try {
                                // console.log(correctIssue.parsedIssue)
                                const params: MetricsApiParams = {
                                    name: issue.parsedIssue.name,
                                    clientAddress: issue.parsedIssue.address,
                                    eventDate: issue.issue.created_at
                                }
                                const resp = await callMetricsApi(issue.issue_number, EVENT_TYPE.CREATE_APPLICATION, params)
                                resolve(resp)



                            } catch (err) {
                                reject(err)
                            }
                        })
                )
            )
        )

        // console.log('createApplication', createApplication)


        //  FIRST_DC_REQUEST and SUBSEQUENT_DC_REQUEST events

        //filter only comments with request:
        const IssueAndRequestComments: any[] = filterComments(correctIssues, parseReleaseRequest)
        // console.log('IssueAndRequestComments', IssueAndRequestComments)

        const requests: any = (
            await Promise.allSettled(
                IssueAndRequestComments.map(
                    (issue: any) =>
                        new Promise<any>(async (resolve, reject) => {
                            try {

                                const firstRequest = issue.comments[0]
                                const firstRequestParams = {
                                    name: issue.parsedIssue.name,
                                    clientAddress: issue.parsedIssue.address,
                                    amount: parseReleaseRequest(firstRequest.body).allocationDatacap,
                                    eventDate: firstRequest.created_at
                                }
                                const firstResp = await callMetricsApi(issue.issue_number, EVENT_TYPE.FIRST_DC_REQUEST, firstRequestParams)
                                const subsequentsArray = issue.comments.slice(1)
                                let subsequents: Promise<any>[];

                                if (issue.comments.length) {
                                    subsequents = subsequentsArray.map(async (s: any) => {
                                        const params = {
                                            name: issue.parsedIssue.name,
                                            clientAddress: issue.parsedIssue.address,
                                            amount: parseReleaseRequest(s.body).allocationDatacap,
                                            eventDate: s.created_at
                                        }
                                        return new Promise(async (rs, rj) => {
                                            try {
                                                rs(await callMetricsApi(issue.issue_number, EVENT_TYPE.FIRST_DC_REQUEST, params))
                                            } catch (error) {
                                                rj(error)
                                            }

                                        })
                                    })
                                }

                                resolve([firstResp, ...(await Promise.allSettled(subsequents)).map((i: any) => i.value)])


                            } catch (err) {
                                reject(err)
                            }
                        })
                )
            )
        )


        // console.log('requests', requests.map((i: any) => i.value))


        // send DC_ALLOCATION event
        const IssueAndAllocationComments: any[] = filterComments(correctIssues, parseApprovedRequestWithSignerAddress)
        // console.log('IssueAndAllocationComments', IssueAndAllocationComments)

        const allocationDatacap: any = (
            await Promise.allSettled(
                IssueAndAllocationComments.map(
                    async (issue: any) =>
                        await Promise.allSettled(
                            issue.comments.map(async (comment: any) =>
                                new Promise<any>(async (resolve, reject) => {
                                    try {
                                        // console.log(correctIssue.parsedIssue)
                                        const params: MetricsApiParams = {
                                            name: issue.parsedIssue.name,
                                            clientAddress: issue.parsedIssue.address,
                                            amount: parseApprovedRequestWithSignerAddress(comment.body).datacap,
                                            messageCid: parseApprovedRequestWithSignerAddress(comment.body).message,
                                            eventDate: comment.created_at
                                        }
                                        // let resp
                                        // if (comment.body.startsWith("## Request Proposed")) {
                                        //     resolve(
                                        //         await callMetricsApi(issue.issue_number, EVENT_TYPE.DC_ALLOCATION_, params)
                                        //     )
                                        // }
                                        if (comment.body.startsWith("## Request Approved")) {
                                            // console.log('params',params, issue.issue_number,)
                                            resolve(
                                                await callMetricsApi(issue.issue_number, EVENT_TYPE.DC_ALLOCATION, params)
                                            )
                                        }
                                    } catch (err) {
                                        console.log(err)
                                        reject(err)
                                    }
                                })
                            )
                        )


                )

            )
        )



        console.log('allocationDatacap', allocationDatacap.map((i:any)=> i.value))
        // console.log("total issues", issueAndComments.length)
        // console.log("wrong issues", incorrectIssues.length)
        // console.log("correct issues", correctIssues.length)
        // console.log("createApplication (should be the same n of corrext issues)", createApplication.length)
        // console.log("datacap requests ", requests.length)
        // console.log("datacap allocation (should be >= dc requests)", requests.length )



















    } catch (error) {
        console.log(error)
    }







}


scrape()
