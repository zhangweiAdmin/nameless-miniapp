const config = require('./utils/config')
const { readUserProfile } = require('./utils/profile')

const DEFAULT_GROUP_INFO = {
  customName: '群隐盒',
  isCreator: false,
  modifyCount: 0,
  openGid: '',
}
const KEEP_GROUP_AFTER_SHARE_MS = 2 * 60 * 1000

function defaultGroupInfo() {
  return Object.assign({}, DEFAULT_GROUP_INFO)
}

function mergeGroupFromQuery(globalData, query) {
  if (!query || !query.openGid) return

  globalData.groupInfo = Object.assign({}, globalData.groupInfo || {}, {
    customName: query.groupName ? decodeURIComponent(query.groupName) : (globalData.groupInfo && globalData.groupInfo.customName) || '群隐盒',
    openGid: query.openGid,
  })
}

function hasGroupEntry(options) {
  return !!(options && ((options.query && options.query.openGid) || options.shareTicket))
}

function shouldKeepGroupAfterShare(globalData) {
  const until = Number(globalData.keepGroupOnPlainShowUntil) || 0
  if (until && until > Date.now()) {
    globalData.keepGroupOnPlainShowUntil = 0
    return true
  }
  return false
}

function clearGroupContext(globalData) {
  globalData.shareTicket = ''
  globalData.groupInfo = defaultGroupInfo()
}

App({
  globalData: {
    shareTicket: '',
    pendingUnlock: null,
    needRefreshMessages: false,
    keepGroupOnPlainShowUntil: 0,
    userProfile: null,
    groupInfo: defaultGroupInfo(),
  },

  onLaunch(options) {
    this.globalData.userProfile = readUserProfile()

    if (!hasGroupEntry(options)) {
      clearGroupContext(this.globalData)
    }

    if (options && options.query) {
      mergeGroupFromQuery(this.globalData, options.query)
    }

    if (options && options.shareTicket) {
      this.globalData.shareTicket = options.shareTicket
    }

    if (wx.cloud) {
      const cloudOptions = { traceUser: true }
      if (config.cloudEnvId) cloudOptions.env = config.cloudEnvId
      wx.cloud.init(cloudOptions)
    }

    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage'],
      })
    }

    this.showColdStartAd()
  },

  onShow(options) {
    if (!hasGroupEntry(options) && !shouldKeepGroupAfterShare(this.globalData)) {
      clearGroupContext(this.globalData)
    }

    if (options && options.query) {
      mergeGroupFromQuery(this.globalData, options.query)
    }

    if (options && options.shareTicket) {
      this.globalData.shareTicket = options.shareTicket
    }

    if (options && options.query && options.query.messageId) {
      this.globalData.pendingUnlock = {
        messageId: options.query.messageId,
        activityId: options.query.activityId || '',
      }
    }
  },

  markShareReturn() {
    this.globalData.keepGroupOnPlainShowUntil = Date.now() + KEEP_GROUP_AFTER_SHARE_MS
  },

  showColdStartAd() {
    const adUnitId = config.adUnitIds.interstitial
    if (!adUnitId || !wx.createInterstitialAd) return

    const interstitialAd = wx.createInterstitialAd({ adUnitId })
    interstitialAd.show().catch(() => {})
  },
})
