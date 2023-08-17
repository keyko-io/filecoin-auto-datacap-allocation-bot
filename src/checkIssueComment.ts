import { config } from "./config";
import { logGeneral, logError } from './logger/consoleLogger'

export const checkIssueComment = async (
  issueNumber: Number, 
  issueBody: String, 
  commentBody: String, 
  commentAuthor: String
) => {
  try {
    logGeneral(`${config.logPrefix} 0 Subsequent-Allocation-Bot started - check issue ${issueNumber} and clients DataCap.`)
    logGeneral(`${config.logPrefix} ${issueBody}`)
    logGeneral(`${config.logPrefix} ${commentBody}`)
    logGeneral(`${config.logPrefix} ${commentAuthor}`)
  } catch (e) {
    logError(`Single Client Topup Error: ${e.message}`);
  }
}
