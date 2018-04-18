'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { ExchangeError } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class foxbit extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'foxbit',
            'name': 'FoxBit',
            'countries': 'BR',
            'has': {
                'CORS': false,
                'createMarketOrder': false,
            },
            'rateLimit': 1000,
            'version': 'v1',
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/27991413-11b40d42-647f-11e7-91ee-78ced874dd09.jpg',
                'api': {
                    'public': 'https://api.blinktrade.com/api',
                    'private': 'https://api.blinktrade.com/tapi',
                },
                'www': 'https://foxbit.exchange',
                'doc': 'https://blinktrade.com/docs',
            },
            'comment': 'Blinktrade API',
            'api': {
                'public': {
                    'get': [
                        '{currency}/ticker',    // ?crypto_currency=BTC
                        '{currency}/orderbook', // ?crypto_currency=BTC
                        '{currency}/trades',    // ?crypto_currency=BTC&since=<TIMESTAMP>&limit=<NUMBER>
                    ],
                },
                'private': {
                    'post': [
                        'message', // message
                        
                        // TODO:  The requests below may be deprecated and
                        //        are known to be failing for most or all of the users
                        //
                        'D',       // order
                        'F',       // cancel order
                        'U2',      // balance
                        'U4',      // my orders
                        'U6',      // withdraw
                        'U18',     // deposit
                        'U24',     // confirm withdrawal
                        'U26',     // list withdrawals
                        'U30',     // list deposits
                        'U34',     // ledger
                        'U70',     // cancel withdrawal
                    ],
                },
            },
            'markets': {
                'BTC/VEF': { 'id': 'BTCVEF', 'symbol': 'BTC/VEF', 'base': 'BTC', 'quote': 'VEF', 'brokerId': 1, 'broker': 'SurBitcoin' },
                'BTC/VND': { 'id': 'BTCVND', 'symbol': 'BTC/VND', 'base': 'BTC', 'quote': 'VND', 'brokerId': 3, 'broker': 'VBTC' },
                'BTC/BRL': { 'id': 'BTCBRL', 'symbol': 'BTC/BRL', 'base': 'BTC', 'quote': 'BRL', 'brokerId': 4, 'broker': 'FoxBit' },
                'BTC/PKR': { 'id': 'BTCPKR', 'symbol': 'BTC/PKR', 'base': 'BTC', 'quote': 'PKR', 'brokerId': 8, 'broker': 'UrduBit' },
                'BTC/CLP': { 'id': 'BTCCLP', 'symbol': 'BTC/CLP', 'base': 'BTC', 'quote': 'CLP', 'brokerId': 9, 'broker': 'ChileBit' },
            },
        });
    }

    fetchBalance (params = {}) {
        // todo parse balance
        return this.privatePostU2 ({
            'BalanceReqID': this.nonce (),
        });
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        let market = this.market (symbol);
        let orderbook = await this.publicGetCurrencyOrderbook (this.extend ({
            'currency': market['quote'],
            'crypto_currency': market['base'],
        }, params));
        return this.parseOrderBook (orderbook);
    }

    async fetchTicker (symbol, params = {}) {
        let market = this.market (symbol);
        let ticker = await this.publicGetCurrencyTicker (this.extend ({
            'currency': market['quote'],
            'crypto_currency': market['base'],
        }, params));
        let timestamp = this.milliseconds ();
        let lowercaseQuote = market['quote'].toLowerCase ();
        let quoteVolume = 'vol_' + lowercaseQuote;
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': parseFloat (ticker['high']),
            'low': parseFloat (ticker['low']),
            'bid': parseFloat (ticker['buy']),
            'ask': parseFloat (ticker['sell']),
            'vwap': undefined,
            'open': undefined,
            'close': undefined,
            'first': undefined,
            'last': parseFloat (ticker['last']),
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': parseFloat (ticker['vol']),
            'quoteVolume': parseFloat (ticker[quoteVolume]),
            'info': ticker,
        };
    }

    parseTrade (trade, market) {
        let timestamp = trade['date'] * 1000;
        return {
            'id': this.safeString (trade, 'tid'),
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': market['symbol'],
            'type': undefined,
            'side': trade['side'],
            'price': trade['price'],
            'amount': trade['amount'],
        };
    }

    /* async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        let market = this.market (symbol);
        let response = await this.publicGetCurrencyTrades (this.extend ({
            'currency': market['quote'],
            'crypto_currency': market['base'],
        }, params));
        return this.parseTrades (response, market, since, limit);
    } */

    async fetchTrades (symbol, params = {}) {
        // let market = this.market (symbol);
        let response = await this.privatePostU4 (this.extend ({
            'OrdersReqID': this.nonce ().toString (),
        }));
        return this.parseOrderList (response['Responses'][0], symbol);
    }

    async parseOrderList (orderList, symbol) {
        const market = this.market (symbol);
        const columns = orderList['Columns'];
        const orders = orderList['OrdListGrp'].map ((items) => {
            const order = {};
            for (let i = 0; i < columns.length; i++) {
                order[columns[i]] = items[i];
            }
            return {
                'id': this.safeString (order, 'OrderID'),
                'info': order,
                'timestamp': new Date (order['OrderDate']).getTime (),
                'datetime': new Date (order['OrderDate']).getTime (),
                'symbol': market['symbol'],
                'type': order['OrdType'] === '2' ? 'limit' : 'market',
                'side': order['Side'] === '1' ? 'buy' : 'sell',
                'price': order['Price'],
                'amount': order['OrderQty'],
                'remaining': order['LeavesQty'],
                'filled': order['OrderQty'] - order['LeavesQty'],
                'cost': order['Volume'],
            };
        });
        return orders;
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        if (type === 'market')
            throw new ExchangeError (this.id + ' allows limit orders only');
        let market = this.market (symbol);
        let orderSide = (side === 'buy') ? '1' : '2';
        let order = {
            'ClOrdID': this.nonce ().toString (),
            'Symbol': market['id'],
            'Side': orderSide,
            'OrdType': '2',
            'Price': price,
            'OrderQty': amount,
            'BrokerID': market['brokerId'],
        };
        let response = await this.privatePostMessage (this.extend (order, params));
        let indexed = this.indexBy (response['Responses'], 'MsgType');
        let execution = indexed['8'];
        return {
            'info': response,
            'id': execution['OrderID'],
        };
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        return await this.privatePostF (this.extend ({
            'ClOrdID': id,
        }, params));
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.urls['api'][api] + '/' + this.version + '/' + this.implodeParams (path, params);
        let query = this.omit (params, this.extractParams (path));
        if (api === 'public') {
            if (Object.keys (query).length)
                url += '?' + this.urlencode (query);
        } else {
            this.checkRequiredCredentials ();
            let nonce = Date.now ().toString ();
            let request = this.extend ({ 'MsgType': path === 'message' ? 'D' : path }, query);
            body = this.json (request);
            headers = {
                'APIKey': this.apiKey,
                'Nonce': nonce,
                'Signature': this.hmac (nonce, this.secret),
                'Content-Type': 'application/json',
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2 (path, api, method, params, headers, body);
        if ('Status' in response)
            if (response['Status'] !== 200)
                throw new ExchangeError (this.id + ' ' + this.json (response));
        return response;
    }
};
