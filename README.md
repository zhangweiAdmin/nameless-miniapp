# 群隐盒悄悄话微信小程序

基于 `prd.md` 实现的微信小程序原生框架 + 云开发项目。

## 已实现能力

- 悄悄话纸条列表：分类筛选、最火/最新排序、分页加载；未确认昵称也可浏览。
- 纸条卡片：点赞、表情回应、分享解锁、发送者昵称解锁、举报。
- 投递纸条页：进入发布前必须确认昵称；分类选择、模板文案、自定义文案每日 3 次直接使用，之后分享小程序继续使用，发布时自动使用已确认昵称。
- 我的页：我投递过的纸条、我解锁过的发送者昵称、群管理修改名称。
- 云函数：投递纸条、列表、点赞、表情、分享活动、解锁、群绑定、群名更新、我的数据、举报、软删除。

## 目录结构

```text
app.js / app.json / app.wxss      小程序入口与全局样式
pages/index                       悄悄话纸条列表页
pages/publish                     投递纸条页
pages/mine                        我的页面
utils                             配置、分类模板、云函数封装、时间格式化
cloudfunctions                    云开发函数
docs                              数据库规则、索引和上线注意事项
```

## 导入与配置

1. 使用微信开发者工具导入当前目录。
2. 确认 `project.config.json` 中的 `appid` 已配置为正式 AppID。
3. 确认 `utils/config.js` 中的 `cloudEnvId` 已配置为正式云环境 ID。
4. 如需真实激励能力，在 `utils/config.js` 中填写 `adUnitIds.rewarded` 和 `adUnitIds.interstitial`。
5. 广告条件满足后，将 `utils/config.js` 中的 `featureFlags.enableDirectUnlock` 改为 `true`，首页才会展示直接解锁发送者昵称入口。
6. 在云开发控制台创建集合：`user_profiles`、`messages`、`like_records`、`reaction_records`、`unlock_records`、`group_bindings`、`share_activities`、`reports`。
7. 按 `docs/database.indexes.md` 创建索引。
8. 逐个部署 `cloudfunctions` 下的云函数，选择“云端安装依赖”；后续修改云函数代码后也需要重新上传部署。

## 开发期说明

- 继续入口未配置时，前端会用“开发模式”弹窗模拟完成，方便测试流程。
- `bindGroup` 支持真实 `openGid`；未传 `openGid` 时使用 `shareTicket` 哈希作为开发期群标识。
- 分享解锁发送者必须从群里的分享卡片重新进入，不要在本机打开分享面板后直接判定成功。
- 真实昵称通过首页 `input type="nickname"` 确认后保存；不要再用 `wx.getUserProfile` 作为真实昵称来源。
- 上线前请阅读 `docs/production-notes.md`，尤其是真实群 ID 解密和激励权益服务端校验。
