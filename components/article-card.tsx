"use client"

import { Edit2, Trash2, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Article {
  id: number
  number: number
  title: string
  author: string
  language: "ru" | "kz" | "en"
  status: "classified" | "needs-review" | "processing"
  section: string
}

interface ArticleCardProps {
  article: Article
}

const languageLabels = {
  ru: "RU",
  kz: "KZ",
  en: "EN",
}

const statusLabels = {
  classified: "Классифицировано",
  "needs-review": "Требует проверки",
  processing: "Обработка...",
}

const statusColors = {
  classified: "bg-success/10 text-success border-success/20",
  "needs-review": "bg-warning/10 text-warning border-warning/20",
  processing: "bg-primary/10 text-primary border-primary/20",
}

export function ArticleCard({ article }: ArticleCardProps) {
  const needsAttention = article.status === "needs-review"

  return (
    <div
      className={cn(
        "group relative p-4 rounded-lg border transition-all duration-300 hover:scale-[1.02]",
        needsAttention
          ? "border-warning/40 bg-warning/5 hover:border-warning hover:shadow-lg hover:shadow-warning/20"
          : "border-border/50 bg-card/30 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20 backdrop-blur-sm",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center font-bold text-sm shadow-md",
            needsAttention
              ? "bg-gradient-to-br from-warning to-warning/90 text-warning-foreground"
              : "bg-gradient-to-br from-primary to-accent text-primary-foreground",
          )}
        >
          {article.number}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground text-base mb-1.5 text-balance leading-snug">{article.title}</h4>
          <p className="text-sm text-muted-foreground mb-3">{article.author}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-secondary/50 text-xs font-bold text-foreground border border-border/30 backdrop-blur-sm">
              {languageLabels[article.language]}
            </span>
            <span
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border inline-flex items-center gap-1.5 backdrop-blur-sm",
                statusColors[article.status],
              )}
            >
              <Sparkles className="w-3 h-3" />
              {statusLabels[article.status]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-md hover:bg-primary/20 hover:text-primary">
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-md hover:bg-primary/20 hover:text-primary">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-md hover:bg-destructive/20 hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
