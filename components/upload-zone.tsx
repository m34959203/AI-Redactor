"use client"

import { useState } from "react"
import { Upload, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false)

  return (
    <div
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
      }}
      className={cn(
        "glass-effect rounded-2xl border-2 border-dashed p-16 transition-all duration-300 cursor-pointer group",
        isDragging
          ? "border-primary bg-primary/10 scale-[1.01] shadow-lg shadow-primary/20"
          : "border-border hover:border-primary/50 hover:bg-primary/5",
      )}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <div
          className={cn(
            "relative p-8 rounded-2xl transition-all duration-300",
            isDragging
              ? "bg-primary/20 scale-110"
              : "bg-gradient-to-br from-secondary to-muted group-hover:from-primary/10 group-hover:to-primary/5",
          )}
        >
          {isDragging && <div className="absolute inset-0 bg-primary/30 rounded-2xl blur-xl animate-pulse" />}
          <Upload
            className={cn(
              "w-14 h-14 relative transition-all duration-300",
              isDragging
                ? "text-primary animate-bounce"
                : "text-muted-foreground group-hover:text-primary group-hover:scale-110",
            )}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-2xl font-serif font-semibold text-foreground">
            {isDragging ? "Отпустите файлы здесь" : "Загрузить статьи"}
          </h3>
          <p className="text-muted-foreground leading-relaxed">Перетащите файлы DOCX или нажмите для выбора</p>
          <p className="text-sm text-muted-foreground">Поддерживаются форматы: .docx, .doc</p>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 text-sm text-muted-foreground">
          <FileText className="w-4 h-4" />
          <span>AI автоматически классифицирует статьи</span>
        </div>
      </div>
    </div>
  )
}
