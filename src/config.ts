require('dotenv').config()

export const config = {
    githubToken: process.env.GITHUB_TOKEN,
    githubLDNOwner: process.env.GITHUB_LDN_REPO_OWNER,
    githubLDNRepo: process.env.GITHUB_LDN_REPO,
    lotusNode: process.env.LOTUS_NODE_TOKEN,
    nodeUrl: process.env.NODE_URL,
    networkType:process.env.NETWORK_TYPE,
    filpusApi: "https://api.filplus.d.interplanetary.one/public/api",
    filplusApiKey: "5c993a17-7b18-4ead-a8a8-89dad981d87e",
    appId: process.env.APP_ID,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    beginPk:process.env.GIT_BEGIN_PK,
    endPk:process.env.GIT_END_PK,
    privateKey: process.env.GIT_PRIVATE_KEY,
    installationID: process.env.INSTALLATION_ID
}