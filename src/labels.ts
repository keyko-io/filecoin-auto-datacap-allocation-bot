
import fvc from "filecoin-verfier-common"
const { ISSUE_LABELS } = fvc

export const LABELS = {
    EFIL_PLUS: ISSUE_LABELS.EFIL_PLUS,
    ERROR: ISSUE_LABELS.ERROR,
    GRANTED: ISSUE_LABELS.STATUS_GRANTED,
    WAITING_FOR_CLIENT_REPLY: ISSUE_LABELS.WAITING_FOR_CLIENT_REPLY,
    ONE_NOTARY_DECLINED: ISSUE_LABELS.ONE_NOTARY_DECLINED,
    READY_TO_SIGN: ISSUE_LABELS.BOT_READY_TO_SIGN,
    STATUS_START_SIGN_DATACAP: ISSUE_LABELS.STATUS_START_SIGN_DATACAP,
    TOTAL_DC_REACHED: ISSUE_LABELS.TOTAL_DC_REACHED,
    VALIDATED: ISSUE_LABELS.STATUS_VALIDATED,
    VERIFIED_CLIENT: ISSUE_LABELS.VERIFIED_CLIENT,
}