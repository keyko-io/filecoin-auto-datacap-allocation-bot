import OctokitInitializer from '../src/initializers/OctokitInitializer'
import { config } from "../src/config";
import { readBuilderProgram } from 'typescript';

const owner = config.githubLDNOwner;
const repo = config.githubLDNRepo;

jest.setTimeout(20000) 
describe('test deps', () => {
    test('get the list of exceptions', async () => {
       console.log(config.exceptionJson)
       expect(config.exceptionJson).toBeTruthy()
    })

})