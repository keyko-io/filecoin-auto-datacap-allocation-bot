import path from "path";
import fs from "fs";

import { config } from "../../src/config"
import OctokitInitializer from "../../src/initializers/OctokitInitializer";
import { testTimeout } from "./testUtils";

/**
 * @info on the test node:
 * 
 * t01019 (t1y6grz7kkjs5wyvg4mp5jqjl3unqt7t5ktqlrf2q): client with 5TiB
 * t01021: legacy msig notary  
 * t01022: exception msig notary 
 * t01011 (t1rbfyvybljzd5xcouqjx22juucdj3xbwtro2crwq): client with 80TiB 
 */

const octokit = OctokitInitializer.getInstance()

export const createIssues = async () => {

    //close previous test issues
    const rawIssues = await octokit.paginate(octokit.issues.listForRepo, {
        owner: config.githubLDNOwner,
        repo: config.githubLDNRepo,
        state: "open",
    });

    await Promise.allSettled(
        rawIssues.map((i: any) => new Promise<any>(async (resolve, reject) => {
            try {
                resolve(await octokit.issues.update({
                    owner: config.githubLDNOwner,
                    repo: config.githubLDNRepo,
                    issue_number: i.number,
                    state: 'closed'
                }))
            } catch (error) {
                reject(error)
            }

        }))
    )

    //create new issues
    const e_fil_issue_body = fs.readFileSync(
        path.resolve(__dirname, '../samples/e_fil_sample.test.md'),
        { encoding: 'utf8' },
    )

    const testIssue1body = fs.readFileSync(
        path.resolve(__dirname, '../samples/ldn_app_t01019.test.md'),
        { encoding: 'utf8' },
    )

    const testIssue2body = fs.readFileSync(
        path.resolve(__dirname, '../samples/ldn_app_t01011.test.md'),
        { encoding: 'utf8' },
    )

    const testIssue3body_real_addr = fs.readFileSync(
        path.resolve(__dirname, '../samples/ldn_app_real_address.test.md'),
        { encoding: 'utf8' },
    )
    const commentBody = fs.readFileSync(
        path.resolve(__dirname, '../samples/datacap_request_trigger.test.md'),
        { encoding: 'utf8' },
    )


    const e_fil_issue = await octokit.issues.create({
        owner: config.githubLDNOwner,
        repo: config.githubLDNRepo,
        title: `TEST clients topup client: t01081 (t1y6grz7kkjs5wyvg4mp5jqjl3unqt7t5ktqlrf2q)`,
        body: e_fil_issue_body

    })

    const testIssue1 = await octokit.issues.create({
        owner: config.githubLDNOwner,
        repo: config.githubLDNRepo,
        title: `TEST clients topup client: t01019 (t1y6grz7kkjs5wyvg4mp5jqjl3unqt7t5ktqlrf2q)`,
        body: testIssue1body

    })

    const testIssue2 = await octokit.issues.create({
        owner: config.githubLDNOwner,
        repo: config.githubLDNRepo,
        title: `TEST clients topup client: t01011 (t1rbfyvybljzd5xcouqjx22juucdj3xbwtro2crwq)`,
        body: testIssue2body
    })

    // const testIssue3 = await octokit.issues.create({
    //     owner: config.githubLDNOwner,
    //     repo: config.githubLDNRepo,
    //     title: `TEST clients topup edge case: t01011 (t1rbfyvybljzd5xcouqjx22juucdj3xbwtro2crwq)`,
    //     body: testIssue3body_real_addr
    // })

    const testIssues = [e_fil_issue, testIssue1, testIssue2]


    const issueNumbs = testIssues.map((a: any) => a.data.number)

    //trigger 1st request
    const dcTrigger = []
    for (let issue_number of issueNumbs) {

        const comment = new Promise<any>(async (resolve, reject) => {
            try {

                const res = await octokit.issues.createComment({
                    owner: config.githubLDNOwner,
                    repo: config.githubLDNRepo,
                    issue_number,
                    body: commentBody

                })
                resolve(res)
            } catch (error) {
                reject(error)
            }
        })
        dcTrigger.push(comment)
    }
    await Promise.allSettled(dcTrigger)
    await postProposeApproveComments(issueNumbs)
    await testTimeout

    const labelReset = resetLabel(issueNumbs)
    await Promise.allSettled(labelReset)

    return issueNumbs

}


export const postProposeApproveComments = (issueNumbs: any[]) => {
    return Promise.allSettled(issueNumbs.map(
        (issue_number: any) => new Promise<any>(async (resolve, reject) => {
            try {
                const proposeBody = fs.readFileSync(
                    path.resolve(__dirname, '../samples/propose_comment.test.md'),
                    { encoding: 'utf8' },
                )

                const propose = await octokit.issues.createComment({
                    owner: config.githubLDNOwner,
                    repo: config.githubLDNRepo,
                    issue_number,
                    body: proposeBody

                })
                const approveBody = fs.readFileSync(
                    path.resolve(__dirname, '../samples/approve_comment.test.md'),
                    { encoding: 'utf8' },
                )

                const approve = await octokit.issues.createComment({
                    owner: config.githubLDNOwner,
                    repo: config.githubLDNRepo,
                    issue_number,
                    body: approveBody

                })
                resolve({ propose, approve })
            } catch (error) {
                reject(error)
            }
        })
    ))

}

export const resetLabel = (issueNumbs: any[]) => {
    const resetLabels = [];
    for (let issue_number of issueNumbs) {

        const labelReset = new Promise<any>(async (resolve, reject) => {
            try {
                console.log(issue_number, issue_number, config.githubLDNOwner, config.githubNotaryRepo)
                await octokit.rest.issues.removeAllLabels({
                    owner: config.githubLDNOwner,
                    repo: config.githubLDNRepo,
                    issue_number
                });

                const res = octokit.issues.addLabels({
                    owner: config.githubLDNOwner,
                    repo: config.githubLDNRepo,
                    issue_number,
                    labels: ['state:Approved', 'state:Granted']
                });
                resolve(res);
            } catch (error) {
                reject(error);
            }
        });
        resetLabels.push(labelReset);
    }
    return resetLabels
}

