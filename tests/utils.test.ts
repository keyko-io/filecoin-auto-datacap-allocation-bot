import { parseRandomNotaryHandle } from "../src/utils"


describe('test random notary parser', () => {
    it('should parse the comment with random notaries correctly', () => {
        const parsedRandomNotaries = parseRandomNotaryHandle("Hello @Fabri - @Huseyin, please sign the datacap request")

        expect(parsedRandomNotaries[0]).toBe("Fabri")
        expect(parsedRandomNotaries[1]).toBe("Huseyin")
    })
})