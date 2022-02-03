
const ENVIRONMENT = process.env.ENVIRONMENT
const PHASE = `Subsequent Allocation`;

export const logGeneral = (message: string): void => {
   if(!checkEnvTestLog(message)) return 
    console.log(`[${PHASE}] ${message}`)
}
export const logWarn = (message: string): void => {
    if(!checkEnvTestLog(message)) return 
    console.warn(`[${PHASE}] ${message}`)
}
export const logDebug = (message: string): void => {
    if(!checkEnvTestLog(message)) return 
    console.debug(`[${PHASE}] ${message}`)
}
export const logError = (message: string): void => {
    if(!checkEnvTestLog(message)) return 
    console.error(`[${PHASE}] ${message}`)
}

const checkEnvTestLog = (message: string) => {
    if (ENVIRONMENT === "test") {
        // console.log(`testLog`)
        console.log(`testLog [${PHASE}] ${message}`)
        return false
    }
    return true
}
