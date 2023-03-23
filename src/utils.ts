import ByteConverter from '@wtfcode/byte-converter'
import { logDebug, logGeneral } from './logger/consoleLogger'
import { config } from './config'
import axios from 'axios';
import OctokitInitializer from './initializers/OctokitInitializer';
const byteConverter = new ByteConverter()
const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;
const octokit = OctokitInitializer.getInstance()


export const matchGroup = (regex, content) => {
  let m
  if ((m = regex.exec(content)) !== null) {
    if (m.length >= 2) {
      return m[1]
    }
    return m[0]
  }
}

export const matchAll = (regex, content) => {
  var matches = [...content.matchAll(regex)]
  if (matches !== null) {
    // each entry in the array has this form: Array ["#### Address > f1111222333", "", "f1111222333"]
    return matches.map(elem => elem[2])
  }
}


export function anyToBytes(inputDatacap: string) {
  const formatDc = inputDatacap.replace(/[t]/g, "T").replace(/[b]/g, "B").replace(/[p]/g, "P").replace(/[I]/g, "i").replace(/\s*/g, "")
  const ext = formatDc.replace(/[0-9.]/g, '')
  const datacap = formatDc.replace(/[^0-9.]/g, '')
  const bytes = byteConverter.convert(parseFloat(datacap), ext, 'B')
  return bytes
}

export function bytesToiB(inputBytes: number) {
  // const autoscale = byteConverter.autoScale(Number(inputBytes), 'B', { preferByte: true, preferBinary: true } as any)
  let autoscale = byteConverter.autoScale(inputBytes, 'B', { preferByte: true, preferBinary: true } as any)
  //this is bc it cannot convert 1099511627776000 to 1PiB and it convert to 9 YiB
  let stringVal = ''
  if (autoscale.dataFormat === "YiB") {
    autoscale = byteConverter.autoScale(inputBytes - 32, 'B', { preferByte: true, preferBinary: true } as any)
    return `${autoscale.value.toFixed(1)}${autoscale.dataFormat}`
    // stringVal = String(autoscale.value)
    // return `${stringVal.substring(0, stringVal.indexOf('.'))}${stringVal.substring(stringVal.indexOf('.'), stringVal.indexOf('.')+3)}${autoscale.dataFormat}`
  }
  stringVal = String(autoscale.value)

  const indexOfDot = stringVal.indexOf('.')
  return `${stringVal.substring(0, indexOfDot > 0 ? indexOfDot : stringVal.length)}${indexOfDot > 0 ? stringVal.substring(indexOfDot, indexOfDot + 3) : ''}${autoscale.dataFormat}`
}

export function bytesToB(inputBytes: number) {
  const autoscale = byteConverter.autoScale(inputBytes, 'B', { preferByte: true, preferDecimal: true } as any)
  return `${Number.isInteger(autoscale.value) ? autoscale.value : autoscale.value.toFixed(1)}${autoscale.dataFormat}`
}

enum LabelsEnum {
  READY_TO_SIGN = "bot:readyToSign",
  NEED_DILIGENCE = "status:needsDiligence",
  ERROR = "status:Error",
  TOTAL_DC_REACHED = "issue:TotalDcReached",
  STATUS_APPROVED = "status:Approved",
  STATUS_START_SIGN_ON_CHAIN = "status:StartSignOnchain",
  STATUS_VERIFYING = "status:Verifying",
  STATUS_DC_REQUEST_POSTED = "status:dcRequestPosted"
}

export const checkLabel = (issue: any) => {

  let iss = {
    number: issue.number,
    label: '',
    skip: false
  }

  if (issue.labels.find((item: any) => item.name === LabelsEnum.READY_TO_SIGN)) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> ${LabelsEnum.READY_TO_SIGN} is present`);
    iss.skip = true
    iss.label = LabelsEnum.READY_TO_SIGN
    return iss
  }
  if (
    issue.labels.find((item: any) => item.name === LabelsEnum.NEED_DILIGENCE)) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> ${LabelsEnum.NEED_DILIGENCE} is present`);
    iss.skip = true
    iss.label = LabelsEnum.NEED_DILIGENCE
    return iss
  }
  if (issue.labels.find((item: any) => item.name === LabelsEnum.ERROR)) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> ${LabelsEnum.ERROR} is present`);
    iss.skip = true
    iss.label = LabelsEnum.ERROR
    return iss
  }
  if (issue.labels.find((item: any) => item.name === LabelsEnum.TOTAL_DC_REACHED)) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> ${LabelsEnum.TOTAL_DC_REACHED} is present`);
    iss.skip = true
    iss.label = LabelsEnum.TOTAL_DC_REACHED
    return iss
  }
  if (issue.labels.find((item: any) => item.name === LabelsEnum.STATUS_DC_REQUEST_POSTED) || issue.labels.find((item: any) => item.name === LabelsEnum.STATUS_START_SIGN_ON_CHAIN)) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> V3 Msig started the RKH signature round.`);
    iss.skip = true
    iss.label = LabelsEnum.STATUS_APPROVED
    return iss
  }
  if (issue.labels.find((item: any) => item.name === LabelsEnum.STATUS_VERIFYING) ) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> Issue is still in verifying phase.`);
    iss.skip = true
    iss.label = LabelsEnum.STATUS_VERIFYING
    return iss
  }

  return iss
}

export const checkRequestAndReturnRequest = (requestListForEachIssue: any[], issue: any) => {

  const requestList = requestListForEachIssue.find((requestItem: any) => requestItem.issueNumber == issue.number).requestList
  const lastRequest = requestList[requestList.length - 1];
  const requestNumber = requestListForEachIssue.length;

  if (lastRequest === undefined) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> DataCap allocation requested comment is not present`);
    return { isValid: false }
  }
  if (!lastRequest.allocationDatacap && !lastRequest.clientAddress) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> DataCap allocation requested comment is not present`);
    return { isValid: false }
  }
  if (!lastRequest.clientAddress) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> clientAddress not found after parsing the comments`);
    return { isValid: false }
  }
  if (!lastRequest.allocationDatacap) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> datacapAllocated not found after parsing the comments`);
    return { isValid: false }
  }
  return {
    isValid: true,
    lastRequest,
    requestNumber
  }
}


export const commentsForEachIssue = async (octokit: any, rawIssues: any) => {
  return await Promise.all(
    rawIssues.map(async (issue: any) => {
      const comments = await octokit.paginate(octokit.rest.issues.listComments,
        {
          owner,
          repo,
          issue_number: issue.number,
        })
      return { issueNumber: issue.number, comments }
    }))
}

export const findClient = (apiClients: any, address: any) => {
  const el = apiClients.data.data.find((item: any) => item.address === address)
  if (el) return el
  else return false
}

export const getTotalDcGrantedSoFar = (client: any) => {
  const set = new Set();
  return client.allowanceArray
    .filter((item: any) => {
      if (set.has(item.msgCID))
        return false;
      set.add(item.msgCID);
      return true;
    })
    .reduce((s: number, item: any) => s + parseInt(item.allowance), 0);
}

export const getDeltaDcAndDcGranted = (elem: any, totalDcGrantedForClientSoFar: any) => {
  return anyToBytes(elem.issue.parsed.datacapRequested) - totalDcGrantedForClientSoFar;
}

export const getGithubHandlesForAddress = (addresses: string[], notaries: any) => {
  return addresses.map(
    (addr: any) => notaries.find(
      (nt: any) => nt.ldn_config.signing_address === addr
    )?.github_user[0]
  );
}

/**
 * 
 * @returns the clients from dmob api
 */
export const getApiClients = async () => {
  return await axios({
    method: "GET",
    url: `${config.filpusApi}/getVerifiedClients`,
    headers: {
      "x-api-key": "5c993a17-7b18-4ead-a8a8-89dad981d87e",
    },
  });
}

export const calculateTotalDcGrantedSoFar = (issue: any) => {
  const dc = issue.issue.requests.reduce((acc: any, el: any) => acc + anyToBytes(el.allocationDatacap), 0)
  return dc
}

export const calculateAllocationToRequest = (
  requestNumber: number,
  totalDcGrantedForClientSoFar: number,
  totaldDcRequestedByClient: number,
  weeklyDcAllocationBytes: number,
  issueNumber: any
) => {
  logDebug(`${config.logPrefix} ${issueNumber} weekly datacap requested by client: ${bytesToiB(weeklyDcAllocationBytes)} ${weeklyDcAllocationBytes}B`)

  logDebug(`${config.logPrefix} ${issueNumber} total datacap requested by client: ${bytesToiB(totaldDcRequestedByClient)}, ${totaldDcRequestedByClient}B`)


  let nextRequest = 0;
  let rule = ""
  let condition = true
  switch (requestNumber) {
    case 0: //1nd req (won't never happen here :) - 50%
      condition = weeklyDcAllocationBytes / 2 <= totaldDcRequestedByClient * 0.05
      nextRequest = condition ? weeklyDcAllocationBytes / 2 : totaldDcRequestedByClient * 0.05;
      rule = condition ? `50% of weekly dc amount requested` : `5% of total dc amount requested`
      break;
    case 1: //2nd req - 100% of the amount in the issue
      condition = weeklyDcAllocationBytes <= totaldDcRequestedByClient * 0.1
      nextRequest = condition ? weeklyDcAllocationBytes : totaldDcRequestedByClient * 0.1;
      rule = condition ? `100% of weekly dc amount requested` : `10% of total dc amount requested`
      break;
    case 2: //3rd req - 200% of the amount in the issue
      condition = weeklyDcAllocationBytes * 2 <= totaldDcRequestedByClient * 0.2
      nextRequest = condition ? weeklyDcAllocationBytes * 2 : totaldDcRequestedByClient * 0.2;
      rule = condition ? `200% of weekly dc amount requested` : `20% of total dc amount requested`
      break;
    case 3: //4th req - 400% of the amount in the issue
      condition = weeklyDcAllocationBytes * 4 <= totaldDcRequestedByClient * 0.4
      nextRequest = condition ? weeklyDcAllocationBytes * 4 : totaldDcRequestedByClient * 0.4;
      rule = condition ? `400% of weekly dc amount requested` : `40% of total dc amount requested`
      break;

    default:
      //5th req on - 800% of the amount in the issue
      condition = weeklyDcAllocationBytes * 8 <= totaldDcRequestedByClient * 0.8
      nextRequest = condition ? weeklyDcAllocationBytes * 8 : totaldDcRequestedByClient * 0.8;
      rule = condition ? `800% of weekly dc amount requested` : `80% of total dc amount requested`
      break;
  }


  const sumTotalAmountWithNextRequest = Math.floor(nextRequest + totalDcGrantedForClientSoFar)
  logDebug(`${config.logPrefix} ${issueNumber} sumTotalAmountWithNextRequest (sum next request + total datcap granted to client so far): ${bytesToiB(sumTotalAmountWithNextRequest)}`)

  let retObj: any = {}
  if (sumTotalAmountWithNextRequest > totaldDcRequestedByClient) {
    logDebug(`${config.logPrefix} ${issueNumber} sumTotalAmountWithNextRequest is higher than total datacap requested by client (${totaldDcRequestedByClient}, requesting the difference of total dc requested - total datacap granted so far)`)
    nextRequest = totaldDcRequestedByClient - totalDcGrantedForClientSoFar
  }
  if (nextRequest <= 0) {
    logDebug(`${config.logPrefix} ${issueNumber} - seems that the client reached the total datacap request in this issue. This should be checked and closed`)
    retObj = {
      amount: 0,
      rule: 'total dc reached',
      totalDatacapReached: true
    }
    return retObj
  }


  logDebug(`${config.logPrefix} ${issueNumber} nextRequest ${bytesToiB(nextRequest)}`)
  logDebug(`${config.logPrefix} ${issueNumber} allocation rule: ${rule}`)
  retObj = {
    amount: bytesToiB(Math.floor(nextRequest)),
    rule,
    totalDatacapReached: false
  }

  return retObj
}

