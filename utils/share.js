const GROUP_SHARE_MARK = 'fromGroupShare'
const GROUP_SHARE_VALUE = '1'
const SHARE_TITLE = 'hi~有人在群隐盒悄悄话里给你留了纸条，快打开看看。'
const SHARE_IMAGE_URL = '/assets/images/share-card.png'

function encodeQuery(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')
}

function buildIndexSharePath(params) {
  const query = Object.assign({}, params || {}, {
    [GROUP_SHARE_MARK]: GROUP_SHARE_VALUE,
  })
  return `/pages/index/index?${encodeQuery(query)}`
}

function buildSharePayload(options) {
  const shareOptions = options || {}
  return {
    title: shareOptions.title || SHARE_TITLE,
    path: shareOptions.path || buildIndexSharePath(shareOptions.params),
    imageUrl: shareOptions.imageUrl || SHARE_IMAGE_URL,
  }
}

function ensureShareTicketMenu() {
  if (wx.showShareMenu) {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage'],
    })
  }

  if (wx.updateShareMenu) {
    try {
      wx.updateShareMenu({ withShareTicket: true })
    } catch (error) {}
  }
}

module.exports = {
  GROUP_SHARE_MARK,
  GROUP_SHARE_VALUE,
  SHARE_IMAGE_URL,
  SHARE_TITLE,
  buildIndexSharePath,
  buildSharePayload,
  ensureShareTicketMenu,
}
