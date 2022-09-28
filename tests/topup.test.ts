import ApiInitializer from '../src/initializers/ApiInitializer'
import OctokitInitializer from '../src/initializers/OctokitInitializer'
import { config } from "../src/config";
import { multisigMonitoring, checkV3LastTwoWeeksAndReturnDatacapToBeRequested } from '../src/msigMonitoring'
import { fail } from 'assert';



jest.setTimeout(20000)

describe('test multisig monitoring', () => {
    const octokit = OctokitInitializer.getInstance()
    test('v3 legacy multisig github issue should be updated and labels are correct', async () => {
        const api = ApiInitializer.getInstance()
        const dataCapRemainingBytes = await api.checkVerifier(config.V3_MULTISIG_ADDRESS)
        if (!dataCapRemainingBytes) fail('seems that the test node is offline')

        //remove labels
        await octokit.rest.issues.removeAllLabels({
            owner: config.githubLDNOwner,
            repo: config.githubNotaryRepo,
            issue_number: config.V3_MULTISIG_ISSUE_NUMBER,
        });

        //check comment is posted
        const msigMonitoring = await multisigMonitoring()
        expect(msigMonitoring.status).toBe(201)

        //check status:approved label is posted
        const issue = await octokit.issues.get({
            owner: config.githubLDNOwner,
            repo: config.githubNotaryRepo,
            issue_number: config.V3_MULTISIG_ISSUE_NUMBER,
        });

        expect(issue.data.labels.map((item: any) => item.name)).toContain('status:Approved')

    })

    test('datacap posted is not undefined and correctly formatted', async () => { 
            //TODO to be implemented (need to test this function --> checkV3LastTwoWeeksAndReturnDatacapToBeRequested)
    })
})
