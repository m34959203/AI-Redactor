import { FileText, BookOpen, FileCheck } from "lucide-react"
import { cn } from "@/lib/utils"

const specialPages = [
  { id: "cover", title: "Титульный лист", icon: FileText, uploaded: true },
  { id: "description", title: "Описание журнала", icon: BookOpen, uploaded: true },
  { id: "final", title: "Заключительная страница", icon: FileCheck, uploaded: false },
]

export function SpecialPagesSection() {
  return (
    <div className="glass-effect-strong rounded-2xl p-8 organic-shadow space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-gradient-to-b from-primary to-accent rounded-full" />
        <h2 className="text-xl font-serif font-semibold text-foreground">Специальные страницы</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {specialPages.map((page) => {
          const Icon = page.icon
          return (
            <div
              key={page.id}
              className={cn(
                "group cursor-pointer rounded-xl border-2 p-6 transition-all duration-300 hover:scale-[1.02]",
                page.uploaded
                  ? "border-success/30 bg-success/5 hover:border-success hover:shadow-lg hover:shadow-success/10"
                  : "border-border bg-card hover:border-primary hover:shadow-lg hover:shadow-primary/10",
              )}
            >
              <div className="flex flex-col items-center gap-4 text-center">
                <div
                  className={cn(
                    "p-4 rounded-xl transition-all duration-300 group-hover:scale-110",
                    page.uploaded
                      ? "bg-success/15 text-success"
                      : "bg-secondary text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary",
                  )}
                >
                  <Icon className="w-7 h-7" />
                </div>
                <div>
                  <span
                    className={cn("text-sm font-medium block mb-1", page.uploaded ? "text-success" : "text-foreground")}
                  >
                    {page.title}
                  </span>
                  {page.uploaded && (
                    <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      Загружено
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
