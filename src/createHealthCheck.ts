import { config } from "./config";
import OctokitInitializer from "./initializers/OctokitInitializer";
import { logError } from "./logger/consoleLogger";
import date from "date-and-time";

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const octokit = OctokitInitializer.getInstance();

const ISSUE_NUMBER = parseInt(process.env.HEALTH_CEHECK_ISSUE) || 1407;

export const createHealthCheckComment = async (issueCommented?: number, issueNumbers?:any[]) => {
  const now = new Date();

  try {
    const res = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: ISSUE_NUMBER,
      body: `SSA bot ran at ${date.format(now, "YYYY/MM/DD HH:mm", true)} UTC
             SSA bot issues commented: ${issueCommented || 0}
             SSA bot issue numbers: ${issueNumbers || "none"}
      `,
    });

    return res;
  } catch (error) {
    logError(error);
  }
};
