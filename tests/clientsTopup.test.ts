import { config } from "../src/config";
import { createIssues } from './helpers/createIssues';
import { checkPostNewRequest, getIssuez, getNodeClients, matchGithubAndNodeClients, matchIssuesAndComments, matchIssuesAndNextRequest, postRequestComments, postStatsComments } from '../src/clientTopup_v2';
import {
  parseReleaseRequest,
} from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import axios from 'axios';


jest.setTimeout(200000)


// beforeall should create some test issue in https://github.com/keyko-io/filecoin-large-clients-onboarding/issues



let mockIssueNumbs
let issuez
let nodeClientz
let match
let issuesAndCommentz
let issuesAndMargin
let issuesAndNextRequest // = matchIssuesAndNextRequest(issuesAndMargin)
let postRequestz //= (await postRequestComments(issuesAndNextRequest)).filter((i: any) => i.status === 'fulfilled').map((i: any) => i.value)
let postStatz //= await commentStats_V2(issuesAndNextRequest)
let apiClients



beforeAll(async () => {
    mockIssueNumbs = await createIssues()
    // console.log(mockIssueNumbs)
    apiClients = await axios({
      method: "GET",
      url: `${config.filpusApi}/getVerifiedClients`,
      headers: {
        "x-api-key": config.filplusApiKey,
      }
    }) 


})

describe('test client topup', () => {
    // test('evergreen test', async () => {
    //     console.log('ok')
    // })
    test('getIssuez is fetching at least one issue', async () => {

        // resetLabel([907,906])
        //if this fails, probably the node is offline... need to wait
        issuez = await getIssuez()
        // console.log('issuez',issuez)

        expect(issuez.length).toBeGreaterThan(0)
    })
    test('nodeClientz is getting clients from node', async () => {
        nodeClientz = await getNodeClients()
        // console.log('nodeClientz',nodeClientz)
        expect(nodeClientz.length).toBeGreaterThan(0)
    })
    test('matchGithubAndNodeClients is pairing issuez and nodeCLientz', async () => {
        match = matchGithubAndNodeClients(issuez, nodeClientz, apiClients)
        expect(match.length).toBeGreaterThan(0)
    })
    test('issuesAndCommentz is pairing issuez and comments for each issue', async () => {
        issuesAndCommentz = await matchIssuesAndComments(match)
        expect(issuesAndCommentz.length).toBeGreaterThan(0)
        for (let iss of issuesAndCommentz) {
            const issueNumber = iss.issue.number
            for (let comm of iss.issue.comments) {
                const parsed = comm.issue_url.substring(comm.issue_url.length - 4)
                expect(parsed.includes(issueNumber)).toBeTruthy()
            }

        }
    })
    test('issuesAndMargin is calculating correctly the margin', async () => {
        console.log(issuesAndCommentz)
        issuesAndMargin = checkPostNewRequest(issuesAndCommentz)
        expect(issuesAndMargin.length).toBeTruthy()

    })
    test('matchIssuesAndNextRequest is correctly preparing the nextRequests', async () => {
        issuesAndNextRequest = matchIssuesAndNextRequest(issuesAndMargin)
        // console.log('issuesAndNextRequest', issuesAndNextRequest)
        expect(issuesAndNextRequest.length).toBe(1)
        expect(issuesAndNextRequest[0].amountToRequest.amount).toBe('100TiB')

    })
    test('the request comment is posted and is correct', async () => {
        postRequestz = await postRequestComments(issuesAndNextRequest)
        // console.log('postRequestz',postRequestz)
         
        for(let elem of postRequestz){
            expect(elem.status).toBe('fulfilled')
            const p = parseReleaseRequest(elem.value.body)
            expect(p.correct).toBeTruthy()
        }
    })
    test('the stats comment is posted and is correct', async () => {
        postStatz = await postStatsComments(issuesAndNextRequest, apiClients)
        for(let elem of postStatz){
            expect(elem.status).toBe('fulfilled')
            
            for(let v of Object.values(elem.value.content)){
                expect(v).not.toEqual('undefined')
            }
        }
    })
})
