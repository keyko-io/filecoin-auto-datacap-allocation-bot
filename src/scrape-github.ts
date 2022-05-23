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

const scrape = async () => {
    try {
        let counter = 0
        const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
            owner: OWNER,
            repo: REPO,
            state: 'all',
        });

        for (let issue of rawIssues) {
            const parsedIssue = parseIssue(issue.body)
            if (!parseIssue(issue.body).correct) {
                console.log('issue is incorrect')
                continue
            }
            // CREATE_APPLICATION
            let params: MetricsApiParams = {
                name: parsedIssue.name,
                clientAddress: parsedIssue.clientAddress,
                eventDate: issue.created_at
            }
            console.log('CREATE_APPLICATION ', issue.number, params.eventDate)
            await callMetricsApi(issue.number, EVENT_TYPE.CREATE_APPLICATION, params)
            counter++

            const rawComments = await octokit.paginate(octokit.issues.listComments, {
                owner: OWNER,
                repo: REPO,
                issue_number: issue.number
            });
            // console.log(rawComments)

            // from this array get the 1st posted and send as FIRST_DC_REQUEST
            // sort the array
            // send the others as SUBSEQUENT_DC_REQUEST

            // const params: MetricsApiParams = {
            //     name: parseIssue(ldnIssue.data.body).name,
            //     clientAddress: parseIssue(ldnIssue.data.body).address,
            //     msigAddress,
            //     amount: dcRequested
            //   }
            //   callMetricsApi(ldnIssueNumber, EVENT_TYPE.FIRST_DC_REQUEST, params)


            // const params: MetricsApiParams = {
            //     name: info.clientName,
            //     clientAddress: info.address,
            //     msigAddress: info.msigAddress,
            //     amount: info.dcAllocationRequested,
            //   };
            //   // await callMetricsApi( info.issueNumber,EVENT_TYPE.SUBSEQUENT_DC_REQUEST,params
            //   );


            // send FIRST_DC_REQUEST and SUBSEQUENT_DC_REQUEST events
            rawComments
                .filter((comment: any) => parseReleaseRequest(comment.body).correct)
                .forEach(async (comment: any, index: any) => {
                    params.name = parsedIssue.name
                    params.clientAddress = parsedIssue.address
                    params.amount = parseReleaseRequest(comment.body).allocationDatacap
                    params.eventDate = comment.created_at

                    if (index === 0) {
                        // console.log('solo qui index = FIRST', index)
                        console.log('FIRST_DC_REQUEST ', issue.number, params.eventDate)

                        await callMetricsApi(issue.number, EVENT_TYPE.FIRST_DC_REQUEST, params)
                        counter++
                        return
                    }
                    await callMetricsApi(issue.number, EVENT_TYPE.SUBSEQUENT_DC_REQUEST, params)
                    counter++
                    console.log('SUBSEQUENT_DC_REQUEST ', issue.number, params.eventDate)
                })




            // const params: MetricsApiParams = {
            //     name,
            //     clientAddress: approveDcComment.address,
            //     msigAddress: msig,
            //     amount: approveDcComment.datacap,
            //     messageCid: approveDcComment.message
            //   }
            //   callMetricsApi(context.issue().issue_number, EVENT_TYPE.DC_ALLOCATION, params)


            // from this array get all approved comment
            // sort the array
            // get all the type: approved and send the DC_ALLOCATION event
            // if  every 2 comments, we don't have a type:approved send DC_ALLOCATION event with the second comment 
            // send DC_ALLOCATION event
            rawComments
                .filter((comment: any) => parseApprovedRequestWithSignerAddress(comment.body).correct)
                //todo sort (?)
                .forEach(async (comment: any, index: any, array: any[]) => {

                    //TODO we need multisig address
                    params.name = parsedIssue.name
                    params.clientAddress = parsedIssue.address
                    params.amount = parseApprovedRequestWithSignerAddress(comment.body).datacap
                    params.messageCid = parseApprovedRequestWithSignerAddress(comment.body).message
                    params.eventDate = comment.created_at

                    if (parseApprovedRequestWithSignerAddress(comment.body).isApproved) {
                        console.log('DC_ALLOCATION, isapproved=true ', issue.number, params.eventDate)
                        await callMetricsApi(issue.number, EVENT_TYPE.DC_ALLOCATION, params)
                        counter++
                        return
                    }
                    if (!parseApprovedRequestWithSignerAddress(comment.body).isApproved && !parseApprovedRequestWithSignerAddress(array[index + 1].body).isApproved) {
                        await callMetricsApi(issue.number, EVENT_TYPE.DC_ALLOCATION, params)
                        counter++
                        console.log('DC_ALLOCATION, isapproved=false ', issue.number, params.eventDate)

                        return
                    }
                })
        }
        console.log('total of calls:', counter)
    } catch (error) {
        console.log(error)
    }







}


scrape()
