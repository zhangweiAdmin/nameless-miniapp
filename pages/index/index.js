const app = getApp()
const config = require('../../utils/config')
const { CATEGORIES, CATEGORY_MAP, REACTIONS } = require('../../utils/categories')
const { callFunction, showCloudError } = require('../../utils/cloud')
const { formatTime, normalizeCloudDate } = require('../../utils/format')
const { buildIndexSharePath, buildSharePayload, ensureShareTicketMenu } = require('../../utils/share')
const {
  MAX_NICKNAME_LENGTH,
  getNicknameError,
  normalizeNickname,
  readUserProfile,
  saveNicknameProfile,
} = require('../../utils/profile')

const ALL_CATEGORY = { key: '', label: '全部', icon: '🫧', tone: '#C7775A' }
const FEATURE_FLAGS = config.featureFlags || {}

function resultData(result) {
  return result.data || result
}

function rpxToPx(rpx, windowWidth) {
  return rpx * windowWidth / 750
}

function buildReactionList(reactions, reactedEmotions) {
  const reacted = reactedEmotions || []
  return REACTIONS.map((emotion) => ({
    emotion,
    count: reactions && reactions[emotion] ? reactions[emotion] : 0,
    active: reacted.indexOf(emotion) > -1,
  }))
}

function reactionCountFromList(reactionList) {
  if (!Array.isArray(reactionList)) return 0
  return reactionList.reduce((total, item) => total + (Number(item.count) || 0), 0)
}

function reactionCountFromMap(reactions) {
  const reactionMap = reactions || {}
  return Object.keys(reactionMap).reduce((total, emotion) => total + (Number(reactionMap[emotion]) || 0), 0)
}

function messageTimeValue(message) {
  const date = new Date(normalizeCloudDate(message.createTime))
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

function messageInteractionCount(message) {
  const reactionCount = Array.isArray(message.reactionList)
    ? reactionCountFromList(message.reactionList)
    : reactionCountFromMap(message.reactions)
  return (Number(message.likeCount) || 0) + reactionCount + (Number(message.unlockCount) || 0)
}

function findHighEnergyMessage(messages) {
  let winner = null
  let winnerCount = 0

  ;(messages || []).forEach((message) => {
    const count = messageInteractionCount(message)
    if (count <= 0) return
    if (!winner || count > winnerCount) {
      winner = message
      winnerCount = count
      return
    }
    if (count === winnerCount && messageTimeValue(message) > messageTimeValue(winner)) {
      winner = message
      winnerCount = count
    }
  })

  return {
    id: winner ? winner._id : '',
    count: winnerCount,
  }
}

function markHighEnergyMessages(messages, preferredId) {
  const fallback = findHighEnergyMessage(messages)
  const highEnergyId = preferredId || fallback.id
  return (messages || []).map((message) => {
    const count = messageInteractionCount(message)
    return Object.assign({}, message, {
      highEnergy: !!highEnergyId && message._id === highEnergyId && count > 0,
      highEnergyCount: count,
    })
  })
}

function decorateMessage(item) {
  const category = CATEGORY_MAP[item.category] || CATEGORY_MAP.praise
  const createTime = normalizeCloudDate(item.createTime)
  return Object.assign({}, item, {
    categoryIcon: category.icon,
    categoryLabel: category.label,
    categoryTone: category.tone,
    formattedTime: formatTime(createTime),
    liked: !!item.liked,
    unlocked: !!item.unlocked || !!item.isOwner,
    senderNickname: item.senderNickname || (item.isOwner ? '我自己' : ''),
    activityId: item.activityId || '',
    reactionList: buildReactionList(item.reactions || {}, item.reactedEmotions || []),
  })
}

function currentGroupInfo() {
  return app.globalData.groupInfo || {}
}

function currentOpenGid() {
  const groupInfo = currentGroupInfo()
  return groupInfo.openGid || ''
}

function getShareInfo(shareTicket) {
  return new Promise((resolve) => {
    if (!shareTicket || !wx.getShareInfo) {
      resolve({})
      return
    }

    wx.getShareInfo({
      shareTicket,
      success: resolve,
      fail: () => resolve({}),
    })
  })
}

function bindGroupByShareTicket(shareTicket) {
  return getShareInfo(shareTicket).then((shareInfo) => callFunction('bindGroup', {
    shareTicket,
    cloudId: shareInfo.cloudID || shareInfo.cloudId || '',
  }))
}

Page({
  data: {
    groupName: '群隐盒悄悄话',
    hasGroupContext: false,
    isGroupChatEntry: false,
    activeOpenGid: '',
    categories: [ALL_CATEGORY].concat(CATEGORIES),
    activeCategory: '',
    sortBy: 'hot',
    messages: [],
    pageToken: '',
    hasMore: true,
    loading: false,
    loadingMore: false,
    resolvingGroupContext: false,
    highEnergyMessageId: '',
    preparingShareId: '',
    sharePreparedMessageId: '',
    unlockingId: '',
    hasUserProfile: false,
    profileNickname: '',
    profileLoading: false,
    nicknamePromptVisible: false,
    nicknameDraft: '',
    nicknameDraftLength: 0,
    nicknamePromptError: '',
    nicknameSaving: false,
    nicknameMaxLength: MAX_NICKNAME_LENGTH,
    fabReady: false,
    fabX: 0,
    fabY: 0,
    enableDirectUnlock: !!FEATURE_FLAGS.enableDirectUnlock && !!config.adUnitIds.rewarded,
  },

  onLoad(options) {
    this.routeOpenGid = options && options.openGid ? options.openGid : ''
    this.groupEntryVersion = app.globalData.groupEntryVersion || 0
    this.captureGroupFromQuery(options)
    this.capturePendingUnlock(options)
    this.syncUserProfileState()
    this.resolveGroupContextAndRefresh()
  },

  onReady() {
    this.initFloatingFabPosition()
  },

  onShow() {
    const groupEntryVersion = app.globalData.groupEntryVersion || 0
    if (groupEntryVersion !== this.groupEntryVersion) {
      this.groupEntryVersion = groupEntryVersion
      this.resolveGroupContextAndRefresh().then(() => {
        this.consumePendingUnlock()
      })
      return
    }

    if (app.globalData.shareTicket && app.globalData.shareTicket !== this.boundShareTicket) {
      this.resolveGroupContextAndRefresh().then(() => {
        this.consumePendingUnlock()
      })
      return
    }

    const groupChanged = this.syncGroupState()
    this.syncUserProfileState()

    this.consumePendingUnlock()

    if (groupChanged) {
      this.setData({
        activeCategory: '',
        messages: [],
        pageToken: '',
        hasMore: false,
        loading: false,
        loadingMore: false,
      })
      this.refreshMessages()
      return
    }

    if (app.globalData.needRefreshMessages) {
      app.globalData.needRefreshMessages = false
      this.setData({ activeCategory: '' })
      this.refreshMessages()
    }
  },

  onPullDownRefresh() {
    this.refreshMessages().then(() => {
      wx.stopPullDownRefresh()
    }).catch(() => {
      wx.stopPullDownRefresh()
    })
  },

  onScrollToLower() {
    this.loadMessages(false)
  },

  syncUserProfileState() {
    const profile = readUserProfile()
    app.globalData.userProfile = profile
    this.setData({
      hasUserProfile: !!profile,
      profileNickname: profile ? profile.nickname : '',
    })
    return profile
  },

  authorizeProfile() {
    const existing = this.syncUserProfileState()
    if (existing) return Promise.resolve(existing)
    if (this.profilePromptPromise) return this.profilePromptPromise

    this.setData({
      nicknamePromptVisible: true,
      nicknameDraft: '',
      nicknameDraftLength: 0,
      nicknamePromptError: '',
      nicknameSaving: false,
    })

    this.profilePromptPromise = new Promise((resolve) => {
      this.profilePromptResolve = resolve
    })
    return this.profilePromptPromise
  },

  finishNicknamePrompt(profile) {
    const resolve = this.profilePromptResolve
    this.profilePromptResolve = null
    this.profilePromptPromise = null
    if (resolve) resolve(profile || null)
  },

  onNicknameDraftInput(event) {
    const nickname = normalizeNickname(event.detail.value || '')
    this.setData({
      nicknameDraft: nickname,
      nicknameDraftLength: Array.from(nickname).length,
      nicknamePromptError: '',
    })
  },

  cancelNicknamePrompt() {
    if (this.data.nicknameSaving) return
    this.setData({
      nicknamePromptVisible: false,
      nicknameDraft: '',
      nicknameDraftLength: 0,
      nicknamePromptError: '',
    })
    this.finishNicknamePrompt(null)
  },

  confirmNicknamePrompt() {
    if (this.data.nicknameSaving) return

    const nickname = normalizeNickname(this.data.nicknameDraft)
    const error = getNicknameError(nickname)
    if (error) {
      this.setData({ nicknamePromptError: error })
      return
    }

    this.setData({
      nicknameSaving: true,
      profileLoading: true,
      nicknamePromptError: '',
    })

    saveNicknameProfile(nickname).then((profile) => {
      app.globalData.userProfile = profile
      this.setData({
        hasUserProfile: true,
        profileNickname: profile.nickname,
        nicknamePromptVisible: false,
        nicknameDraft: '',
        nicknameDraftLength: 0,
      })
      wx.showToast({ title: '昵称已保存', icon: 'success' })
      this.finishNicknamePrompt(profile)
      return profile
    }).catch((error) => {
      this.setData({
        nicknamePromptError: error && error.message ? error.message : '昵称保存失败，请重试',
      })
    }).then(() => {
      this.setData({
        nicknameSaving: false,
        profileLoading: false,
      })
    })
  },

  noop() {},

  initFloatingFabPosition() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const windowWidth = windowInfo.windowWidth || 375
    const windowHeight = windowInfo.windowHeight || 667
    const safeBottom = windowInfo.safeArea ? Math.max(0, windowHeight - windowInfo.safeArea.bottom) : 0
    const fabWidth = rpxToPx(226, windowWidth)
    const fabHeight = rpxToPx(96, windowWidth)
    const marginX = rpxToPx(32, windowWidth)
    const marginBottom = rpxToPx(48, windowWidth) + safeBottom

    this.setData({
      fabReady: true,
      fabX: Math.max(marginX, windowWidth - fabWidth - marginX),
      fabY: Math.max(marginX, windowHeight - fabHeight - marginBottom),
    })
  },

  handleFabTap() {
    if (this.fabMoved) return
    this.goPublish()
  },

  onFabTouchStart() {
    this.fabMoved = false
    this.fabStartX = this.data.fabX
    this.fabStartY = this.data.fabY
  },

  onFabMove(event) {
    const detail = event.detail || {}
    if (typeof detail.x !== 'number' || typeof detail.y !== 'number') return

    const nextX = Math.round(detail.x)
    const nextY = Math.round(detail.y)
    this.pendingFabX = nextX
    this.pendingFabY = nextY

    if (Math.abs(nextX - (this.fabStartX || 0)) > 8 || Math.abs(nextY - (this.fabStartY || 0)) > 8) {
      this.fabMoved = true
    }

    clearTimeout(this.fabMoveTimer)
    this.fabMoveTimer = setTimeout(() => {
      this.setData({
        fabX: this.pendingFabX,
        fabY: this.pendingFabY,
      })
    }, 80)
  },

  onFabTouchEnd() {
    clearTimeout(this.fabMoveTimer)
    if (typeof this.pendingFabX === 'number' && typeof this.pendingFabY === 'number') {
      this.setData({
        fabX: this.pendingFabX,
        fabY: this.pendingFabY,
      })
    }

    setTimeout(() => {
      this.fabMoved = false
    }, 120)
  },

  consumePendingUnlock() {
    if (!app.globalData.pendingUnlock) return

    const pendingUnlock = app.globalData.pendingUnlock
    app.globalData.pendingUnlock = null
    this.askUnlockFromShare(pendingUnlock)
  },

  capturePendingUnlock(options) {
    if (!options || !options.messageId) return
    app.globalData.pendingUnlock = {
      messageId: options.messageId,
      activityId: options.activityId || '',
    }
  },

  captureGroupFromQuery(options) {
    if (!options || !options.openGid) return
    app.globalData.groupInfo = Object.assign({}, currentGroupInfo(), {
      customName: options.groupName ? decodeURIComponent(options.groupName) : currentGroupInfo().customName || '群隐盒悄悄话',
      openGid: options.openGid,
    })
  },

  resolveGroupContextAndRefresh() {
    const resolveToken = Date.now()
    this.groupResolveToken = resolveToken
    this.setData({
      resolvingGroupContext: true,
      activeCategory: '',
      messages: [],
      pageToken: '',
      hasMore: false,
      loading: false,
      loadingMore: false,
    })

    return this.syncGroupFromShare().then(() => {
      if (this.groupResolveToken !== resolveToken) return Promise.resolve()
      return this.refreshMessages()
    }).then(() => {
      if (this.groupResolveToken === resolveToken) {
        this.setData({ resolvingGroupContext: false })
      }
    }).catch((error) => {
      if (this.groupResolveToken === resolveToken) {
        this.setData({
          resolvingGroupContext: false,
          messages: [],
          hasMore: false,
          loading: false,
          loadingMore: false,
        })
      }
      showCloudError(error, '群隐盒悄悄话加载失败')
    })
  },

  syncGroupFromShare() {
    const shareTicket = app.globalData.shareTicket
    if (shareTicket) {
      return bindGroupByShareTicket(shareTicket).then((result) => {
        const data = resultData(result)
        const groupInfo = {
          customName: data.customName || '群隐盒悄悄话',
          isCreator: !!data.isCreator,
          modifyCount: data.modifyCount || 0,
          openGid: data.openGid || '',
        }
        app.globalData.groupInfo = groupInfo
        this.boundShareTicket = shareTicket
        this.syncGroupState()
        return groupInfo
      }).catch(() => {
        this.syncGroupState()
        return currentGroupInfo()
      })
    }

    const queryOpenGid = this.routeOpenGid || ''
    if (queryOpenGid) {
      return callFunction('bindGroup', { openGid: queryOpenGid }).then((result) => {
        const data = resultData(result)
        const groupInfo = {
          customName: data.customName || currentGroupInfo().customName || '群隐盒悄悄话',
          isCreator: !!data.isCreator,
          modifyCount: data.modifyCount || 0,
          openGid: data.openGid || queryOpenGid,
        }
        app.globalData.groupInfo = groupInfo
        this.syncGroupState()
        return groupInfo
      }).catch(() => {
        this.syncGroupState()
        return currentGroupInfo()
      })
    }

    if (!currentOpenGid()) {
      this.syncGroupState()
      return Promise.resolve(currentGroupInfo())
    }

    return callFunction('bindGroup', { openGid: currentOpenGid() }).then((result) => {
      const data = resultData(result)
      const groupInfo = {
        customName: data.customName || '群隐盒悄悄话',
        isCreator: !!data.isCreator,
        modifyCount: data.modifyCount || 0,
        openGid: data.openGid || currentOpenGid(),
      }
      app.globalData.groupInfo = groupInfo
      this.syncGroupState()
      return groupInfo
    }).catch(() => {
      this.syncGroupState()
      return currentGroupInfo()
    })
  },

  syncGroupState() {
    const groupInfo = currentGroupInfo()
    const openGid = groupInfo.openGid || ''
    const groupChanged = openGid !== this.data.activeOpenGid
    this.setData({
      groupName: groupInfo.customName || '群隐盒悄悄话',
      hasGroupContext: !!openGid,
      isGroupChatEntry: !!app.globalData.isGroupChatEntry,
      activeOpenGid: openGid,
    })
    return groupChanged
  },

  refreshMessages() {
    if (!this.data.hasGroupContext) {
      this.setData({
        messages: [],
        pageToken: '',
        hasMore: false,
        loading: false,
        loadingMore: false,
      })
      return Promise.resolve()
    }

    this.setData({
      pageToken: '',
      hasMore: true,
    })
    return this.loadMessages(true)
  },

  loadMessages(reset) {
    if (!this.data.hasGroupContext) {
      this.setData({
        messages: [],
        pageToken: '',
        hasMore: false,
        loading: false,
        loadingMore: false,
      })
      return Promise.resolve()
    }

    if (this.data.loading || (!reset && !this.data.hasMore)) {
      return Promise.resolve()
    }

    this.setData({
      loading: reset,
      loadingMore: !reset,
    })

    return callFunction('getMessages', {
      openGid: currentOpenGid(),
      category: this.data.activeCategory,
      sortBy: this.data.sortBy,
      pageSize: config.pageSize,
      pageToken: reset ? '' : this.data.pageToken,
    }).then((result) => {
      const data = resultData(result)
      const nextList = (data.list || []).map(decorateMessage)
      const combinedMessages = reset ? nextList : this.data.messages.concat(nextList)
      const highEnergyMessageId = data.highEnergyMessageId || ''
      this.setData({
        messages: markHighEnergyMessages(combinedMessages, highEnergyMessageId),
        pageToken: data.nextToken || '',
        hasMore: !!data.nextToken,
        highEnergyMessageId,
      })
    }).catch((error) => {
      if (reset) this.setData({ messages: [], hasMore: false })
      showCloudError(error, '悄悄话纸条暂时加载失败')
    }).then(() => {
      this.setData({ loading: false, loadingMore: false })
    })
  },

  selectCategory(event) {
    if (!this.data.hasGroupContext) {
      this.showGroupEntryTip()
      return
    }

    const key = event.currentTarget.dataset.key || ''
    if (key === this.data.activeCategory) return
    this.setData({ activeCategory: key })
    this.refreshMessages()
  },

  toggleSort(event) {
    if (!this.data.hasGroupContext) {
      this.showGroupEntryTip()
      return
    }

    const sortBy = event.currentTarget.dataset.sort
    if (!sortBy || sortBy === this.data.sortBy) return
    this.setData({ sortBy })
    this.refreshMessages()
  },

  goPublish() {
    if (!this.data.hasGroupContext) {
      this.showGroupEntryTip()
      return
    }

    const groupInfo = currentGroupInfo()
    const params = [
      `openGid=${encodeURIComponent(groupInfo.openGid || '')}`,
      `groupName=${encodeURIComponent(groupInfo.customName || '群隐盒悄悄话')}`,
    ]
    const publishUrl = `/pages/publish/publish?${params.join('&')}`

    if (!this.syncUserProfileState()) {
      this.authorizeProfile().then((profile) => {
        if (profile) wx.navigateTo({ url: publishUrl })
      })
      return
    }

    wx.navigateTo({ url: publishUrl })
  },

  showProfileEntryTip() {
    wx.showModal({
      title: '先确认昵称',
      content: '确认昵称后才能投递纸条。你仍然可以先浏览群里的纸条。',
      confirmText: '知道了',
      showCancel: false,
    })
  },

  showGroupEntryTip() {
    ensureShareTicketMenu()

    wx.showModal({
      title: '先放进群里',
      content: '请点击右上角“...”把群隐盒悄悄话分享到群，再从群里的卡片进入。每个群会拥有自己的纸条盒。',
      confirmText: '知道了',
      showCancel: false,
    })
  },

  updateMessage(messageId, updater) {
    const messages = this.data.messages.map((message) => {
      if (message._id !== messageId) return message
      const patch = typeof updater === 'function' ? updater(message) : updater
      return Object.assign({}, message, patch)
    })
    this.setData({ messages: markHighEnergyMessages(messages) })
  },

  getMessage(messageId) {
    return this.data.messages.find((message) => message._id === messageId)
  },

  handleLike(event) {
    const messageId = event.currentTarget.dataset.id
    const message = this.getMessage(messageId)
    if (!message) return

    const nextLiked = !message.liked
    const nextLikeCount = Math.max(0, (message.likeCount || 0) + (nextLiked ? 1 : -1))
    this.updateMessage(messageId, { liked: nextLiked, likeCount: nextLikeCount })

    callFunction('toggleLike', { messageId }).then((result) => {
      const data = resultData(result)
      this.updateMessage(messageId, {
        liked: data.action === 'add',
        likeCount: data.likeCount || 0,
      })
    }).catch((error) => {
      this.updateMessage(messageId, {
        liked: message.liked,
        likeCount: message.likeCount || 0,
      })
      showCloudError(error, '点赞失败，请稍后再试')
    })
  },

  handleReaction(event) {
    const messageId = event.currentTarget.dataset.id
    const emotion = event.currentTarget.dataset.emotion
    const message = this.getMessage(messageId)
    if (!message || !emotion) return

    const existing = message.reactionList.find((item) => item.emotion === emotion)
    if (existing && existing.active) {
      wx.showToast({ title: '这枚表情已经送过啦', icon: 'none' })
      return
    }

    callFunction('addReaction', { messageId, emotion }).then((result) => {
      const data = resultData(result)
      this.updateMessage(messageId, (current) => ({
        reactionList: current.reactionList.map((item) => {
          if (item.emotion !== emotion) return item
          return {
            emotion: item.emotion,
            count: data.count || item.count + 1,
            active: true,
          }
        }),
      }))
    }).catch((error) => {
      showCloudError(error, '回应失败，请稍后再试')
    })
  },

  prepareShareUnlock(event) {
    const messageId = event.currentTarget.dataset.id
    const message = this.getMessage(messageId)
    if (!message || this.data.preparingShareId) return

    if (message.activityId) {
      this.setPreparedShare(messageId, message.activityId)
      this.showShareUnlockTip()
      return
    }

    this.setData({ preparingShareId: messageId })
    callFunction('getActivityId', { messageId }).then((result) => {
      const data = resultData(result)
      this.updateMessage(messageId, { activityId: data.activityId })
      this.setPreparedShare(messageId, data.activityId)
      this.showShareUnlockTip()
    }).catch((error) => {
      showCloudError(error, '分享卡片生成失败')
    }).then(() => {
      this.setData({ preparingShareId: '' })
    })
  },

  showShareUnlockTip() {
    ensureShareTicketMenu()

    wx.showModal({
      title: '分享后解锁发送者',
      content: '请点击右上角“...”转发到群。触发转发后回到这里，会自动解锁这一张纸条的发送者昵称。',
      confirmText: '知道了',
      showCancel: false,
    })
  },

  setPreparedShare(messageId, activityId) {
    this.setData({ sharePreparedMessageId: messageId })

    if (!wx.updateShareMenu || !activityId) return
    try {
      wx.updateShareMenu({
        withShareTicket: true,
        isPrivateMessage: true,
        activityId,
      })
    } catch (error) {}
  },

  onShareAppMessage() {
    ensureShareTicketMenu()
    if (app.markShareReturn) app.markShareReturn()

    const messageId = this.data.sharePreparedMessageId
    if (messageId) {
      const message = this.getMessage(messageId)
      const activityId = message && message.activityId ? message.activityId : ''
      this.scheduleUnlockAfterShare(messageId, activityId)
      return buildSharePayload({
        path: buildIndexSharePath({ messageId, activityId }),
      })
    }

    return buildSharePayload()
  },

  scheduleUnlockAfterShare(messageId, activityId) {
    if (!messageId || !activityId || this.data.unlockingId === messageId) return

    const token = `${messageId}:${activityId}:${Date.now()}`
    this.pendingShareUnlockToken = token
    setTimeout(() => {
      if (this.pendingShareUnlockToken !== token) return
      const message = this.getMessage(messageId)
      if (!message || message.unlocked) return
      this.pendingShareUnlockToken = ''
      this.unlockMessage(messageId, activityId, 'share')
    }, 900)
  },

  askUnlockFromShare(pendingUnlock) {
    if (!pendingUnlock || !pendingUnlock.messageId) return

    wx.showModal({
      title: '发现一张悄悄话纸条',
      content: '要查看这张纸条的发送者昵称吗？不会显示头像。',
      confirmText: '解锁发送者',
      cancelText: '先看看',
      success: (res) => {
        if (res.confirm) {
          this.unlockMessage(pendingUnlock.messageId, pendingUnlock.activityId, 'share')
        }
      },
    })
  },

  unlockByAd(event) {
    const messageId = event.currentTarget.dataset.id
    if (!messageId || this.data.unlockingId) return

    this.runRewardedAd(() => {
      this.unlockMessage(messageId, '', 'ad')
    })
  },

  runRewardedAd(onReward) {
    const adUnitId = config.adUnitIds.rewarded
    if (!adUnitId || !wx.createRewardedVideoAd) {
      wx.showModal({
        title: '开发模式',
        content: '当前未配置继续入口，本次将模拟完成。',
        confirmText: '继续',
        success: (res) => {
          if (res.confirm) onReward()
        },
      })
      return
    }

    const videoAd = wx.createRewardedVideoAd({ adUnitId })
    videoAd.onClose((res) => {
      if (res && res.isEnded) {
        onReward()
      } else {
        wx.showToast({ title: '完成后才能解锁哦', icon: 'none' })
      }
    })
    videoAd.onError(() => {
      wx.showToast({ title: '暂时无法继续，请稍后重试', icon: 'none' })
    })
    videoAd.load().then(() => videoAd.show()).catch(() => {
      wx.showToast({ title: '暂时无法继续，请稍后重试', icon: 'none' })
    })
  },

  unlockMessage(messageId, activityId, unlockType) {
    this.setData({ unlockingId: messageId })
    wx.showLoading({ title: '解锁中' })

    callFunction('unlockMessage', {
      messageId,
      activityId: activityId || '',
      openGid: currentOpenGid(),
      shareTicket: unlockType === 'share' ? app.globalData.shareTicket || '' : '',
      unlockType,
    }).then((result) => {
      const data = resultData(result)
      const senderNickname = data.senderNickname || '暂未确认昵称'
      this.updateMessage(messageId, {
        unlocked: true,
        senderNickname,
      })
      if (this.data.sharePreparedMessageId === messageId) {
        this.setData({ sharePreparedMessageId: '' })
      }
      wx.showModal({
        title: '发送者昵称已解锁',
        content: data.senderNickname ? `这张纸条的发送者昵称是：${data.senderNickname}` : '发送者暂未确认昵称，暂时无法显示。',
        confirmText: '收好',
        showCancel: false,
      })
    }).catch((error) => {
      showCloudError(error, unlockType === 'share' ? '分享链接已失效，请重新分享' : '解锁失败')
    }).then(() => {
      wx.hideLoading()
      this.setData({ unlockingId: '' })
      this.refreshMessages()
    })
  },

  reportMessage(event) {
    const messageId = event.currentTarget.dataset.id
    if (!messageId) return

    wx.showActionSheet({
      itemList: ['不友善内容', '骚扰或刷屏', '泄露隐私', '其他问题'],
      success: (res) => {
        const reasons = ['unfriendly', 'spam', 'privacy', 'other']
        callFunction('reportMessage', {
          messageId,
          reason: reasons[res.tapIndex] || 'other',
        }).then(() => {
          wx.showToast({ title: '已收到反馈', icon: 'success' })
        }).catch((error) => {
          showCloudError(error, '举报失败，请稍后再试')
        })
      },
    })
  },
})
