import { config } from "../src/config";
import { createIssues } from './helpers/createIssues';
import { checkPostNewRequest, getIssuez, getNodeClients, matchGithubAndNodeClients, matchIssuesAndComments, matchIssuesAndNextRequest, postRequestComments, retrieveLastTwoSigners } from '../src/clientTopup_v2';
import {
    parseReleaseRequest,
} from "@keyko-io/filecoin-verifier-tools/utils/large-issue-parser.js";
import axios from 'axios';
import { findClient, getGithubHandlesForAddress, getTotalDcGrantedSoFar, getDeltaDcAndDcGranted } from "../src/utils";
import OctokitInitializer from "../src/initializers/OctokitInitializer";


jest.setTimeout(200000)


// beforeall should create some test issue in https://github.com/keyko-io/filecoin-large-clients-onboarding/issues




let apiClients
const TEST_ADDRESS_ARRAY = [
    'f13dkryrmhnsvmromygwhnm37v2ospivoielu4dya',
    'f1ymfz2mqdrkrdpjmrwh4qaqtuknfpsq3lp3r3auq',
    'f1dpgqn57cl5wqijiyv3256nids2ox3fms2mg3oay'
]


const TEST_ELEM = {
    issue: {
        parsed: {
            correct: true,
            errorMessage: '',
            errorDetails: '',
            name: 'TVCC',
            address: 't1y6grz7kkjs5wyvg4mp5jqjl3unqt7t5ktqlrf2q',
            datacapRequested: '5PiB',
            dataCapWeeklyAllocation: '100TiB',
            website: 'www.tvcc.kr / https://www.youtube.com/c/TVCC-Broadcast',
            datacapRemoval: false,
            region: 'Asia excl. Japan',
            isAddressFormatted: false,
            isCustomNotary: false
        },
        number: 1047,
        idAddress: 't01019',
        address: 't1y6grz7kkjs5wyvg4mp5jqjl3unqt7t5ktqlrf2q',
        datacap: '5497558138880',
        comments: [{
            body: '## Request Proposed\n' +
                '\n' +
                '#### Address \n' +
                '> f1111222333\n' +
                '\n' +
                '#### Datacap Allocated\n' +
                '> 5TiB\n' +
                '\n' +
                '#### Message sent to Filecoin Network\n' +
                '> bafy2bzacecud6trc3n6ipvbz44kphtrzy3rapfwaawdnexkakchbsb3yyz57u \n' +
                '\n' +
                '#### Signer Address \n' +
                '> f1oz43ckvmtxmmsfzqm6bpnemqlavz4ifyl524chq'
        },
        {
            body: '## Request Approved\n' +
                '\n' +
                '#### Address \n' +
                '> f1111222333\n' +
                '\n' +
                '#### Datacap Allocated\n' +
                '> 5TiB\n' +
                '\n' +
                '#### Message sent to Filecoin Network\n' +
                '> bafy2bzacecud6trc3n6ipvbz44kphtrzy3rapfwaawdnexkakchbsb3yyz57u \n' +
                '\n' +
                '#### Signer Address \n' +
                '> f1oz43ckvmtxmmsfzqm6bpnemqlavz4ifyl524chq'
        }],
        numberOfRequests: 1,
        lastRequest: [Object],
        requests: [Array]
    },
    postRequest: true,
    margin: 0.1,
    amountToRequest: {
        amount: '100TiB',
        rule: '100% of weekly dc amount requested',
        totalDatacapReached: false
    }
}
beforeAll(async () => {

    apiClients = await axios({
        method: "GET",
        url: `${config.filpusApi}/getVerifiedClients`,
        headers: {
            "x-api-key": config.filplusApiKey,
        }
    })


})

describe('test dmob api and make sure the data we need is there', () => {
    // test('evergreen test', async () => {
    //     console.log('ok')
    // })
    test('test data for matchGithubAndNodeClients', async () => {
        for (let adr of TEST_ADDRESS_ARRAY) {
            const dmobClient = findClient(apiClients, adr)
            expect(dmobClient).toBeTruthy()
            expect(dmobClient.addressId).toBeTruthy()
            expect(dmobClient.address).toBeTruthy()
            expect(dmobClient.allowance).toBeTruthy()
        }
    })
    test('test getTotalDcGrantedSoFar and getDeltaDcAndDcGranted', async () => {
        for (let adr of TEST_ADDRESS_ARRAY) {
            let client = apiClients.data.data.find((item: any) => item.address === adr)
            const totalDcGrantedForClientSoFar = getTotalDcGrantedSoFar(client)
            expect(totalDcGrantedForClientSoFar).toBeTruthy()
            const deltaTotalDcAndDatacapGranted = getDeltaDcAndDcGranted(TEST_ELEM, totalDcGrantedForClientSoFar)
            expect(deltaTotalDcAndDatacapGranted).toBeTruthy()

        }
    })
    test('test retrieveLastTwoSigners & getGithubHandlesForAddress', async () => {

        const addresses = retrieveLastTwoSigners(
            TEST_ELEM.issue.comments,
            TEST_ELEM.issue.number
        )
        expect(addresses.length).toBe(2)

        const octokit = OctokitInitializer.getInstance()
        let notaries: any = await octokit.request(
            `GET ${config.notariersJsonPath}`
        );
        notaries = JSON.parse(notaries.data).notaries;
        const githubHandles = getGithubHandlesForAddress(addresses, notaries)
        expect(githubHandles.length).toBe(2)

    })
})

