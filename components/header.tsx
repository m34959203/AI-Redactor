"use client"

import { BookOpen, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"

interface HeaderProps {
  articleCount: number
}

export function Header({ articleCount }: HeaderProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark")
    setTheme(isDark ? "dark" : "light")
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light"
    setTheme(newTheme)
    document.documentElement.classList.toggle("dark")
  }

  return (
    <header className="glass-effect-strong rounded-xl p-6 ai-glow animate-in slide-in-from-top duration-500">
      <div className="flex items-center justify-between flex-wrap gap-6">
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-accent to-primary rounded-xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity neural-pulse" />
            <div className="relative bg-gradient-to-br from-primary via-accent to-primary p-3.5 rounded-xl shadow-2xl">
              <BookOpen className="w-7 h-7 text-primary-foreground" />
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-foreground mb-0.5 tracking-tight">AI Scientific Journal Editor</h1>
            <p className="text-sm text-muted-foreground">Powered by artificial intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-lg opacity-0 group-hover:opacity-20 transition-opacity blur-sm" />
            <div className="relative px-4 py-2 rounded-lg bg-secondary/50 border border-border/50 backdrop-blur-sm">
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {articleCount}
              </span>
              <span className="ml-2 text-xs text-muted-foreground font-medium">Articles</span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-lg hover:bg-secondary/80 h-10 w-10 backdrop-blur-sm"
          >
            {theme === "light" ? (
              <Moon className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Sun className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>
    </header>
  )
}
