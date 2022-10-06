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
  if (issue.labels.find((item: any) => item.name === LabelsEnum.STATUS_APPROVED) || issue.labels.find((item: any) => item.name === LabelsEnum.STATUS_START_SIGN_ON_CHAIN)) {
    logGeneral(`${config.logPrefix} ${issue.number} skipped --> V3 Msig started the RKH signature round.`);
    iss.skip = true
    iss.label = LabelsEnum.STATUS_APPROVED
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