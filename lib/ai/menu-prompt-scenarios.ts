import type { FestivalType, MenuScenario } from "@/lib/types";

interface MenuScenarioPrompt {
  label: string;
  intent: string;
  requirements: string[];
}

const SCENARIO_PROMPTS: Record<MenuScenario, MenuScenarioPrompt> = {
  daily_home: {
    label: "日常在家",
    intent: "适合家庭或个人日常做饭，强调可执行、营养均衡和采购可控。",
    requirements: [
      "优先选择常见菜市场或超市容易买到的食材。",
      "避免每餐都引入完全不同的冷门食材，减少采购复杂度。",
      "做法以家常烹饪为主，兼顾口味和可持续执行。",
    ],
  },
  travel: {
    label: "旅行外食",
    intent: "适合旅行途中安排用餐，强调当地风味、肠胃负担、补水和行程灵活性。",
    requirements: [
      "菜名可以包含当地特色或外食选择，但仍保持结构化字段完整。",
      "减少依赖复杂烹饪步骤，steps 可写成选择建议或简单处理方式。",
      "避免连续多餐高油高盐或生冷刺激，提醒肠胃敏感、儿童、老人等风险。",
    ],
  },
  work_takeout: {
    label: "上班外卖",
    intent: "适合工作日外卖、食堂或周边就餐，强调快速决策、预算和健康组合。",
    requirements: [
      "菜名优先像外卖/食堂可点到的组合，例如主菜、蔬菜、主食或汤。",
      "ingredients 可保留核心食材，不要求像家庭烹饪一样完整采购。",
      "reason 中说明点餐组合原则，例如少油、加蔬菜、主食份量或蛋白质来源。",
    ],
  },
  batch_cooking: {
    label: "周末备菜",
    intent: "适合周末集中备菜并在工作日复用，强调食材复用、保存和加热后口感。",
    requirements: [
      "优先复用 2 到 4 类核心食材，减少采购和预处理成本。",
      "多安排适合冷藏、分装、复热的菜品，少安排复热后明显变差的菜。",
      "reason 或 warnings 中提示保存、复热或提前处理注意事项。",
    ],
  },
  festival: {
    label: "节日聚餐",
    intent: "适合过年过节家庭聚餐，强调节日氛围、传统菜品和丰盛感。",
    requirements: [
      "菜品选择要符合节日传统，例如年夜饭要有鱼（年年有余）、饺子、年糕等。",
      "考虑多人聚餐场景，增加硬菜、凉菜、汤品的搭配。",
      "菜名要有吉祥寓意，兼顾传统与创新。",
      "注意食材的可采购性和烹饪时间安排。",
    ],
  },
};

export const FESTIVAL_CONFIG: Record<FestivalType, { label: string; description: string; traditionalDishes: string[] }> = {
  spring_festival: {
    label: "春节/年夜饭",
    description: "农历新年，全家团圆的传统节日",
    traditionalDishes: ["饺子", "鱼", "年糕", "红烧肉", "八宝饭", "春卷"],
  },
  lantern_festival: {
    label: "元宵节",
    description: "农历正月十五，吃元宵赏花灯",
    traditionalDishes: ["元宵", "汤圆", "面条", "饺子"],
  },
  dragon_boat: {
    label: "端午节",
    description: "农历五月初五，纪念屈原",
    traditionalDishes: ["粽子", "咸鸭蛋", "雄黄酒"],
  },
  mid_autumn: {
    label: "中秋节",
    description: "农历八月十五，赏月团圆",
    traditionalDishes: ["月饼", "螃蟹", "柚子", "桂花酒"],
  },
  double_ninth: {
    label: "重阳节",
    description: "农历九月初九，敬老登高",
    traditionalDishes: ["重阳糕", "菊花酒", "螃蟹"],
  },
  new_year: {
    label: "元旦",
    description: "公历新年，辞旧迎新",
    traditionalDishes: ["跨年大餐", "火锅", "团圆饭"],
  },
  christmas: {
    label: "圣诞节",
    description: "西方传统节日",
    traditionalDishes: ["火鸡", "圣诞蛋糕", "热红酒"],
  },
  thanksgiving: {
    label: "感恩节",
    description: "感恩丰收的节日",
    traditionalDishes: ["火鸡", "南瓜派", "玉米"],
  },
  other: {
    label: "其他节日",
    description: "自定义节日场景",
    traditionalDishes: [],
  },
};

export function getMenuScenarioPrompt(scenario: MenuScenario = "daily_home") {
  return SCENARIO_PROMPTS[scenario] || SCENARIO_PROMPTS.daily_home;
}

export function menuScenarioLabel(scenario: MenuScenario = "daily_home") {
  return getMenuScenarioPrompt(scenario).label;
}

export function getFestivalLabel(festival: FestivalType) {
  return FESTIVAL_CONFIG[festival]?.label || "节日";
}
