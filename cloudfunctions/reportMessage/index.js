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

const VALID_REASONS = ['unfriendly', 'spam', 'privacy', 'other']

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const messageId = event.messageId
  const reason = VALID_REASONS.indexOf(event.reason) > -1 ? event.reason : 'other'

  if (!openid) return { code: 401, message: '登录态失效，请重新打开小程序' }
  if (!messageId) return { code: 4001, message: '缺少纸条 ID' }

  await ensureCollections(['reports'])

  await db.collection('reports').add({
    data: {
      _openid: openid,
      reporterOpenId: openid,
      messageId,
      reason,
      status: 'pending',
      createTime: new Date(),
    },
  })

  return { code: 0 }
}
