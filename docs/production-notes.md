# 上线前注意事项

## 群 openGid

当前 `bindGroup` 支持两种输入：

- `openGid`：生产环境推荐，使用真实群唯一标识。
- `shareTicket`：开发期 fallback，云函数用哈希生成临时群标识。

上线前建议接入真实群分享解密链路，确保同一个群稳定映射到同一个 `openGid`。

## 激励权益

当前激励权益由前端视频 `onClose` 且 `isEnded` 后触发。若需要强风控，可以新增完成记录集合，并在 `unlockMessage`、`updateGroupName` 中校验服务端记录。

## 内容安全

`publishMessage` 已调用 `security.msgSecCheck`。上线前请确认云函数 openapi 权限已生效，小程序类目和资质满足 UGC 社交场景要求。
