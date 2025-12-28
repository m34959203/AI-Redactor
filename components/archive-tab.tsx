import { Archive, Calendar } from "lucide-react"

export function ArchiveTab() {
  return (
    <div className="glass-effect-strong rounded-2xl p-12 organic-shadow animate-in fade-in duration-500">
      <div className="text-center space-y-8 max-w-xl mx-auto">
        <div className="inline-flex p-8 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl">
          <Archive className="w-20 h-20 text-primary" />
        </div>

        <div className="space-y-3">
          <h2 className="text-3xl font-serif font-bold text-foreground">Архив выпусков</h2>
          <p className="text-muted-foreground leading-relaxed text-lg">История всех созданных выпусков журнала</p>
        </div>

        <div className="flex items-center justify-center gap-3 px-5 py-3 rounded-full bg-muted text-muted-foreground">
          <Calendar className="w-5 h-5" />
          <span className="text-base">Архив пуст</span>
        </div>
      </div>
    </div>
  )
}
