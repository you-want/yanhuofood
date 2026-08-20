"use client";

import { ChevronDown, Clock3, HeartPulse, HelpCircle, Settings2, Utensils } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MenuTemplate } from "@/lib/domain/menu-templates";
import type { BudgetLevel, FestivalType, HealthGoal, MenuDays, MenuScenario } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MenuGenerationFormValue {
  dinersCount: number;
  days: MenuDays;
  mealCount: number;
  startDate: string;
  dislikedIngredients: string[];
  cuisines: string;
  dietaryRestrictions: string[];
  healthGoal: HealthGoal;
  specialGroup: "children" | "elderly" | "pregnant" | "";
  energyDisplay: "auto" | "on" | "off";
  halal: boolean;
  lightMeal: boolean;
  scenario: MenuScenario;
  festivalType: FestivalType;
  festivalTheme: string;
  dishesPerMeal: number;
  budgetLevel: BudgetLevel;
  cookingTimeLimit: number;
}

interface MenuGenerationFormProps extends MenuGenerationFormValue {
  selectedTemplate: MenuTemplate | null;
  planEndDate: string;
  advancedOpen: boolean;
  fieldErrors: Record<string, string>;
  onAdvancedOpenChange: (open: boolean) => void;
  onChange: <K extends keyof MenuGenerationFormValue>(key: K, value: MenuGenerationFormValue[K]) => void;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDate() {
  return formatLocalDate(new Date());
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatLocalDate(date);
}

function nextMondayDate() {
  const date = new Date();
  const diff = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + diff);
  return formatLocalDate(date);
}

function splitTags(value: string) {
  return Array.from(new Set(value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean)));
}

function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button type="button" aria-label="查看说明" onClick={() => setOpen((value) => !value)} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function Field({ label, help, children, htmlFor, error }: { label: string; help: string; children: ReactNode; htmlFor?: string; error?: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor} className={cn("text-sm font-medium", error ? "text-destructive" : "text-foreground")}>{label}</Label>
        <HelpTip text={help} />
      </div>
      {children}
      {error && <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

function SwitchField({ title, description, help, checked, onCheckedChange }: { title: string; description: string; help: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted px-3 py-3 transition hover:border-primary/20 hover:bg-primary/10">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5"><p className="text-sm font-medium text-foreground">{title}</p><HelpTip text={help} /></div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function MenuGenerationForm(props: MenuGenerationFormProps) {
  const change = props.onChange;
  const clamp = (value: number, min: number, max: number, fallback: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));

  return (
    <Card id="menu-generation-settings" className="mt-6">
      <CardHeader>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" />{props.selectedTemplate ? props.selectedTemplate.title : "本次生成设置"}</CardTitle>
            <CardDescription>{props.selectedTemplate ? props.selectedTemplate.description : "先确认关键条件；口味、忌口、健康、预算和烹饪时间可在高级条件中调整。"}</CardDescription>
          </div>
          <Badge variant={props.selectedTemplate ? "default" : "secondary"}>{props.selectedTemplate ? "模板已预填" : "实时生效"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="用餐人数" help="用于影响食材用量和份量建议。" htmlFor="menu-diners-count" error={props.fieldErrors.diners_count}>
              <Input id="menu-diners-count" type="number" min={1} max={20} value={props.dinersCount} onChange={(e) => change("dinersCount", Number(e.target.value))} onBlur={() => change("dinersCount", clamp(props.dinersCount, 1, 20, 1))} />
            </Field>
            <Field label="计划天数" help="模板已预填，可改成 1、5 或 7 天。" error={props.fieldErrors.days}>
              <SelectNative value={props.days} onChange={(e) => change("days", Number(e.target.value) as MenuDays)}><option value={1}>1 天</option><option value={5}>5 天</option><option value={7}>7 天</option></SelectNative>
            </Field>
            <Field label="每天餐次" help="首次生成建议保留 3 餐，之后可增加加餐。" error={props.fieldErrors.mealCount}>
              <SelectNative value={props.mealCount} onChange={(e) => change("mealCount", Number(e.target.value))}><option value={3}>3 餐</option><option value={4}>4 餐</option><option value={5}>5 餐</option></SelectNative>
            </Field>
            <Field label="开始日期" help="用于规划未来某一段菜单。" htmlFor="menu-start-date" error={props.fieldErrors.start_date}>
              <Input id="menu-start-date" type="date" value={props.startDate} onChange={(e) => change("startDate", e.target.value || todayDate())} />
            </Field>
            <Field label="忌口" help="填写本次生成要避开的食材，用逗号分隔。" htmlFor="menu-disliked-ingredients" error={props.fieldErrors.disliked_ingredients}>
              <Input id="menu-disliked-ingredients" value={props.dislikedIngredients.join(",")} onChange={(e) => change("dislikedIngredients", splitTags(e.target.value))} placeholder="例如：香菜, 辣椒" />
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><Badge variant="outline">{props.startDate} ~ {props.planEndDate}</Badge><Badge variant="outline">{props.cuisines || "默认家常口味"}</Badge><Badge variant="outline">{props.cookingTimeLimit} 分钟内</Badge></div>
            <Button type="button" variant="ghost" size="sm" onClick={() => props.onAdvancedOpenChange(!props.advancedOpen)}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", props.advancedOpen && "rotate-180")} aria-hidden="true" />
              {props.advancedOpen ? "收起高级条件" : "高级条件：口味、健康、预算与时间"}
            </Button>
          </div>
        </div>

        {props.advancedOpen && <>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Utensils className="h-4 w-4 text-primary" />口味边界</div>
              <Field label="偏好菜系/地域" help="可以随时修改本次生成的菜系、地方口味或做饭风格。" htmlFor="menu-cuisines" error={props.fieldErrors.cuisines}><Input id="menu-cuisines" value={props.cuisines} onChange={(e) => change("cuisines", e.target.value)} placeholder="例如：中式家常、川菜、北京菜" /></Field>
              <Field label="饮食限制" help="用逗号分隔多个限制，例如少油、少盐、高蛋白。" htmlFor="menu-dietary-restrictions" error={props.fieldErrors.dietary_restrictions}><Input id="menu-dietary-restrictions" value={props.dietaryRestrictions.join(",")} onChange={(e) => change("dietaryRestrictions", splitTags(e.target.value))} placeholder="例如：少油, 少盐, 高蛋白" /></Field>
              <Field label="忌口" help="填写本次生成要避开的食材。" htmlFor="menu-disliked-ingredients-advanced" error={props.fieldErrors.disliked_ingredients}><Input id="menu-disliked-ingredients-advanced" value={props.dislikedIngredients.join(",")} onChange={(e) => change("dislikedIngredients", splitTags(e.target.value))} placeholder="例如：香菜, 辣椒, 蒜" /></Field>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><HeartPulse className="h-4 w-4 text-primary" />健康与人群</div>
              <Field label="目标模式" help="决定本次菜单的营养倾向。营养值仅作日常估算。"><SelectNative value={props.healthGoal} onChange={(e) => change("healthGoal", e.target.value as HealthGoal)}><option value="balanced">均衡饮食</option><option value="fat_loss">减脂控热量</option><option value="high_protein">高蛋白</option><option value="low_sugar">控糖少精制碳水</option><option value="muscle_gain">增肌</option></SelectNative></Field>
              <Field label="特殊人群" help="儿童、老人、孕妇会影响搭配和提示。"><SelectNative value={props.specialGroup} onChange={(e) => change("specialGroup", e.target.value as MenuGenerationFormValue["specialGroup"])}><option value="">无</option><option value="children">儿童</option><option value="elderly">老年人</option><option value="pregnant">孕妇</option></SelectNative></Field>
              <Field label="热量显示" help="按目标显示会在减脂、高蛋白、控糖、增肌或轻食场景展示热量；均衡饮食默认隐藏。"><SelectNative value={props.energyDisplay} onChange={(e) => change("energyDisplay", e.target.value as MenuGenerationFormValue["energyDisplay"])}><option value="auto">按目标显示</option><option value="on">始终显示</option><option value="off">隐藏</option></SelectNative></Field>
              <div className="grid gap-3 sm:grid-cols-2"><SwitchField title="清真口味" description="避开猪肉、酒精等" help="开启后本次生成会避开明显不合适的食材。" checked={props.halal} onCheckedChange={(value) => change("halal", value)} /><SwitchField title="轻食/减脂" description="控油和热量" help="开启后本次生成会偏清淡、低油和控热量。" checked={props.lightMeal} onCheckedChange={(value) => change("lightMeal", value)} /></div>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Clock3 className="h-4 w-4 text-primary" />菜单结构</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="生成场景" help="切换 AI 的菜单组织方式。" htmlFor="menu-scenario" error={props.fieldErrors.scenario}><SelectNative id="menu-scenario" value={props.scenario} onChange={(e) => change("scenario", e.target.value as MenuScenario)}><option value="daily_home">日常在家</option><option value="travel">旅行外食</option><option value="work_takeout">上班外卖</option><option value="batch_cooking">周末备菜</option><option value="festival">节日聚餐</option></SelectNative></Field>
              {props.scenario === "festival" && <Field label="选择节日" help="节日类型会影响菜品寓意、组合和提醒。" htmlFor="menu-festival-type" error={props.fieldErrors.festival_type}><SelectNative id="menu-festival-type" value={props.festivalType} onChange={(e) => change("festivalType", e.target.value as FestivalType)}><option value="spring_festival">春节/年夜饭</option><option value="lantern_festival">元宵节</option><option value="dragon_boat">端午节</option><option value="mid_autumn">中秋节</option><option value="double_ninth">重阳节</option><option value="new_year">元旦/跨年</option><option value="christmas">圣诞节</option><option value="thanksgiving">感恩节</option><option value="other">其他节日</option></SelectNative></Field>}
              {props.scenario === "festival" && <Field label="聚餐主题" help="可补充具体节日、宴席主题或家人偏好。" htmlFor="menu-festival-theme" error={props.fieldErrors.festival_theme}><Input id="menu-festival-theme" value={props.festivalTheme} onChange={(e) => change("festivalTheme", e.target.value)} placeholder="例如：年夜饭、生日宴、乔迁宴，8 人聚餐" /></Field>}
              <Field label="周期" help="从开始日期往后连续规划 1 天、5 天或 7 天。" error={props.fieldErrors.days}><SelectNative value={props.days} onChange={(e) => change("days", Number(e.target.value) as MenuDays)}><option value={1}>只生成 1 天</option><option value={5}>连续 5 天</option><option value={7}>连续 7 天</option></SelectNative></Field>
              <Field label="开始日期" help="用于规划未来某一段菜单。" error={props.fieldErrors.start_date}><div className="flex flex-col gap-2 sm:flex-row"><Input type="date" value={props.startDate} onChange={(e) => change("startDate", e.target.value || todayDate())} className="sm:min-w-0 sm:flex-1" /><div className="flex shrink-0 flex-wrap gap-1.5"><Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => { change("startDate", todayDate()); change("days", 1); }}>今日菜单</Button><Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => { change("startDate", tomorrowDate()); change("days", 1); }}>明日菜单</Button><Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => change("startDate", nextMondayDate())}>下周一</Button></div></div></Field>
              <Field label="每天餐次" help="餐次越多，生成内容越长。" error={props.fieldErrors.mealCount}><SelectNative value={props.mealCount} onChange={(e) => change("mealCount", Number(e.target.value))}><option value={3}>3 餐</option><option value={4}>4 餐</option><option value={5}>5 餐</option></SelectNative></Field>
              <Field label="用餐人数" help="用于影响食材用量和份量建议。" htmlFor="menu-diners-count-advanced" error={props.fieldErrors.diners_count}><Input id="menu-diners-count-advanced" type="number" min={1} max={20} value={props.dinersCount} onChange={(e) => change("dinersCount", Number(e.target.value))} onBlur={() => change("dinersCount", clamp(props.dinersCount, 1, 20, 1))} /></Field>
              <Field label="每餐菜品数" help="菜品数越多，生成更丰富，但模型耗时会增加。" htmlFor="menu-dishes-per-meal" error={props.fieldErrors.dishes_per_meal}><Input id="menu-dishes-per-meal" type="number" min={1} max={6} value={props.dishesPerMeal} onChange={(e) => change("dishesPerMeal", Number(e.target.value))} onBlur={() => change("dishesPerMeal", clamp(props.dishesPerMeal, 1, 6, 1))} /></Field>
              <Field label="预算倾向" help="控制本次菜单更省钱、日常均衡或偏品质。"><SelectNative value={props.budgetLevel} onChange={(e) => change("budgetLevel", e.target.value as BudgetLevel)}><option value="low">省钱优先</option><option value="medium">日常均衡</option><option value="high">品质优先</option></SelectNative></Field>
              <Field label="单餐烹饪时间" help="帮助 AI 避免推荐太复杂或太耗时的菜。" htmlFor="menu-cooking-time-limit" error={props.fieldErrors.cooking_time_limit}><Input id="menu-cooking-time-limit" type="number" min={10} max={180} value={props.cookingTimeLimit} onChange={(e) => change("cookingTimeLimit", Number(e.target.value))} onBlur={() => change("cookingTimeLimit", clamp(props.cookingTimeLimit, 10, 180, 45))} /></Field>
              <Field label="计划区间" help="由开始日期和周期自动生成。"><div className="flex h-11 items-center rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground">{props.startDate} ~ {props.planEndDate}</div></Field>
            </div>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}
