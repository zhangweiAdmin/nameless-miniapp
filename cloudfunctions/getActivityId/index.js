const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ensuredCollections = {}

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

async function ensureCollections(names) {
  await Promise.all(names.map((name) => ensureCollection(name)))
}

async function getMessage(messageId) {
  try {
    const result = await db.collection('messages').doc(messageId).get()
    return result.data
  } catch (error) {
    return null
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const messageId = event.messageId

  if (!openid) return { code: 401, message: '登录态失效，请重新打开小程序' }
  if (!messageId) return { code: 4001, message: '缺少纸条 ID' }

  await ensureCollections(['messages', 'share_activities'])

  const message = await getMessage(messageId)
  if (!message || message.status !== 'normal') return { code: 404, message: '纸条不存在或已删除' }
  if (!message.openGid) return { code: 4003, message: '这张纸条还没有绑定群' }
  if (message.allowUnlock === false) return { code: 4004, message: '发送者没有开放查看' }

  const now = new Date()
  const activityId = crypto.randomBytes(12).toString('hex')
  await db.collection('share_activities').add({
    data: {
      _openid: openid,
      activityId,
      messageId,
      openGid: message.openGid,
      creatorOpenId: openid,
      expireTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createTime: now,
    },
  })

  return { code: 0, activityId }
}
