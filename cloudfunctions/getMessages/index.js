const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const VALID_CATEGORIES = ['praise', 'comfort', 'thanks', 'fun', 'encourage']
const REACTIONS = ['😊', '😂', '🙏', '🤗']
const DEFAULT_NICKNAMES = ['微信用户']
const ensuredCollections = {}

function clampPageSize(value) {
  const pageSize = Number(value) || 10
  return Math.min(Math.max(pageSize, 1), 30)
}

function normalizeReactions(reactions) {
  const result = {}
  REACTIONS.forEach((emotion) => {
    result[emotion] = reactions && reactions[emotion] ? reactions[emotion] : 0
  })
  return result
}

function interactionCount(message) {
  const reactions = message.reactions || {}
  const reactionCount = Object.keys(reactions).reduce((total, emotion) => (
    total + (Number(reactions[emotion]) || 0)
  ), 0)
  return (Number(message.likeCount) || 0) + reactionCount + (Number(message.unlockCount) || 0)
}

function findHighEnergyMessage(messages) {
  let winner = null
  let winnerCount = 0

  ;(messages || []).forEach((message) => {
    const count = interactionCount(message)
    if (count <= 0) return
    if (!winner || count > winnerCount) {
      winner = message
      winnerCount = count
      return
    }
    if (count === winnerCount && dateValue(message.createTime) > dateValue(winner.createTime)) {
      winner = message
      winnerCount = count
    }
  })

  return {
    id: winner ? winner._id : '',
    count: winnerCount,
  }
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function cleanNickname(value) {
  const nickname = normalizeNickname(value)
  return nickname && DEFAULT_NICKNAMES.indexOf(nickname) === -1 ? nickname : ''
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

function dateValue(value) {
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

function sortMessages(messages, sortBy) {
  return messages.sort((a, b) => {
    if (sortBy === 'hot') {
      const interactionGap = interactionCount(b) - interactionCount(a)
      if (interactionGap) return interactionGap
      const likeGap = (b.likeCount || 0) - (a.likeCount || 0)
      if (likeGap) return likeGap
    }
    return dateValue(b.createTime) - dateValue(a.createTime)
  })
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const openGid = String(event.openGid || '').trim()
  const category = String(event.category || '')
  const sortBy = event.sortBy === 'new' ? 'new' : 'hot'
  const pageSize = clampPageSize(event.pageSize)
  const offset = Math.max(Number(event.pageToken) || 0, 0)

  if (!openGid) {
    return { code: 0, list: [], nextToken: '', noGroup: true }
  }

  const filter = { status: 'normal', openGid }
  if (category && VALID_CATEGORIES.indexOf(category) > -1) {
    filter.category = category
  }

  await Promise.all([
    ensureCollection('messages'),
    ensureCollection('like_records'),
    ensureCollection('reaction_records'),
    ensureCollection('unlock_records'),
    ensureCollection('user_profiles'),
  ])

  const fetchLimit = 100
  const messageResult = await db.collection('messages').where(filter).limit(fetchLimit).get()
  const allMessages = messageResult.data || []
  const highEnergyMessage = findHighEnergyMessage(allMessages)
  const sortedMessages = sortMessages(allMessages, sortBy)
  const messages = sortedMessages.slice(offset, offset + pageSize)
  const ids = messages.map((item) => item._id)

  let likedIds = []
  let reactionMap = {}
  let unlockMap = {}

  if (openid && ids.length) {
    const [likeResult, reactionResult, unlockResult] = await Promise.all([
      db.collection('like_records').where({ userId: openid, messageId: _.in(ids) }).get(),
      db.collection('reaction_records').where({ userId: openid, messageId: _.in(ids) }).get(),
      db.collection('unlock_records').where({ unlockedByOpenId: openid, messageId: _.in(ids) }).get(),
    ])

    likedIds = (likeResult.data || []).map((item) => item.messageId)
    ;(reactionResult.data || []).forEach((item) => {
      if (!reactionMap[item.messageId]) reactionMap[item.messageId] = []
      reactionMap[item.messageId].push(item.emotion)
    })
    ;(unlockResult.data || []).forEach((item) => {
      unlockMap[item.messageId] = item
    })
  }

  const profileNicknameMap = {}
  if (openid && messages.length) {
    const profileOpenIds = []
    messages.forEach((item) => {
      const isOwner = item._openid === openid
      const unlockRecord = unlockMap[item._id]
      const needsProfileNickname = (isOwner || unlockRecord) &&
        item._openid &&
        (!cleanNickname(item.senderNickname) || (unlockRecord && !cleanNickname(unlockRecord.senderNickname)))
      if (needsProfileNickname && profileOpenIds.indexOf(item._openid) === -1) {
        profileOpenIds.push(item._openid)
      }
    })

    if (profileOpenIds.length) {
      const profileResult = await db.collection('user_profiles').where({
        _openid: _.in(profileOpenIds),
        status: 'normal',
      }).get()
      ;(profileResult.data || []).forEach((profile) => {
        const nickname = cleanNickname(profile.nickname)
        if (nickname) profileNicknameMap[profile._openid] = nickname
      })
    }
  }

  const list = messages.map((item) => {
    const isOwner = item._openid === openid
    const unlockRecord = unlockMap[item._id]
    const messageNickname = cleanNickname(item.senderNickname)
    const unlockNickname = unlockRecord ? cleanNickname(unlockRecord.senderNickname) : ''
    const profileNickname = profileNicknameMap[item._openid] || ''
    const senderNickname = isOwner
      ? messageNickname || profileNickname || '我自己'
      : unlockRecord
        ? unlockNickname || messageNickname || profileNickname || ''
        : ''
    return {
      _id: item._id,
      content: item.content,
      targetName: item.targetName || '',
      category: item.category,
      isTemplate: !!item.isTemplate,
      likeCount: item.likeCount || 0,
      reactions: normalizeReactions(item.reactions),
      unlockCount: item.unlockCount || 0,
      createTime: item.createTime,
      liked: likedIds.indexOf(item._id) > -1,
      reactedEmotions: reactionMap[item._id] || [],
      unlocked: isOwner || !!unlockRecord,
      senderNickname,
      isOwner,
    }
  })

  return {
    code: 0,
    list,
    nextToken: sortedMessages.length > offset + pageSize ? String(offset + messages.length) : '',
    highEnergyMessageId: highEnergyMessage.id,
    highEnergyInteractionCount: highEnergyMessage.count,
  }
}
