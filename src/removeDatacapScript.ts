import { Octokit } from "@octokit/rest";
import { config } from "./config";
import { createAppAuth } from "@octokit/auth-app"
import { matchGroupLargeNotary } from "@keyko-io/filecoin-verifier-tools/utils/common-utils"

const OWNER = process.env.GITHUB_LDN_REPO_OWNER;
const REPO = process.env.GITHUB_NOTARY_REPO;

const formatPK = () => {
    const BEGIN = config.beginPk;
    const END = config.endPk;
    const splitted = config.privateKey.match(/.{1,64}/g);
    const formatted = `${BEGIN}\n${splitted.join("\n")}\n${END}`;
    return formatted;
};

const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
        type: "installation",
        installationId: config.installationID,
        appId: config.appId,
        privateKey: formatPK(),
        clientId: config.clientId,
        clientSecret: config.clientSecret,
    },
});


//!!!!THIS are all the number , we need to delete 550 and 279 inside the array in case we aggree on running!!!!
/* const issuesToRemoveDatacap = [
    550,
    551,
    552,
    554,
    555,
    556,
    540,
    541,
    542,
    543,
    544,
    545,
    546,
    539,
    534,
    405,
    533,
    497,
    511,
    512,
    519,
    530,
    531,
    532,
    521,
    522,
    520,
    523,
    524,
    525,
    529,
    406,
    493,
    494,
    495,
    496,
    387,
    481,
    482,
    483,
    478,
    474,
    390,
    402,
    403,
    398,
    399,
    400,
    381,
    383,
    380,
    374,
    378,
    371,
    372,
    373,
    375,
    376,
    377,
    365,
    366,
    367,
    368,
    360,
    362,
    363,
    359,
    358,
    361,
    347,
    348,
    349,
    350,
    351,
    352,
    353,
    354,
    355,
    356,
    357,
    329,
    330,
    331,
    332,
    333,
    334,
    335,
    336,
    338,
    339,
    340,
    341,
    342,
    344,
    343,
    307,
    308,
    309,
    310,
    311,
    317,
    306,
    294,
    296,
    297,
    298,
    299,
    300,
    301,
    302,
    303,
    304,
    305,
    291,
    293,
    292,
    286,
    287,
    288,
    269,
    270,
    271,
    273,
    282,
    284,
    272,
    264,
    267,
    268,
    265,
    263,
    266,
    255,
    312,
    262,
    257,
    258,
    259,
    260,
    261,
    313,
    314,
    315,
    251,
    252,
    254,
    237,
    283,
    280,
    278,
    277,
    281,
    275,
    279,
    274,
    276
] */


//this 2 number was the test cases , before testing this number I did many console logging and trying.
const issuesToRemoveDatacap2 = [279, 550]

export const removeDatacap = async (issues: number[]): Promise<void> => {
    for (let issue of issues) {
        try {

            //we get all the comment for issue
            const allTheComment = await octokit.rest.issues.listComments({
                owner: OWNER,
                repo: REPO,
                issue_number: issue
            });

            //we parse and see if it has this removal comment
            const regexDatacap = /####\s*Datacap\s*Allocated\W*^>\s*(.*)/m
            const commentWithRemoval = allTheComment.data.find((comment) => {
                const parsedComment = matchGroupLargeNotary(regexDatacap, comment.body)
                return parsedComment === "0TiB"
            })


            // if doesnt have we run this script
            if (!commentWithRemoval) {
                const issueContent = await octokit.rest.issues.get({
                    owner: OWNER,
                    repo: REPO,
                    issue_number: issue
                });


                //we check address because we need its required for comment
                const regexAddress = /-\s*On-chain\s*Address\(es\)\s*to\s*be\s*Notarized:\s*(.*)/mi
                const address = matchGroupLargeNotary(regexAddress, issueContent.data.body)

                await octokit.issues.createComment({
                    owner: OWNER,
                    repo: REPO,
                    issue_number: issue,
                    body: `\r\n## Request Approved\r\n#### Address\r\n> ${address}\r\n#### Datacap Allocated\r\n> 0TiB\r\n`
                });
            }
        } catch (error) {
            console.log(error)
        }
    }

}


removeDatacap(issuesToRemoveDatacap2)