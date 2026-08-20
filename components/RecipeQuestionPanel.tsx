"use client";

import { AlertTriangle, Bot, ExternalLink, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { readLocalModelConfig } from "@/lib/local-model-config";
import type { RecipeAskQuestionType, RecipeAskResponse } from "@/lib/schemas/recipe-knowledge";
import type { Recipe } from "@/lib/types";

const QUICK_QUESTIONS: Array<{ type: RecipeAskQuestionType; label: string; question: string }> = [
  { type: "why_recommended", label: "为什么推荐", question: "为什么推荐这道菜？" },
  { type: "replace_ingredient", label: "替换食材", question: "如果缺少或不吃某种食材，应该怎样替换？" },
  { type: "reduce_oil_salt", label: "减少油盐", question: "怎样减少这道菜的油和盐，同时尽量保留风味？" },
  { type: "adjust_servings", label: "调整人数", question: "怎样按用餐人数调整食材分量？" },
  { type: "equipment_alternative", label: "设备替代", question: "没有菜谱中的设备时，可以怎样替代？" },
  { type: "prep_ahead", label: "提前备菜", question: "哪些步骤可以提前完成？" },
  { type: "use_leftovers", label: "余料利用", question: "做完后剩余食材可以怎样利用？" },
];

type AnswerPayload = RecipeAskResponse & {
  generation?: { source?: "ai" | "rules"; warning?: string | null };
};

interface RecipeQuestionPanelProps {
  recipe: Recipe;
  dinersCount?: number;
  availableIngredients?: string[];
}

function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function RecipeQuestionPanel({ recipe, dinersCount, availableIngredients = [] }: RecipeQuestionPanelProps) {
  const [question, setQuestion] = useState("");
  const [questionType, setQuestionType] = useState<RecipeAskQuestionType | undefined>();
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async (nextQuestion = question, nextType = questionType) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || loading) return;
    setQuestion(trimmed);
    setQuestionType(nextType);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/recipes/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe,
          question: trimmed,
          question_type: nextType,
          diners_count: dinersCount,
          available_ingredients: availableIngredients,
          model_config: readLocalModelConfig(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || "菜谱问答暂时不可用");
      setAnswer(payload as AnswerPayload);
    } catch (askError) {
      setAnswer(null);
      setError(askError instanceof Error ? askError.message : "菜谱问答暂时不可用");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-primary/20 bg-primary/10 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Bot className="h-4 w-4 text-primary" />
            围绕这道菜提问
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">回答只使用当前菜谱上下文；不会保存对话，也不会自动修改菜单。</p>
        </div>
        {answer && <Badge variant={answer.generation?.source === "ai" ? "default" : "secondary"}>{answer.generation?.source === "ai" ? "AI 回答" : "规则建议"}</Badge>}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
        {QUICK_QUESTIONS.map((item) => (
          <Button
            key={item.type}
            type="button"
            size="sm"
            variant={questionType === item.type ? "default" : "outline"}
            className="shrink-0 whitespace-nowrap"
            disabled={loading}
            onClick={() => {
              setQuestion(item.question);
              setQuestionType(item.type);
              void ask(item.question, item.type);
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            setQuestionType(undefined);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void ask();
          }}
          maxLength={500}
          rows={2}
          className="min-h-20 bg-card"
          placeholder="例如：没有烤箱怎么做？改成 3 人份需要多少食材？"
          disabled={loading}
        />
        <Button type="button" className="w-full shrink-0 sm:w-auto" disabled={loading || !question.trim()} onClick={() => void ask()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? "回答中" : "提问"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {answer && (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-card p-3">
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{answer.answer}</p>
          {answer.suggestions.length > 0 && (
            <div className="grid gap-2">
              {answer.suggestions.map((suggestion, index) => (
                <div key={`${suggestion.title}-${index}`} className="rounded-md bg-muted px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">{suggestion.title}</p>
                  <p className="mt-1 text-sm leading-6 text-foreground">{suggestion.detail}</p>
                </div>
              ))}
            </div>
          )}
          {answer.warnings.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
              {answer.warnings.join("；")}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span>置信度：{answer.confidence === "high" ? "高" : answer.confidence === "medium" ? "中" : "低"}</span>
            {answer.sources.map((source) => {
              const url = safeExternalUrl(source.url);
              return url ? (
                <a key={source.source_recipe_id} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  来源：{source.name}<ExternalLink className="h-3 w-3" />
                </a>
              ) : <span key={source.source_recipe_id}>来源：{source.name}</span>;
            })}
          </div>
          {answer.generation?.warning && <p className="text-xs text-muted-foreground">{answer.generation.warning}</p>}
        </div>
      )}
    </section>
  );
}
