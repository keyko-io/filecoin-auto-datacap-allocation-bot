import path from "path";
import fs from "fs";

import { config } from "../../src/config"
import OctokitInitializer from "../../src/initializers/OctokitInitializer";

export const createIssues = async () => {
    const octokit = OctokitInitializer.getInstance()


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
    const issueBody = fs.readFileSync(
        path.resolve(__dirname, '../samples/large_client_application.test.md'),
        { encoding: 'utf8' },
    )
    const commentBody = fs.readFileSync(
        path.resolve(__dirname, '../samples/datacap_request_trigger.test.md'),
        { encoding: 'utf8' },
    )

    const promOpenArr = []
    for (let i = 0; i < 2; i++) {

        const openIssue = new Promise<any>(async (resolve, reject) => {
            try {

                const res = await octokit.issues.create({
                    owner: config.githubLDNOwner,
                    repo: config.githubLDNRepo,
                    title: `TEST clients topup #${i}`,
                    body: issueBody

                })
                resolve(res)
            } catch (error) {
                reject(error)
            }
        })
        promOpenArr.push(openIssue)
    }


    const issues = await Promise.allSettled(promOpenArr)

    const issueNumbs = issues.map((a: any) => a.value.data.number)

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

    return issues.map((i:any)=> i.value)







    // const resetLabels = []
    // for (let issue_number of issueNumbs) {

    //     const labelReset = new Promise<any>(async (resolve, reject) => {
    //         try {

    //             await octokit.rest.issues.removeAllLabels({
    //                 owner: config.githubLDNOwner,
    //                 repo: config.githubNotaryRepo,
    //                 issue_number
    //             });

    //             const res = octokit.issues.addLabels({
    //                 owner: config.githubLDNOwner,
    //                 repo: config.githubLDNRepo,
    //                 issue_number,
    //                 labels: ['state:Approved', 'state:Granted']
    //             })
    //             resolve(res)
    //         } catch (error) {
    //             reject(error)
    //         }
    //     })
    //     resetLabels.push(labelReset)
    // }

    // console.log(

    // )


    // const xxx = await setTimeout(7000, async () =>

    //     Promise.allSettled(resetLabels)

    // )
    // xxx()


    // console.log(xxx())










}
