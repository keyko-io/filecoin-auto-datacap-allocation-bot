const fetch = require('node-fetch');
const parser = require('@keyko-io/filecoin-verifier-tools/lib/utils/large-issue-parser')
const username = 'filecoin-project';
const repo = 'filecoin-plus-large-datasets';
const fs = require('fs');
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
    auth: 'ddc4cce57e1da5eaa1e198b383cfdd04bc5ef88b'
});



octokit.paginate('GET /repos/:owner/:repo/issues', {
    owner: username,
    repo: repo
})
    // .then(response => {
    //     console.log(response)
    //     return response.json()

    // }

    // )
    .then(data => {
        // console.log(data);
        const adrs = []
        for (issue of data) {
            // console.log(issue.url)
            if (issue.body && parser.parseIssue(issue?.body)?.correct) {
                const ad = parser.parseIssue(issue?.body).address
                console.log(ad)
                adrs.push(ad)
            }
        }

        fs.writeFile('addresses.json', JSON.stringify(adrs), error => {
            if (error) {
                console.error("error", error);
            } else {
                console.log(`Saved ${adrs.length} issue URLs to issues.json`);
            }
        });


    })
    .catch(error => console.error(error));
