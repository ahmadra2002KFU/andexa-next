"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Lightbulb, Wrench } from "lucide-react"

const examples = [
  "Summarize the key findings from the attached sales report.",
  "Which product had the highest growth in Q4?",
  "Create a bar chart showing sales by region.",
  "What is the average age of patients by department?",
]

interface WelcomeScreenProps {
  onExampleClick: (text: string) => void
}

export function WelcomeScreen({ onExampleClick }: WelcomeScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 rounded-xl bg-card p-6 shadow-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xl mx-auto">
          A
        </div>
      </div>
      <h2 className="mb-2 text-3xl font-bold">Upload an Excel file to get started</h2>
      <p className="max-w-lg text-muted-foreground">
        Upload an Excel file and chat about it. I can help with analysis, visualizations, and more.
      </p>
      <div className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="cursor-default hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center text-primary">
              <Lightbulb className="h-6 w-6" />
              <h3 className="ml-2 text-lg font-semibold">Examples</h3>
            </div>
            {examples.map((ex) => (
              <p
                key={ex}
                className="mb-3 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => onExampleClick(ex)}
              >
                &ldquo;{ex}&rdquo;
              </p>
            ))}
          </CardContent>
        </Card>
        <Card className="cursor-default hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center text-primary">
              <Wrench className="h-6 w-6" />
              <h3 className="ml-2 text-lg font-semibold">Capabilities</h3>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">Understands complex queries about your data.</p>
            <p className="mb-3 text-sm text-muted-foreground">Can generate charts and visualizations.</p>
            <p className="text-sm text-muted-foreground">Supports multiple languages and file formats.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
