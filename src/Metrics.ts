// import axios from 'axios';
// const baseURL = process.env.METRICS_API_URL || ""

export enum EVENT_TYPE {
    CREATE_APPLICATION = "create_application",
    MULTISIG_CREATION = "multisig_creation",
    FIRST_DC_REQUEST = "first_datacap_request",
    DC_ALLOCATION = "datacap_allocation",
    SUBSEQUENT_DC_REQUEST = "subsequent_datacap_request",
    TOTAL_DATACAP_REACHED = "total_datacap_reached",
}

/**
 * @amount amount of dc requested / allocated
 * @requestNumber number of request for ssa allocation
 * @approvers who approved the last request
 */
export type MetricsApiParams = {
    name: string,
    clientAddress: string,
    msigAddress?: string,
    amount?: string,
    requestNumber?: string | number
}

// type ApiRequest = {
//     environment: string,
//     repo: string,
//     issueNumber: any,
//     timeStamp: Date,
//     eventType: EVENT_TYPE
//     params: MetricsApiParams
// }

// export  function callMetricsApi(issueNumber: any, eventType: EVENT_TYPE, params: MetricsApiParams) {
//     const req: ApiRequest = {
//         environment: process.env.METRICS_API_ENVIRONMENT || "test",
//         issueNumber,
//         repo: "large-dataset",
//         timeStamp: new Date,
//         eventType,
//         params
//     }
//     // const res = "functioning sofar"
//     console.log(req)
//     // const res =  axios.post(baseURL, req)
//     // console.log()
//     // return res
// }
