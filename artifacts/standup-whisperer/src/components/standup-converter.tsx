import React, { useState, useRef, useEffect } from "react";
import { Copy, Terminal, Check, AlignLeft, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Card } from "./ui/card";

type Format = "plain" | "slack" | "markdown";

export function StandupConverter() {
  const [notes, setNotes] = useState("");
  const [format, setFormat] = useState<Format>("markdown");
  const [output, setOutput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isCopiedSlack, setIsCopiedSlack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const endOfOutputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGenerating && endOfOutputRef.current) {
      endOfOutputRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [output, isGenerating]);

  const handleGenerate = async () => {
    if (!notes.trim()) return;

    setError(null);
    setOutput("");
    setIsGenerating(true);

    abortControllerRef.current = new AbortController();

    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${BASE}/api/standup/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, format }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.done) break;
          if (payload.error) {
            setError(payload.error);
            break;
          }
          if (payload.content) {
            setOutput((prev) => prev + payload.content);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "An error occurred while generating.");
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const convertToSlack = (text: string): string => {
    return text
      .replace(/^#{1,3}\s*(Yesterday)/mi, "*Yesterday*")
      .replace(/^#{1,3}\s*(Today)/mi, "*Today*")
      .replace(/^#{1,3}\s*(Blockers)/mi, "*Blockers* :warning:")
      .replace(/^Yesterday$/mi, "*Yesterday*")
      .replace(/^Today$/mi, "*Today*")
      .replace(/^Blockers$/mi, "*Blockers* :warning:")
      .replace(/^\s*-\s+/gm, "• ");
  };

  const handleCopySlack = async () => {
    if (!output) return;
    const slackText = convertToSlack(output);
    await navigator.clipboard.writeText(slackText);
    setIsCopiedSlack(true);
    setTimeout(() => setIsCopiedSlack(false), 2000);
  };

  const renderOutput = () => {
    if (!output && !isGenerating && !error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center border border-dashed border-border rounded-md bg-muted/20">
          <Terminal className="w-8 h-8 mb-4 opacity-50" />
          <p className="text-sm font-mono">Ready to compile your daily update.</p>
          <p className="text-xs mt-2 opacity-70">Paste your raw notes and click generate.</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive-foreground text-sm flex items-start gap-3 font-mono">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-1">Compilation Error</p>
            <p className="opacity-90">{error}</p>
          </div>
        </div>
      );
    }

    const content = output;
    
    // Slack formatter
    const renderSlack = (text: string) => {
      const parts = text.split(/(\*[^*]+\*)/g);
      return (
        <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {parts.map((part, i) => {
            if (part.startsWith("*") && part.endsWith("*")) {
              return <strong key={i} className="font-bold">{part.slice(1, -1)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </div>
      );
    };

    return (
      <div className="relative">
        <div className="bg-card border border-border rounded-md p-6 min-h-[300px] shadow-sm relative group overflow-hidden">
          {format === "plain" && (
            <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed">
              {content}
            </pre>
          )}
          
          {format === "slack" && renderSlack(content)}
          
          {format === "markdown" && (
            <div className="prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-headings:font-bold prose-headings:tracking-tight max-w-none font-sans whitespace-pre-wrap">
              {content.split("\n").map((line, i) => {
                if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-bold mt-4 mb-2">{line.slice(4)}</h3>;
                if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-bold mt-5 mb-2">{line.slice(3)}</h2>;
                if (line.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold mt-6 mb-3">{line.slice(2)}</h1>;
                if (line.trim() === "") return <br key={i} />;
                
                // Bold replacement
                const parts = line.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <div key={i} className="min-h-[1.5em]">
                    {parts.map((p, j) => 
                      p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isGenerating && (
            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />
          )}
          
          <div ref={endOfOutputRef} />
        </div>
        
        {output && !isGenerating && (
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleCopySlack} className="font-mono text-xs h-8 border border-border">
              {isCopiedSlack ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
              {isCopiedSlack ? "COPIED!" : "COPY FOR SLACK"}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleCopy} className="font-mono text-xs h-8">
              {isCopied ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
              {isCopied ? "COPIED" : "COPY"}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      {/* Input Section */}
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
            <AlignLeft className="w-4 h-4" />
            Input_Buffer
          </h2>
          <Textarea
            placeholder="Dump your messy thoughts here...&#10;&#10;e.g.&#10;- fixed that weird bug in the auth flow&#10;- reviewed PRs for Sarah&#10;- need to talk to design about the new modal&#10;- feeling stuck on the db migration"
            className="min-h-[400px] font-mono text-sm leading-relaxed resize-y bg-card border-border focus-visible:ring-primary shadow-sm p-4"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isGenerating}
          />
        </div>

        <Card className="p-4 border-border bg-card shadow-sm">
          <div className="flex items-center justify-between">
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as Format)}
              disabled={isGenerating}
              className="flex items-center gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="markdown" id="f-md" />
                <Label htmlFor="f-md" className="font-mono text-xs cursor-pointer">MARKDOWN</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="slack" id="f-slack" />
                <Label htmlFor="f-slack" className="font-mono text-xs cursor-pointer">SLACK</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="plain" id="f-plain" />
                <Label htmlFor="f-plain" className="font-mono text-xs cursor-pointer">PLAIN</Label>
              </div>
            </RadioGroup>

            {isGenerating ? (
              <Button onClick={handleCancel} variant="destructive" size="sm" className="font-mono text-xs h-8">
                ABORT
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={!notes.trim()}
                size="sm"
                className="font-mono text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                GENERATE
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Output Section */}
      <div className="space-y-6 lg:sticky lg:top-8">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Standard_Out
            </h2>
            {output && !isGenerating && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] font-mono hover:bg-muted"
                onClick={() => {
                  setOutput("");
                  setNotes("");
                }}
              >
                CLEAR
              </Button>
            )}
          </div>
          {renderOutput()}
        </div>
      </div>
    </div>
  );
}
