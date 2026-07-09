/**
 * 场景化教学的场景定义
 *
 * 场景是真实世界中的角色扮演情境，学生与扮演特定角色的 AI 老师
 * 一起练习英语。
 */

/** CEFR 等级标识符，用于场景 v2 的难度分级 */
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

/**
 * 场景 v2：Act = 三幕故事（开场 / 主线 / 收尾）中的一个阶段。
 * goal 会作为该幕的专属目标注入 LLM 提示词。
 */
export interface ActDef {
  /** Act 在 UI 中显示的中文名，如 "开场" / "主线" / "收尾" */
  name: string
  /** 注入提示词的目标 —— 该幕应完成什么 */
  goal: string
}

/**
 * @deprecated v2 起场景不再用 phase 级 objective；改用顶层 acts 描述剧情骨架，
 * 并由运行时按用户 CEFR 档从 vocab/lists/{level}.json 自动抽 30 个目标词。
 * 该类型保留仅为向后兼容旧 scenarios-default.json。
 */
export interface ScenarioObjective {
  id: string
  description: string
  descriptionEn: string
  keywords: string[]
  /** 学生在该阶段应学习的单词 */
  targetWords: string[]
}

export interface Scenario {
  id: string
  name: string
  nameEn: string
  description: string
  icon: string
  /**
   * @deprecated v2: 场景不再有固定 level，每个场景都能从 A1 → C2 闯关。
   * 仅为向后兼容旧 scenarios-default.json 保留。
   */
  level: number
  /** 主题标签，v2 用作 vocab/lists/{level}.json 的抽词锚点 */
  topics: string[]
  /**
   * @deprecated v2 起目标词不再静态写在场景里，改由运行时按
   * (用户CEFR档, scenario.topics) 自动从 vocab/lists/{level}.json 抽 30 个。
   * 仅为向后兼容旧 scenarios-default.json 保留。
   */
  targetWords: string[]
  role: {
    student: string
    teacher: string
  }
  setting: string
  /**
   * @deprecated v2 用 acts 替代。仅为向后兼容旧 scenarios-default.json 保留。
   */
  objectives: ScenarioObjective[]
  /**
   * v2 新增：3 幕剧骨架（开场 / 主线 / 收尾），注入 LLM prompt。
   * 可选——存在则用 v2 流程，缺失则回退旧 objectives。
   */
  acts?: ActDef[]
}

/** 所有可用场景 */
export const scenarios: Scenario[] = [
  {
    id: 'restaurant-ordering',
    name: '餐厅点餐',
    nameEn: 'Restaurant Ordering',
    description: '在一家西餐厅，你是顾客，Luna 是服务员。你需要完成点餐的全过程。',
    icon: '🍽️',
    level: 1,
    topics: ['food', 'politeness', 'number'],
    targetWords: ['coffee', 'tea', 'water', 'bread', 'please', 'thank'],
    role: {
      student: '顾客 (Customer)',
      teacher: '服务员 (Waitress)'
    },
    setting: 'A casual Italian restaurant on a Friday evening. The restaurant is warm and cozy.',
    objectives: [
      {
        id: 'greet',
        description: '向服务员打招呼',
        descriptionEn: 'Greet the waiter',
        keywords: ['hello', 'hi', 'good evening', 'good afternoon'],
        targetWords: ['please'],
      },
      {
        id: 'order-drink',
        description: '点一杯饮品',
        descriptionEn: 'Order a drink',
        keywords: ['coffee', 'tea', 'water', 'juice', 'drink', 'like', 'want', 'have'],
        targetWords: ['coffee', 'tea', 'water'],
      },
      {
        id: 'order-food',
        description: '点一份主食',
        descriptionEn: 'Order food',
        keywords: ['bread', 'meat', 'fruit', 'food', 'eat', 'order', 'like', 'want', 'have'],
        targetWords: ['bread'],
      },
      {
        id: 'pay',
        description: '结账离开',
        descriptionEn: 'Pay and leave',
        keywords: ['pay', 'bill', 'how much', 'money', 'goodbye', 'bye', 'thank'],
        targetWords: ['thank'],
      }
    ],
  },
  {
    id: 'asking-directions',
    name: '问路指路',
    nameEn: 'Asking for Directions',
    description: '你在一座陌生城市迷路了，Luna 是一位友好的路人。你需要问路找到目的地。',
    icon: '🗺️',
    level: 1,
    topics: ['place', 'question', 'basic'],
    targetWords: ['where', 'how', 'go', 'turn', 'left', 'right', 'near', 'far'],
    role: {
      student: '游客 (Tourist)',
      teacher: '路人 (Local Resident)'
    },
    setting: 'A busy street in a city. You are looking for the train station.',
    objectives: [
      {
        id: 'greet-ask',
        description: '礼貌地打招呼并询问',
        descriptionEn: 'Greet and ask politely',
        keywords: ['hello', 'excuse me', 'hi', 'please', 'help'],
        targetWords: ['how'],
      },
      {
        id: 'ask-destination',
        description: '询问目的地怎么走',
        descriptionEn: 'Ask how to get to the destination',
        keywords: ['where', 'how', 'get to', 'find', 'station', 'school', 'hospital'],
        targetWords: ['where', 'near', 'far'],
      },
      {
        id: 'understand-directions',
        description: '理解并确认方向',
        descriptionEn: 'Understand and confirm directions',
        keywords: ['left', 'right', 'straight', 'turn', 'go', 'thank', 'understand'],
        targetWords: ['go', 'turn', 'left', 'right'],
      },
    ],
  },
  {
    id: 'shopping',
    name: '购物对话',
    nameEn: 'Shopping',
    description: '你在一家商店购物，Luna 是店员。你需要询问商品并完成购买。',
    icon: '🛒',
    level: 1,
    topics: ['object', 'number', 'description'],
    targetWords: ['how much', 'want', 'like', 'big', 'small', 'good', 'one', 'two'],
    role: {
      student: '顾客 (Customer)',
      teacher: '店员 (Shop Assistant)'
    },
    setting: 'A small clothing store. You are looking for a gift.',
    objectives: [
      {
        id: 'greet',
        description: '向店员打招呼',
        descriptionEn: 'Greet the shop assistant',
        keywords: ['hello', 'hi', 'good morning', 'good afternoon'],
        targetWords: ['good'],
      },
      {
        id: 'ask-item',
        description: '询问想要的商品',
        descriptionEn: 'Ask about an item',
        keywords: ['want', 'like', 'look for', 'need', 'have', 'show'],
        targetWords: ['want', 'like', 'big', 'small'],
      },
      {
        id: 'ask-price',
        description: '询问价格',
        descriptionEn: 'Ask the price',
        keywords: ['how much', 'price', 'cost', 'money'],
        targetWords: ['how much'],
      },
      {
        id: 'buy',
        description: '决定购买并付款',
        descriptionEn: 'Decide to buy and pay',
        keywords: ['take', 'buy', 'want', 'please', 'thank', 'pay'],
        targetWords: ['one', 'two'],
      }
    ],
  },
  {
    id: 'meeting-someone',
    name: '初次见面',
    nameEn: 'Meeting Someone New',
    description: '你在一次聚会上认识新朋友，Luna 是你的新朋友。你们互相介绍自己。',
    icon: '👋',
    level: 1,
    topics: ['greeting', 'people', 'family'],
    targetWords: ['hello', 'name', 'nice', 'meet', 'friend', 'family', 'from'],
    role: {
      student: '聚会客人 (Party Guest)',
      teacher: '新朋友 (New Friend)'
    },
    setting: 'A friendly neighborhood party. Music is playing and people are chatting.',
    objectives: [
      {
        id: 'greet',
        description: '打招呼并自我介绍',
        descriptionEn: 'Greet and introduce yourself',
        keywords: ['hello', 'hi', 'my name', 'i am', 'nice'],
        targetWords: ['hello', 'name'],
      },
      {
        id: 'ask-about',
        description: '询问对方信息',
        descriptionEn: 'Ask about the other person',
        keywords: ['what', 'your name', 'where', 'from', 'do'],
        targetWords: ['nice', 'meet', 'from'],
      },
      {
        id: 'talk-family',
        description: '谈论家庭或朋友',
        descriptionEn: 'Talk about family or friends',
        keywords: ['family', 'mother', 'father', 'friend', 'sister', 'brother'],
        targetWords: ['friend', 'family'],
      }
    ],
  },
  {
    id: 'at-school',
    name: '校园生活',
    nameEn: 'At School',
    description: '你是新同学，Luna 是你的同学。你们讨论学校和学习。',
    icon: '🏫',
    level: 1,
    topics: ['people', 'object', 'verb'],
    targetWords: ['teacher', 'student', 'book', 'read', 'write', 'school', 'like'],
    role: {
      student: '新同学 (New Student)',
      teacher: '同学 (Classmate)'
    },
    setting: 'A school classroom during break time. Students are chatting.',
    objectives: [
      {
        id: 'greet',
        description: '向同学打招呼',
        descriptionEn: 'Greet your classmate',
        keywords: ['hello', 'hi', 'hey'],
        targetWords: ['school'],
      },
      {
        id: 'talk-school',
        description: '讨论学校生活',
        descriptionEn: 'Talk about school life',
        keywords: ['school', 'class', 'teacher', 'student', 'like'],
        targetWords: ['teacher', 'student'],
      },
      {
        id: 'talk-hobbies',
        description: '谈论兴趣爱好',
        descriptionEn: 'Talk about hobbies',
        keywords: ['like', 'read', 'write', 'play', 'book', 'fun'],
        targetWords: ['book', 'read', 'write'],
      },
      {
        id: 'say-goodbye',
        description: '告别同学',
        descriptionEn: 'Say goodbye',
        keywords: ['goodbye', 'bye', 'see you', 'nice'],
        targetWords: ['like'],
      }
    ],
  },
  {
    id: 'daily-routine',
    name: '日常作息',
    nameEn: 'Daily Routine',
    description: 'Luna 是你的室友，你们讨论每天的日常作息。',
    icon: '⏰',
    level: 1,
    topics: ['time', 'verb', 'family'],
    targetWords: ['morning', 'afternoon', 'night', 'eat', 'sleep', 'go', 'work'],
    role: {
      student: '室友 (Roommate)',
      teacher: '室友 (Roommate)'
    },
    setting: 'Your apartment in the morning. You and Luna are having breakfast together.',
    objectives: [
      {
        id: 'greet-morning',
        description: '早上打招呼',
        descriptionEn: 'Say good morning',
        keywords: ['morning', 'good morning', 'hello', 'hi'],
        targetWords: ['morning'],
      },
      {
        id: 'talk-routine',
        description: '讨论日常安排',
        descriptionEn: 'Talk about daily schedule',
        keywords: ['morning', 'afternoon', 'night', 'eat', 'go', 'work', 'sleep'],
        targetWords: ['afternoon', 'night', 'eat', 'go', 'work'],
      },
      {
        id: 'say-goodbye',
        description: '告别出门',
        descriptionEn: 'Say goodbye and leave',
        keywords: ['goodbye', 'bye', 'see you', 'go', 'work'],
        targetWords: ['sleep'],
      }
    ],
  },
  {
    id: 'job-interview',
    name: '求职面试',
    nameEn: 'Job Interview',
    description: '你正在参加一场英语面试，Luna 是面试官。展示你的英语能力。',
    icon: '💼',
    level: 3,
    topics: ['communication', 'evaluation', 'success'],
    targetWords: ['experience', 'skill', 'team', 'work', 'good', 'help', 'achieve'],
    role: {
      student: '求职者 (Job Applicant)',
      teacher: '面试官 (Interviewer)'
    },
    setting: 'A modern office meeting room. You are interviewing for a position at a company.',
    objectives: [
      {
        id: 'introduce',
        description: '自我介绍',
        descriptionEn: 'Introduce yourself',
        keywords: ['name', 'experience', 'work', 'study', 'university'],
        targetWords: ['experience'],
      },
      {
        id: 'skills',
        description: '描述你的技能',
        descriptionEn: 'Describe your skills',
        keywords: ['skill', 'good at', 'can', 'experience', 'team'],
        targetWords: ['skill', 'team'],
      },
      {
        id: 'motivation',
        description: '说明你的动机',
        descriptionEn: 'Explain your motivation',
        keywords: ['want', 'like', 'because', 'help', 'achieve', 'grow'],
        targetWords: ['help', 'achieve'],
      },
      {
        id: 'questions',
        description: '向面试官提问',
        descriptionEn: 'Ask questions to the interviewer',
        keywords: ['question', 'what', 'how', 'team', 'work'],
        targetWords: ['work'],
      },
      {
        id: 'close',
        description: '礼貌结束面试',
        descriptionEn: 'Close the interview politely',
        keywords: ['thank', 'opportunity', 'look forward', 'goodbye'],
        targetWords: ['good'],
      }
    ],
  },
  {
    id: 'hotel-complaint',
    name: '酒店投诉',
    nameEn: 'Hotel Complaint',
    description: '你在酒店遇到问题，Luna 是前台服务员。你需要礼貌但清楚地表达不满。',
    icon: '🏨',
    level: 3,
    topics: ['communication', 'manners', 'emotion'],
    targetWords: ['problem', 'room', 'help', 'please', 'sorry', 'fix', 'better'],
    role: {
      student: '酒店客人 (Hotel Guest)',
      teacher: '前台服务员 (Receptionist)'
    },
    setting: 'A hotel lobby. You have an issue with your room and need to speak to the receptionist.',
    objectives: [
      {
        id: 'explain-problem',
        description: '说明遇到的问题',
        descriptionEn: 'Explain the problem',
        keywords: ['problem', 'room', 'water', 'air conditioning', 'noise', 'broken'],
        targetWords: ['problem', 'room'],
      },
      {
        id: 'request-help',
        description: '请求帮助',
        descriptionEn: 'Request help',
        keywords: ['help', 'please', 'can you', 'fix', 'change'],
        targetWords: ['help', 'please', 'fix'],
      },
      {
        id: 'negotiate',
        description: '协商解决方案',
        descriptionEn: 'Negotiate a solution',
        keywords: ['another', 'different', 'better', 'discount', 'refund'],
        targetWords: ['sorry', 'better'],
      },
    ],
  },
  {
    id: 'travel-planning',
    name: '旅行规划',
    nameEn: 'Travel Planning',
    description: '你和 Luna 在讨论即将到来的旅行计划。',
    icon: '✈️',
    level: 3,
    topics: ['decision', 'social', 'knowledge'],
    targetWords: ['visit', 'go', 'see', 'want', 'plan', 'suggest', 'beautiful'],
    role: {
      student: '旅行者 (Traveler)',
      teacher: '旅行伙伴 (Travel Buddy)'
    },
    setting: 'A coffee shop. You and Luna are planning a trip together.',
    objectives: [
      {
        id: 'suggest-destination',
        description: '建议旅行目的地',
        descriptionEn: 'Suggest a destination',
        keywords: ['go to', 'visit', 'how about', 'what about', 'want'],
        targetWords: ['visit', 'want'],
      },
      {
        id: 'discuss-plan',
        description: '讨论旅行计划',
        descriptionEn: 'Discuss the plan',
        keywords: ['plan', 'day', 'see', 'do', 'when', 'where'],
        targetWords: ['plan', 'go', 'see'],
      },
      {
        id: 'share-opinions',
        description: '分享意见和建议',
        descriptionEn: 'Share opinions and suggestions',
        keywords: ['think', 'suggest', 'good idea', 'beautiful', 'interesting'],
        targetWords: ['suggest', 'beautiful'],
      },
    ],
  },
  {
    id: 'doctor-visit',
    name: '看医生',
    nameEn: 'Doctor Visit',
    description: '你感觉不舒服去看医生，Luna 是医生。描述你的症状。',
    icon: '🏥',
    level: 3,
    topics: ['emotion', 'state', 'description'],
    targetWords: ['feel', 'hurt', 'head', 'stomach', 'bad', 'better', 'medicine'],
    role: {
      student: '病人 (Patient)',
      teacher: '医生 (Doctor)'
    },
    setting: 'A doctor\'s office. You are not feeling well and have come for a check-up.',
    objectives: [
      {
        id: 'describe-symptoms',
        description: '描述症状',
        descriptionEn: 'Describe your symptoms',
        keywords: ['feel', 'hurt', 'pain', 'head', 'stomach', 'bad', 'sick'],
        targetWords: ['feel', 'hurt', 'head'],
      },
      {
        id: 'answer-questions',
        description: '回答医生的问题',
        descriptionEn: 'Answer the doctor\'s questions',
        keywords: ['yes', 'no', 'when', 'how long', 'yesterday', 'today'],
        targetWords: ['stomach', 'bad'],
      },
      {
        id: 'understand-advice',
        description: '理解医生的建议',
        descriptionEn: 'Understand the doctor\'s advice',
        keywords: ['medicine', 'rest', 'water', 'better', 'understand'],
        targetWords: ['medicine', 'better'],
      },
    ],
  }
]

/** 获取指定等级的场景 */
export function getScenariosForLevel(levelNum: number): Scenario[] {
  return scenarios.filter((s) => s.level === levelNum)
}

/** 按 ID 获取场景 */
export function getScenarioById(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}

/** 获取所有可用场景 */
export function getAllScenarios(): Scenario[] {
  return [...scenarios]
}
