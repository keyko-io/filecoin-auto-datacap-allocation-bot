import { config } from "../config";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";


const formatPK = () => {
  const BEGIN = config.beginPk;
  const END = config.endPk;
  const splitted = config.privateKey.match(/.{1,64}/g);
  const formatted = `${BEGIN}\n${splitted.join("\n")}\n${END}`;
  return formatted;
};






export default class OctokitInitializer {
  private static octoInstance: Octokit

  private constructor() { }

  public static getInstance(): Octokit {
    if (!this.octoInstance) {
      this.octoInstance = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          type: "installation",
          installationId: config.installationID,
          appId: config.appId,
          privateKey: formatPK(),
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        }
      });
    }

    return this.octoInstance
  }

}

