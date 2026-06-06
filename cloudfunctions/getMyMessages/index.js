const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const ensuredCollections = {}
const DEFAULT_NICKNAMES = ['微信用户']

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

function dateValue(value) {
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function cleanNickname(value) {
  const nickname = normalizeNickname(value)
  return nickname && DEFAULT_NICKNAMES.indexOf(nickname) === -1 ? nickname : ''
}

function publicMessage(item) {
  return {
    _id: item._id,
    content: item.content,
    targetName: item.targetName || '',
    senderNickname: cleanNickname(item.senderNickname),
    category: item.category,
    openGid: item.openGid || '',
    isTemplate: !!item.isTemplate,
    likeCount: item.likeCount || 0,
    reactions: item.reactions || {},
    unlockCount: item.unlockCount || 0,
    createTime: item.createTime,
    status: item.status,
  }
}

function publicUnlock(item, senderNicknameMap) {
  const senderOpenId = item.senderOpenId || ''
  return {
    _id: item._id,
    messageId: item.messageId,
    unlockType: item.unlockType,
    unlockTime: item.unlockTime,
    senderNickname: cleanNickname(item.senderNickname) || senderNicknameMap[senderOpenId] || '',
    contentSnapshot: item.contentSnapshot || '',
    targetName: item.targetName || '',
    category: item.category || 'praise',
    openGid: item.openGid || '',
  }
}

async function buildSenderNicknameMap(unlocks) {
  const senderOpenIds = []
  unlocks.forEach((item) => {
    const senderOpenId = item.senderOpenId || ''
    if (senderOpenId && !cleanNickname(item.senderNickname) && senderOpenIds.indexOf(senderOpenId) === -1) {
      senderOpenIds.push(senderOpenId)
    }
  })
  if (!senderOpenIds.length) return {}

  await ensureCollection('user_profiles')
  const result = await db.collection('user_profiles').where({
    _openid: _.in(senderOpenIds),
    status: 'normal',
  }).get()

  const map = {}
  ;(result.data || []).forEach((profile) => {
    const nickname = cleanNickname(profile.nickname)
    if (nickname) map[profile._openid] = nickname
  })
  return map
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const openGid = String(event.openGid || '').trim()

  if (!openid) return { code: 401, message: '登录态失效，请重新打开小程序' }

  await Promise.all([
    ensureCollection('messages'),
    ensureCollection('unlock_records'),
    ensureCollection('group_bindings'),
  ])

  const [messageResult, unlockResult, groupResult, currentGroupResult] = await Promise.all([
    db.collection('messages').where({ _openid: openid }).limit(100).get(),
    db.collection('unlock_records').where({ unlockedByOpenId: openid }).limit(100).get(),
    db.collection('group_bindings').where({ creatorOpenId: openid }).limit(20).get(),
    openGid
      ? db.collection('group_bindings').where({ openGid }).limit(1).get()
      : Promise.resolve({ data: [] }),
  ])

  const messages = (messageResult.data || [])
    .filter((item) => item.status !== 'deleted')
    .sort((a, b) => dateValue(b.createTime) - dateValue(a.createTime))
  const unlocks = (unlockResult.data || [])
    .sort((a, b) => dateValue(b.unlockTime) - dateValue(a.unlockTime))
  const senderNicknameMap = await buildSenderNicknameMap(unlocks)
  const currentGroup = (currentGroupResult.data || [])[0]
  const latestCreatorGroup = (groupResult.data || [])
    .sort((a, b) => dateValue(b.lastModifyTime) - dateValue(a.lastModifyTime))[0]
  const group = openGid ? currentGroup : latestCreatorGroup
  const groupInfo = group ? {
    customName: group.customName || '群隐盒',
    isCreator: group.creatorOpenId === openid,
    modifyCount: group.modifyCount || 0,
    openGid: group.openGid || '',
  } : {
    customName: '群隐盒',
    isCreator: false,
    modifyCount: 0,
    openGid,
  }

  return {
    code: 0,
    messages: messages.map(publicMessage),
    unlocks: unlocks.map((item) => publicUnlock(item, senderNicknameMap)),
    groupInfo,
  }
}
