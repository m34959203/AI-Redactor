import { SpellCheck, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SpellingTab() {
  return (
    <div className="glass-effect-strong rounded-2xl p-12 organic-shadow animate-in fade-in duration-500">
      <div className="text-center space-y-8 max-w-xl mx-auto">
        <div className="inline-flex p-8 bg-gradient-to-br from-accent/10 to-accent/5 rounded-3xl">
          <SpellCheck className="w-20 h-20 text-accent" />
        </div>

        <div className="space-y-3">
          <h2 className="text-3xl font-serif font-bold text-foreground">AI-проверка орфографии</h2>
          <p className="text-muted-foreground leading-relaxed text-lg">
            Автоматическая проверка орфографии и грамматики во всех загруженных статьях
          </p>
        </div>

        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-destructive/10 border-2 border-destructive/20">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <span className="text-base font-semibold text-destructive">3 ошибки найдено</span>
        </div>

        <Button
          size="lg"
          className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity h-14 px-8 text-base rounded-xl shadow-lg shadow-primary/20"
        >
          Начать проверку
        </Button>
      </div>
    </div>
  )
}
