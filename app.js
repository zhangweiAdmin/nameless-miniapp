const config = require('./utils/config')
const { readUserProfile } = require('./utils/profile')
const { ensureShareTicketMenu } = require('./utils/share')

const DEFAULT_GROUP_INFO = {
  customName: '群隐盒悄悄话',
  isCreator: false,
  modifyCount: 0,
  openGid: '',
}
const KEEP_GROUP_AFTER_SHARE_MS = 2 * 60 * 1000
const MESSAGE_CARD_SCENES = [1007, 1008, 1044]
const GROUP_CHAT_SCENES = [1008, 1044, 1158]
const SEARCH_SCENES = [1005, 1006, 1027]

function defaultGroupInfo() {
  return Object.assign({}, DEFAULT_GROUP_INFO)
}

function mergeGroupFromQuery(globalData, query) {
  if (!query || !query.openGid) return

  globalData.groupInfo = Object.assign({}, globalData.groupInfo || {}, {
    customName: query.groupName ? decodeURIComponent(query.groupName) : (globalData.groupInfo && globalData.groupInfo.customName) || '群隐盒悄悄话',
    openGid: query.openGid,
  })
}

function hasGroupEntry(options) {
  return !!(options && ((options.query && options.query.openGid) || options.shareTicket))
}

function hasGroupShareMarker(options) {
  return !!(options && options.query && options.query.fromGroupShare === '1')
}

function isMessageCardScene(options) {
  const scene = Number(options && options.scene)
  return MESSAGE_CARD_SCENES.indexOf(scene) > -1
}

function isGroupChatScene(options) {
  const scene = Number(options && options.scene)
  return GROUP_CHAT_SCENES.indexOf(scene) > -1
}

function isSearchScene(options) {
  const scene = Number(options && options.scene)
  return SEARCH_SCENES.indexOf(scene) > -1
}

function syncEntryScene(globalData, options) {
  const isGroupChatEntry = hasGroupEntry(options) || hasGroupShareMarker(options) || isGroupChatScene(options)
  globalData.isGroupChatEntry = isGroupChatEntry
  globalData.entrySource = isGroupChatEntry ? 'group' : (isSearchScene(options) ? 'search' : 'normal')
  if (isGroupChatEntry) {
    globalData.groupEntryVersion = (globalData.groupEntryVersion || 0) + 1
  }
}

function shouldKeepGroupAfterShare(globalData, options) {
  const until = Number(globalData.keepGroupOnPlainShowUntil) || 0
  if (!until) return false

  globalData.keepGroupOnPlainShowUntil = 0
  if (until <= Date.now()) return false
  if (hasGroupShareMarker(options)) return false
  if (isMessageCardScene(options)) return false
  return true
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
    isGroupChatEntry: false,
    entrySource: 'normal',
    groupEntryVersion: 0,
    userProfile: null,
    groupInfo: defaultGroupInfo(),
  },

  onLaunch(options) {
    this.globalData.userProfile = readUserProfile()
    syncEntryScene(this.globalData, options)

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

    ensureShareTicketMenu()

    this.showColdStartAd()
  },

  onShow(options) {
    syncEntryScene(this.globalData, options)

    if (hasGroupEntry(options)) {
      this.globalData.keepGroupOnPlainShowUntil = 0
    } else if (!shouldKeepGroupAfterShare(this.globalData, options)) {
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
