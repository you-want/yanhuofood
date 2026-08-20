import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  ChefHat,
  CircleHelp,
  ClipboardList,
  Heart,
  RefreshCw,
  Settings2,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

const steps = [
  {
    title: "1. 生成第一份菜单",
    icon: Sparkles,
    content: [
      "从总览页选择一个场景模板，或进入菜单页自行设置人数、天数、餐次和忌口。",
      "检查计划开始日期。首次使用只需确认关键条件，高级条件可按需展开。",
      "点击开始生成。生成任务可恢复，刷新或离开页面后返回仍能继续查看状态。",
      "如果显示“样例兜底”，说明本次不是 AI 结果，请检查模型配置后重试。",
    ],
  },
  {
    title: "2. 调整不满意的餐食",
    icon: RefreshCw,
    content: [
      "在菜单中点击“换菜”只替换一道菜，点击“整餐”替换当前餐次。",
      "选择不爱吃、食材难买、太复杂、太贵或重复等原因，系统只修改目标位置。",
      "点击餐食单元可以手动编辑。菜名改变后，旧食材和营养会标记为需要重新计算。",
      "如页面提示忌口、清真或饮食限制冲突，请先修正，再进入采购清单。",
    ],
  },
  {
    title: "3. 查看菜品做法",
    icon: ChefHat,
    content: [
      "点击菜单中的“详情”，在站内查看食材、调料、步骤、耗时、难度和注意事项。",
      "一餐包含多道菜时，可在详情顶部切换具体菜品。",
      "需要长期保留时，点击“加入食谱库”；已存在的同名食谱会自动跳过。",
    ],
  },
  {
    title: "4. 执行采购清单",
    icon: ShoppingBasket,
    content: [
      "进入清单页，选择菜单周期和需要采购的连续日期范围，也可以快速选择未来 2 天或 3 天。",
      "点击食材标记为已购买；使用“家中已有”将其从待采购列表排除，并可随时恢复。",
      "勾选、家中已有和分类折叠状态会保存在当前浏览器；配置 Supabase 后也会持久化到服务端。",
      "菜单变化时会显示新增和移除项目。确认更新后，仍存在食材的执行状态会被保留。",
      "可复制文本、调用系统分享，也可以导出 CSV、PNG 或打印。",
    ],
  },
  {
    title: "5. 记录反馈并规划下周",
    icon: Heart,
    content: [
      "在菜品详情中选择“喜欢”“不想再吃”或“做过了”。再次点击可取消状态。",
      "后续生成会排除“不想再吃”的菜品，并参考喜欢和做过的菜品风格。",
      "点击“沿用偏好规划下周”保留当前人数、餐次、预算、时间限制和反馈，再生成新计划。",
      "点击“复制整周顺延”可直接复制现有菜单到下周；保存前请检查季节性食材和重复菜品。",
    ],
  },
];

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={<Badge>用户手册</Badge>}
        title="烟火食间使用指南"
        description="从生成菜单到调整、采购、做饭反馈和下周复用的完整操作说明。建议先从菜单工作台开始，再按需要查看附近吃什么和模型设置。"
        actions={<Button asChild><Link href="/menus"><CalendarDays className="h-4 w-4" />进入菜单工作台</Link></Button>}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/menus" className="group flex items-start justify-between rounded-lg border border-border bg-card p-4 transition hover:border-primary/30">
          <div>
            <Sparkles className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold text-foreground">生成与调整菜单</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">设置条件、替换餐食、查看做法。</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        <Link href="/ingredients" className="group flex items-start justify-between rounded-lg border border-border bg-card p-4 transition hover:border-primary/30">
          <div>
            <ClipboardList className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold text-foreground">执行采购清单</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">选择日期、持续勾选、分享导出。</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        <Link href="/nearby" className="group flex items-start justify-between rounded-lg border border-border bg-card p-4 transition hover:border-primary/30">
          <div>
            <ChefHat className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold text-foreground">附近快速决策</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">用位置和筛选条件找真实餐馆。</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        <Link href="/model-settings" className="group flex items-start justify-between rounded-lg border border-border bg-card p-4 transition hover:border-primary/30">
          <div>
            <Settings2 className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold text-foreground">配置浏览器模型</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">仅在服务器没有可用模型时需要。</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      </section>

      <section className="mt-6 space-y-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Card key={step.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm leading-6 text-foreground">
                  {step.content.map((item) => (
                    <li key={item} className="flex gap-3">
                      <CheckCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              模型配置与数据说明
            </CardTitle>
            <CardDescription>了解什么时候需要配置，以及数据保存在哪里。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-foreground">
            <p>服务器已配置模型时，普通用户无需填写 API Key。</p>
            <p>“本浏览器模型配置”只保存在当前浏览器 localStorage，并随本次生成请求临时发送，不写入 Supabase。</p>
            <p>未配置 Supabase 时，菜单、反馈和采购状态会尽量降级保存在当前浏览器，清理浏览器数据后可能丢失。</p>
            <p>营养数据为日常估算，不替代医生、营养师或其他专业建议。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleHelp className="h-5 w-5 text-primary" />
              常见问题
            </CardTitle>
            <CardDescription>遇到异常时优先检查这些项目。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-foreground">
            <div>
              <p className="font-semibold text-foreground">生成结果显示为样例</p>
              <p>检查模型配置和网络后重试。样例结果不会被当作 AI 成功统计。</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">采购状态和菜单没有同步</p>
              <p>确认选择的是同一菜单周期和日期范围；菜单变化后需要先确认清单差异。</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">换菜后仍看到旧食材</p>
              <p>重新进入清单页并确认清单更新；系统会保留未变化食材的已购和已有状态。</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">准备开始规划</p>
          <p className="mt-1 text-sm text-primary">从模板开始通常只需要确认少量关键条件。</p>
        </div>
        <Button asChild variant="outline" className="border-primary/30 bg-card">
          <Link href="/">
            返回总览
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </main>
  );
}
