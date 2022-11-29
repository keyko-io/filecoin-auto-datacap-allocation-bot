import { config } from "./config";
import OctokitInitializer from "./initializers/OctokitInitializer";
import { logError } from "./logger/consoleLogger";
import date from "date-and-time";

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const octokit = OctokitInitializer.getInstance();

const ISSUE_NUMBER = parseInt(process.env.HEALTH_CEHECK_ISSUE) || 1398;

export const createHealthCheckComment = async () => {
  const now = new Date();

  try {
    const issue = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: ISSUE_NUMBER,
    });

    const res = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: ISSUE_NUMBER,
      body: `SSA bot ran at ${date.format(now, "YYYY/MM/DD HH:mm", true)} UTC
      current number of comments posted : ${issue.data.comments + 1} 
      `,
    });

    return res;
  } catch (error) {
    logError(error);
  }
};
