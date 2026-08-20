export function buildDouyinSearchUrl(name: string, keyword?: string | null) {
  const searchKeyword = keyword?.trim() || `${name.trim()} 做法`;
  return `https://www.douyin.com/search/${encodeURIComponent(searchKeyword)}`;
}
