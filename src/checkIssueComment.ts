import { config } from "./config"
import { logGeneral, logError } from './logger/consoleLogger'
import { issue, AllowanceArrayElement, requestAmount } from "./types/types"
import { getApiClients, getRemainingDataCap, anyToBytes, calculateAllocationToRequest } from "./utils"
import { parseIssue } from '@keyko-io/filecoin-verifier-tools/lib/utils/large-issue-parser'
import { callMetricsApi } from "@keyko-io/filecoin-verifier-tools/lib/metrics/metrics"
import OctokitInitializer from "./initializers/OctokitInitializer"
import fvc from "filecoin-verfier-common"
import { v4 as uuidv4 } from 'uuid'
import { EVENT_TYPE, MetricsApiParams } from "./Metrics"

const { ISSUE_LABELS } = fvc
const owner = config.githubLDNOwner
const repo = config.githubLDNRepo
const octokit = OctokitInitializer.getInstance()

const VERIFIER_ADDRESS_MAP = {
  "f01858410": "f02049625",
}

/**
 * Check a GitHub issue comment for specific commands or data.
 *
 * @param {number} issueNumber - The number of the GitHub issue.
 * @param {string} issueBody - The main content of the GitHub issue.
 * @param {string} commentBody - The content of the comment made on the issue.
 * @param {string} commentAuthor - The author of the comment.
 */
export const checkIssueComment = async (
  issueNumber: number,
  issueBody: string,
  commentBody: string,
  commentAuthor: string
) => {
  try {
    logIssueDetails(issueNumber, issueBody, commentBody, commentAuthor)

    const parsedIssue: issue = parseIssue(issueBody)
    if (!parsedIssue.correct) {
      logGeneral(`${config.logPrefix} ${issueNumber} not correct`)
      return
    }
    parsedIssue.number = issueNumber

    const {
      success: extendSuccess, 
      modifiedIssue: issueWithClientData
    } = await extendIssueWithClientData(parsedIssue)

    if (!extendSuccess) return

    const extendedIssue = extendIssueWithLastLdnAllowance(issueWithClientData)
    
    if (!(await checkPostNewRequest(extendedIssue))) {
      logGeneral(`${config.logPrefix} ${issueNumber} doesn't need to post new request`)
      return
    }

    const amountToRequest = calculateAmountToRequest(extendedIssue)
    await postRequestComments(extendedIssue, amountToRequest)
  } catch (e) {
    logError(`Single Client Topup Error: ${e.message}`)
    return
  }
}

/**
 * Calculate the amount of DataCap to request based on the issue details.
 *
 * @param {issue} issue - The parsed issue object.
 * @returns {requestAmount} - The calculated amount to request.
 */
const calculateAmountToRequest = (issue: issue): requestAmount => {
  const requestNumber = issue.allowanceArray.length
  const totalDcGrantedForClientSoFar = issue.allowanceArray.reduce(
    (acc: number, current: AllowanceArrayElement) => acc += parseInt(current.allowance), 
    0
  )

  const totaldDcRequestedByClient = anyToBytes(issue.datacapRequested)
  const weeklyDcAllocationBytes = anyToBytes(issue.dataCapWeeklyAllocation)

  return calculateAllocationToRequest(
    requestNumber, 
    totalDcGrantedForClientSoFar, 
    totaldDcRequestedByClient, 
    weeklyDcAllocationBytes, 
    issue.number
  )
}

/**
 * Format the comment for a new allocation request.
 *
 * @param {string} address - The address for the allocation request.
 * @param {string} amountToRequest - The amount of DataCap being requested.
 * @param {string} msigAddress - The multisig notary address.
 * @param {number} requestNumber - The sequential number of the request.
 * @param {string} uuid - The unique identifier for the request.
 * @returns {string} - The formatted comment.
 */
export const newAllocationRequestComment_V2 = (
  address: string,
  amountToRequest: string,
  msigAddress: string,
  requestNumber: number,
  uuid:string
): string => {
  return `
## DataCap Allocation requested\r\n
### Request number ${requestNumber}
#### Multisig Notary address\r\n> ${msigAddress}\r\n
#### Client address\r\n> ${address}\r\n
#### DataCap allocation requested\r\n> ${amountToRequest}\r\n
#### Id\r\n> ${uuid}`
}

/**
 * Handle the posting of request comments on a GitHub issue.
 *
 * @param {issue} issue - The parsed issue object.
 * @param {requestAmount} amountToRequest - The calculated amount to request.
 */
const postRequestComments = async (issue: issue, amountToRequest: requestAmount) => {
  if (amountToRequest.totalDatacapReached) {
    try {
      await handleTotalDatacapReached(issue)
    } catch (e) {
      logError(`Single Client Topup Error: ${e.message}`)
    }
  } else {
    try {
      await handleNewDatacapRequest(issue, amountToRequest)
    } catch(e) {
      logError(`Single Client Topup Error: ${e.message}`)
    }
  }
}

/**
 * Handle the situation when the total datacap for an issue has been reached.
 * Posts a comment, adds an issue label, and logs the event.
 * 
 * @param {issue} issue - The issue object.
 * @returns {Promise<void>}
 */
const handleTotalDatacapReached = async (issue: issue) => {
  const dcReachedBody = `The issue reached the total datacap requested. This should be closed`
  await addIssueLabel(issue.number, [ISSUE_LABELS.TOTAL_DC_REACHED])
  await postComment(issue.number, dcReachedBody)
  logGeneral(`${config.logPrefix} ${issue.number}, posted close request comment.`)
}

/**
 * Handle the request for new datacap for a specific issue.
 * Determines the notary address, posts a comment, updates issue labels, and logs the event.
 * 
 * @param {issue} issue - The issue object.
 * @param {requestAmount} amountToRequest - Amount of datacap to request.
 * @returns {Promise<void>}
 */
const handleNewDatacapRequest = async (issue: issue, amountToRequest: requestAmount) => {
  const { notaryAddress, body } = prepareNewDatacapRequestBody(issue, amountToRequest)
  const commentResult = await postComment(issue.number, body)

  if (commentResult.status === 201) {
    await removeIssueLabel(issue.number, ISSUE_LABELS.GRANTED)
    await addIssueLabel(issue.number, [ISSUE_LABELS.READY_TO_SIGN, ISSUE_LABELS.VERIFIED_CLIENT])

    // metrics
    const metricsParams: MetricsApiParams = {
      name: issue.name,
      clientAddress: issue.address,
      msigAddress: notaryAddress,
      amount: amountToRequest.amount.toString(),
      uuid: uuidv4(),
    }

    await callMetricsApi(issue.number, EVENT_TYPE.SUBSEQUENT_DC_REQUEST, metricsParams)
  }

  logGeneral(`CREATE REQUEST COMMENT ${config.logPrefix} ${issue.number}, posted new datacap request comment.`)
}

/**
 * Prepares the body content for the new datacap request.
 * 
 * @param {issue} issue - The issue object.
 * @param {requestAmount} amountToRequest - Amount of datacap to request.
 * @returns {Object} - Returns the notary address and body content for the request.
 */
const prepareNewDatacapRequestBody = (issue: issue, amountToRequest: requestAmount) => {
  const notaryAddress = VERIFIER_ADDRESS_MAP[issue.lastRequest.verifierAddressId] || issue.lastRequest.verifierAddressId

  const uuid = uuidv4()
  const body = newAllocationRequestComment_V2(
    issue.address,
    amountToRequest.amount.toString(),
    notaryAddress,
    issue.allowanceArray.length + 1,
    uuid
  )

  return { notaryAddress, body }
}

/**
 * Posts a comment to a given issue.
 * 
 * @param {number} issueNumber - The number of the issue to which the comment will be posted.
 * @param {string} body - The content of the comment.
 * @returns {Promise<Object>} - Returns the result of the comment creation.
 */
const postComment = async (issueNumber: number, body: string) => {
  return await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  })
}


/**
 * Adds labels to a specific issue.
 * 
 * @param {number} issueNumber - The number of the issue to which the labels will be added.
 * @param {string[]} labels - An array of labels to add.
 * @returns {Promise<Object>} - Returns the result of the label addition.
 */
const addIssueLabel = async (issueNumber: number, labels: string[]) => {
  return await octokit.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels,
  })
}

/**
 * Removes a label from a specific issue.
 * 
 * @param {number} issueNumber - The number of the issue from which the label will be removed.
 * @param {string} label - The label to remove.
 * @returns {Promise<Object>} - Returns the result of the label removal.
 */
const removeIssueLabel = async (issueNumber: number, label: string) => {
  return await octokit.issues.removeLabel({
    owner,
    repo,
    issue_number: issueNumber,
    name: label,
  })
}

/**
 * Logs the details of an issue including the body, comment, and author of the comment.
 * 
 * @param {number} issueNumber - The number of the issue.
 * @param {string} issueBody - The body/content of the issue.
 * @param {string} commentBody - The body/content of the comment.
 * @param {string} commentAuthor - The author of the comment.
 * @returns {void}
 */
const logIssueDetails = (
  issueNumber: number,
  issueBody: string,
  commentBody: string,
  commentAuthor: string
) => {
  const logs = [
    `Subsequent-Allocation-Bot started - check issue ${issueNumber}.`,
    `---------------------------------------------------`,
    `${config.logPrefix} ${issueNumber} ${issueBody}`,
    `${config.logPrefix} ${issueNumber} ${commentBody}`,
    `${config.logPrefix} ${issueNumber} ${commentAuthor}`
  ]
  logs.forEach(logGeneral)
}

/**
 * Extend an issue with data from a client.
 *
 * @param {issue} issue - The issue to extend.
 * @returns {Object} - An object containing a success boolean and the modified issue.
 */
const extendIssueWithClientData = async (issue: issue): Promise<{ success: boolean, modifiedIssue: issue }> => {
  const apiClients = await getApiClients();
  const client = apiClients.find(item => item.address === issue.address);

  if (!client) {
    logGeneral(`${config.logPrefix} ${issue.name} No client found for address ${issue.address}`);
    return { success: false, modifiedIssue: issue };
  }

  const modifiedIssue = { ...issue }; // Hacemos una copia de issue
  modifiedIssue.idAddress = client.addressId;
  modifiedIssue.address = client.address;
  modifiedIssue.datacap = client.allowance;
  modifiedIssue.allowanceArray = client.allowanceArray;

  return { success: true, modifiedIssue };
}

/**
 * Extend an issue to include the last LDN allowance data.
 *
 * @param {issue} issue - The issue to extend.
 * @returns {issue} - The modified issue with added last request data.
 */
const extendIssueWithLastLdnAllowance = (issue: issue): issue => {
  const modifiedIssue = { ...issue };
  modifiedIssue.lastRequest = issue.allowanceArray?.find(request => request.isLdnAllowance);
  return modifiedIssue;
}

/**
 * Check if a new request needs to be posted based on the issue data.
 *
 * @param {issue} issue - The parsed issue object.
 * @returns {boolean} - Returns true if a new request should be posted, otherwise false.
 */
const checkPostNewRequest = async (issue: issue) => {
  if (!issue.lastRequest) return false

  const remainingDatacap = await getRemainingDataCap(issue.address)
  const margin = computeMargin(remainingDatacap, issue.lastRequest.allowance)

  if (margin <= 0.25) {
    logGeneral(`datacap remaining / datacp allocated: ${(margin * 100).toFixed(2)} %`)
    return true
  }
  return false
}

/**
 * Compute the margin between the remaining DataCap and the last request allowance.
 *
 * @param {string} remainingDatacap - The remaining DataCap.
 * @param {string} lastRequestAllowance - The allowance of the last request.
 * @returns {number} - The computed margin.
 */
const computeMargin = (remainingDatacap: string, lastRequestAllowance: string): number => {
  const remaining = parseInt(remainingDatacap) || 1
  const last = parseInt(lastRequestAllowance)
  return remaining / last
}
