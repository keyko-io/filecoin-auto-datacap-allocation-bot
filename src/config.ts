require('dotenv').config()

export const config = {
    githubToken: process.env.GITHUB_TOKEN,
    githubLDNOwner: process.env.GITHUB_LDN_REPO_OWNER,
    githubLDNRepo: process.env.GITHUB_LDN_REPO,
    lotusNode: process.env.LOTUS_NODE_TOKEN,
    nodeUrl: process.env.NODE_URL,
    networkType:process.env.NETWORK_TYPE,
    filpusApi: "https://api.filplus.d.interplanetary.one/public/api",
    filplusApiKey: "5c993a17-7b18-4ead-a8a8-89dad981d87e"
}