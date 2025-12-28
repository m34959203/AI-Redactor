import { BookOpen } from "lucide-react"
import { ArticleCard } from "@/components/article-card"

interface Article {
  id: number
  number: number
  title: string
  author: string
  language: "ru" | "kz" | "en"
  status: "classified" | "needs-review" | "processing"
  section: string
}

interface ArticleSectionProps {
  sectionName: string
  articles: Article[]
}

export function ArticleSection({ sectionName, articles }: ArticleSectionProps) {
  return (
    <div className="glass-effect-strong rounded-2xl overflow-hidden organic-shadow">
      <div className="bg-gradient-to-r from-primary via-primary to-accent/80 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-serif font-semibold text-white">{sectionName}</h3>
          </div>
          <div className="px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium">
            {articles.length} {articles.length === 1 ? "статья" : "статьи"}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </div>
  )
}
