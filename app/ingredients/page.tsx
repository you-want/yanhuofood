"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import { AlertTriangle, CheckSquare2, ChevronDown, Clipboard, ClipboardList, Download, FileImage, Home, PackageCheck, Share2, ShoppingBasket, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trackProductEvent } from "@/lib/analytics/client";
import { addDaysToDate, getMenuEndDate, getMenuStartDate } from "@/lib/domain/menu";
import { mergeMenuRecords, readLocalMenus, type LocalMenuRecord } from "@/lib/local-menus";
import type { Menu } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Ingredient {
  key?: string;
  name: string;
  quantity: string;
  purchaseQuantity: string;
  category: string;
  wasteRate: number;
  bufferRate: number;
  reason: string;
  mergeWarning?: string;
}

interface MenuOption {
  value: string;
  label: string;
}

type ItemState = "pending" | "purchased" | "owned";

interface ShoppingStatePayload {
  menu_fingerprint?: string;
  item_states?: Record<string, ItemState>;
  collapsed_categories?: string[];
}

const LOCAL_SHOPPING_STATE_KEY = "yanhuofood.shoppingListState";

function itemKey(item: Ingredient) {
  return item.key || `${item.category}:${item.name}`;
}

function readLocalShoppingStates(): Record<string, ShoppingStatePayload> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_SHOPPING_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalShoppingState(key: string, state: ShoppingStatePayload) {
  if (typeof window === "undefined") return;
  const all = readLocalShoppingStates();
  all[key] = state;
  window.localStorage.setItem(LOCAL_SHOPPING_STATE_KEY, JSON.stringify(all));
}

function readLocalShoppingState(key: string) {
  return readLocalShoppingStates()[key] || null;
}

function menuDays(menu?: Menu | null) {
  return menu?.days?.filter((day) => day.date).map((day) => day.date as string) || [];
}

export default function IngredientsPage() {
  const exportRef = useRef<HTMLDivElement>(null);
  const itemStatesRef = useRef<Record<string, ItemState>>({});
  const [selectedMenu, setSelectedMenu] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [localMenus, setLocalMenus] = useState<LocalMenuRecord[]>([]);
  const [trackedListKey, setTrackedListKey] = useState<string | null>(null);
  const [stateLoadedKey, setStateLoadedKey] = useState<string | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [diffNoticeDismissed, setDiffNoticeDismissed] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [sampleProcurementConfirmed, setSampleProcurementConfirmed] = useState(false);

  const updateItemStates = (next: Record<string, ItemState>) => {
    itemStatesRef.current = next;
    setItemStates(next);
  };

  useEffect(() => {
    setLocalMenus(readLocalMenus());
  }, []);

  const menus = useQuery({
    queryKey: ["menus"],
    retry: 1,
    queryFn: async () => {
      const res = await fetch("/api/menus/generate");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || "读取菜单失败");
      return data;
    },
  });

  const serverMenus = (menus.data?.menus || []) as LocalMenuRecord[];
  const allMenus = mergeMenuRecords(serverMenus, localMenus);
  const menuFingerprint = allMenus.map((m) => `${m.start_date || getMenuStartDate(m.data)}:${m.updated_at || ""}`).join("|");
  const targetMenu = allMenus.find((m) => (m.start_date || getMenuStartDate(m.data)) === selectedMenu);
  const targetMenuData = targetMenu?.data || null;
  const isSampleMenu = targetMenu?.source === "sample";
  const procurementBlocked = isSampleMenu && !sampleProcurementConfirmed;
  const availableDates = menuDays(targetMenuData);
  const targetMenuStart = targetMenuData ? getMenuStartDate(targetMenuData) : "";
  const targetMenuEnd = targetMenuData ? getMenuEndDate(targetMenuData) : "";
  const effectiveDateFrom = dateFrom || availableDates[0] || selectedMenu || "";
  const effectiveDateTo = dateTo || availableDates[availableDates.length - 1] || targetMenuEnd;
  const shoppingStateKey = selectedMenu && effectiveDateFrom && effectiveDateTo
    ? `${selectedMenu}:${effectiveDateFrom}:${effectiveDateTo}`
    : "";

  const ingredients = useQuery({
    queryKey: ["ingredients", selectedMenu, effectiveDateFrom, effectiveDateTo, menuFingerprint, sampleProcurementConfirmed],
    queryFn: async () => {
      if (!targetMenu?.data) {
        return { ingredients: [], grouped: {}, total: 0 };
      }

      const res = await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu: targetMenu.data, date_from: effectiveDateFrom, date_to: effectiveDateTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || "生成采购清单失败");
      return data;
    },
    enabled: !!selectedMenu && !!effectiveDateFrom && !!effectiveDateTo && !procurementBlocked,
  });

  const shoppingState = useQuery({
    queryKey: ["shopping-list-state", shoppingStateKey],
    enabled: !!shoppingStateKey && !procurementBlocked,
    queryFn: async () => {
      const params = new URLSearchParams({
        menu_start: selectedMenu || "",
        date_from: effectiveDateFrom,
        date_to: effectiveDateTo,
      });
      const res = await fetch(`/api/ingredients/state?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || "读取采购状态失败");
      return data;
    },
  });

  const allIngredients = useMemo(() => (ingredients.data?.ingredients || []) as Ingredient[], [ingredients.data?.ingredients]);
  const total = ingredients.data?.total || allIngredients.length;
  const grouped = (ingredients.data?.grouped || {}) as Record<string, Ingredient[]>;
  const listFingerprint = allIngredients.map((item) => `${itemKey(item)}=${item.quantity}`).join("|");
  const purchasedCount = allIngredients.filter((item) => itemStates[itemKey(item)] === "purchased").length;
  const ownedCount = allIngredients.filter((item) => itemStates[itemKey(item)] === "owned").length;
  const actionableItems = allIngredients.filter((item) => itemStates[itemKey(item)] !== "owned");
  const pendingItems = actionableItems.filter((item) => itemStates[itemKey(item)] !== "purchased");
  const allChecked = actionableItems.length > 0 && actionableItems.every((item) => itemStates[itemKey(item)] === "purchased");
  const savedKeys = Object.keys(itemStates);
  const currentKeys = new Set(allIngredients.map(itemKey));
  const addedCount = allIngredients.filter((item) => !savedKeys.includes(itemKey(item))).length;
  const removedCount = savedKeys.filter((key) => !currentKeys.has(key)).length;
  const hasListDiff = !!savedFingerprint && savedFingerprint !== listFingerprint && !diffNoticeDismissed;

  useEffect(() => {
    if (!selectedMenu || !targetMenuStart || !targetMenuEnd) return;
    setDateFrom(targetMenuStart);
    setDateTo(targetMenuEnd);
    setDiffNoticeDismissed(false);
  }, [selectedMenu, targetMenuEnd, targetMenuStart]);

  useEffect(() => {
    if (!shoppingStateKey || stateLoadedKey === shoppingStateKey) return;
    const localState = readLocalShoppingState(shoppingStateKey);
    if (!localState && !shoppingState.isFetched) return;
    const remoteState = shoppingState.data?.state as ShoppingStatePayload | null | undefined;
    const state = localState || remoteState || {};
    updateItemStates(state.item_states || {});
    setCollapsedCategories(new Set(state.collapsed_categories || []));
    setSavedFingerprint(state.menu_fingerprint || "");
    setDiffNoticeDismissed(false);
    setStateLoadedKey(shoppingStateKey);
  }, [shoppingState.data?.state, shoppingState.isFetched, shoppingStateKey, stateLoadedKey]);

  useEffect(() => {
    if (!selectedMenu || ingredients.isLoading || total === 0) return;
    const key = `${selectedMenu}:${total}`;
    if (trackedListKey === key) return;
    const targetMenu = allMenus.find((m) => (m.start_date || getMenuStartDate(m.data)) === selectedMenu);
    trackProductEvent("shopping_list_viewed", {
      menu_id: targetMenu?.id || selectedMenu,
      date_range: selectedMenu,
      item_count: total,
    });
    setTrackedListKey(key);
  }, [allMenus, ingredients.isLoading, selectedMenu, total, trackedListKey]);

  const persistState = (nextStates: Record<string, ItemState>, nextCollapsed = collapsedCategories, fingerprint = listFingerprint) => {
    if (!shoppingStateKey || !selectedMenu) return;
    const payload: ShoppingStatePayload = {
      menu_fingerprint: fingerprint,
      item_states: nextStates,
      collapsed_categories: Array.from(nextCollapsed),
    };
    writeLocalShoppingState(shoppingStateKey, payload);
    setSavedFingerprint(fingerprint);
    fetch("/api/ingredients/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_start: selectedMenu,
        date_from: effectiveDateFrom,
        date_to: effectiveDateTo,
        ...payload,
      }),
      keepalive: true,
    }).catch(() => {
      // Local storage remains the fallback source of truth.
    });
  };

  const setItemState = (item: Ingredient, status: ItemState) => {
    const key = itemKey(item);
    const next = { ...itemStatesRef.current, [key]: status };
    updateItemStates(next);
    persistState(next);
    trackProductEvent("shopping_item_updated", {
      status,
      category: item?.category || "unknown",
    });
  };

  const toggleItem = (item: Ingredient) => {
    const current = itemStates[itemKey(item)] || "pending";
    setItemState(item, current === "purchased" ? "pending" : "purchased");
  };

  const toggleAll = () => {
    if (allChecked) {
      const next = { ...itemStates };
      for (const item of actionableItems) next[itemKey(item)] = "pending";
      updateItemStates(next);
      persistState(next);
      trackProductEvent("shopping_item_updated", { status: "bulk_unchecked", category: "all" });
    } else {
      const next = { ...itemStates };
      for (const item of actionableItems) next[itemKey(item)] = "purchased";
      updateItemStates(next);
      persistState(next);
      trackProductEvent("shopping_item_updated", { status: "bulk_checked", category: "all" });
    }
  };

  const selectAll = () => {
    const next = { ...itemStates };
    for (const item of actionableItems) next[itemKey(item)] = "purchased";
    updateItemStates(next);
    persistState(next);
    trackProductEvent("shopping_item_updated", { status: "bulk_checked", category: "all" });
  };

  const clearAll = () => {
    const next = { ...itemStates };
    for (const item of actionableItems) next[itemKey(item)] = "pending";
    updateItemStates(next);
    persistState(next);
    trackProductEvent("shopping_item_updated", { status: "bulk_unchecked", category: "all" });
  };

  const toggleCategory = (category: string) => {
    const categoryItems = grouped[category] || [];
    const categoryKeys = categoryItems.filter((item) => itemStates[itemKey(item)] !== "owned").map(itemKey);
    const allCategoryChecked = categoryKeys.every((key) => itemStates[key] === "purchased");
    const next = { ...itemStates };
    if (allCategoryChecked) {
      for (const key of categoryKeys) next[key] = "pending";
      trackProductEvent("shopping_item_updated", { status: "category_unchecked", category });
    } else {
      for (const key of categoryKeys) next[key] = "purchased";
      trackProductEvent("shopping_item_updated", { status: "category_checked", category });
    }
    updateItemStates(next);
    persistState(next);
  };

  const handleDownload = () => {
    const items = ingredients.data?.ingredients || [];
    const rows = ["名称,菜谱用量,建议采购量,分类,损耗比例,备量比例,说明"];
    for (const item of items) {
      rows.push([
        item.name,
        item.quantity,
        item.purchaseQuantity,
        item.category,
        `${Math.round((item.wasteRate || 0) * 100)}%`,
        `${Math.round((item.bufferRate || 0) * 100)}%`,
        item.reason,
      ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `食材清单_${selectedMenu}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    trackProductEvent("shopping_list_exported", { format: "csv" });
  };

  const handleDownloadImage = async () => {
    if (!exportRef.current) return;
    const dataUrl = await toPng(exportRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `食材清单_${selectedMenu}.png`;
    a.click();
    trackProductEvent("shopping_list_exported", { format: "png" });
  };

  const shoppingText = () => {
    const lines = [`食材清单 ${effectiveDateFrom} ~ ${effectiveDateTo}`];
    for (const [category, items] of Object.entries(grouped)) {
      const visibleItems = items.filter((item) => itemStates[itemKey(item)] !== "owned");
      if (!visibleItems.length) continue;
      lines.push("", `【${category}】`);
      for (const item of visibleItems) {
        const status = itemStates[itemKey(item)] === "purchased" ? "已买" : "待买";
        lines.push(`- [${status}] ${item.name}：${item.purchaseQuantity}`);
      }
    }
    if (ownedCount > 0) lines.push("", `家中已有：${ownedCount} 项已排除`);
    return lines.join("\n");
  };

  const handleCopyText = async () => {
    await navigator.clipboard.writeText(shoppingText());
    setCopyMessage("已复制清单文本。");
    trackProductEvent("shopping_list_exported", { format: "copy_text" });
  };

  const handleShare = async () => {
    const text = shoppingText();
    if (navigator.share) {
      await navigator.share({ title: "食材清单", text });
      trackProductEvent("shopping_list_exported", { format: "system_share" });
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopyMessage("当前浏览器不支持系统分享，已复制清单文本。");
    trackProductEvent("shopping_list_exported", { format: "copy_text" });
  };

  const setQuickRange = (days: number) => {
    if (!targetMenuData) return;
    const start = getMenuStartDate(targetMenuData);
    const end = getMenuEndDate(targetMenuData);
    setDateFrom(start);
    setDateTo(addDaysToDate(start, Math.min(days, targetMenuData.days.length) - 1) > end ? end : addDaysToDate(start, Math.min(days, targetMenuData.days.length) - 1));
    setStateLoadedKey(null);
    setDiffNoticeDismissed(false);
  };

  const toggleCollapseCategory = (category: string) => {
    const next = new Set(collapsedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setCollapsedCategories(next);
    persistState(itemStates, next);
  };

  const confirmListUpdate = () => {
    const next = Object.fromEntries(
      Object.entries(itemStates).filter(([key]) => currentKeys.has(key))
    ) as Record<string, ItemState>;
    updateItemStates(next);
    setDiffNoticeDismissed(true);
    persistState(next, collapsedCategories, listFingerprint);
  };

  const menuOptions: MenuOption[] =
    allMenus.map((m) => ({
      value: m.start_date || getMenuStartDate(m.data),
      label: `${getMenuStartDate(m.data)} ~ ${getMenuEndDate(m.data)} 菜单${m.source === "sample" ? "（通用样例）" : ""}`,
    }));

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
    >
      <PageHeader
        eyebrow={<><Badge>采购准备</Badge>{selectedMenu && <Badge variant="secondary">{purchasedCount}/{actionableItems.length} 已采购</Badge>}</>}
        title="食材清单"
        description="从已生成的菜单里提取食材，按分类勾选采购进度。先选菜单，再按需调整日期范围和采购状态。"
        actions={<div className="flex w-full flex-wrap gap-2 lg:w-auto">
          <Button onClick={selectAll} disabled={!selectedMenu || procurementBlocked || actionableItems.length === 0 || allChecked} variant="secondary">
            <CheckSquare2 className="h-4 w-4" />
            全选
          </Button>
          <Button onClick={clearAll} disabled={!selectedMenu || procurementBlocked || purchasedCount === 0} variant="outline">
            <Square className="h-4 w-4" />
            清空已选
          </Button>
          <Button onClick={handleCopyText} disabled={!selectedMenu || procurementBlocked || actionableItems.length === 0} variant="outline">
            <Clipboard className="h-4 w-4" />
            复制文本
          </Button>
          <Button onClick={handleShare} disabled={!selectedMenu || procurementBlocked || actionableItems.length === 0} variant="outline">
            <Share2 className="h-4 w-4" />
            分享
          </Button>
          <Button onClick={handleDownloadImage} disabled={!selectedMenu || procurementBlocked || total === 0} variant="outline">
            <FileImage className="h-4 w-4" />
            下载图片
          </Button>
          <Button onClick={handleDownload} disabled={!selectedMenu || procurementBlocked || total === 0} variant="outline">
            <Download className="h-4 w-4" />
            下载 CSV
          </Button>
        </div>}
      />

      {selectedMenu ? (
        <Card className="mb-5 overflow-hidden border-primary/20">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">采购进度</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{purchasedCount} / {actionableItems.length || 0} 项已采购</p>
              </div>
              <p className="text-sm text-muted-foreground">{ownedCount ? `${ownedCount} 项家中已有` : "勾选已买食材，清单会自动保存"}</p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={actionableItems.length || 0} aria-valuenow={purchasedCount}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${actionableItems.length ? Math.round((purchasedCount / actionableItems.length) * 100) : 0}%` }} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              选择菜单
            </CardTitle>
            <CardDescription>选择一个历史菜单来生成采购清单。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>菜单周期</Label>
              <SelectNative
                value={selectedMenu || ""}
                onChange={(e) => {
                  const nextMenu = e.target.value || null;
                  setSelectedMenu(nextMenu);
                  setSampleProcurementConfirmed(false);
                  updateItemStates({});
                  setCollapsedCategories(new Set());
                  setStateLoadedKey(null);
                  setSavedFingerprint("");
                  setDiffNoticeDismissed(false);
                }}
              >
                <option value="">请选择菜单</option>
                {menuOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectNative>
            </div>

            {isSampleMenu && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning" role="alert">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold">这是通用样例菜单，采购清单默认已暂停</p>
                      <p className="mt-1 text-warning">样例可能未完整遵循忌口、清真、人数和份量要求。请优先回到菜单页重新生成；只有人工核对后才继续采购。</p>
                    </div>
                    <label htmlFor="confirm-sample-procurement" className="flex cursor-pointer items-start gap-2 font-medium">
                      <Checkbox
                        id="confirm-sample-procurement"
                        checked={sampleProcurementConfirmed}
                        onCheckedChange={(checked) => setSampleProcurementConfirmed(checked === true)}
                      />
                      <span>我已逐项核对样例菜单，仍要生成采购清单</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {selectedMenu && targetMenuData && !procurementBlocked && (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>采购开始日期</Label>
                    <SelectNative
                      value={effectiveDateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        if (effectiveDateTo && e.target.value > effectiveDateTo) setDateTo(e.target.value);
                        setStateLoadedKey(null);
                        setDiffNoticeDismissed(false);
                      }}
                    >
                      {availableDates.map((date) => <option key={date} value={date}>{date}</option>)}
                    </SelectNative>
                  </div>
                  <div className="grid gap-2">
                    <Label>采购结束日期</Label>
                    <SelectNative
                      value={effectiveDateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        if (effectiveDateFrom && e.target.value < effectiveDateFrom) setDateFrom(e.target.value);
                        setStateLoadedKey(null);
                        setDiffNoticeDismissed(false);
                      }}
                    >
                      {availableDates.map((date) => <option key={date} value={date}>{date}</option>)}
                    </SelectNative>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuickRange(2)}>未来 2 天</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuickRange(3)}>未来 3 天</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuickRange(targetMenuData.days.length)}>整段菜单</Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-primary/10 p-3">
                <p className="text-xs text-primary">待采购</p>
                <p className="mt-1 text-2xl font-semibold text-primary">{pendingItems.length}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">已买 / 已有</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{purchasedCount}/{ownedCount}</p>
              </div>
            </div>
            {copyMessage && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{copyMessage}</p>}

            {!selectedMenu && (
              <div className="rounded-lg border border-dashed border-input bg-muted px-4 py-8 text-center">
                <ShoppingBasket className="mx-auto h-7 w-7 text-primary" />
                <p className="mt-3 text-sm font-medium text-foreground">先选择一个菜单</p>
                <p className="mt-1 text-sm text-muted-foreground">系统会根据菜单里的菜品汇总需要采购的食材。</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              采购列表
            </CardTitle>
            <CardDescription>{selectedMenu ? "点击条目即可切换勾选状态，支持全选和分类选择。" : "等待选择菜单后生成。"}</CardDescription>
          </CardHeader>
          <CardContent>
            {procurementBlocked && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-6 text-sm text-warning">
                采购清单尚未生成。请先核对样例菜单并在左侧明确确认，或返回菜单页重新生成个性化 AI 菜单。
              </div>
            )}

            {selectedMenu && !procurementBlocked && ingredients.isError && (
              <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-5 text-sm text-destructive">
                <p>采购清单生成失败：{ingredients.error instanceof Error ? ingredients.error.message : "未知错误"}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => ingredients.refetch()}>重新生成采购清单</Button>
              </div>
            )}

            {selectedMenu && !procurementBlocked && ingredients.isLoading && (
              <div className="space-y-4" aria-label="采购清单加载中">
                <Skeleton className="h-12 w-full" />
                {Array.from({ length: 3 }).map((_, groupIndex) => (
                  <div key={groupIndex} className="space-y-2">
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ))}
              </div>
            )}

            {selectedMenu && !procurementBlocked && !ingredients.isLoading && !ingredients.isError && total === 0 && (
              <p className="rounded-lg border border-border bg-muted px-4 py-6 text-sm text-muted-foreground">该菜单暂无可用的食材数据。</p>
            )}

            {selectedMenu && !procurementBlocked && !ingredients.isLoading && total > 0 && (
              <div ref={exportRef} className="space-y-5 bg-card p-1">
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
                  建议采购量已按食材类别加入损耗和少量备量。实际购买时仍需结合家中库存、食材大小和包装规格调整。
                </div>
                {hasListDiff && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p>菜单或日期范围已变化：新增 {addedCount} 项，移除 {removedCount} 项。确认后会保留仍存在食材的状态。</p>
                      <Button type="button" size="sm" variant="outline" onClick={confirmListUpdate} className="bg-card">
                        确认更新清单
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleAll}
                    className="mt-0"
                  />
                  <Label className="cursor-pointer text-sm font-medium text-foreground" onClick={toggleAll}>
                    {allChecked ? "取消全选" : "全选"}
                    <span className="ml-1 text-muted-foreground font-normal">({purchasedCount}/{actionableItems.length})</span>
                  </Label>
                  {ownedCount > 0 && <Badge variant="outline">家中已有 {ownedCount} 项已排除</Badge>}
                </div>
                {Object.entries(grouped).map(([category, items]) => {
                  const categoryVisibleItems = items.filter((item) => itemStates[itemKey(item)] !== "owned");
                  const categoryChecked = categoryVisibleItems.length > 0 && categoryVisibleItems.every((item) => itemStates[itemKey(item)] === "purchased");
                  const collapsed = collapsedCategories.has(category);
                  return (
                    <div key={category}>
                      <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={categoryChecked}
                            onCheckedChange={() => toggleCategory(category)}
                            className="mt-0"
                          />
                          <h3 className="cursor-pointer font-medium text-foreground" onClick={() => toggleCategory(category)}>{category}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{categoryVisibleItems.length}/{items.length} 项</Badge>
                          <button
                            type="button"
                            onClick={() => toggleCollapseCategory(category)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                            aria-label={collapsed ? "展开分类" : "折叠分类"}
                          >
                            <ChevronDown className={cn("h-4 w-4 transition", collapsed && "-rotate-90")} />
                          </button>
                        </div>
                      </div>
                      {!collapsed && <ul className="space-y-1">
                        {items.map((item) => {
                          const key = itemKey(item);
                          const state = itemStates[key] || "pending";
                          const checked = state === "purchased";
                          const owned = state === "owned";
                          return (
                            <li
                              key={key}
                              onClick={() => !owned && toggleItem(item)}
                              className={cn(
                                "grid gap-2 rounded-lg px-3 py-3 transition sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3",
                                owned ? "bg-muted text-muted-foreground" : checked ? "cursor-pointer bg-primary/10 text-muted-foreground" : "cursor-pointer hover:bg-muted"
                              )}
                            >
                              <Checkbox
                                className="mt-0.5 sm:mt-0"
                                checked={checked}
                                disabled={owned}
                                onCheckedChange={() => toggleItem(item)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={cn("text-sm font-semibold text-foreground", (checked || owned) && "line-through text-muted-foreground")}>{item.name}</span>
                                  <Badge variant="outline">
                                    多备 {Math.round(((item.wasteRate || 0) + (item.bufferRate || 0)) * 100)}%
                                  </Badge>
                                  {owned && <Badge variant="secondary">家中已有</Badge>}
                                </div>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.reason}</p>
                                {item.mergeWarning && <p className="mt-1 text-xs leading-5 text-warning">{item.mergeWarning}</p>}
                              </div>
                              <div className="grid gap-1 text-sm sm:min-w-40 sm:text-right">
                                <span className="text-muted-foreground">菜谱用量：{item.quantity}</span>
                                <span className={cn("font-medium text-primary", owned && "text-muted-foreground")}>
                                  {owned ? "已从待采购排除" : `建议采购：${item.purchaseQuantity}`}
                                </span>
                                <div className="flex flex-wrap gap-1 sm:justify-end">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setItemState(item, owned ? "pending" : "owned");
                                    }}
                                    className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs text-muted-foreground hover:border-primary/30 hover:text-primary"
                                  >
                                    <Home className="h-3 w-3" />
                                    {owned ? "恢复采购" : "家中已有"}
                                  </button>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </motion.main>
  );
}
