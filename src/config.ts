require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` })

export const config = 
{
    githubToken: process.env.GITHUB_TOKEN,
    githubLDNOwner: process.env.GITHUB_LDN_REPO_OWNER || 'keyko-io',
    githubLDNRepo: process.env.GITHUB_LDN_REPO || 'filecoin-large-clients-onboarding',
    githubNotaryRepo: process.env.GITHUB_NOTARY_REPO || 'filecoin-notaries-onboarding',
    nodeUrl: process.env.NODE_URL ,
    networkType: process.env.NETWORK_TYPE || 'test',
    filpusApi: "https://api.filplus.d.interplanetary.one/public/api",
    filplusApiKey: process.env.API_KEY,
    appId: process.env.APP_ID ,
    clientId: process.env.CLIENT_ID ,
    clientSecret: process.env.CLIENT_SECRET,
    beginPk: process.env.GIT_BEGIN_PK,
    endPk: process.env.GIT_END_PK,
    privateKey: process.env.GIT_PRIVATE_KEY,
    installationID: process.env.INSTALLATION_ID,
    notariersJsonPath: process.env.VERIFIERS_JSON_PATH_PROD,
    LOG_PREFIX: "Issue number",
    V3_MULTISIG_ADDRESS: process.env.V3_MULTISIG_ADDRESS || 't01003',
    V3_MULTISIG_ISSUE_NUMBER: parseInt(process.env.V3_MULTISIG_ISSUE_NUMBER) || 479,
    V3_MULTISIG_DATACAP_ALLOWANCE: '25PiB',
    V3_MARGIN_COMPARISON_PERCENTAGE: 0.25,
    V3_MULTISIG_DATACAP_ALLOWANCE_BYTES: 28147497671065600
}