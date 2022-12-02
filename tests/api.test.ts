import ApiInitializer from '../src/initializers/ApiInitializer'



jest.setTimeout(20000)
describe('test verifyAPI', () => {
    test('the api should be correctly initialized andcommunicating with the node - test', async () => {

        const api = ApiInitializer.getInstance()
        const head = await api.client.chainHead()
        console.log(head)

        expect(head).toBeTruthy()


    })
    test('the api should be correctly initialized andcommunicating with the node - production', async () => {
        const NODE_URL = "https://node.glif.io/space06/lotus/rpc/v0"
        const LOTUS_NODE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJBbGxvdyI6WyJyZWFkIiwid3JpdGUiXX0.h8l0t2onbj85EKy0HYxmjYPlDJSNap70bQExEHh5yKU"

        const NETWORK_TYPE = 'Mainnet'
        const api = ApiInitializer.getInstance(
            NODE_URL, LOTUS_NODE_TOKEN, NETWORK_TYPE
        )
        
        const head = await api.client.chainHead()
        console.log(head)

        expect(head).toBeTruthy()


    })

})