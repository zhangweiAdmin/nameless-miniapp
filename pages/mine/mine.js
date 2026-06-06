const app = getApp()
const config = require('../../utils/config')
const { CATEGORY_MAP } = require('../../utils/categories')
const { callFunction, showCloudError } = require('../../utils/cloud')
const { formatTime, normalizeCloudDate } = require('../../utils/format')
const { readUserProfile } = require('../../utils/profile')

function resultData(result) {
  return result.data || result
}

function decorateMessage(item) {
  const category = CATEGORY_MAP[item.category] || CATEGORY_MAP.praise
  return Object.assign({}, item, {
    categoryIcon: category.icon,
    categoryLabel: category.label,
    formattedTime: formatTime(normalizeCloudDate(item.createTime)),
  })
}

function decorateUnlock(item) {
  const category = CATEGORY_MAP[item.category] || CATEGORY_MAP.praise
  return Object.assign({}, item, {
    categoryIcon: category.icon,
    categoryLabel: category.label,
    formattedTime: formatTime(normalizeCloudDate(item.unlockTime)),
  })
}

function displayLength(text) {
  return Array.from(text || '').length
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
    activePanel: 'messages',
    loading: true,
    myMessages: [],
    unlockRecords: [],
    groupInfo: {
      customName: '群隐盒',
      isCreator: false,
      modifyCount: 0,
      openGid: '',
    },
    groupNameInput: '群隐盒',
    savingGroup: false,
  },

  onShow() {
    if (!this.ensureUserProfile()) return
    this.setData({ loading: true })
    this.syncGroupInfo().then(() => {
      this.loadMine()
    }).catch(() => {
      this.loadMine()
    })
  },

  ensureUserProfile() {
    const profile = readUserProfile()
    app.globalData.userProfile = profile
    if (profile) return true

    wx.showModal({
      title: '先确认昵称',
      content: '进入群隐盒前需要先在首页点击“匿名投递”确认昵称。',
      confirmText: '去首页',
      showCancel: false,
      success: () => {
        wx.switchTab({ url: '/pages/index/index' })
      },
    })
    return false
  },

  switchPanel(event) {
    const panel = event.currentTarget.dataset.panel
    if (!panel || panel === this.data.activePanel) return
    this.setData({ activePanel: panel })
  },

  applyGroupInfo(rawGroupInfo) {
    const data = rawGroupInfo || {}
    const groupInfo = {
      customName: data.customName || '群隐盒',
      isCreator: !!data.isCreator,
      modifyCount: data.modifyCount || 0,
      openGid: data.openGid || '',
    }
    app.globalData.groupInfo = groupInfo
    this.setData({
      groupInfo,
      groupNameInput: groupInfo.customName,
    })
    return groupInfo
  },

  syncGroupInfo() {
    const shareTicket = app.globalData.shareTicket
    if (!shareTicket) {
      const groupInfo = app.globalData.groupInfo || this.data.groupInfo
      if (groupInfo.openGid) {
        return callFunction('bindGroup', { openGid: groupInfo.openGid }).then((result) => {
          return this.applyGroupInfo(resultData(result))
        }).catch(() => {
          this.setData({
            groupInfo,
            groupNameInput: groupInfo.customName || '群隐盒',
          })
          return groupInfo
        })
      }

      this.setData({
        groupInfo,
        groupNameInput: groupInfo.customName || '群隐盒',
      })
      return Promise.resolve(groupInfo)
    }

    return bindGroupByShareTicket(shareTicket).then((result) => {
      return this.applyGroupInfo(resultData(result))
    }).catch(() => {
      const groupInfo = app.globalData.groupInfo || this.data.groupInfo
      this.setData({ groupInfo })
      return groupInfo
    })
  },

  loadMine() {
    this.setData({ loading: true })

    callFunction('getMyMessages', {
      openGid: this.data.groupInfo.openGid || '',
    }).then((result) => {
      const data = resultData(result)
      const groupInfo = data.groupInfo || this.data.groupInfo
      this.setData({
        myMessages: (data.messages || data.list || []).map(decorateMessage),
        unlockRecords: (data.unlocks || []).map(decorateUnlock),
        groupInfo,
        groupNameInput: groupInfo.customName || '群隐盒',
      })
      app.globalData.groupInfo = groupInfo
    }).catch((error) => {
      showCloudError(error, '我的页面加载失败')
    }).then(() => {
      this.setData({ loading: false })
    })
  },

  onGroupNameInput(event) {
    this.setData({ groupNameInput: event.detail.value || '' })
  },

  submitGroupName() {
    if (this.data.savingGroup) return

    const newName = (this.data.groupNameInput || '').trim()
    if (!newName) {
      wx.showToast({ title: '群名不能为空', icon: 'none' })
      return
    }

    if (displayLength(newName) > 6) {
      wx.showToast({ title: '群名最多 6 个字', icon: 'none' })
      return
    }

    if (newName === this.data.groupInfo.customName) {
      wx.showToast({ title: '群名没有变化', icon: 'none' })
      return
    }

    const needAd = (this.data.groupInfo.modifyCount || 0) > 0
    const update = () => this.updateGroupName(newName, needAd)

    if (needAd) {
      this.runRewardedAd(update)
    } else {
      update()
    }
  },

  updateGroupName(newName, needAd) {
    this.setData({ savingGroup: true })
    wx.showLoading({ title: '保存中' })

    callFunction('updateGroupName', {
      newName,
      needAd,
      openGid: this.data.groupInfo.openGid || '',
      shareTicket: app.globalData.shareTicket || '',
    }).then((result) => {
      const data = resultData(result)
      const groupInfo = {
        customName: data.customName || newName,
        isCreator: true,
        modifyCount: data.modifyCount || this.data.groupInfo.modifyCount + 1,
        openGid: data.openGid || this.data.groupInfo.openGid || '',
      }
      app.globalData.groupInfo = groupInfo
      this.setData({
        groupInfo,
        groupNameInput: groupInfo.customName,
      })
      wx.showToast({ title: '群名已更新', icon: 'success' })
    }).catch((error) => {
      showCloudError(error, '群名更新失败')
    }).then(() => {
      wx.hideLoading()
      this.setData({ savingGroup: false })
    })
  },

  deleteMyMessage(event) {
    const messageId = event.currentTarget.dataset.id
    if (!messageId) return

    wx.showModal({
      title: '删除这张匿名纸条？',
      content: '删除后列表不再展示，但已产生的发送者昵称解锁记录会保留。',
      confirmText: '删除',
      confirmColor: '#C86555',
      success: (res) => {
        if (!res.confirm) return
        callFunction('deleteMessage', { messageId }).then(() => {
          this.setData({
            myMessages: this.data.myMessages.filter((item) => item._id !== messageId),
          })
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch((error) => {
          showCloudError(error, '删除失败，请稍后再试')
        })
      },
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
        wx.showToast({ title: '完成后才能继续修改哦', icon: 'none' })
      }
    })
    videoAd.onError(() => {
      wx.showToast({ title: '暂时无法继续，请稍后重试', icon: 'none' })
    })
    videoAd.load().then(() => videoAd.show()).catch(() => {
      wx.showToast({ title: '暂时无法继续，请稍后重试', icon: 'none' })
    })
  },
})
