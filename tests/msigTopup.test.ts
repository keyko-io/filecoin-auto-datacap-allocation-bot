/**
 * @test to test we have on github test repo issues to represent multisigs
 *       addresses are test addresses on the node:
 *       v3 legacy = t01003; exceptions = t081
 */



import OctokitInitializer from '../src/initializers/OctokitInitializer'
import { config } from "../src/config";
import { msigTopup, exceptionMsigTopup, checkV3LastTwoWeeksAndReturnDatacapToBeRequested as allowanceRequest } from '../src/msigTopup'
import { anyToBytes } from '../src/utils';
const exceptions = config.exceptionJson



jest.setTimeout(20000)

/**
 * @TODO test checkV3LastTwoWeeksAndReturnDatacapToBeRequested function
 */
describe('test checkV3LastTwoWeeksAndReturnDatacapToBeRequested', () => {
    it.only('should get the allowance', async () => {
        const allowance = await allowanceRequest(config.v3MultisigDatacapAllowanceBytes)
        expect(allowance).not.toBeFalsy()
    })
})

describe('test multisig monitoring', () => {


    test('testing xception json imported from deps/filecoin-content', () => {
        exceptions.map((exception: any) => {
            console.log('exception', exception)
            const address = exception.notary_msig
            const dcAllowance = exception.notary_msig_datacap
            const dcAllowanceBytes = anyToBytes(exception.notary_msig_datacap)
            const marginPercentage = config.v3MarginComparisonPercentage
            const issueNumber = parseInt(exception.notary_msig_issue_number)

            expect(address).toBeTruthy()
            expect(dcAllowance).toBeTruthy()
            expect(dcAllowanceBytes).toBeTruthy()
            expect(marginPercentage).toBeTruthy()
            expect(issueNumber).toBeTruthy()
        })
    })


    const octokit = OctokitInitializer.getInstance()
    test('v3 legacy multisig github issue should be updated and labels are correct', async () => {

        //remove labels
        await octokit.rest.issues.removeAllLabels({
            owner: config.githubLDNOwner,
            repo: config.githubNotaryRepo,
            issue_number: config.v3MultisigIssueNumber,
        });

        //check comment is posted
        const msigMonitoring = await msigTopup()
        expect(msigMonitoring.status).toBe(201)

        //check status:approved label is posted
        const issue = await octokit.issues.get({
            owner: config.githubLDNOwner,
            repo: config.githubNotaryRepo,
            issue_number: config.v3MultisigIssueNumber,
        });

        expect(issue.data.labels.map((item: any) => item.name)).toContain('status:Approved')

    })

    test('test monitoring of exception multisig and datacap requested is not undefined', async () => {

        // delete all labels from test issues
        await Promise.allSettled(
            exceptions.map((exception: any) => new Promise<any>(async (resolve, reject) => {
                try {
                    const rm = await octokit.rest.issues.removeAllLabels({
                        owner: config.githubLDNOwner,
                        repo: config.githubNotaryRepo,
                        issue_number: exception.notary_msig_issue_number,
                    });
                    resolve(rm)
                } catch (error) {
                    reject(error)
                }
            }))
        )


        const monitoring = await exceptionMsigTopup() as any[]

        const isFulfilled = monitoring.every((item: any) => item.status === 'fulfilled')

        expect(isFulfilled).toBeTruthy()
        for (let res of monitoring) {
            if (res.value) {
                expect(res.value.dataCapRemainingBytes).toBeDefined()
            }
        }

        //check labels are updated
        const labels: any = await Promise.allSettled(
            exceptions.map((exception: any) => new Promise<any>(async (resolve, reject) => {
                try {
                    const issue = await octokit.rest.issues.get({
                        owner: config.githubLDNOwner,
                        repo: config.githubNotaryRepo,
                        issue_number: exception.notary_msig_issue_number,
                    });

                    resolve(issue.data.labels)
                } catch (error) {
                    reject(error)
                }
            }))
        )

        const approvedLabels = labels.map((i: any) => i.value.filter((l: any) => l.name === 'status:Approved'))
        expect(approvedLabels.length).toBe(exceptions.length)

    })

    test('bot is not posting the comment is the label \'status:Approved\' is there', async () => {

        const monitoring = await exceptionMsigTopup() as any[]
        console.log('monitoring', monitoring)

        const isFulfilled = monitoring.every((item: any) => item.status === 'fulfilled')

        const areCommentsPosted = monitoring.every((item: any) => !item.value)

        expect(isFulfilled).toBeTruthy()

        expect(areCommentsPosted).toBeTruthy()



    })


})
