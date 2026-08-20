"use client";

import { Ban, Check, Copy, Heart, MapPin, Navigation, Star, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  NearbyPlaceFeedbackValue,
  NearbyRecommendation,
} from "@/lib/places/types";

interface NearbyPlaceCardProps {
  recommendation: NearbyRecommendation;
  highlighted?: boolean;
  feedback?: NearbyPlaceFeedbackValue;
  onChoose: (recommendation: NearbyRecommendation) => void;
  onFeedback: (recommendation: NearbyRecommendation, value: NearbyPlaceFeedbackValue) => void;
  onCopy: (name: string) => void;
}

function formatDistance(distanceM: number) {
  return distanceM < 1_000 ? `${distanceM} 米` : `${(distanceM / 1_000).toFixed(1)} 公里`;
}

export function NearbyPlaceCard({
  recommendation,
  highlighted = false,
  feedback,
  onChoose,
  onFeedback,
  onCopy,
}: NearbyPlaceCardProps) {
  const { place } = recommendation;
  const navigationUrl = `https://uri.amap.com/marker?position=${place.location.longitude},${place.location.latitude}&name=${encodeURIComponent(place.name)}&src=yanhuofood&coordinate=gaode&callnative=1`;

  return (
    <Card className={highlighted ? "border-primary ring-2 ring-ring" : ""}>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {highlighted ? <Badge>本次推荐</Badge> : null}
              {place.categoryName ? <Badge variant="secondary">{place.categoryName}</Badge> : null}
              <Badge variant="outline">匹配 {Math.round(recommendation.score)} 分</Badge>
            </div>
            <CardTitle className="text-lg leading-6">{place.name}</CardTitle>
          </div>
          <Store className="h-5 w-5 shrink-0 text-primary" />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {formatDistance(place.distanceM)}
          </span>
          {place.rating !== undefined ? (
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-warning text-warning" />
              {place.rating.toFixed(1)}
            </span>
          ) : null}
          {place.averageCost !== undefined ? <span>人均约 ¥{Math.round(place.averageCost)}</span> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 text-sm leading-6 text-foreground">
          {place.address ? <p>{place.address}</p> : <p className="text-muted-foreground">暂无详细地址</p>}
          {place.openingHours ? <p className="text-muted-foreground">营业时间：{place.openingHours}</p> : null}
        </div>

        <div className="rounded-md bg-primary/10 px-3 py-2.5">
          <p className="text-xs font-semibold text-primary">推荐依据</p>
          <p className="mt-1 text-sm leading-6 text-primary">
            {recommendation.reasons.join("；") || "来自当前位置附近的真实餐饮门店"}
          </p>
        </div>

        {recommendation.warnings.length ? (
          <ul className="space-y-1 text-xs leading-5 text-warning">
            {recommendation.warnings.slice(0, 2).map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button onClick={() => onChoose(recommendation)} className="col-span-2 sm:col-span-1">
            <Check className="h-4 w-4" />
            就吃这家
          </Button>
          <Button variant="outline" onClick={() => onCopy(place.name)}>
            <Copy className="h-4 w-4" />
            复制店名
          </Button>
          <Button asChild variant="outline">
            <a href={navigationUrl} target="_blank" rel="noreferrer">
              <Navigation className="h-4 w-4" />
              地图导航
            </a>
          </Button>
          <Button
            variant={feedback === "liked" ? "secondary" : "ghost"}
            onClick={() => onFeedback(recommendation, "liked")}
            aria-label={feedback === "liked" ? `取消喜欢 ${place.name}` : `喜欢 ${place.name}`}
          >
            <Heart className={feedback === "liked" ? "h-4 w-4 fill-rose-500 text-rose-600" : "h-4 w-4"} />
            {feedback === "liked" ? "已喜欢" : "喜欢"}
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onFeedback(recommendation, "blocked")}
          >
            <Ban className="h-4 w-4" />
            不再推荐
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
