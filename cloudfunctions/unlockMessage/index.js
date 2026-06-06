const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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

async function ensureCollections(names) {
  await Promise.all(names.map((name) => ensureCollection(name)))
}
const _ = db.command

function groupHash(shareTicket) {
  if (!shareTicket) return ''
  return crypto.createHash('sha1').update(`group:${shareTicket}`).digest('hex').slice(0, 18)
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function isDefaultNickname(value) {
  return DEFAULT_NICKNAMES.indexOf(normalizeNickname(value)) > -1
}

function cleanNickname(value) {
  const nickname = normalizeNickname(value)
  return nickname && !isDefaultNickname(nickname) ? nickname : ''
}

async function getMessage(messageId) {
  try {
    const result = await db.collection('messages').doc(messageId).get()
    return result.data
  } catch (error) {
    return null
  }
}

async function getPublisherNickname(message, messageId) {
  const messageNickname = cleanNickname(message.senderNickname)
  if (messageNickname) return messageNickname
  if (!message._openid) return ''

  const profileResult = await db.collection('user_profiles').where({
    _openid: message._openid,
  }).limit(1).get()
  const profile = (profileResult.data || [])[0]
  const profileNickname = cleanNickname(profile && profile.nickname)
  if (!profile || profile.status !== 'normal' || !profileNickname) return ''

  try {
    await db.collection('messages').doc(messageId).update({
      data: { senderNickname: profileNickname },
    })
  } catch (error) {
    console.warn('backfill senderNickname failed:', error)
  }

  return profileNickname
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const messageId = event.messageId
  const activityId = event.activityId || ''
  const shareTicket = event.shareTicket || ''
  const openGid = String(event.openGid || '').trim()
  const unlockType = event.unlockType === 'ad' ? 'ad' : 'share'

  if (!openid) return { code: 401, message: '登录态失效，请重新打开小程序' }
  if (!messageId) return { code: 4001, message: '缺少纸条 ID' }

  await ensureCollections(['messages', 'share_activities', 'unlock_records', 'user_profiles'])

  const message = await getMessage(messageId)
  if (!message || message.status !== 'normal') return { code: 404, message: '纸条不存在或已删除' }
  const senderNickname = await getPublisherNickname(message, messageId)
  if (message._openid === openid) return { code: 0, senderNickname: senderNickname || '我自己', isOwner: true }

  if (unlockType === 'share') {
    if (!activityId) return { code: 4002, message: '分享链接已失效，请重新分享' }
    if (!shareTicket) return { code: 4003, message: '需要从群分享卡片进入后解锁' }
    if (!openGid || openGid !== (message.openGid || '')) {
      return { code: 4004, message: '这张纸条不属于当前群，请从原群卡片进入' }
    }

    const activity = await db.collection('share_activities').where({
      activityId,
      messageId,
      openGid: message.openGid || '',
      expireTime: _.gte(new Date()),
    }).limit(1).get()

    if (!activity.data.length) return { code: 4002, message: '分享链接已失效，请重新分享' }
  }

  const existing = await db.collection('unlock_records').where({
    messageId,
    unlockedByOpenId: openid,
  }).limit(1).get()

  if (existing.data.length) {
    const existingRecord = existing.data[0]
    const existingNickname = cleanNickname(existingRecord.senderNickname)
    const unlockPatch = {}
    if ((!existingNickname || existingNickname !== senderNickname) && senderNickname) {
      unlockPatch.senderNickname = senderNickname
    }
    if (!existingRecord.senderOpenId && message._openid) {
      unlockPatch.senderOpenId = message._openid
    }

    if (Object.keys(unlockPatch).length) {
      try {
        await db.collection('unlock_records').doc(existingRecord._id).update({
          data: unlockPatch,
        })
      } catch (error) {
        console.warn('backfill unlock senderNickname failed:', error)
      }
    }

    return {
      code: 0,
      senderNickname: senderNickname || existingNickname,
      alreadyUnlocked: true,
    }
  }

  await db.collection('unlock_records').add({
    data: {
      _openid: openid,
      messageId,
      unlockedByOpenId: openid,
      unlockType,
      unlockTime: new Date(),
      shareGroupId: groupHash(shareTicket),
      openGid: message.openGid || '',
      activityId,
      senderOpenId: message._openid || '',
      senderNickname,
      contentSnapshot: message.content,
      targetName: message.targetName || '',
      category: message.category,
    },
  })

  await db.collection('messages').doc(messageId).update({
    data: { unlockCount: _.inc(1) },
  })

  return { code: 0, senderNickname }
}
