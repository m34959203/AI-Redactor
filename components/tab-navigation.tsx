"use client"

import { FileEdit, SpellCheck, MessageSquare, Archive, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TabType } from "@/app/page"

interface TabNavigationProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  spellingErrorCount?: number
}

const tabs = [
  { id: "editor" as TabType, label: "Редактор", icon: FileEdit },
  { id: "spelling" as TabType, label: "Орфография", icon: SpellCheck },
  { id: "review" as TabType, label: "Рецензия", icon: MessageSquare },
  { id: "archive" as TabType, label: "Архив", icon: Archive },
  { id: "about" as TabType, label: "О журнале", icon: Info },
]

export function TabNavigation({ activeTab, onTabChange, spellingErrorCount }: TabNavigationProps) {
  return (
    <nav className="glass-effect rounded-xl p-1.5 ai-glow animate-in slide-in-from-top duration-500 delay-75">
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex-1 min-w-[130px] relative flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all duration-300",
                isActive
                  ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
              )}
            >
              <Icon className={cn("w-4 h-4 transition-transform duration-300", isActive && "scale-110")} />
              <span className="text-sm">{tab.label}</span>
              {tab.id === "spelling" && spellingErrorCount && spellingErrorCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-xs font-bold shadow-md">
                  {spellingErrorCount}
                </Badge>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
