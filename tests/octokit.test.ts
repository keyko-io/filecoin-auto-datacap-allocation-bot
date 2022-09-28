import OctokitInitializer from '../src/initializers/OctokitInitializer'
import { config } from "../src/config";
import { readBuilderProgram } from 'typescript';

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;

jest.setTimeout(20000) 
describe('test octokit', () => {
    test('octokit should be initialized and should get issues', async () => {
        const octokit = OctokitInitializer.getInstance()

        const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
            owner,
            repo,
            state: "open",
        });
        expect(rawIssues.length).toBeGreaterThan(0)
    })

})