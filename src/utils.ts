import ByteConverter from '@wtfcode/byte-converter'
import { logGeneral } from './logger/consoleLogger'
import { config } from './config'
const byteConverter = new ByteConverter()
const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;


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
  let autoscale = byteConverter.autoScale(inputBytes, 'B', { preferByte: true, preferBinary: true } as any)
  //this is bc it cannot convert 1099511627776000 to 1PiB
  if (autoscale.dataFormat === "YiB") {
    autoscale = byteConverter.autoScale(inputBytes - 32, 'B', { preferByte: true, preferBinary: true } as any)
    return `${(autoscale.value / 1024).toFixed(1)}${"PiB"}`
  }
  return `${autoscale.value}${autoscale.dataFormat}`
  // return `${Number.isInteger(autoscale.value) ? autoscale.value : autoscale.value.toFixed(1)}${autoscale.dataFormat}`
}

export function bytesToB(inputBytes: number) {
  const autoscale = byteConverter.autoScale(inputBytes, 'B', { preferByte: true, preferDecimal: true } as any)
  return `${Number.isInteger(autoscale.value) ? autoscale.value : autoscale.value.toFixed(1)}${autoscale.dataFormat}`
}

enum LabelsEnum {
  READY_TO_SIGN = "bot:readyToSign",
  NEED_DILIGENCE = "status:needsDiligence",
  ERROR = "status:Error",
  TOTAL_DC_REACHED = "issue:TotalDcReached"
}

export const checkLabel = (issue: any) => {
  if (issue.labels.find((item: any) => item.name === LabelsEnum.READY_TO_SIGN)) {
    logGeneral(`${config.LOG_PREFIX} ${issue.number} skipped --> ${LabelsEnum.READY_TO_SIGN} is present`);
    return false
  }
  if (
    issue.labels.find((item: any) => item.name === LabelsEnum.NEED_DILIGENCE)) {
    logGeneral(`${config.LOG_PREFIX} ${issue.number} skipped --> ${LabelsEnum.NEED_DILIGENCE} is present`);
    return false
  }
  if (issue.labels.find((item: any) => item.name === LabelsEnum.ERROR)) {
    logGeneral(`${config.LOG_PREFIX} ${issue.number} skipped --> ${LabelsEnum.ERROR} is present`);
    return false
  }
  if (issue.labels.find((item: any) => item.name === LabelsEnum.TOTAL_DC_REACHED)) {
    logGeneral(`${config.LOG_PREFIX} ${issue.number} skipped --> ${LabelsEnum.TOTAL_DC_REACHED} is present`);
    return false
  }
  return true
}

export const checkRequestAndReturnRequest = (requestListForEachIssue: any[], issue: any) => {

  const requestList = requestListForEachIssue.find((requestItem: any) => requestItem.issueNumber == issue.number).requestList
  const lastRequest = requestList[requestList.length - 1];
  const requestNumber = requestListForEachIssue.length;

  if (lastRequest === undefined) {
    logGeneral(`${config.LOG_PREFIX} ${issue.number} skipped --> DataCap allocation requested comment is not present`);
    return { isValid: false }
  }
  if (!lastRequest.allocationDatacap && !lastRequest.clientAddress) {
    logGeneral(`${config.LOG_PREFIX} ${issue.number} skipped --> DataCap allocation requested comment is not present`);
    return { isValid: false }
  }
  if (!lastRequest.clientAddress) {
    logGeneral(`${config.LOG_PREFIX} ${issue.number} skipped --> clientAddress not found after parsing the comments`);
    return { isValid: false }
  }
  if (!lastRequest.allocationDatacap) {
    logGeneral(`${config.LOG_PREFIX} ${issue.number} skipped --> datacapAllocated not found after parsing the comments`);
    return { isValid: false }
  }
  return {
    isValid: true,
    lastRequest,
    requestNumber
  }
}


export const commentsForEachIssue = async (octokit:any,rawIssues:any) => {
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