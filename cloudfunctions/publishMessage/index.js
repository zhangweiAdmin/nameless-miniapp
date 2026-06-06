const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const VALID_CATEGORIES = ['praise', 'comfort', 'thanks', 'fun', 'encourage']
const DEFAULT_REACTIONS = { '😊': 0, '😂': 0, '🙏': 0, '🤗': 0 }
const MAX_MESSAGE_LENGTH = 120
const MAX_TARGET_NAME_LENGTH = 8
const CUSTOM_DAILY_QUOTA = 3
const CHINA_TIMEZONE_OFFSET = 8 * 60 * 60 * 1000
const CONTENT_SAFE_TIMEOUT_MS = 4000
const DEFAULT_NICKNAMES = ['微信用户']
const ensuredCollections = {}

function charLength(text) {
  return Array.from(text || '').length
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function isDefaultNickname(value) {
  return DEFAULT_NICKNAMES.indexOf(normalizeNickname(value)) > -1
}

function isUsableNickname(value) {
  const nickname = normalizeNickname(value)
  return !!nickname && !isDefaultNickname(nickname)
}

function chinaDayStart(date) {
  const chinaTime = new Date(date.getTime() + CHINA_TIMEZONE_OFFSET)
  chinaTime.setUTCHours(0, 0, 0, 0)
  return new Date(chinaTime.getTime() - CHINA_TIMEZONE_OFFSET)
}

function isCollectionAlreadyExists(error) {
  const message = String(error && (error.message || error.errMsg || ''))
  return /already.*exist|collection.*exists|集合已存在|已存在/i.test(message)
}

async function ensureCollection(name) {
  if (ensuredCollections[name] || typeof db.createCollection !== 'function') return
  try {
    await db.createCollection(name)
  } catch (error) {
    if (!isCollectionAlreadyExists(error)) throw error
  }
  ensuredCollections[name] = true
}

async function isContentSafe(content, openid) {
  try {
    const check = cloud.openapi.security.msgSecCheck({
      content,
      version: 2,
      scene: 2,
      openid,
    })
    const timeout = new Promise((resolve) => {
      setTimeout(() => {
        console.warn('msgSecCheck timeout, skipped')
        resolve({ result: { suggest: 'pass' } })
      }, CONTENT_SAFE_TIMEOUT_MS)
    })
    const res = await Promise.race([check, timeout])
    const result = res.result || res
    return result.suggest !== 'risky'
  } catch (error) {
    const message = String(error.message || '')
    if (error.errCode === 87014 || message.indexOf('risky') > -1) {
      return false
    }

    // Local/dev cloud environments may not have content security permissions yet.
    console.warn('msgSecCheck skipped:', error)
    return true
  }
}

async function getSavedUserProfile(openid) {
  const result = await db.collection('user_profiles').where({
    _openid: openid,
  }).limit(1).get()
  const profile = (result.data || [])[0] || null
  if (profile && profile.status === 'normal') return profile
  return null
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const content = String(event.content || '').trim()
  const targetName = String(event.targetName || '').trim().replace(/\s+/g, ' ')
  const category = String(event.category || '')
  const openGid = String(event.openGid || '').trim()
  const isTemplate = !!event.isTemplate
  const customAccessGranted = !!event.customAccessGranted || !!event.customRewarded

  if (!openid) return { code: 401, message: '请先登录' }
  if (!openGid) return { code: 4005, message: '请先从群里的卡片进入群隐盒' }
  if (VALID_CATEGORIES.indexOf(category) === -1) return { code: 4001, message: '请选择正确分类' }
  if (!content) return { code: 4002, message: '纸条内容不能为空' }
  if (charLength(content) > MAX_MESSAGE_LENGTH) return { code: 4003, message: `纸条最多${MAX_MESSAGE_LENGTH}字` }
  if (charLength(targetName) > MAX_TARGET_NAME_LENGTH) return { code: 4004, message: `写给谁最多${MAX_TARGET_NAME_LENGTH}个字` }

  await Promise.all([
    ensureCollection('messages'),
    ensureCollection('user_profiles'),
  ])

  const profile = await getSavedUserProfile(openid)
  const senderNickname = normalizeNickname(profile && profile.nickname)
  if (!isUsableNickname(senderNickname)) return { code: 4006, message: '请先确认真实昵称后再发布' }

  const now = new Date()
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000)
  const todayStart = chinaDayStart(now)

  const [minuteCount, customTodayCount] = await Promise.all([
    db.collection('messages').where({ _openid: openid, createTime: _.gte(oneMinuteAgo) }).count(),
    db.collection('messages').where({ _openid: openid, isTemplate: false, createTime: _.gte(todayStart) }).count(),
  ])

  if (minuteCount.total >= 2) return { code: 4291, message: '匿名投递太快啦，稍等一分钟再试' }
  if (!isTemplate && customTodayCount.total >= CUSTOM_DAILY_QUOTA && !customAccessGranted) {
    return {
      code: 4301,
      message: '分享小程序后可以继续自定义',
      requireShare: true,
      customQuotaLeft: 0,
    }
  }

  const safe = await isContentSafe(`${senderNickname} ${targetName} ${content}`, openid)
  if (!safe) return { code: 87014, message: '内容可能不合规，请修改后再匿名投递' }

  const result = await db.collection('messages').add({
    data: {
      _openid: openid,
      content,
      targetName,
      senderNickname,
      category,
      openGid,
      isTemplate,
      likeCount: 0,
      reactions: DEFAULT_REACTIONS,
      unlockCount: 0,
      createTime: now,
      status: 'normal',
    },
  })

  return {
    code: 0,
    messageId: result._id,
    customQuotaLeft: isTemplate
      ? Math.max(0, CUSTOM_DAILY_QUOTA - customTodayCount.total)
      : Math.max(0, CUSTOM_DAILY_QUOTA - customTodayCount.total - 1),
  }
}
