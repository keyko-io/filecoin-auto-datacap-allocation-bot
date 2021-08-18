require('dotenv').config()

export const config = {
    githubToken: process.env.GITHUB_TOKEN,
    githubLDNOwner: process.env.GITHUB_LDN_REPO_OWNER,
    githubLDNRepo: process.env.GITHUB_LDN_REPO,
}