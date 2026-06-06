function normalizeCloudError(error, functionName) {
  const rawMessage = String(
    (error && (error.errMsg || error.message || error.code || error.errCode)) || ''
  )
  const lowerMessage = rawMessage.toLowerCase()
  const normalized = new Error(rawMessage || '云函数调用失败')
  normalized.code = error && (error.code || error.errCode)
  normalized.raw = error
  normalized.functionName = functionName

  if (lowerMessage.indexOf('function') > -1 && lowerMessage.indexOf('not') > -1) {
    normalized.message = `云函数 ${functionName} 还没有部署`
    return normalized
  }

  if (rawMessage.indexOf('云函数不存在') > -1 || rawMessage.indexOf('函数不存在') > -1) {
    normalized.message = `云函数 ${functionName} 还没有部署`
    return normalized
  }

  if (lowerMessage.indexOf('env') > -1 && lowerMessage.indexOf('not') > -1) {
    normalized.message = '云环境不可用，请确认 AppID 与云环境 ID 是否匹配'
    return normalized
  }

  if (rawMessage.indexOf('环境') > -1 && rawMessage.indexOf('不存在') > -1) {
    normalized.message = '云环境不可用，请确认 AppID 与云环境 ID 是否匹配'
    return normalized
  }

  if (
    lowerMessage.indexOf('collection') > -1 &&
    (lowerMessage.indexOf('not exist') > -1 || lowerMessage.indexOf('not found') > -1)
  ) {
    normalized.message = '数据库集合还没创建，请先完成云数据库初始化'
    return normalized
  }

  if (rawMessage.indexOf('集合') > -1 && rawMessage.indexOf('不存在') > -1) {
    normalized.message = '数据库集合还没创建，请先完成云数据库初始化'
    return normalized
  }

  if (lowerMessage.indexOf('index') > -1 || rawMessage.indexOf('索引') > -1) {
    normalized.message = '数据库索引未配置，请按文档创建索引后重试'
    return normalized
  }

  return normalized
}

const CLOUD_FUNCTION_TIMEOUT_MS = 15000

function withTimeout(promise, timeoutMs, onTimeout) {
  let timer = null
  const timeoutPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(onTimeout())
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).then((result) => {
    if (timer) clearTimeout(timer)
    return result
  }).catch((error) => {
    if (timer) clearTimeout(timer)
    throw error
  })
}

function callFunction(name, data) {
  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('当前基础库不支持云开发'))
  }

  const request = wx.cloud.callFunction({
    name,
    data: data || {},
  })

  return withTimeout(request, CLOUD_FUNCTION_TIMEOUT_MS, () => {
    const error = new Error(`云函数 ${name} 响应超时，请确认云函数已部署`)
    error.code = 'timeout'
    error.functionName = name
    return error
  }).then((res) => {
    const result = res.result || {}
    if (result.code && result.code !== 0) {
      const error = new Error(result.message || '云函数调用失败')
      error.code = result.code
      error.result = result
      error.functionName = name
      throw error
    }
    return result
  }).catch((error) => {
    const normalized = normalizeCloudError(error, name)
    console.error('[cloud.callFunction]', name, data || {}, error)
    throw normalized
  })
}

function showCloudError(error, fallback) {
  const title = error && error.message ? error.message : fallback || '操作失败，请稍后重试'
  wx.showToast({
    title,
    icon: 'none',
    duration: 2200,
  })
}

module.exports = {
  callFunction,
  showCloudError,
}
