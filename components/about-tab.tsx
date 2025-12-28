import { Info, BookOpen } from "lucide-react"

export function AboutTab() {
  return (
    <div className="glass-effect-strong rounded-2xl p-10 organic-shadow animate-in fade-in duration-500">
      <div className="max-w-3xl space-y-8">
        <div className="flex items-center gap-5">
          <div className="p-5 bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl">
            <Info className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground mb-2">О журнале</h2>
            <p className="text-muted-foreground text-lg leading-relaxed">Информация и настройки журнала</p>
          </div>
        </div>

        <div className="p-8 rounded-2xl bg-gradient-to-br from-secondary to-muted border border-border">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-serif font-semibold text-foreground">AI-Редактор научного журнала</h3>
          </div>
          <p className="text-muted-foreground leading-relaxed text-base">
            Современный инструмент для автоматизации процесса создания и редактирования научных журналов с
            использованием искусственного интеллекта для классификации статей, проверки орфографии и генерации рецензий.
          </p>
        </div>
      </div>
    </div>
  )
}
