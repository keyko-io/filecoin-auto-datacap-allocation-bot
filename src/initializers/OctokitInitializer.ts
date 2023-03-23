import { config } from "../config";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

const pk = `MIIEpQIBAAKCAQEA0F1whMuILkYpB5f9LzXBWm7+JEE3aRxA7uPlptVQekNIkCyTP5ho9sYgvRWAvUvYSP+7wdqOFk8Hm1AQdEZIvKJ7swJtBEHtZDEoKzbhymj/BsU22K/S92SG5MD11U7TcmOZtLrT3WzzVfQRPhTPKwcIbXpRha6CKF7f8VeIH6rME2gRn1IluSkCwlmPePBPaUjIlQUukTf14XBOXXK1+kYsg0lkWr8c8W3/9zqjnHT9DjITKoYOlHSo82bG/B2e3JJEs/aQ8m43ZIevsic84O4wseMWVDnbBoI6EFXP0/3Bo/kS3g3gSjV2qn2+1fMMLq+Oaht21G/e3d7odmq39QIDAQABAoIBAF6opG5fvI0xKICfptDkveNkmyZDTnX89O7SL8l8DSSOHpAJABgbGExLtCHSe/sDUs3PCDBIJtaxroX7eI4qQ+8WbdXkGzyc6sjioBoJw8fdrUYZIBKOxevICpQvqT7voZXM884sNgXY8i8xQwgOEhO9DTIXKKPvpIfMmjYdCuU/M67ATqT686sGf/ZTCI+zNDDchwamifsWBTlJ5zJnL4yW4FEvJE3GXXdHu2d6b10NONCzvMTskl0wB19OSiV1fa0rGl4kNlZqEhgO6wp16nncJhCVZfj3JMLYlNb0reQsAt5jTqrcgJ0lNbQ53243YUSLrtuPJXwAsqHjXXR3JCECgYEA7NxiekKbhT4TSYVYI/bjHatbQV7McNs87P1+vDKFL2o30URJjIGJY8a8P98DsXJHOO0S1zMzZ+WaFPpGod/Zd8/5Ml2/aHrHY/KXvFpU8hpim3MDy/PMBaDybuhILGAxBtal1sGno/kWufL6VE/fiflqu97CpCE2jQpH19ilM9kCgYEA4TOZilmufu4YdT5j0iqiOP1i7EsB+PLMCrXqU7KdpZ8+68RzfMQyvwZ8G5IzkXIiOm0/WF6YYbELBD1QUWCKZEOcw6r/zlwDTlCk64y15pbIzeB+BU16KE1y59pwkHfm6VVIDD4CT0Dp4lb0/sj7YJsvn7nJb5OWvoxV0T0uP30CgYEAsJ7BnBMw7tFUBn21NNQzlPsjCALNhdYlfz6jk2hEog+dYaF/CpPJRCp8U1BT66ygaVV2uBvI2E+AbuYVZz2JZushEiqPwTPUnLXX6a6eKw37u5ivGxVHbGcQgB0bPGPaCxRiA1rSS9ZA2RXTDq2krbjbmw3HrCXMDK2+1rgIsDkCgYEAzYWr4GlMKKbeR1GzA8DI373Po9ooaKwcrsGqosvlt5sHb1+QDhN4RIGEjhz1Vw2UU0IUh299HdrXNP1H6ZxzcGGMFb5fSlMK6VQLzrRR5alChTEVkX1NuK5F6XafOBlU8SlVYWbN8MpLKLc3S7bcQyQdaGXDgkJtVmT4hMaTCHkCgYEA6fX0feKAOST9LfxTasWZqaU9et87AmrDCKxAW9D4UAteg67XwddOWZZSkW8vGYjYV048jUWWBXiu7ihNtuwwwDES43QOniaK8owHF19Zwd3Twhvyjy3cu3+/T3AfP1XtataTJPDg1D6d4w9YxACmIZgkEsN6uZ8P4EQzgS/kv0E=`

const formatPK = () => {
  const BEGIN = config.beginPk;
  const END = config.endPk;
  console.log(config.privateKey, process.env.GIT_PRIVATE_KEY)
  // const splitted = config.privateKey.match(/.{1,64}/g);
  const splitted = pk.match(/.{1,64}/g);
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
          installationId: "17063806",
          // installationId: config.installationID,
          appId: "116297",
          // appId: config.appId,
          privateKey: formatPK(),
          clientId: "Iv1.95ab3105163fa0de",
          // clientId: config.clientId,
          clientSecret: "05dbe8082483f7eb639fb8ec394c6a6c4cc3a719",
        }
      });
    }

    return this.octoInstance
  }

}

