const VerifyAPI= require("@keyko-io/filecoin-verifier-tools/api/api.js")



const api = new VerifyAPI( // eslint-disable-line
  VerifyAPI.standAloneProvider(
    "https://node.glif.io/space06/lotus/rpc/v0",
    null,
    process.env.NETWORK_TYPE !== "Mainnet" // if node != Mainnet => testnet = true
  )
);

const ADDRESS = 'f3vyn26odhgiu746qv4n4h3xv7u3bzntwwnnhzrcppnhv52htgzkdg2war2pgi4kdoucneqzkl7wenj3mnjpea'
const testCheckClient = async  () => {
try {
  // const  cachedActorAddress = await api.cachedActorAddress(ADDRESS)
  // console.log("cachedActorAddress",cachedActorAddress)
  const  actorAddress = await api.actorAddress(ADDRESS)
  console.log("actorAddress",actorAddress)
  
  const checkClient = await api.checkClient(actorAddress)
  console.log("checkClient",checkClient)
  
} catch (error) {
  console.log(error)
}
}


testCheckClient()










