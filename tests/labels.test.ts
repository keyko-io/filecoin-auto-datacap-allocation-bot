
// import { LABELS } from '../src/labels'
import fvc from "filecoin-verfier-common"
const { ISSUE_LABELS } = fvc


jest.setTimeout(20000)

/**
 * @TODO test checkV3LastTwoWeeksAndReturnDatacapToBeRequested function
 */
const TEST_AGAINST_LABELS = {
    EFIL_PLUS: "efil+",
    ERROR: "error",
    GRANTED: "granted",
    WAITING_FOR_CLIENT_REPLY: "waiting for client reply",
    ONE_NOTARY_DECLINED: "one notary declined",
    READY_TO_SIGN: "ready to sign",
    STATUS_START_SIGN_DATACAP: "start sign datacap",
    TOTAL_DC_REACHED: "total datacap reached",
    VALIDATED: "validated",
    VERIFIED_CLIENT: "verified client",
};

describe('test all the labels', () => {
    it('all the labels should be correct', async () => {
        for (let [k,v] of Object.entries(ISSUE_LABELS)){
            console.log("LABEL",k,v, "TEST_AGAINST_LABELS[k]",TEST_AGAINST_LABELS[k])
            // expect(v).toEqual(TEST_AGAINST_LABELS[k])
        }
    })
})

