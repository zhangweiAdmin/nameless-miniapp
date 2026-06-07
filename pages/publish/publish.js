const app = getApp()
const config = require('../../utils/config')
const { CATEGORIES, TEMPLATES } = require('../../utils/categories')
const { callFunction, showCloudError } = require('../../utils/cloud')
const { normalizeCloudDate } = require('../../utils/format')
const { readUserProfile } = require('../../utils/profile')
const { buildSharePayload, ensureShareTicketMenu } = require('../../utils/share')

function charLength(text) {
  return Array.from(text || '').length
}

const TARGET_NAME_MAX_LENGTH = 8
const TEMPLATE_BATCH_SIZE = 5
const TARGET_PROMPTS = {
  praise: {
    title: '想夸谁？',
    placeholder: '比如：小群主 / 那个很稳的人',
  },
  comfort: {
    title: '想安抚谁？',
    placeholder: '比如：最近很累的人',
  },
  thanks: {
    title: '想感谢谁？',
    placeholder: '比如：今天帮忙的人',
  },
  fun: {
    title: '想调侃谁？',
    placeholder: '比如：表情包大户',
  },
  encourage: {
    title: '想鼓励谁？',
    placeholder: '比如：正在打怪的人',
  },
}

function todayKey() {
  return dateKey(new Date())
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function readCustomQuota(limit) {
  const record = wx.getStorageSync('custom_quota_record') || {}
  if (record.date !== todayKey()) return 0
  return Math.min(limit, Number(record.used) || 0)
}

function customQuotaLeft(used, limit) {
  return Math.max(0, limit - used)
}

function readCustomShareUnlocked() {
  const record = wx.getStorageSync('custom_share_unlock_record') || {}
  return record.date === todayKey() && !!record.unlocked
}

function markCustomShareUnlocked() {
  wx.setStorageSync('custom_share_unlock_record', {
    date: todayKey(),
    unlocked: true,
  })
}

function normalizeTargetName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function currentGroupInfo() {
  return app.globalData.groupInfo || {}
}

function currentOpenGid() {
  const groupInfo = currentGroupInfo()
  return groupInfo.openGid || ''
}

function shuffledList(list) {
  const result = list.slice()
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const temp = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temp
  }
  return result
}

function getTemplateBatch(categoryKey, previousTemplates) {
  const list = TEMPLATES[categoryKey] || []
  if (!list.length) return []

  const previousMap = {}
  ;(previousTemplates || []).forEach((item) => {
    previousMap[item] = true
  })

  const freshPool = list.filter((item) => !previousMap[item])
  const pool = freshPool.length >= TEMPLATE_BATCH_SIZE ? freshPool : list
  return shuffledList(pool).slice(0, TEMPLATE_BATCH_SIZE)
}

Page({
  data: {
    categories: CATEGORIES,
    activeCategory: '',
    templates: [],
    templateBatchIndex: 0,
    selectedTemplateIndex: -1,
    content: '',
    showCustomInput: false,
    isTemplate: true,
    submitting: false,
    maxLength: config.maxMessageLength,
    targetName: '',
    targetNameMaxLength: TARGET_NAME_MAX_LENGTH,
    hasUserProfile: false,
    profileNickname: '',
    targetPromptVisible: false,
    targetPromptTitle: '',
    targetPromptPlaceholder: '',
    pendingTargetCategory: '',
    targetDraft: '',
    targetDraftLength: 0,
    contentLength: 0,
    customQuotaLimit: config.customDailyQuota || 3,
    customQuotaLeft: config.customDailyQuota || 3,
    customShareUnlocked: false,
    awaitingCustomShareUnlock: false,
    customSharePromptVisible: false,
    checkingCustomEntry: false,
    hasGroupContext: false,
    groupName: '群隐盒悄悄话',
  },

  onLoad(options) {
    if (!this.ensureUserProfileOrLeave()) return
    this.captureGroupFromQuery(options)
    this.syncGroupContext()
    this.refreshCustomQuota()
  },

  onShow() {
    this.ensureUserProfileOrLeave()
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

  ensureUserProfileOrLeave() {
    if (this.syncUserProfileState()) return true
    if (this.profileRedirecting) return false

    this.profileRedirecting = true
    wx.showModal({
      title: '先确认昵称',
      content: '确认昵称后才能投递纸条。请回到首页点击“投递纸条”，确认昵称后再进入发布页。',
      confirmText: '去首页',
      showCancel: false,
      success: () => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({ url: '/pages/index/index' })
        }
      },
    })
    return false
  },

  syncGroupContext() {
    const groupInfo = currentGroupInfo()
    const hasGroupContext = !!groupInfo.openGid
    this.setData({
      hasGroupContext,
      groupName: groupInfo.customName || '群隐盒悄悄话',
    })
  },

  captureGroupFromQuery(options) {
    if (!options || !options.openGid) return
    app.globalData.groupInfo = Object.assign({}, currentGroupInfo(), {
      customName: options.groupName ? decodeURIComponent(options.groupName) : currentGroupInfo().customName || '群隐盒悄悄话',
      openGid: options.openGid,
    })
  },

  refreshCustomQuota() {
    const limit = this.data.customQuotaLimit
    const used = readCustomQuota(limit)
    this.setData({
      customQuotaLeft: customQuotaLeft(used, limit),
      customShareUnlocked: readCustomShareUnlocked(),
    })
  },

  markCustomPublished(serverQuotaLeft) {
    const limit = this.data.customQuotaLimit
    const used = typeof serverQuotaLeft === 'number'
      ? limit - Math.min(limit, Math.max(0, serverQuotaLeft))
      : readCustomQuota(limit) + 1
    wx.setStorageSync('custom_quota_record', {
      date: todayKey(),
      used,
    })
    this.setData({ customQuotaLeft: customQuotaLeft(used, limit) })
  },

  syncCustomQuotaFromServer() {
    return callFunction('getMyMessages').then((result) => {
      const today = todayKey()
      const used = (result.messages || []).filter((item) => {
        if (item.isTemplate) return false
        return dateKey(normalizeCloudDate(item.createTime)) === today
      }).length
      const limit = this.data.customQuotaLimit
      wx.setStorageSync('custom_quota_record', {
        date: today,
        used,
      })
      this.setData({
        customQuotaLeft: customQuotaLeft(used, limit),
        customShareUnlocked: readCustomShareUnlocked(),
      })
    })
  },

  clearPendingCustomShareAction() {
    this.pendingCustomShareAction = null
    if (this.data.awaitingCustomShareUnlock || this.data.customSharePromptVisible) {
      this.setData({
        awaitingCustomShareUnlock: false,
        customSharePromptVisible: false,
      })
    }
  },

  selectCategory(event) {
    const key = event.currentTarget.dataset.key
    if (!key) return

    this.clearPendingCustomShareAction()
    this.askTargetName(key)
  },

  resetCategorySelection() {
    this.setData({
      activeCategory: '',
      templates: [],
      templateBatchIndex: 0,
      selectedTemplateIndex: -1,
      content: '',
      showCustomInput: false,
      isTemplate: true,
      contentLength: 0,
      targetName: '',
    })
  },

  askTargetName(categoryKey) {
    const prompt = TARGET_PROMPTS[categoryKey] || {
      title: '想写给谁？',
      placeholder: '比如：群里的某个人',
    }

    this.setData({
      activeCategory: '',
      templates: [],
      templateBatchIndex: 0,
      selectedTemplateIndex: -1,
      content: '',
      showCustomInput: false,
      isTemplate: true,
      contentLength: 0,
      targetName: '',
      targetPromptVisible: true,
      targetPromptTitle: prompt.title,
      targetPromptPlaceholder: prompt.placeholder,
      pendingTargetCategory: categoryKey,
      targetDraft: '',
      targetDraftLength: 0,
    })
  },

  editTargetName() {
    this.askTargetName(this.data.activeCategory)
  },

  onTargetDraftInput(event) {
    let value = event.detail.value || ''
    if (charLength(value) > TARGET_NAME_MAX_LENGTH) {
      value = Array.from(value).slice(0, TARGET_NAME_MAX_LENGTH).join('')
    }

    this.setData({
      targetDraft: value,
      targetDraftLength: charLength(value),
    })
  },

  confirmTargetName() {
    const targetName = normalizeTargetName(this.data.targetDraft)
    if (!targetName) {
      wx.showToast({ title: '先写给谁呀', icon: 'none' })
      return
    }

    const categoryKey = this.data.pendingTargetCategory
    if (!categoryKey) {
      this.cancelTargetName()
      return
    }

    this.setData({
      activeCategory: categoryKey,
      templates: getTemplateBatch(categoryKey),
      templateBatchIndex: 0,
      selectedTemplateIndex: -1,
      content: '',
      showCustomInput: false,
      isTemplate: true,
      contentLength: 0,
      targetName,
      targetPromptVisible: false,
      pendingTargetCategory: '',
      targetDraft: '',
      targetDraftLength: 0,
    })
  },

  cancelTargetName() {
    this.resetCategorySelection()
    this.setData({
      targetPromptVisible: false,
      pendingTargetCategory: '',
      targetDraft: '',
      targetDraftLength: 0,
    })
  },

  noop() {},

  selectTemplate(event) {
    if (!this.data.activeCategory || !this.data.targetName) {
      wx.showToast({ title: '先选语气并填写写给谁', icon: 'none' })
      return
    }

    const index = Number(event.currentTarget.dataset.index)
    const content = this.data.templates[index] || ''
    this.clearPendingCustomShareAction()
    this.setData({
      selectedTemplateIndex: index,
      content,
      showCustomInput: false,
      isTemplate: true,
      contentLength: charLength(content),
    })
  },

  changeTemplateBatch() {
    if (!this.data.activeCategory || !this.data.targetName) {
      wx.showToast({ title: '先选语气并填写写给谁', icon: 'none' })
      return
    }

    const list = TEMPLATES[this.data.activeCategory] || []
    if (list.length <= TEMPLATE_BATCH_SIZE) return

    this.clearPendingCustomShareAction()
    this.setData({
      templates: getTemplateBatch(this.data.activeCategory, this.data.templates),
      templateBatchIndex: this.data.templateBatchIndex + 1,
      selectedTemplateIndex: -1,
      content: '',
      showCustomInput: false,
      isTemplate: true,
      contentLength: 0,
    })
  },

  startCustomWriting() {
    if (!this.data.activeCategory || !this.data.targetName) {
      wx.showToast({ title: '先选语气并填写写给谁', icon: 'none' })
      return
    }

    if (this.data.showCustomInput) {
      this.showCustomInput()
      return
    }

    if (this.data.checkingCustomEntry) return

    this.setData({ checkingCustomEntry: true })
    this.syncCustomQuotaFromServer().catch(() => {
      // If the quota sync fails, fall back to the local record and keep the user moving.
    }).then(() => {
      this.setData({ checkingCustomEntry: false })
      this.openCustomWritingAfterQuotaCheck()
    })
  },

  openCustomWritingAfterQuotaCheck() {
    if (this.data.customQuotaLeft <= 0 && !this.data.customShareUnlocked) {
      this.requireCustomShareAccess(() => {
        this.showCustomInput()
      })
      return
    }

    this.showCustomInput()
  },

  showCustomInput() {
    this.setData({
      showCustomInput: true,
      selectedTemplateIndex: -1,
      content: this.data.isTemplate ? '' : this.data.content,
      isTemplate: false,
      contentLength: this.data.isTemplate ? 0 : charLength(this.data.content),
    })
  },

  onContentInput(event) {
    const value = event.detail.value || ''
    this.clearPendingCustomShareAction()
    this.setData({
      content: value,
      contentLength: charLength(value),
      isTemplate: false,
    })
  },

  submitMessage() {
    if (this.data.submitting) return

    const content = (this.data.content || '').trim()

    if (!this.syncUserProfileState()) {
      wx.showModal({
        title: '先确认昵称',
        content: '请先回到首页点击“投递纸条”，确认昵称后再发布。',
        confirmText: '去首页',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/index/index' })
        },
      })
      return
    }

    if (!this.data.activeCategory || !this.data.targetName) {
      wx.showToast({ title: '先选语气并填写写给谁', icon: 'none' })
      return
    }

    if (!content) {
      wx.showToast({ title: '先写点什么吧', icon: 'none' })
      return
    }

    if (charLength(content) > this.data.maxLength) {
      wx.showToast({ title: `最多${this.data.maxLength}字`, icon: 'none' })
      return
    }

    if (!this.data.isTemplate && this.data.customQuotaLeft <= 0 && !this.data.customShareUnlocked) {
      this.requireCustomShareAccess(() => {
        this.publishMessage(content, true)
      })
      return
    }

    this.publishMessage(content, this.data.customShareUnlocked)
  },

  publishMessage(content, customAccessGranted) {
    this.setData({ submitting: true })
    wx.showLoading({ title: '投递中' })

    callFunction('publishMessage', {
      openGid: currentOpenGid(),
      category: this.data.activeCategory,
      content,
      targetName: this.data.targetName,
      isTemplate: this.data.isTemplate,
      customAccessGranted: !!customAccessGranted,
    }).then((result) => {
      if (!result.messageId) {
        throw new Error('发布接口没有返回消息 ID，请重新部署 publishMessage 云函数')
      }

      wx.hideLoading()
      if (!this.data.isTemplate) {
        this.markCustomPublished(result.customQuotaLeft)
      } else if (typeof result.customQuotaLeft === 'number') {
        this.setData({ customQuotaLeft: result.customQuotaLeft })
      }

      app.globalData.needRefreshMessages = true
      wx.showToast({ title: '已放进盒子', icon: 'success' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({ url: '/pages/index/index' })
        }
      }, 650)
    }).catch((error) => {
      if (error.code === 4301 && !customAccessGranted) {
        wx.hideLoading()
        this.setData({ submitting: false, customQuotaLeft: 0 })
        this.requireCustomShareAccess(() => {
          this.publishMessage(content, true)
        })
        return
      }
      wx.hideLoading()
      wx.showModal({
        title: '投递失败',
        content: error && error.code === 4005
          ? '当前群信息还没准备好，请返回首页重新进入后再试。'
          : (error && error.message ? error.message : '投递失败，请稍后再试'),
        confirmText: '知道了',
        showCancel: false,
      })
    }).then(() => {
      this.setData({ submitting: false })
    })
  },

  requireCustomShareAccess(afterShare) {
    if (this.data.customShareUnlocked) {
      afterShare()
      return
    }

    this.pendingCustomShareAction = afterShare
    this.setData({
      awaitingCustomShareUnlock: true,
      customSharePromptVisible: true,
    })
    ensureShareTicketMenu()
  },

  closeCustomSharePrompt() {
    if (this.data.submitting) return
    this.clearPendingCustomShareAction()
  },

  grantCustomShareAccess() {
    markCustomShareUnlocked()
    const pendingAction = this.pendingCustomShareAction
    this.pendingCustomShareAction = null
    this.setData({
      customShareUnlocked: true,
      awaitingCustomShareUnlock: false,
      customSharePromptVisible: false,
    })

    wx.showToast({ title: '今天可以继续写啦', icon: 'none' })
    if (typeof pendingAction === 'function') {
      setTimeout(() => {
        pendingAction()
      }, 360)
    }
  },

  onShareAppMessage() {
    ensureShareTicketMenu()
    if (app.markShareReturn) app.markShareReturn()

    if (this.data.awaitingCustomShareUnlock) {
      this.grantCustomShareAccess()
      return buildSharePayload()
    }

    return buildSharePayload()
  },
})
