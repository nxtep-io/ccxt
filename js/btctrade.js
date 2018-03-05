'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { ExchangeError } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class BTCTrade extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'btctrade',
            'name': 'Bitcoin Trade',
            'countries': 'BR', // Brazil
            'rateLimit': 1000,
            'version': 'v1',
            'has': {
                'CORS': false,
                'publicAPI': true,
                'fetchOrderBook': true,
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/27837060-e7c58714-60ea-11e7-9192-f05e86adb83f.jpg',
                'api': {
                    'public': 'https://api.bitcointrade.com.br/v1/public',
                },
                'www': 'https://bitcointrade.com.br/',
                'doc': [
                    'https://apidocs.bitcointrade.com.br',
                ],
            },
            'api': {
                'public': {
                    'get': [
                        '{coin}/orders/', // last slash critical
                        '{coin}/ticker/',
                    ],
                },
            },
            'markets': {
                'BTC/BRL': { 'id': 'BRLBTC', 'symbol': 'BTC', 'base': 'BTC', 'quote': 'BRL', 'suffix': 'Bitcoin' },
            },
            'fees': {
                'trading': {
                    'maker': 0.3 / 100,
                    'taker': 0.7 / 100,
                },
            },
        });
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        const market = this.market (symbol);
        const response = await this.publicGetCoinOrders (this.extend ({
            'coin': market['base'],
        }, params));
        return this.parseOrderBook (response.data, this.milliseconds (), 'bids', 'asks', 'unit_price', 'amount');
    }

    async fetchTicker (symbol, params = {}) {
        const market = this.market (symbol);
        const response = await this.publicGetCoinTicker (this.extend ({
            'coin': market['base'],
        }, params));
        const ticker = response['data'];
        return {
            'symbol': symbol,
            'timestamp': new Date (ticker['date']).getDate (),
            'datetime': ticker['date'],
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
            'baseVolume': parseFloat (ticker['volume']),
            'quoteVolume': undefined,
            'info': ticker,
        };
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.urls['api'][api] + '/';
        let query = this.omit (params, this.extractParams (path));
        if (api === 'public') {
            url += this.implodeParams (path, params);
            if (Object.keys (query).length)
                url += '?' + this.urlencode (query);
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }
};
