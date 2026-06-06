function pad(number) {
  return number < 10 ? `0${number}` : `${number}`
}

function formatTime(input) {
  if (!input) return ''

  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff >= 0 && diff < minute) return '刚刚'
  if (diff >= minute && diff < hour) return `${Math.floor(diff / minute)}分钟前`
  if (diff >= hour && diff < day) return `${Math.floor(diff / hour)}小时前`

  const sameYear = now.getFullYear() === date.getFullYear()
  const monthDay = `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
  if (sameYear) return `${monthDay} ${pad(date.getHours())}:${pad(date.getMinutes())}`

  return `${date.getFullYear()}.${monthDay}`
}

function normalizeCloudDate(value) {
  if (!value) return ''
  if (value.$date) return value.$date
  return value
}

module.exports = {
  formatTime,
  normalizeCloudDate,
}
