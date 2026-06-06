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

function textLength(text) {
  return Array.from(text || '').length
}

function dateValue(value) {
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

function ticketToOpenGid(shareTicket) {
  if (!shareTicket) return ''
  return `gid_${crypto.createHash('sha1').update(`openGid:${shareTicket}`).digest('hex').slice(0, 24)}`
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const newName = (event.newName || '').trim()
  const needAd = !!event.needAd
  const openGid = event.openGid || ticketToOpenGid(event.shareTicket || '')

  if (!openid) return { code: 401, message: '登录态失效，请重新打开小程序' }
  if (!newName) return { code: 4001, message: '群名称不能为空' }
  if (textLength(newName) > 6) return { code: 4002, message: '群名称最多 6 个字' }

  await ensureCollections(['group_bindings'])

  let groupResult
  if (openGid) {
    groupResult = await db.collection('group_bindings').where({ openGid }).limit(1).get()
  } else {
    const creatorGroups = await db.collection('group_bindings')
      .where({ creatorOpenId: openid })
      .limit(20)
      .get()
    const latestGroup = (creatorGroups.data || [])
      .sort((a, b) => dateValue(b.lastModifyTime) - dateValue(a.lastModifyTime))[0]
    groupResult = { data: latestGroup ? [latestGroup] : [] }
  }

  if (!groupResult.data.length) return { code: 404, message: '暂时没有可管理的群' }

  const group = groupResult.data[0]
  if (group.creatorOpenId !== openid) return { code: 403, message: '只有群管理员可以修改名称' }
  if ((group.modifyCount || 0) > 0 && !needAd) return { code: 4003, message: '请完成继续流程后再修改群名' }

  const modifyCount = (group.modifyCount || 0) + 1
  await db.collection('group_bindings').doc(group._id).update({
    data: {
      customName: newName,
      modifyCount,
      lastModifyTime: new Date(),
    },
  })

  return { code: 0, customName: newName, modifyCount, openGid: group.openGid || openGid }
}
