const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const MAX_NICKNAME_LENGTH = 20
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

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const nickname = normalizeNickname(event.nickname || event.nickName)

  if (!openid) return { code: 401, message: '登录态失效，请重新打开小程序' }
  if (!nickname) return { code: 4001, message: '请先填写你的微信昵称' }
  if (charLength(nickname) > MAX_NICKNAME_LENGTH) return { code: 4002, message: `昵称最多${MAX_NICKNAME_LENGTH}个字` }
  if (isDefaultNickname(nickname)) return { code: 4003, message: '当前还是微信默认昵称，请选择或填写你的真实昵称' }

  await ensureCollection('user_profiles')

  const now = new Date()
  const existing = await db.collection('user_profiles').where({ _openid: openid }).limit(1).get()
  if (existing.data && existing.data.length) {
    await db.collection('user_profiles').doc(existing.data[0]._id).update({
      data: {
        nickname,
        updateTime: now,
        status: 'normal',
      },
    })
  } else {
    await db.collection('user_profiles').add({
      data: {
        _openid: openid,
        nickname,
        createTime: now,
        updateTime: now,
        status: 'normal',
      },
    })
  }

  return {
    code: 0,
    nickname,
  }
}
