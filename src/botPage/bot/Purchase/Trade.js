import { subscribeToStream, doUntilDone } from '../tools'

export default class Trade {
  constructor($scope) {
    this.api = $scope.api
    this.observer = $scope.observer
    this.CM = $scope.CM
  }
  init() {
    this.openContract = null
    this.contractId = null
    this.isSellAvailable = false
    this.isSold = false
  }
  start(contract) {
    this.init()
    subscribeToStream(this.observer, 'api.buy', purchasedContract => {
      this.observer.emit('trade.purchase', { contract, purchasedContract })

      this.isSold = false

      this.contractId = purchasedContract.contract_id
      doUntilDone(() => this.api.originalApi.unsubscribeFromAllProposals())
        .then(() => this.subscribeToOpenContract())
      this.CM.execContext('between-before-and-during')
    }, () => this.api.buy(contract.id, contract.ask_price),
    true, 'buy', ['trade.purchase'])
  }
  sellAtMarket() {
    if (!this.isSold && this.isSellAvailable) {
      doUntilDone(() => this.api.originalApi.sellContract(
        this.openContract.contract_id, 0)).then(() => {
          this.isSold = true
          this.isSellAvailable = false
        })
    }
  }
  retryIfContractNotReceived(contract) {
    if (!('transaction_ids' in contract)) {
      this.api.proposal_open_contract(this.contractId)
      return true
    }
    return false
  }
  handleExpire(contract) {
    this.isSellAvailable = !this.isSold &&
      !contract.is_expired && contract.is_valid_to_sell

    if (!this.isSold && contract.is_valid_to_sell && contract.is_expired) {
      this.isSold = true
      doUntilDone(() => this.api.originalApi.sellExpiredContracts())
    }
  }
  handleUpdate(contract) {
    const finished = contract.sell_price
    if (finished) {
      this.openContract = null
      this.observer.emit('trade.finish', contract)
      doUntilDone(() => this.api.originalApi.unsubscribeFromAllProposalsOpenContract())
    } else {
      this.openContract = contract
      this.observer.emit('trade.update', contract)
    }
    this.CM.execContext(finished ? 'after' : 'during', contract)
  }
  subscribeToOpenContract() {
    if (!this.contractId) {
      return
    }
    subscribeToStream(this.observer, 'api.proposal_open_contract', contract => {
      if (this.retryIfContractNotReceived(contract)) {
        return
      }

      this.handleExpire(contract)

      this.handleUpdate(contract)
    }, () => this.api.proposal_open_contract(this.contractId),
    false, 'proposal_open_contract', ['trade.update', 'trade.finish'])
  }
  checkSellAvailable() {
    return !!this.isSellAvailable
  }
}