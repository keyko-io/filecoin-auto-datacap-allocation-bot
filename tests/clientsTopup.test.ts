import fs from 'fs'
import ApiInitializer from '../src/initializers/ApiInitializer'
import OctokitInitializer from '../src/initializers/OctokitInitializer'
import { config } from "../src/config";
import { msigTopup, exceptionMsigTopup, checkV3LastTwoWeeksAndReturnDatacapToBeRequested } from '../src/msigTopup'
import path from 'path';
import { setTimeout } from 'timers/promises';
import { createIssues } from './helpers/createIssues';
import { clientsTopup_v2 } from '../src/clientTopup_v2';

const exceptions = config.exceptionJson

jest.setTimeout(200000)


// beforeall should create some test issue in https://github.com/keyko-io/filecoin-large-clients-onboarding/issues



let issues
beforeAll(async () => {
    //issues = await createIssues()
})

describe('test client topup', () => {
    test('if label is ready to sign dont post any request', async () => {
        await clientsTopup_v2()
    })
})



// describe('test multisig monitoring', () => {
//     const octokit = OctokitInitializer.getInstance()
//     test('v3 legacy multisig github issue should be updated and labels are correct', async () => {

//         //remove labels
//         await octokit.rest.issues.removeAllLabels({
//             owner: config.githubLDNOwner,
//             repo: config.githubNotaryRepo,
//             issue_number: config.v3MultisigIssueNumber,
//         });

//         //check comment is posted
//         const msigMonitoring = await msigTopup()
//         expect(msigMonitoring.status).toBe(201)

//         //check status:approved label is posted
//         const issue = await octokit.issues.get({
//             owner: config.githubLDNOwner,
//             repo: config.githubNotaryRepo,
//             issue_number: config.v3MultisigIssueNumber,
//         });

//         expect(issue.data.labels.map((item: any) => item.name)).toContain('status:Approved')

//     })

//     test('test monitoring of exception multisig and datacap requested is not undefined', async () => {

//         // delete all labels from test issues
//         await Promise.allSettled(
//             exceptions.map((exception: any) => new Promise<any>(async (resolve, reject) => {
//                 try {
//                     const rm = await octokit.rest.issues.removeAllLabels({
//                         owner: config.githubLDNOwner,
//                         repo: config.githubNotaryRepo,
//                         issue_number: exception.notary_msig_issue_number,
//                     });
//                     resolve(rm)
//                 } catch (error) {
//                     reject(error)
//                 }
//             }))
//         )


//         const monitoring = await exceptionMsigTopup() as any[]

//         const isFulfilled = monitoring.every((item: any) => item.status === 'fulfilled')

//         expect(isFulfilled).toBeTruthy()
//         for (let res of monitoring) {
//             if (res.value) {
//                 expect(res.value.dataCapRemainingBytes).toBeDefined()
//             }
//         }

//         //check labels are updated
//         const labels: any = await Promise.allSettled(
//             exceptions.map((exception: any) => new Promise<any>(async (resolve, reject) => {
//                 try {
//                     const issue = await octokit.rest.issues.get({
//                         owner: config.githubLDNOwner,
//                         repo: config.githubNotaryRepo,
//                         issue_number: exception.notary_msig_issue_number,
//                     });

//                     resolve(issue.data.labels)
//                 } catch (error) {
//                     reject(error)
//                 }
//             }))
//         )

//         const approvedLabels = labels.map((i: any) => i.value.filter((l: any) => l.name === 'status:Approved'))
//         expect(approvedLabels.length).toBe(exceptions.length)

//     })

//     test('bot is not posting the comment is the label \'status:Approved\' is there', async () => {

//         const monitoring = await exceptionMsigTopup() as any[]

//         const isFulfilled = monitoring.every((item: any) => item.status === 'fulfilled')

//         const areCommentsPosted = monitoring.every((item: any) => !item.value)

//         expect(isFulfilled).toBeTruthy()
//         expect(areCommentsPosted).toBeTruthy()



//     })


// })
