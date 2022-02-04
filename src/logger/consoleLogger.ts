
const ENVIRONMENT = process.env.ENVIRONMENT
const PHASE = `Subsequent Allocation`;

export const logGeneral = (message: string): void => {
   if(!checkEnvTestLog(message)) return 
    console.log(`[${PHASE}] INFO ${message}`)
}
export const logWarn = (message: string): void => {
    if(!checkEnvTestLog(message)) return 
    console.warn(`[${PHASE}] WARN ${message}`)
}
export const logDebug = (message: string): void => {
    if(!checkEnvTestLog(message)) return 
    console.debug(`[${PHASE}] DEBUG ${message}`)
}
export const logError = (message: string): void => {
    if(!checkEnvTestLog(message)) return 
    console.error(`[${PHASE}] ${message}`)
}

const checkEnvTestLog = (message: string) => {
    if (ENVIRONMENT === "test") {
        // console.log(`testLog`)
        console.log(`testLog [${PHASE}] ERROR ${message}`)
        return false
    }
    return true
}
