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
        node_url: any = "https://node.glif.io/space06/lotus/rpc/v0",
        lotus_node_token: any = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJBbGxvdyI6WyJyZWFkIiwid3JpdGUiXX0.h8l0t2onbj85EKy0HYxmjYPlDJSNap70bQExEHh5yKU",
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

