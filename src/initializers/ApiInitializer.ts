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

    public static getInstance(
        node_url: any = config.nodeUrl,
        lotus_node_token: any = config.lotus_node_token,
        network_type: any = config.networkType
    ): VerifyAPI {
        if (!this.api) {
            this.api = new VerifyAPI( // eslint-disable-line
                VerifyAPI.standAloneProvider(
                    node_url,
                    { token: lotus_node_token },
                    network_type
                )
            );
        }
        return this.api
    }

}

