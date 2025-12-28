"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { TabNavigation } from "@/components/tab-navigation"
import { EditorTab } from "@/components/editor-tab"
import { SpellingTab } from "@/components/spelling-tab"
import { ReviewTab } from "@/components/review-tab"
import { ArchiveTab } from "@/components/archive-tab"
import { AboutTab } from "@/components/about-tab"

export type TabType = "editor" | "spelling" | "review" | "archive" | "about"

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("editor")
  const [articleCount, setArticleCount] = useState(12)
  const [spellingErrorCount] = useState(3)

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Primary glow orb - top right */}
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-primary/20 blur-[120px] neural-pulse" />
        {/* Accent glow orb - left side */}
        <div
          className="absolute top-1/3 -left-40 w-[500px] h-[500px] rounded-full bg-accent/15 blur-[100px] neural-pulse"
          style={{ animationDelay: "1s" }}
        />
        {/* Secondary glow - bottom */}
        <div
          className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/10 blur-[90px] neural-pulse"
          style={{ animationDelay: "2s" }}
        />

        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(oklch(0.62 0.28 265) 1px, transparent 1px), linear-gradient(90deg, oklch(0.62 0.28 265) 1px, transparent 1px)`,
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6 relative z-10">
        <Header articleCount={articleCount} />
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} spellingErrorCount={spellingErrorCount} />

        <div className="animate-in fade-in duration-500">
          {activeTab === "editor" && <EditorTab />}
          {activeTab === "spelling" && <SpellingTab />}
          {activeTab === "review" && <ReviewTab />}
          {activeTab === "archive" && <ArchiveTab />}
          {activeTab === "about" && <AboutTab />}
        </div>
      </div>
    </div>
  )
}
