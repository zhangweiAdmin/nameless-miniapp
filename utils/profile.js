const { callFunction } = require('./cloud')

const PROFILE_STORAGE_KEY = 'user_profile'
const MAX_NICKNAME_LENGTH = 20
const DEFAULT_NICKNAMES = ['微信用户']

function charLength(text) {
  return Array.from(text || '').length
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function isDefaultNickname(value) {
  return DEFAULT_NICKNAMES.indexOf(normalizeNickname(value)) > -1
}

function getNicknameError(value) {
  const nickname = normalizeNickname(value)
  if (!nickname) return '请先填写你的微信昵称'
  if (isDefaultNickname(nickname)) return '当前还是微信默认昵称，请选择或填写你的真实昵称'
  if (charLength(nickname) > MAX_NICKNAME_LENGTH) return `昵称最多${MAX_NICKNAME_LENGTH}个字`
  return ''
}

function readUserProfile() {
  const record = wx.getStorageSync(PROFILE_STORAGE_KEY) || {}
  const nickname = normalizeNickname(record.nickname || record.nickName)
  if (getNicknameError(nickname)) return null
  return {
    nickname,
    updateTime: record.updateTime || '',
  }
}

function saveUserProfile(profile) {
  const nickname = normalizeNickname(profile && (profile.nickname || profile.nickName))
  if (getNicknameError(nickname)) return null

  const record = {
    nickname,
    updateTime: Date.now(),
  }
  wx.setStorageSync(PROFILE_STORAGE_KEY, record)
  return record
}

function saveNicknameProfile(value) {
  const nickname = normalizeNickname(value)
  const error = getNicknameError(nickname)
  if (error) return Promise.reject(new Error(error))

  return callFunction('saveUserProfile', { nickname }).then((result) => {
    return saveUserProfile({
      nickname: result.nickname || nickname,
    })
  })
}

module.exports = {
  MAX_NICKNAME_LENGTH,
  normalizeNickname,
  getNicknameError,
  readUserProfile,
  saveUserProfile,
  saveNicknameProfile,
}
