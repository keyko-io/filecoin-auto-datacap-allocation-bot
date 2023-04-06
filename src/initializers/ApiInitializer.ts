import { config } from "../config";

import { VerifyAPI } from "@keyko-io/filecoin-verifier-tools"

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
                VerifyAPI.standAloneProvider(node_url, {
                    token:lotus_node_token
                }),
                network_type // if node != Mainnet => testnet = true
            )
        }
        return this.api
    }

}

