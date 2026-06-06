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
const _ = db.command

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

  await ensureCollections(['messages', 'like_records'])

  const message = await getMessage(messageId)
  if (!message || message.status !== 'normal') return { code: 404, message: '纸条不存在或已删除' }

  const recordResult = await db.collection('like_records').where({
    messageId,
    userId: openid,
  }).limit(1).get()

  if (!recordResult.data.length) {
    await db.collection('like_records').add({
      data: {
        _openid: openid,
        messageId,
        userId: openid,
        createTime: new Date(),
      },
    })
    await db.collection('messages').doc(messageId).update({
      data: { likeCount: _.inc(1) },
    })
    const updated = await getMessage(messageId)
    return { code: 0, action: 'add', likeCount: updated.likeCount || 0 }
  }

  await db.collection('like_records').doc(recordResult.data[0]._id).remove()
  await db.collection('messages').doc(messageId).update({
    data: { likeCount: _.inc(-1) },
  })

  const updated = await getMessage(messageId)
  const likeCount = Math.max(updated.likeCount || 0, 0)
  if ((updated.likeCount || 0) < 0) {
    await db.collection('messages').doc(messageId).update({ data: { likeCount: 0 } })
  }

  return { code: 0, action: 'remove', likeCount }
}
