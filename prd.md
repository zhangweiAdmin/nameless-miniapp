# 《群隐盒》可落地产品文档

> 本文档专为 AI 编程工具（Codex、Cursor）设计，提供完整上下文。每个功能包含：业务目标、用户路径、数据模型、关键接口、边界条件。

---

## 1. 产品概述

| 项目       | 内容                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| 产品名     | 群隐盒                                                                                                   |
| 一句话描述 | 群内匿名留言板——夸奖、安抚、感谢、恶搞、鼓励。发送者身份默认隐藏，点赞越多越靠前，分享到群才能解锁身份。 |
| 目标用户   | 大学生群、公司群、好友群                                                                                 |
| 核心差异化 | **点赞排序 + 分享解锁身份 + 群专属名称 + 模板/广告自定义文案**                                           |
| 技术栈     | 微信小程序 + 云开发（数据库、云函数、云存储）                                                            |
| 资质要求   | 企业主体或个体工商户（UGC社交类目）                                                                      |
| 开发方式   | 先个人主体开发测试，上线前迁移企业主体                                                                   |

---

## 2. 用户路径（核心流程）

```
用户打开小程序
    │
    ▼
留言列表页（默认按点赞量倒排 + 时间倒排）
    │
    ├── 浏览留言 → 点赞（❤️）
    │
    ├── 看到感兴趣留言 → 点击“分享解锁”→ 分享到群 → 群友点击 → 解锁发送者身份
    │
    ├── 点击发布按钮 → 选择分类 → 选模板（免费）或 看广告自定义 → 发布
    │
    └── 我的页面 → 查看自己的留言/解锁记录 → 群管理（修改群名称，首次免费，后续看广告）
```

---

### 2.1 UI推荐

推荐风格：柔和、治愈、有呼吸感

主色调：暖色系（粉橙、淡紫、奶油黄）或低饱和度的莫兰迪色，避免大红大紫

背景：纯色+轻微噪点/渐变，或者毛玻璃效果

卡片：大圆角（24px以上）、细边框或无边框、轻微投影

字体：无衬线字体（苹方、Inter、SF Pro），标题18px粗体，正文15px常规

动效：输入后小纸条“飘”出去的动画；翻转卡片查看留言等轻柔动效

氛围：可以加一点插画风的小元素（星星、信封、云朵）

## 3. 数据结构（云开发数据库）

### 3.1 messages（留言表）

| 字段          | 类型    | 说明                                 |
| ------------- | ------- | ------------------------------------ |
| `_id`         | string  | 自动生成                             |
| `_openid`     | string  | 发布者OpenID，不返回前端             |
| `content`     | string  | 留言内容                             |
| `category`    | string  | praise/comfort/thanks/fun/encourage  |
| `isTemplate`  | boolean | 是否模板发布                         |
| `likeCount`   | number  | 点赞总数，默认0                      |
| `reactions`   | object  | `{ "😊":0, "😂":0, "🙏":0, "🤗":0 }` |
| `unlockCount` | number  | 被解锁次数                           |
| `createTime`  | Date    | 创建时间                             |
| `status`      | string  | normal/flagged/deleted               |

### 3.2 like_records（点赞记录，去重用）

| 字段         | 说明       |
| ------------ | ---------- |
| `messageId`  | 留言ID     |
| `userId`     | 用户OpenID |
| `createTime` | 点赞时间   |

**唯一索引**：`messageId + userId`

### 3.3 reaction_records（表情回应记录，去重用）

| 字段         | 说明              |
| ------------ | ----------------- |
| `messageId`  | 留言ID            |
| `userId`     | 用户OpenID        |
| `emotion`    | 😊 / 😂 / 🙏 / 🤗 |
| `createTime` | 回应时间          |

**唯一索引**：`messageId + userId + emotion`

### 3.4 unlock_records（解锁记录）

| 字段               | 说明         |
| ------------------ | ------------ |
| `messageId`        | 留言ID       |
| `unlockedByOpenId` | 解锁者OpenID |
| `unlockType`       | share / ad   |
| `unlockTime`       | 时间         |
| `shareGroupId`     | 可选，群ID   |

### 3.5 group_bindings（群绑定表）

| 字段             | 说明                                  |
| ---------------- | ------------------------------------- |
| `openGid`        | 群唯一标识                            |
| `creatorOpenId`  | 第一个进入该群的用户（管理员）        |
| `customName`     | 群内显示名称，默认“群隐盒”，最长6汉字 |
| `modifyCount`    | 已修改次数                            |
| `createTime`     | 创建时间                              |
| `lastModifyTime` | 最后修改时间                          |

### 3.6 share_activities（私密分享临时记录）

| 字段            | 说明            |
| --------------- | --------------- |
| `activityId`    | 分享活动ID      |
| `messageId`     | 关联留言        |
| `creatorOpenId` | 创建者          |
| `expireTime`    | 过期时间（7天） |

---

## 4. 云函数清单（每个函数附带核心逻辑）

### 4.1 publishMessage - 发布留言

```
输入: { content, category, isTemplate }
处理:
  1. 频控检查（1分钟≤2条，1天≤10条）
  2. 调用 security.msgSecCheck 审核内容
  3. 通过后写入 messages 集合
输出: { code:0, messageId }
```

### 4.2 toggleLike - 点赞/取消点赞

```
输入: { messageId }
处理:
  1. 查询 like_records 是否存在记录
  2. 不存在 → 增加记录 + messages.likeCount +1
  3. 存在 → 删除记录 + messages.likeCount -1
输出: { action:'add'/'remove', likeCount }
```

### 4.3 addReaction - 添加表情回应

```
输入: { messageId, emotion }  // emotion 只能是 😊 😂 🙏 🤗
处理:
  1. 查询 reaction_records 防重
  2. 不重复 → 增加记录 + messages.reactions[emotion] +1
输出: { emotion, count }
```

### 4.4 getMessages - 获取留言列表

```
输入: { category, sortBy, pageSize, pageToken }
处理:
  1. sortBy='hot' → orderBy('likeCount','desc').orderBy('createTime','desc')
  2. sortBy='new' → orderBy('createTime','desc')
  3. 分页查询 messages 集合 (status='normal')
输出: { list, nextToken }
```

### 4.5 getActivityId - 创建私密分享

```
输入: { messageId }
处理:
  1. 生成唯一 activityId
  2. 写入 share_activities（过期时间7天）
输出: { activityId }
```

### 4.6 unlockMessage - 解锁留言身份

```
输入: { messageId, activityId, shareTicket, unlockType }
处理:
  1. 验证 shareTicket（如 unlockType='share'）
  2. 检查是否已解锁过该留言
  3. 写入 unlock_records
  4. messages.unlockCount +1
输出: { pseudonym: "访客" + 随机4位字母数字 }
```

### 4.7 bindGroup - 绑定群配置

```
输入: { shareTicket }  // 从群卡片进入时获取
处理:
  1. 解密获取 openGid
  2. 查询 group_bindings 是否存在
  3. 不存在 → 创建记录，当前用户为 creatorOpenId
输出: { customName, isCreator }
```

### 4.8 updateGroupName - 修改群名称

```
输入: { newName, needAd }  // needAd 表示本次是否需要看广告
处理:
  1. 校验当前用户是 creatorOpenId
  2. needAd=true → 检查广告观看记录
  3. 更新 customName, modifyCount+1, lastModifyTime
输出: { customName, modifyCount }
```

### 4.9 getMyMessages - 我的留言

```
输入: { }
处理: 查询当前用户发布的所有留言
输出: { list }
```

### 4.10 reportMessage - 举报留言

```
输入: { messageId, reason }
处理: 写入 reports 集合
输出: { code:0 }
```

---

## 5. 数据库索引（必须创建）

```javascript
// messages 集合
db.collection("messages").createIndex({ likeCount: -1, createTime: -1 })
db.collection("messages").createIndex({ category: 1, likeCount: -1 })
db.collection("messages").createIndex({ _openid: 1, createTime: -1 })

// like_records 集合（唯一索引）
db.collection("like_records").createIndex(
  { messageId: 1, userId: 1 },
  { unique: true },
)

// reaction_records 集合（唯一索引）
db.collection("reaction_records").createIndex(
  { messageId: 1, userId: 1, emotion: 1 },
  { unique: true },
)

// group_bindings 集合
db.collection("group_bindings").createIndex({ openGid: 1 })
```

---

## 6. 安全规则（database rules）

```json
{
  "messages": {
    ".read": true,
    ".write": "doc._openid == auth.openid"
  },
  "like_records": {
    ".read": true,
    ".write": "auth != null"
  },
  "reaction_records": {
    ".read": true,
    ".write": "auth != null"
  },
  "unlock_records": {
    ".read": "doc.unlockedByOpenId == auth.openid",
    ".write": "auth != null"
  },
  "group_bindings": {
    ".read": true,
    ".write": "doc.creatorOpenId == auth.openid"
  }
}
```

---

## 7. 前端页面结构

### 7.1 pages/index（留言列表页）

```
- 顶部导航栏：显示群自定义名称（从 group_bindings 读取）
- 分类Tab：5个分类 + 排序切换（最火/最新）
- 留言列表：scroll-view 无限滚动
- 每条留言卡片：
  - 内容 + 分类图标 + 时间
  - 点赞按钮（❤️ + 数字）
  - 4个表情回应按钮（😊 😂 🙏 🤗）
  - 底部：身份显示（未解锁显示🔒+分享按钮，已解锁显示假名）
- 右下角FAB：发布按钮
```

### 7.2 pages/publish（发布页）

```
- 分类选择（5个按钮，必选）
- 模板区域：展示当前分类的3-5条模板，点击即填充
- 自定义入口：按钮“写自己的话”
  - 点击后检查：今日是否已看广告？
  - 未看 → 拉起激励视频 → 看完后显示输入框
  - 已看 → 直接显示输入框
- 发布按钮：调用 publishMessage
```

### 7.3 pages/mine（我的页面）

```
- 我发布的：列表展示本人留言，可删除
- 我解锁过的：展示解锁过的留言及发送者假名
- 群管理（仅群管理员可见）：修改群名称（首次免费，后续需广告）
```

---

## 8. 广告集成

### 8.1 激励视频广告（3个场景）

| 场景       | 触发位置                    | 回调后动作           |
| ---------- | --------------------------- | -------------------- |
| 自定义文案 | 发布页点击“写自己的话”      | 显示输入框           |
| 解锁身份   | 未解锁卡片上“广告解锁”按钮  | 调用 unlockMessage   |
| 修改群名   | 群管理页（modifyCount>0时） | 调用 updateGroupName |

**代码模板**：

```javascript
const videoAd = wx.createRewardedVideoAd({ adUnitId: "xxxx" })
videoAd.onClose((res) => {
  if (res && res.isEnded) {
    // 发放权益
  }
})
```

### 8.2 开屏广告（小程序冷启动）

```javascript
// app.js onLaunch 中
const interstitialAd = wx.createInterstitialAd({ adUnitId: "xxxx" })
interstitialAd.show().catch(() => {})
```

---

## 9. 关键边界条件处理

| 场景               | 处理方式                                         |
| ------------------ | ------------------------------------------------ |
| 内容审核不通过     | 弹窗提示修改，保留用户输入，不写入数据库         |
| 激励视频加载失败   | 提示“广告加载失败，请稍后重试”，提供分享解锁备选 |
| 私密分享验证失败   | 提示“分享链接已失效，请重新分享”                 |
| 同一条留言重复点赞 | 第二次点击取消点赞，likeCount -1                 |
| 留言被删除         | 列表不再显示，已解锁记录保留历史快照             |
| 用户首次进入无群ID | 不绑定群，正常使用，显示默认名称“群隐盒”         |

---

## 10. 开发阶段规划

| 阶段   | 交付内容      | 云函数                       | 页面               |
| ------ | ------------- | ---------------------------- | ------------------ |
| Phase1 | 基础留言+列表 | publishMessage, getMessages  | index, publish     |
| Phase2 | 点赞+表情回应 | toggleLike, addReaction      | 更新 index         |
| Phase3 | 分享解锁身份  | getActivityId, unlockMessage | 更新 index         |
| Phase4 | 群专属名称    | bindGroup, updateGroupName   | mine               |
| Phase5 | 广告接入      | 无新增                       | 更新 publish, mine |
| Phase6 | 安全与运营    | reportMessage                | 更新 index         |

---

## 11. 给 Codex/AI 助手的额外提示

1. **云函数统一模板**：

```javascript
const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
exports.main = async (event, context) => {
  // 业务逻辑
  return { code: 0, data: {} }
}
```

2. **前端调用示例**：

```javascript
wx.cloud
  .callFunction({
    name: "publishMessage",
    data: { content, category, isTemplate },
  })
  .then((res) => {
    if (res.result.code === 0) wx.showToast({ title: "发布成功" })
  })
```

3. **分享解锁关键API**：

```javascript
// 1. 获取 activityId
const { result } = await wx.cloud.callFunction({ name: 'getActivityId', data: { messageId } })
// 2. 设置私密分享
wx.updateShareMenu({ isPrivateMessage: true, activityId: result.activityId })
// 3. 用户分享
onShareAppMessage() { return { title: '有人对你匿名留言了', path: '/pages/index' } }
```

---

## 12.项目使用微信小程序原生框架实现
