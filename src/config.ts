require('dotenv').config({ path: process.env.NODE_ENV == 'test'? `.env.test`: '.env.prod' })
import v3_exception_test from './json/v3_exceptions_test.json'
import v3_exception_prod from './json/v3_exceptions_prod.json'

export const config = {
    githubToken: process.env.GITHUB_TOKEN,
    githubLDNOwner: process.env.GITHUB_LDN_REPO_OWNER || 'keyko-io',
    githubLDNRepo: process.env.GITHUB_LDN_REPO || 'filecoin-large-clients-onboarding',
    githubNotaryRepo: process.env.GITHUB_NOTARY_REPO || 'filecoin-notaries-onboarding',
    nodeUrl: process.env.NODE_URL,
    networkType: process.env.NETWORK_TYPE || 'test',
    filpusApi: "https://api.filplus.d.interplanetary.one/public/api",
    filplusApiKey: process.env.API_KEY,
    appId: process.env.APP_ID,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    beginPk: process.env.GIT_BEGIN_PK,
    endPk: process.env.GIT_END_PK,
    privateKey: process.env.GIT_PRIVATE_KEY,
    installationID: process.env.INSTALLATION_ID,
    notariersJsonPath: process.env.VERIFIERS_JSON_PATH_PROD,
    logPrefix: "Issue number",
    v3MultisigAddress: process.env.V3_MULTISIG_ADDRESS || 't01003',
    v3MultisigIssueNumber: parseInt(process.env.V3_MULTISIG_ISSUE_NUMBER) || 479,
    v3MultisigDatacapAllowance: '25PiB',
    v3MarginComparisonPercentage: 0.25,
    v3MultisigDatacapAllowanceBytes: 28147497671065600,
    exceptionJson: process.env.NODE_ENV == 'test' ? v3_exception_test : v3_exception_prod,
    lotus_node_token:process.env.NODE_ENV == 'test' ? null : process.env.LOTUS_NODE_TOKEN
}