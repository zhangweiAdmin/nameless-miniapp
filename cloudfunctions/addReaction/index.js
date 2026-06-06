const cloud = require('wx-server-sdk')

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

const VALID_EMOTIONS = ['😊', '😂', '🙏', '🤗']
const DEFAULT_REACTIONS = { '😊': 0, '😂': 0, '🙏': 0, '🤗': 0 }

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
  const emotion = event.emotion

  if (!openid) return { code: 401, message: '登录态失效，请重新打开小程序' }
  if (!messageId) return { code: 4001, message: '缺少纸条 ID' }
  if (VALID_EMOTIONS.indexOf(emotion) === -1) return { code: 4002, message: '表情不支持' }

  await ensureCollections(['messages', 'reaction_records'])

  const message = await getMessage(messageId)
  if (!message || message.status !== 'normal') return { code: 404, message: '纸条不存在或已删除' }

  const existing = await db.collection('reaction_records').where({
    messageId,
    userId: openid,
    emotion,
  }).limit(1).get()

  const reactions = Object.assign({}, DEFAULT_REACTIONS, message.reactions || {})
  if (existing.data.length) {
    return { code: 0, emotion, count: reactions[emotion] || 0, duplicated: true }
  }

  await db.collection('reaction_records').add({
    data: {
      _openid: openid,
      messageId,
      userId: openid,
      emotion,
      createTime: new Date(),
    },
  })

  reactions[emotion] = (reactions[emotion] || 0) + 1
  await db.collection('messages').doc(messageId).update({
    data: { reactions },
  })

  return { code: 0, emotion, count: reactions[emotion] }
}
