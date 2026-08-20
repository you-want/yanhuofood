"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Edit3, Eye, Plus, RotateCw, Search, Soup, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { RecipeDetailDialog } from "@/components/RecipeDetailDialog";
import { RecipeImage } from "@/components/RecipeImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Recipe } from "@/lib/types";

interface RecipeFormData {
  name: string;
  cuisine: string;
  calories: number;
  ingredients: string;
  instructions: string;
  tags: string;
  image_url: string;
  video_url: string;
  video_search_keyword: string;
}

const CUISINES = ["中式", "西式", "日式", "韩式", "东南亚", "其他"];

function splitTags(value: string) {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

async function readApiResponse(response: Response, fallbackMessage: string) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || fallbackMessage);
  }
  return data;
}

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : null;
}

export default function RecipesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [formData, setFormData] = useState<RecipeFormData>({
    name: "",
    cuisine: "中式",
    calories: 0,
    ingredients: "",
    instructions: "",
    tags: "",
    image_url: "",
    video_url: "",
    video_search_keyword: "",
  });
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("全部");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["recipes"],
    retry: 1,
    queryFn: async () => {
      const res = await fetch("/api/recipes");
      return readApiResponse(res, "读取食谱失败");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      cuisine: "中式",
      calories: 0,
      ingredients: "",
      instructions: "",
      tags: "",
      image_url: "",
      video_url: "",
      video_search_keyword: "",
    });
    setEditingRecipe(null);
    setShowForm(false);
  };

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          cuisine: formData.cuisine,
          calories: formData.calories,
          ingredients: splitTags(formData.ingredients),
          instructions: formData.instructions,
          tags: splitTags(formData.tags),
          image_url: formData.image_url,
          video_url: formData.video_url,
          video_search_keyword: formData.video_search_keyword,
        }),
      });
      return readApiResponse(res, "新增食谱失败");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      resetForm();
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/recipes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRecipe!.id,
          name: formData.name,
          cuisine: formData.cuisine,
          calories: formData.calories,
          ingredients: splitTags(formData.ingredients),
          instructions: formData.instructions,
          tags: splitTags(formData.tags),
          image_url: formData.image_url,
          video_url: formData.video_url,
          video_search_keyword: formData.video_search_keyword,
        }),
      });
      return readApiResponse(res, "更新食谱失败");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      resetForm();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/recipes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      return readApiResponse(res, "删除食谱失败");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const handleEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setFormData({
      name: recipe.name,
      cuisine: recipe.cuisine,
      calories: recipe.calories,
      ingredients: (recipe.ingredients || []).join(", "),
      instructions: recipe.instructions || "",
      tags: (recipe.tags || []).join(", "),
      image_url: recipe.image_url || "",
      video_url: recipe.video_url || "",
      video_search_keyword: recipe.video_search_keyword || "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (editingRecipe) {
      update.mutate();
    } else {
      create.mutate();
    }
  };

  const recipes = useMemo(() => data?.recipes || [], [data?.recipes]);
  const visibleRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return recipes.filter((recipe: Recipe) => {
      const matchesCuisine = cuisineFilter === "全部" || recipe.cuisine === cuisineFilter;
      if (!query) return matchesCuisine;
      const haystack = [recipe.name, recipe.cuisine, ...(recipe.tags || []), ...(recipe.ingredients || [])].join(" ").toLowerCase();
      return matchesCuisine && haystack.includes(query);
    });
  }, [cuisineFilter, recipes, searchQuery]);
  const formError = mutationError(editingRecipe ? update.error : create.error);
  const removeError = mutationError(remove.error);

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
    >
      <PageHeader
        eyebrow={<><Badge>食谱资产</Badge>{!isLoading && <Badge variant="secondary">{recipes.length} 道食谱</Badge>}</>}
        title="食谱库"
        description="维护可复用菜品，后续可用于菜单生成、今日推荐和个人偏好沉淀。"
        actions={
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            添加食谱
          </Button>
        }
      />

      <Card className="mb-5 border-border/80 bg-card/80">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索菜名、食材或标签"
              aria-label="搜索食谱"
              className="pl-9 pr-9"
            />
            {searchQuery ? (
              <button type="button" onClick={() => setSearchQuery("")} aria-label="清除搜索" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <SelectNative value={cuisineFilter} onChange={(event) => setCuisineFilter(event.target.value)} aria-label="按菜系筛选" className="w-full sm:w-32">
              <option value="全部">全部菜系</option>
              {CUISINES.map((cuisine) => <option key={cuisine} value={cuisine}>{cuisine}</option>)}
            </SelectNative>
            <Badge variant="secondary" className="shrink-0">显示 {visibleRecipes.length} 道</Badge>
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="border-primary/20 bg-card">
          <CardHeader>
            <CardTitle>{editingRecipe ? "编辑食谱" : "添加食谱"}</CardTitle>
            <CardDescription>先保存基础信息，后续可以扩展结构化食材、步骤和营养。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>菜名</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="例如：番茄牛腩" />
              </div>
              <div className="grid gap-2">
                <Label>菜系</Label>
                <SelectNative value={formData.cuisine} onChange={(e) => setFormData({ ...formData, cuisine: e.target.value })}>
                  {CUISINES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="grid gap-2">
                <Label>热量 (kcal)</Label>
                <Input type="number" min={0} value={formData.calories} onChange={(e) => setFormData({ ...formData, calories: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>标签</Label>
                <Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} placeholder="例如：家常菜, 炖煮" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>食材</Label>
                <Textarea rows={2} value={formData.ingredients} onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })} placeholder="例如：番茄, 牛腩, 洋葱, 姜" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>做法步骤</Label>
                <Textarea rows={4} value={formData.instructions} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} placeholder={"牛腩焯水并洗净\n炒香配料后加水炖煮\n加入番茄煮至入味"} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="recipe-image-url">菜品图片网址</Label>
                <Input id="recipe-image-url" type="url" value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://example.com/recipe.jpg" />
              </div>
              {formData.image_url && (
                <RecipeImage
                  src={formData.image_url}
                  alt="菜品图片预览"
                  className="aspect-[16/9] w-full max-w-xl rounded-md border border-border sm:col-span-2"
                />
              )}
              <div className="grid gap-2">
                <Label htmlFor="recipe-video-url">制作视频网址</Label>
                <Input id="recipe-video-url" type="url" value={formData.video_url} onChange={(e) => setFormData({ ...formData, video_url: e.target.value })} placeholder="https://www.douyin.com/video/..." />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="recipe-video-keyword">抖音搜索关键词</Label>
                <Input id="recipe-video-keyword" value={formData.video_search_keyword} onChange={(e) => setFormData({ ...formData, video_search_keyword: e.target.value })} placeholder={`${formData.name || "菜名"} 做法`} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
                {create.isPending || update.isPending ? "保存中" : "保存"}
              </Button>
              <Button onClick={resetForm} variant="outline">
                取消
              </Button>
            </div>
            {formError && <p className="mt-3 text-sm text-destructive" role="alert">保存失败：{formError}</p>}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">加载中...</CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/30 bg-destructive/10" role="alert">
          <CardContent className="flex flex-col gap-3 pt-5 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>食谱加载失败：{mutationError(error) || "未知错误"}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
              <RotateCw className="h-4 w-4" />
              重新加载
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {removeError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2 xl:col-span-3" role="alert">
              删除失败：{removeError}
            </div>
          )}
          {recipes.length === 0 && (
            <div className="rounded-xl border border-dashed border-input bg-card/55 px-4 py-16 text-center md:col-span-2 xl:col-span-3">
              <Soup className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-4 text-sm font-medium text-foreground">食谱库还是空的</p>
              <p className="mt-1 text-sm text-muted-foreground">添加常做的菜，后续规划菜单会更贴近你的日常。</p>
            </div>
          )}
          {recipes.length > 0 && visibleRecipes.length === 0 && (
            <div className="rounded-xl border border-dashed border-input bg-card/55 px-4 py-14 text-center md:col-span-2 xl:col-span-3">
              <Search className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-4 text-sm font-medium text-foreground">没有匹配的食谱</p>
              <p className="mt-1 text-sm text-muted-foreground">试试更短的关键词，或清除菜系筛选。</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => { setSearchQuery(""); setCuisineFilter("全部"); }}>清除筛选</Button>
            </div>
          )}
          {visibleRecipes.map((recipe: Recipe) => (
            <Card key={recipe.id} className="overflow-hidden transition hover:border-primary/30 hover:shadow-md">
              {recipe.image_url?.trim() && (
                <button
                  type="button"
                  className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring empty:hidden"
                  onClick={() => setDetailRecipe(recipe)}
                  aria-label={`查看${recipe.name}详情`}
                >
                  <RecipeImage src={recipe.image_url} alt={`${recipe.name}成品图`} className="aspect-[16/9] w-full border-b border-border" />
                </button>
              )}
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <Soup className="h-5 w-5 shrink-0 text-primary" />
                      <span className="break-words">{recipe.name}</span>
                    </CardTitle>
                    <CardDescription>
                      {recipe.cuisine} · {recipe.calories} kcal
                    </CardDescription>
                  </div>
                  {!recipe.is_public && (
                    <div className="flex gap-1">
                      <Button onClick={() => handleEdit(recipe)} variant="ghost" size="icon" aria-label="编辑食谱">
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button onClick={() => remove.mutate(recipe.id)} variant="ghost" size="icon" aria-label="删除食谱">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex h-full flex-col space-y-3">
                {recipe.tags && recipe.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {recipe.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                  <p className="text-sm text-muted-foreground">食材：{recipe.ingredients.join("、")}</p>
                )}
                {recipe.instructions && (
                  <p className="line-clamp-3 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">{recipe.instructions}</p>
                )}
                <Button type="button" variant="outline" className="mt-auto w-full" onClick={() => setDetailRecipe(recipe)}>
                  <Eye className="h-4 w-4" />
                  查看详情
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {detailRecipe && (
        <RecipeDetailDialog recipe={detailRecipe} onClose={() => setDetailRecipe(null)} />
      )}
    </motion.main>
  );
}
