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
                'fetchBalance': true,
                'createOrder': true,
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/27837060-e7c58714-60ea-11e7-9192-f05e86adb83f.jpg',
                'api': {
                    'public': 'https://api.bitcointrade.com.br/v1/public',
                    'private': 'https://api.bitcointrade.com.br/v1',
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
                'private': {
                    'get': [
                        'wallets/balance/',
                        'market/user_orders/list',
                    ],
                    'post': [
                        'market/create_order',
                    ],
                    'delete': [
                        'market/user_orders',
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

    async fetchBalance (params = {}) {
        const response = await this.privateGetWalletsBalance ();
        if (!(response['data'] instanceof Array)) {
            // NOT OK
        }
        let result = { 'info': response };
        const data = response['data'];
        if (!response['message']) {
            // OK
            for (let i = 0; i < data.length; i++) {
                const wallet = data[i];
                let account = this.account ();
                account['free'] = parseFloat (wallet['available_amount']);
                account['used'] = parseFloat (wallet['locked_amount']);
                account['total'] = account['free'] + account['used'];
                result[wallet['currency_code']] = account;
            }
        }
        return this.parseBalance (result);
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        let response = undefined;
        const market = this.market (symbol);
        if (type === 'market') {
            response = await this.privatePostMarketCreateOrder ({
                'type': side, // BTCTrade uses type as buy or sell
                'currency': market['base'],
                'subtype': 'market',
                'amount': amount,
            });
        } else if (type === 'limit') {
            response = await this.privatePostMarketCreateOrder ({
                'type': side, // BTCTrade uses type as buy or sell
                'currency': market['base'],
                'subtype': 'limited',
                'amount': amount,
                'unit_price': price,
            });
        }
        const data = response.data;
        return {
            'info': data,
            'id': data.id,
            'amount': this.safeFloat (data, 'amount'),
            'price': this.safeFloat (data, 'unit_price'),
            'user': data['user_code'],
            'code': data['code'],
        };
    }

    async cancelOrder (id, params = {}) {
        const response = await this.privateDeleteMarketUserOrders (this.extend ({
            'id': id,
        }, params));
        return response.data === null && response.message === null;
    }

    async fetchOrders (symbol = undefined, params = {}) {
        if (!symbol)
            throw new ExchangeError ('fetchOrders requires a symbol');
        const market = this.market (symbol);
        const response = await this.privateGetMarketUserOrdersList (this.extend ({
            'currency': market['base'],
            ...params,
        }));
        if (response.message === null) {
            // OK
            return response.data.orders.map (this.parseOrder.bind (this));
        } else throw new ExchangeError (response.message);
    }

    parseStatus (status) {
        return status === 'canceled' ? status : 'open';
    }

    parseOrder (order) {
        const price = this.safeFloat (order, 'unit_price');
        const amount = this.safeFloat (order, 'requested_amount');
        const cost = this.safeFloat (order, 'total_price');
        const remaining = this.safeFloat (order, 'remaining_price');
        const filled = this.safeFloat (order, 'executed_amount');
        return {
            'info': order,
            'id': order.id,
            'timestamp': new Date (order['create_date'] || Date.now ()).getTime (),
            'datetime': order['create_date'] || new Date (),
            'symbol': order['currencyCode'],
            'type': order.subtype,
            'side': order.type,
            'price': price,
            'cost': cost,
            'amount': amount,
            'remaining': remaining,
            'filled': filled,
            'status': this.parseStatus (order.status),
            // 'fee': '',
        };
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.urls['api'][api] + '/';
        let query = this.omit (params, this.extractParams (path));
        if (api === 'public') {
            url += this.implodeParams (path, params);
            if (Object.keys (query).length)
                url += '?' + this.urlencode (query);
        } else {
            url += path;
            if (method === 'GET') {
                if (Object.keys (query).length)
                    url += '?' + this.urlencode (query);
            } else {
                body = JSON.stringify (params);
            }
            headers = {
                'Authorization': `ApiToken ${this.apiKey}`,
                'Content-Type': 'application/json',
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }
};
