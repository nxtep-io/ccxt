const ccxt      = require ('../../ccxt.js')

const btcTrade = new ccxt.btctrade({apiKey: 'U2FsdGVkX19HiQ7RU/+Zh3osWQKx6uo3DmsS2DeMPbY='});

async function Test() {
  const balance = await btcTrade.createOrder('BTC', 'market', 'buy', 0.00001);
  console.log(balance);
}

Test()
  .then(e => console.log(e))
  .catch(e => console.log(e));