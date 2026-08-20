"use client";

import { Clock3, ExternalLink, Search, Users, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { RecipeImage } from "@/components/RecipeImage";
import { RecipeQuestionPanel } from "@/components/RecipeQuestionPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildDouyinSearchUrl } from "@/lib/recipe-media";
import type { Recipe, RecipeIngredientDetail } from "@/lib/types";

interface RecipeDetailDialogProps {
  recipe: Recipe;
  onClose: () => void;
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

function difficultyLabel(value?: Recipe["difficulty"]) {
  return value === "easy" ? "简单" : value === "medium" ? "适中" : value === "hard" ? "较难" : null;
}

function ingredientLabel(item: RecipeIngredientDetail) {
  const amount = typeof item.amount === "number" ? ` ${item.amount}${item.unit || ""}` : item.unit ? ` ${item.unit}` : "";
  return `${item.name}${amount}${item.optional ? "（可选）" : ""}`;
}

export function RecipeDetailDialog({ recipe, onClose }: RecipeDetailDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const videoUrl = safeExternalUrl(recipe.video_url);
  const sourceUrl = safeExternalUrl(recipe.source_url || recipe.source?.homepage_url);
  const steps = useMemo(
    () => recipe.steps?.length
      ? recipe.steps.map((step) => step.instruction)
      : (recipe.instructions || "").split(/\r?\n/).map((step) => step.trim()).filter(Boolean),
    [recipe.instructions, recipe.steps]
  );
  const ingredients = recipe.ingredient_details?.length
    ? recipe.ingredient_details
    : (recipe.ingredients || []).map((name) => ({ name, normalized_name: name, category: "other" as const }));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 p-0 sm:p-3" onClick={onClose} role="presentation">
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-detail-title"
        className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden bg-card shadow-xl sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{recipe.cuisine || "未分类"}</p>
            <h2 id="recipe-detail-title" className="mt-1 text-lg font-semibold text-foreground">{recipe.name}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="关闭食谱详情"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {recipe.image_url?.trim() && <RecipeImage src={recipe.image_url} alt={`${recipe.name}成品图`} className="aspect-[16/9] w-full border-b border-border" />}

          <div className="space-y-6 px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{Math.max(0, Math.round(recipe.calories || 0))} kcal</Badge>
              {recipe.quality_status === "reviewed" && <Badge variant="default">已审核菜谱</Badge>}
              {recipe.source_recipe_id && <Badge variant="outline">可信来源</Badge>}
              {(recipe.tags || []).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
            </div>

            {(recipe.servings || recipe.cooking_time_minutes || recipe.prep_time_minutes || recipe.difficulty) && (
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">份量</p><p className="mt-1 flex items-center gap-1 font-semibold text-foreground"><Users className="h-3.5 w-3.5" />{recipe.servings ? `${recipe.servings} 人份` : "--"}</p></div>
                <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">烹饪</p><p className="mt-1 flex items-center gap-1 font-semibold text-foreground"><Clock3 className="h-3.5 w-3.5" />{recipe.cooking_time_minutes ? `${recipe.cooking_time_minutes} 分钟` : "--"}</p></div>
                <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">准备</p><p className="mt-1 font-semibold text-foreground">{typeof recipe.prep_time_minutes === "number" ? `${recipe.prep_time_minutes} 分钟` : "--"}</p></div>
                <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">难度</p><p className="mt-1 font-semibold text-foreground">{difficultyLabel(recipe.difficulty) || "--"}</p></div>
              </div>
            )}

            {(recipe.source || recipe.source_name || recipe.source_recipe_id || recipe.source_url) && (
              <section className="rounded-md border border-primary/20 bg-primary/10 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-primary">菜谱来源</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{recipe.source?.name || recipe.source_name || "烟火食间可信菜谱库"}</p>
                    {recipe.source?.attribution_text && <p className="mt-1 text-xs leading-5 text-muted-foreground">{recipe.source.attribution_text}</p>}
                  </div>
                  {sourceUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={sourceUrl} target="_blank" rel="noopener noreferrer">查看来源<ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  )}
                </div>
              </section>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              {videoUrl && (
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer"><Video className="h-4 w-4" />打开制作视频<ExternalLink className="h-3.5 w-3.5" /></a>
                </Button>
              )}
              <Button asChild className="w-full sm:w-auto">
                <a href={buildDouyinSearchUrl(recipe.name, recipe.video_search_keyword)} target="_blank" rel="noopener noreferrer"><Search className="h-4 w-4" />在抖音搜索做法<ExternalLink className="h-3.5 w-3.5" /></a>
              </Button>
            </div>

            <section>
              <h3 className="text-sm font-semibold text-foreground">食材</h3>
              {ingredients.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {ingredients.map((ingredient, index) => <span key={`${ingredient.normalized_name}-${index}`} className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground">{ingredientLabel(ingredient)}</span>)}
                </div>
              ) : <p className="mt-2 text-sm text-muted-foreground">暂无食材信息。</p>}
            </section>

            {(recipe.seasonings || []).length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-foreground">调味料</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(recipe.seasonings || []).map((item, index) => <span key={`${item.normalized_name}-${index}`} className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground">{ingredientLabel(item)}</span>)}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-foreground">做法步骤</h3>
              {steps.length > 0 ? (
                <ol className="mt-2 space-y-2">
                  {steps.map((step, index) => <li key={`${index}-${step}`} className="rounded-md bg-muted px-3 py-2 text-sm leading-6 text-foreground">{index + 1}. {step}</li>)}
                </ol>
              ) : <p className="mt-2 text-sm text-muted-foreground">暂无做法步骤。</p>}
            </section>

            <RecipeQuestionPanel recipe={recipe} dinersCount={recipe.servings} />
          </div>
        </div>
      </aside>
    </div>
  );
}
