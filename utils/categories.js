const CATEGORIES = [
  { key: 'praise', label: '夸夸', icon: '✨', tone: '#F2A26E' },
  { key: 'comfort', label: '安抚', icon: '☁️', tone: '#91A989' },
  { key: 'thanks', label: '感谢', icon: '🫶', tone: '#D89A85' },
  { key: 'fun', label: '调侃', icon: '🎈', tone: '#C9A96A' },
  { key: 'encourage', label: '鼓励', icon: '🌱', tone: '#7CA982' },
]

const CATEGORY_MAP = CATEGORIES.reduce((map, item) => {
  map[item.key] = item
  return map
}, {})

const REACTIONS = ['😊', '😂', '🙏', '🤗']

function fillTemplate(pattern, angle) {
  return pattern.replace(/\{(\w+)\}/g, (match, key) => angle[key] || '')
}

function buildTemplates(angles, patterns) {
  const result = []
  patterns.forEach((pattern, patternIndex) => {
    angles.forEach((angle, angleIndex) => {
      const rotatedPattern = patterns[(patternIndex + angleIndex) % patterns.length]
      result.push(fillTemplate(rotatedPattern, angle))
    })
  })
  return result.slice(0, 200)
}

const PRAISE_ANGLES = [
  { topic: '工作', scene: '处理事情', quality: '稳和靠谱', detail: '把复杂事情捋顺', image: '像自带进度条' },
  { topic: '长相', scene: '出现', quality: '清爽好看', detail: '让人第一眼就记住', image: '像把光带进来' },
  { topic: '性格', scene: '和人相处', quality: '温柔又有边界', detail: '让人相处起来很放松', image: '像一块稳定靠垫' },
  { topic: '游戏水平', scene: '操作起来', quality: '意识在线', detail: '接住关键局面', image: '像队伍里的隐藏大腿' },
  { topic: '经历', scene: '聊起过往', quality: '有韧劲', detail: '走过不少还保持真诚', image: '像一本慢慢翻开的书' },
  { topic: '气质', scene: '安静站着', quality: '很有辨识度', detail: '不用说太多也有存在感', image: '像低调但好看的滤镜' },
  { topic: '社交', scene: '接话的时候', quality: '会照顾气氛', detail: '让冷场变得轻松', image: '像群里的暖场开关' },
  { topic: '成绩', scene: '学习和做成果', quality: '认真能打', detail: '一步步把结果做出来', image: '像稳稳上分的曲线' },
  { topic: '情绪价值', scene: '陪人说话', quality: '很会安放情绪', detail: '让人觉得被理解', image: '像一盏不刺眼的小灯' },
  { topic: '审美创意', scene: '做选择时', quality: '有自己的品味', detail: '总能挑出好看的方向', image: '像自带灵感雷达' },
]

const PRAISE_PATTERNS = [
  '你的{topic}真的很有亮点，{quality}特别明显。',
  '你在{scene}时，很容易让人看到{quality}。',
  '{topic}这块你很拿得出手，完全不用怀疑。',
  '你能做到{detail}，这点真的很厉害。',
  '你给人的感觉{image}，很难不被注意到。',
  '说真的，你的{topic}比你自己想的更出色。',
  '你在{scene}时那种状态，很自然也很亮。',
  '{quality}这件事，在你身上特别有说服力。',
  '你把{topic}做得不声不响，但效果很明显。',
  '你身上有种让人放心的劲，尤其在{topic}上。',
  '别人可能只是完成，你是在{scene}里做得漂亮。',
  '{detail}这件小事，已经说明你很不一般。',
  '你不需要很大声，{topic}里的亮点也会自己冒出来。',
  '你处理{topic}的方式，有一种很舒服的稳定感。',
  '你在{topic}上的表现，很适合被认真夸一下。',
  '你的{quality}不是装出来的，是日常里一点点露出来的。',
  '{scene}的时候，你真的很像一个靠谱答案。',
  '你让{topic}这件事变得更好看，也更有秩序。',
  '能把{detail}做到这样，真的挺值得被看见。',
  '你的{topic}有种低调的闪光感，越看越明显。',
]

const COMFORT_ANGLES = [
  { topic: '工作压力', moment: '事情堆起来', feeling: '累到没力气', reminder: '你不是机器', gentle: '先把呼吸放慢一点', image: '像给自己盖一条软毯' },
  { topic: '外貌焦虑', moment: '开始挑剔自己', feeling: '心里有点乱', reminder: '你不需要时时完美', gentle: '今天先别和镜子较劲', image: '像把刺眼的灯调暗' },
  { topic: '性格敏感', moment: '想太多的时候', feeling: '很容易内耗', reminder: '感受多不是错', gentle: '可以先抱抱那个敏感的自己', image: '像给心口放一颗糖' },
  { topic: '游戏失利', moment: '一局打崩', feeling: '有点不服也有点泄气', reminder: '输一局不代表你不行', gentle: '先喝口水再排下一把', image: '像暂停键按得刚刚好' },
  { topic: '成长经历', moment: '想起过去', feeling: '有些委屈翻上来', reminder: '你已经走到这里了', gentle: '不用急着把所有事解释清楚', image: '像给旧伤口换一层新纱布' },
  { topic: '气质被误读', moment: '别人不懂你', feeling: '有点孤单', reminder: '不被立刻理解也没关系', gentle: '你可以慢慢展开自己', image: '像一朵按自己时间开的花' },
  { topic: '社交疲惫', moment: '应付太多场面', feeling: '电量快见底', reminder: '休息不是扫兴', gentle: '可以短暂退回自己的小角落', image: '像把手机切到省电模式' },
  { topic: '成绩波动', moment: '结果没到预期', feeling: '心里不太甘心', reminder: '一次分数不是全部', gentle: '先把今天这一步走完', image: '像曲线里正常的一次回调' },
  { topic: '关系误会', moment: '话没说清楚', feeling: '又急又难过', reminder: '误会不等于结局', gentle: '给彼此一点缓冲时间', image: '像雾慢慢散开' },
  { topic: '未来焦虑', moment: '想太远的时候', feeling: '脑子停不下来', reminder: '不用今天解决一生', gentle: '先处理眼前一小件事', image: '像把地图缩放到当前街口' },
]

const COMFORT_PATTERNS = [
  '{topic}让你累的时候，可以先把自己放回第一位。',
  '当{moment}时，不代表你不行，只是今天难度比较高。',
  '如果现在{feeling}，那就先别逼自己立刻好起来。',
  '{reminder}，你已经撑得比自己想的久了。',
  '先{gentle}，剩下的事可以慢慢来。',
  '今天不需要满分，能照顾好自己就已经很好。',
  '{topic}这件事可以一点点拆，不用一口气扛完。',
  '你可以允许自己在{moment}时停一下。',
  '有些难过不是矫情，是你真的累了。',
  '把节奏放慢一点，世界不会因此少喜欢你。',
  '{image}，现在更需要温柔一点对自己。',
  '就算{feeling}，也不影响你本来就很珍贵。',
  '你不用把每个情绪都解释得很完美。',
  '今天先别和自己硬碰硬，缓一缓也算前进。',
  '{moment}的时候，先别急着否定自己。',
  '你可以不那么坚强一小会儿，真的没关系。',
  '这段{topic}不会定义你，它只是路上的一段。',
  '如果心里很吵，就先给自己留一点安静。',
  '你已经在努力了，这一点不需要别人批准。',
  '慢一点也没关系，你还在往前走。',
]

const THANKS_ANGLES = [
  { topic: '工作帮忙', scene: '最忙的时候', action: '接住了那一摊事', value: '很多踏实感', detail: '那一下真的很关键' },
  { topic: '细节照顾', scene: '别人没注意到时', action: '把小细节放在心上', value: '被认真对待的感觉', detail: '那些小事我都记得' },
  { topic: '性格包容', scene: '气氛紧的时候', action: '没有急着下判断', value: '很大的安全感', detail: '你的耐心很珍贵' },
  { topic: '游戏带飞', scene: '局势不妙的时候', action: '把节奏拉了回来', value: '重新有希望的感觉', detail: '那波操作真的救命' },
  { topic: '经历分享', scene: '我有点迷茫时', action: '把你的经验讲出来', value: '少绕路的提醒', detail: '那段话很有用' },
  { topic: '气质安定', scene: '大家都慌的时候', action: '稳稳地待在那里', value: '安定感', detail: '你的存在很压得住场' },
  { topic: '社交救场', scene: '快冷场的时候', action: '自然地接过话头', value: '更轻松的气氛', detail: '那一刻真的很需要你' },
  { topic: '成绩带动', scene: '一起努力的时候', action: '把认真劲带给大家', value: '继续坚持的动力', detail: '你的自律很有感染力' },
  { topic: '情绪支持', scene: '我状态不太好时', action: '没有敷衍地听完', value: '不是一个人的感觉', detail: '那份陪伴很暖' },
  { topic: '审美建议', scene: '选择困难的时候', action: '给了很靠谱的判断', value: '更好看的方向', detail: '你的眼光真的在线' },
]

const THANKS_PATTERNS = [
  '谢谢你在{topic}上帮了这一把。',
  '{scene}，你愿意{action}，真的很暖。',
  '你那次{action}，给我{value}。',
  '{detail}，我一直记得。',
  '谢谢你没有把那件事当成小事。',
  '如果没有你，{scene}可能会难很多。',
  '你给人的帮助不是很吵，但特别实在。',
  '谢谢你用自己的方式把事情变轻了一点。',
  '你在{topic}里的那份用心，真的被看见了。',
  '谢谢你出现得刚刚好，也做得刚刚好。',
  '你愿意{action}，这件事本身就很值得感谢。',
  '那次{scene}，你让我感觉很安心。',
  '谢谢你的{topic}，它不是理所当然的。',
  '你带来的{value}，比你想象中重要。',
  '有些感谢不太好当面说，但真的想让你知道。',
  '你把普通的一天，变得没那么普通。',
  '谢谢你把人放在心上，而不是只把事做完。',
  '你的{detail}，让人很想认真说一声谢谢。',
  '那一刻你没有走开，这点很珍贵。',
  '谢谢你让我在{scene}少慌了一点。',
]

const FUN_ANGLES = [
  { topic: '工作状态', scene: '认真起来', quirk: '像突然开启隐藏模式', detail: '效率和表情形成强烈反差', image: '建议低调一点，太显眼了' },
  { topic: '长相氛围', scene: '一出现', quirk: '自带镜头感', detail: '连普通表情都像有设计', image: '建议给群聊交一点出场费' },
  { topic: '性格反差', scene: '突然开口', quirk: '一本正经地好笑', detail: '让人不知道该佩服还是该笑', image: '群聊快乐 KPI 靠你了' },
  { topic: '游戏操作', scene: '关键团战', quirk: '像在玩玄学流派', detail: '菜得可爱或强得离谱都很有看点', image: '建议写进队史' },
  { topic: '经历故事', scene: '讲起往事', quirk: '素材密度很高', detail: '随便一句都像连续剧预告', image: '建议开个连载' },
  { topic: '气质出场', scene: '安静路过', quirk: '存在感自动加粗', detail: '不说话也很难被忽略', image: '建议申请群聊特效' },
  { topic: '社交名场面', scene: '接话时', quirk: '像群聊润滑剂', detail: '把尴尬变成笑点', image: '建议颁发救场证书' },
  { topic: '成绩玄学', scene: '出结果时', quirk: '像偷偷加载了好运插件', detail: '努力和运气都很会配合你', image: '建议分享一下上分秘方' },
  { topic: '情绪包袱', scene: '安慰别人时', quirk: '温柔里带点喜剧效果', detail: '让人一边被治愈一边想笑', image: '建议列入群聊非遗' },
  { topic: '审美库存', scene: '挑东西时', quirk: '像随身带了灵感仓库', detail: '总能拿出奇妙但好看的选择', image: '建议给眼光上保险' },
]

const FUN_PATTERNS = [
  '你的{topic}这块有点超纲，{image}。',
  '{scene}的时候，你的{quirk}真的很明显。',
  '{detail}，这很难不被群聊记录下来。',
  '你在{topic}上的存在感，已经悄悄超标了。',
  '这位朋友的{topic}建议重点观察，很有节目效果。',
  '你一进入{scene}，群里的空气都开始冒泡。',
  '{quirk}这件事，在你身上非常合理。',
  '你的{detail}，可以说是群聊限定款。',
  '建议你把{topic}稍微收一收，不然大家会笑出声。',
  '你在{scene}时那种状态，很适合被做成表情包。',
  '{topic}这方面你太有记忆点了，想忘都难。',
  '你的{quirk}不是缺点，是群聊快乐资源。',
  '{detail}，属于越想越好笑的那种。',
  '你在{topic}里的发挥，像偷偷加了喜剧滤镜。',
  '这个{scene}如果没有你，快乐浓度会下降。',
  '你的{topic}很适合申请一个群内专属称号。',
  '不得不说，你的{quirk}很有个人版权。',
  '{detail}，建议群友们自觉珍惜。',
  '你在{scene}时太有画面感了，真的很难低调。',
  '群里有你，{topic}都变得更有梗了。',
]

const ENCOURAGE_ANGLES = [
  { topic: '工作', scene: '任务压过来', strength: '能把乱局一点点理顺', next: '先完成眼前这一小步', image: '像稳稳往前推的车轮' },
  { topic: '外貌状态', scene: '不够自信', strength: '自己的好看方式', next: '别急着否定镜子里的自己', image: '像慢慢亮起来的清晨' },
  { topic: '性格', scene: '觉得自己不够外向', strength: '真诚和分寸感', next: '按自己的节奏展开就好', image: '像耐心生长的树' },
  { topic: '游戏水平', scene: '连跪', strength: '复盘和坚持的能力', next: '下一局重新开，手感会回来的', image: '像还没结束的翻盘局' },
  { topic: '成长经历', scene: '被过去影响', strength: '一路走来的韧性', next: '把今天过好也算赢', image: '像把旧地图走出新路线' },
  { topic: '气质', scene: '不被理解', strength: '需要时间被看见的独特感', next: '不用急着变成别人喜欢的样子', image: '像有自己光源的星星' },
  { topic: '社交', scene: '害怕说错话', strength: '在意别人感受的温柔', next: '可以给自己一点试错空间', image: '像慢慢热起来的茶' },
  { topic: '成绩', scene: '结果暂时不理想', strength: '不会被一次波动带走的努力', next: '继续把基础打稳', image: '像还在上升的折线' },
  { topic: '情绪', scene: '心里没电', strength: '照顾自己的能力', next: '先恢复一点点能量', image: '像重新充电的小灯' },
  { topic: '审美创意', scene: '灵感卡住', strength: '一直都在的判断和品味', next: '先做一个小版本出来', image: '像还没开封的灵感盒' },
]

const ENCOURAGE_PATTERNS = [
  '{topic}这条路可以慢慢走，你已经在路上了。',
  '{scene}的时候，别忘了你有{strength}。',
  '先{next}，剩下的会一点点接上。',
  '你不是没有进步，只是有些进步还没大声出现。',
  '{image}，你现在也在慢慢变亮。',
  '别急着否定自己，{topic}这件事还没到结尾。',
  '你能走到这里，已经说明你很有韧性。',
  '今天先赢一小步，也很值得。',
  '{scene}不代表你差，只代表这一段比较难。',
  '你可以不完美，但不要不相信自己。',
  '{strength}这件事，是你身上很重要的底气。',
  '如果现在有点乱，就先把下一步放小一点。',
  '你的节奏也许慢，但它一直在往前。',
  '别把一次失误当成自己的全部说明书。',
  '你值得被鼓励，也值得继续试一次。',
  '把{topic}这件事拆小一点，你会更容易赢回来。',
  '先照顾好自己，再去处理那些难题。',
  '{next}，这已经是很实在的前进。',
  '你身上有一种会重新站起来的力量。',
  '继续吧，你比自己以为的更能扛。',
]

const TEMPLATES = {
  praise: buildTemplates(PRAISE_ANGLES, PRAISE_PATTERNS),
  comfort: buildTemplates(COMFORT_ANGLES, COMFORT_PATTERNS),
  thanks: buildTemplates(THANKS_ANGLES, THANKS_PATTERNS),
  fun: buildTemplates(FUN_ANGLES, FUN_PATTERNS),
  encourage: buildTemplates(ENCOURAGE_ANGLES, ENCOURAGE_PATTERNS),
}

module.exports = {
  CATEGORIES,
  CATEGORY_MAP,
  REACTIONS,
  TEMPLATES,
}
