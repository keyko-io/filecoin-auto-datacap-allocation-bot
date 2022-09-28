import { config } from "../config";

import VerifyAPI from "@keyko-io/filecoin-verifier-tools/api/api.js";






// const api = new VerifyAPI( // eslint-disable-line
//   VerifyAPI.standAloneProvider(
//     process.env.NODE_URL,
//     null,
//     process.env.NETWORK_TYPE !== "Mainnet" // if node != Mainnet => testnet = true
//   )
// );



export default class ApiInitializer {
    private static api: VerifyAPI

    private constructor() { }

    public static getInstance(): VerifyAPI {
        if (!this.api) {
        this.api = new VerifyAPI( // eslint-disable-line
            VerifyAPI.standAloneProvider(
                config.nodeUrl,
                null,
                config.networkType 
            )
        );
        }
        return this.api
    }

}

