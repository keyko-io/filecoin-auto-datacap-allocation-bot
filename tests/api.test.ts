import ApiInitializer from '../src/initializers/ApiInitializer'
import { config } from "../src/config";



jest.setTimeout(20000)
describe('test verifyAPI', () => {
    test('the api should be correctly initialized andcommunicating with the node', async () => {

        const api = ApiInitializer.getInstance()
        const head = await api.client.chainHead()
        console.log(head)

        expect(head).toBeTruthy()
        

    })

})