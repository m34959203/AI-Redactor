"use client"

import { useState } from "react"
import { SpecialPagesSection } from "@/components/special-pages-section"
import { UploadZone } from "@/components/upload-zone"
import { ArticleSection } from "@/components/article-section"
import { Button } from "@/components/ui/button"
import { Download, Sparkles } from "lucide-react"

export function EditorTab() {
  const [articles] = useState([
    {
      id: 1,
      number: 1,
      title: "Применение машинного обучения в анализе больших данных",
      author: "Иванов А.И., Петров П.П.",
      language: "ru" as const,
      status: "classified" as const,
      section: "Технические науки",
    },
    {
      id: 2,
      number: 2,
      title: "Қазіргі білім беру жүйесіндегі инновациялық әдістер",
      author: "Қасымов Н.Қ.",
      language: "kz" as const,
      status: "needs-review" as const,
      section: "Педагогические науки",
    },
    {
      id: 3,
      number: 3,
      title: "Modern approaches to renewable energy systems",
      author: "Smith J., Johnson M.",
      language: "en" as const,
      status: "classified" as const,
      section: "Технические науки",
    },
  ])

  const sections = articles.reduce(
    (acc, article) => {
      if (!acc[article.section]) {
        acc[article.section] = []
      }
      acc[article.section].push(article)
      return acc
    },
    {} as Record<string, typeof articles>,
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <SpecialPagesSection />
      <UploadZone />

      <div className="space-y-5">
        {Object.entries(sections).map(([sectionName, sectionArticles]) => (
          <ArticleSection key={sectionName} sectionName={sectionName} articles={sectionArticles} />
        ))}
      </div>

      <div className="glass-effect-strong rounded-2xl p-8 organic-shadow">
        <Button
          size="lg"
          className="w-full bg-gradient-to-r from-primary via-primary to-accent hover:opacity-90 transition-all duration-300 text-lg font-semibold h-16 group rounded-xl shadow-lg shadow-primary/20"
        >
          <Sparkles className="w-6 h-6 mr-3 group-hover:rotate-180 transition-transform duration-500" />
          Сгенерировать PDF выпуска
          <Download className="w-6 h-6 ml-3 group-hover:translate-y-1 transition-transform duration-300" />
        </Button>
      </div>
    </div>
  )
}
