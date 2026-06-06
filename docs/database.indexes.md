# 数据库索引

在云开发控制台创建以下索引。

```javascript
// user_profiles
 db.collection('user_profiles').createIndex({ _openid: 1 })

// messages
 db.collection('messages').createIndex({ likeCount: -1, createTime: -1 })
 db.collection('messages').createIndex({ category: 1, likeCount: -1 })
 db.collection('messages').createIndex({ _openid: 1, createTime: -1 })
 db.collection('messages').createIndex({ _openid: 1, isTemplate: 1, createTime: -1 })
 db.collection('messages').createIndex({ status: 1, createTime: -1 })
 db.collection('messages').createIndex({ openGid: 1, status: 1, createTime: -1 })
 db.collection('messages').createIndex({ openGid: 1, status: 1, category: 1 })

// like_records，唯一索引
 db.collection('like_records').createIndex(
   { messageId: 1, userId: 1 },
   { unique: true }
 )

// reaction_records，唯一索引
 db.collection('reaction_records').createIndex(
   { messageId: 1, userId: 1, emotion: 1 },
   { unique: true }
 )

// unlock_records
 db.collection('unlock_records').createIndex({ unlockedByOpenId: 1, unlockTime: -1 })
 db.collection('unlock_records').createIndex({ messageId: 1, unlockedByOpenId: 1 })

// group_bindings
 db.collection('group_bindings').createIndex({ openGid: 1 })
 db.collection('group_bindings').createIndex({ creatorOpenId: 1, lastModifyTime: -1 })

// share_activities
 db.collection('share_activities').createIndex({ activityId: 1 })
 db.collection('share_activities').createIndex({ messageId: 1, expireTime: 1 })

// reports
 db.collection('reports').createIndex({ messageId: 1, createTime: -1 })
```
