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

function ticketToOpenGid(shareTicket) {
  if (!shareTicket) return ''
  return `gid_${crypto.createHash('sha1').update(`openGid:${shareTicket}`).digest('hex').slice(0, 24)}`
}

function readOpenGidFromOpenData(openData) {
  const item = openData && openData.list && openData.list[0]
  if (!item) return ''

  let data = item.data || item
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (error) {
      return ''
    }
  }

  return data.openGId || data.openGid || ''
}

async function cloudIdToOpenGid(cloudId) {
  if (!cloudId || typeof cloud.getOpenData !== 'function') return ''

  try {
    const openData = await cloud.getOpenData({
      list: [cloudId],
    })
    return readOpenGidFromOpenData(openData)
  } catch (error) {
    console.warn('getOpenData failed:', error)
    return ''
  }
}

async function migrateLegacyMessages(openGid, legacyOpenGid) {
  if (!openGid || !legacyOpenGid || openGid === legacyOpenGid) return

  try {
    await db.collection('messages').where({
      openGid: legacyOpenGid,
    }).update({
      data: {
        openGid,
        legacyOpenGid,
      },
    })
  } catch (error) {
    console.warn('migrateLegacyMessages failed:', error)
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const cloudId = event.cloudID || event.cloudId || ''
  const realOpenGid = await cloudIdToOpenGid(cloudId)
  const legacyOpenGid = ticketToOpenGid(event.shareTicket || '')
  const openGid = event.openGid || realOpenGid || legacyOpenGid

  if (!openid) return { code: 401, message: '登录态失效，请重新打开小程序' }

  if (!openGid) {
    return { code: 0, customName: '群隐盒悄悄话', isCreator: false, modifyCount: 0, openGid: '' }
  }

  await ensureCollections(['group_bindings', 'messages'])
  if (realOpenGid) {
    await migrateLegacyMessages(realOpenGid, legacyOpenGid)
  }

  const collection = db.collection('group_bindings')
  const existing = await collection.where({ openGid }).limit(1).get()

  if (existing.data.length) {
    const group = existing.data[0]
    return {
      code: 0,
      customName: group.customName || '群隐盒悄悄话',
      isCreator: group.creatorOpenId === openid,
      modifyCount: group.modifyCount || 0,
      openGid,
    }
  }

  const now = new Date()
  await collection.add({
    data: {
      _openid: openid,
      openGid,
      creatorOpenId: openid,
      customName: '群隐盒悄悄话',
      modifyCount: 0,
      createTime: now,
      lastModifyTime: now,
    },
  })

  return { code: 0, customName: '群隐盒悄悄话', isCreator: true, modifyCount: 0, openGid }
}
