import { Octokit } from "@octokit/rest"
import { createAppAuth } from "@octokit/auth-app"

const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
        appId: 1,
        privateKey: "-----BEGIN PRIVATE KEY-----\n...",
        clientId: "lv1.1234567890abcdef",
        clientSecret: "1234567890abcdef12341234567890abcdef1234",
    }
})
