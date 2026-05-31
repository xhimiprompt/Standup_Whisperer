import React from "react";
import { StandupConverter } from "@/components/standup-converter";
import { Terminal } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Terminal className="w-5 h-5" />
            <span className="font-mono font-bold text-sm tracking-tight">Standup_Whisperer</span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
            v1.0.0
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 lg:p-12">
        <div className="mb-12">
          <h1 className="text-3xl font-sans font-semibold tracking-tight text-foreground mb-3">
            Compile your thoughts.
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            Dump your scattered notes, bugs, and blockers. Get a sharp, professional update in seconds. The daily ritual that separates pros from ramblers.
          </p>
        </div>

        <StandupConverter />
      </main>
      
      <footer className="border-t border-border/50 py-6 mt-12 text-center">
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          // End of file
        </p>
      </footer>
    </div>
  );
}
