import { observer as globalObserver } from 'binary-common-utils/lib/observer'
import {
  subscribeToStream, registerStream, doUntilDone,
  getDirection, getPipSizes, tradeOptionToProposal,
} from '../tools'
import Trade from './Trade'

export default class Purchase {
  constructor($scope) {
    this.api = $scope.api
    this.observer = $scope.observer
    this.CM = $scope.CM
    this.$scope = $scope
    this.trade = new Trade(this.$scope)
  }
  start(tradeOption) {
    this.init()

    const { symbol, granularity } = tradeOption
    const proposals = tradeOptionToProposal(tradeOption)

    registerStream(this.observer,
      'api.ohlc', candle => this.handleOhlcStream(candle))
    registerStream(this.observer,
      'api.tick', tick => this.handleTickStream(tick))
    this.subscribeTicks(symbol, granularity)
    this.subscribeToProposals(proposals)
  }
  startPurchase(option) {
    if (!this.purchased) {
      this.purchased = true
      this.trade.start(this.proposals[option])
    }
  }
  init() {
    this.granularity = 0
    this.ready = false
    this.purchased = false
    this.symbol = ''
    this.ticks = []
    this.ohlc = []
    this.pipSizes = []
    this.proposals = {}
  }
  subscribeToProposals(proposals) {
    subscribeToStream(this.observer, 'api.proposal', proposal => {
      this.proposals[proposal.contract_type] = proposal
      if (Object.keys(this.proposals).length === proposals.length) {
        this.ready = true
      }
    }, () => {
      doUntilDone(() => this.api.originalApi.unsubscribeFromAllProposals())
        .then(() => proposals.forEach(p => this.api.proposal(p)))
    }, false, null)
  }
  subscribeTicks(symbol, granularity) {
    return Promise.all([
      this.getPipSizes(),
      this.subscribeToTickHistory(symbol),
      this.subscribeToCandles(symbol, granularity),
    ])
  }
  getPipSizes() {
    return new Promise(resolve => {
      this.api.originalApi.getActiveSymbolsBrief().then(resp =>
        (this.pipSizes = getPipSizes(resp.active_symbols)))
      resolve()
    })
  }
  getContract(option) {
    return this.proposals[option]
  }
  handleTickStream(tick) {
    this.ticks = [...this.ticks.slice(1), tick]

    const {
      direction = getDirection(this.ticks),
      symbol, ticks, ohlc,
    } = this

    const ticksObj =
      ({ direction, symbol, pipSize: this.pipSizes[symbol], ticks, ohlc })

    this.CM.setContext('shared', ticksObj)

    if (this.ready) {
      this.CM.execContext('before', this.proposals)
    }

    globalObserver.emit('bot.tickUpdate', ticksObj)
  }
  handleOhlcStream(candle) {
    const length = this.ohlc.length
    const prevCandles = length && this.ohlc[length - 1].epoch === candle.epoch ?
      this.ohlc.slice(0, -1) :
      this.ohlc.slice(1)
    this.ohlc = [...prevCandles, candle]
  }
  subscribeToCandles(symbol, granularity) {
    if (granularity === this.granularity && this.symbol === symbol) {
      return null
    }
    return subscribeToStream(this.observer,
      'api.candles', ohlc => {
        this.granularity = granularity
        this.ohlc = ohlc
      }, () => {
        doUntilDone(() => this.api.originalApi.unsubscribeFromAllCandles())
          .then(() => {
            this.api.history(symbol, {
              end: 'latest',
              count: 5000,
              granularity,
              style: 'candles',
              subscribe: 1,
            })
          })
      }, true, 'candles', ['api.ohlc', 'api.candles'])
  }
  subscribeToTickHistory(symbol) {
    if (symbol === this.symbol) {
      return null
    }
    return subscribeToStream(this.observer,
      'api.history', history => {
        this.symbol = symbol
        this.ticks = history
      }, () => {
        doUntilDone(() => this.api.originalApi.unsubscribeFromAllTicks())
          .then(() => {
            this.api.history(symbol, {
              end: 'latest',
              count: 5000,
              subscribe: 1,
            })
          })
      }, true, 'history', ['api.history', 'api.tick', 'bot.tickUpdate'])
  }
}