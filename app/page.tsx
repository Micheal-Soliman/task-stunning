"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [idea, setIdea] = useState("");
  const [improved, setImproved] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  const [outputLang, setOutputLang] = useState<"en" | "ar">("en");
  const [includeDetails, setIncludeDetails] = useState(false);
  const [projectMode, setProjectMode] = useState(false);
  const [blueprint, setBlueprint] = useState<string>("");
  const [processingMs, setProcessingMs] = useState<number | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [detailsCopied, setDetailsCopied] = useState(false);
  const [showImproved, setShowImproved] = useState(true);
  const [showBlueprintSection, setShowBlueprintSection] = useState(true);
  const [showDetailsSection, setShowDetailsSection] = useState(true);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLPreElement | null>(null);
  const blueprintRef = useRef<HTMLPreElement | null>(null);
  const detailsRef = useRef<HTMLPreElement | null>(null);

  // Smoothly reveal the result once we have content
  useEffect(() => {
    if (improved) {
      setShowResult(true);
      // Scroll into view for better UX after generation
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [improved]);

  useEffect(() => {
    setCopied(false);
  }, [improved]);

  useEffect(() => {
    try {
      const savedIdea = localStorage.getItem("idea");
      if (savedIdea) setIdea(savedIdea);
      const savedLang = localStorage.getItem("outputLang");
      if (savedLang === "ar" || savedLang === "en") setOutputLang(savedLang as "en" | "ar");
      const savedDetails = localStorage.getItem("includeDetails");
      if (savedDetails) setIncludeDetails(savedDetails === "1");
      const savedProj = localStorage.getItem("projectMode");
      if (savedProj) setProjectMode(savedProj === "1");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("idea", idea);
      localStorage.setItem("outputLang", outputLang);
      localStorage.setItem("includeDetails", includeDetails ? "1" : "0");
      localStorage.setItem("projectMode", projectMode ? "1" : "0");
    } catch {}
  }, [idea, outputLang, includeDetails, projectMode]);

  async function handleImprove() {
    setError(null);
    setShowResult(false);
    setImproved("");
    setBlueprint("");
    setProcessingMs(null);
    setDetails(null);

    const trimmed = idea.trim();
    if (!trimmed) {
      setError("Please enter a rough website idea to improve.");
      return;
    }
    setLoading(true);
    try {
      const payload: any = { idea: trimmed, details: includeDetails, outputLang };
      if (projectMode) payload.project = { projectMode: true };
      const res = await fetch("/api/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j?.error || `Request failed (${res.status})`);
      }
      const data: { improved: string; meta?: { processingMs?: number }; details?: any } = await res.json();
      setImproved(data.improved || "");
      if (data?.meta?.processingMs != null) setProcessingMs(Number(data.meta.processingMs));
      if (includeDetails && data?.details?.blueprint) {
        setBlueprint(String(data.details.blueprint));
      } else {
        setBlueprint("");
      }
      if (includeDetails && data?.details) {
        setDetails(data.details);
      } else {
        setDetails(null);
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleImprove();
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(improved);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select text range if clipboard fails
      const sel = window.getSelection();
      const range = document.createRange();
      if (contentRef.current) {
        range.selectNodeContents(contentRef.current);
        sel?.removeAllRanges();
        sel?.addRange(range);
        try {
          document.execCommand("copy");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } finally {
          sel?.removeAllRanges();
        }
      }
    }
  }

  async function handleCopyBlueprint() {
    const text = blueprint || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBlueprint(true);
      setTimeout(() => setCopiedBlueprint(false), 1500);
    } catch {
      const sel = window.getSelection();
      const range = document.createRange();
      if (blueprintRef.current) {
        range.selectNodeContents(blueprintRef.current);
        sel?.removeAllRanges();
        sel?.addRange(range);
        try {
          document.execCommand("copy");
          setCopiedBlueprint(true);
          setTimeout(() => setCopiedBlueprint(false), 1500);
        } finally {
          sel?.removeAllRanges();
        }
      }
    }
  }

  async function handleCopyDetails() {
    const text = details ? JSON.stringify(details, null, 2) : "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setDetailsCopied(true);
      setTimeout(() => setDetailsCopied(false), 1500);
    } catch {
      const sel = window.getSelection();
      const range = document.createRange();
      if (detailsRef.current) {
        range.selectNodeContents(detailsRef.current);
        sel?.removeAllRanges();
        sel?.addRange(range);
        try {
          document.execCommand("copy");
          setDetailsCopied(true);
          setTimeout(() => setDetailsCopied(false), 1500);
        } finally {
          sel?.removeAllRanges();
        }
      }
    }
  }

  function downloadText(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-zinc-50 text-zinc-900 dark:from-black dark:to-zinc-950 dark:text-zinc-50">
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-20">
        {/* Minimal brand header to feel product-like without over-engineering */}
        <header className="mb-10 flex items-center justify-between">
          <div className="text-sm font-medium tracking-tight text-zinc-600 dark:text-zinc-400">Website Prompt Improver</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-500">v0.1</div>
        </header>

        {/* Hero copy */}
        <section className="mb-8">
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Turn a rough website idea into a build‑ready prompt
          </h1>
          <p className="mt-3 max-w-prose text-pretty text-lg text-zinc-600 dark:text-zinc-400">
            Paste anything messy. Get a clear, structured prompt with audience, purpose, tone, sections, and features.
          </p>
        </section>

        {/* Input area */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-900">
          <label htmlFor="idea" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Your rough idea
          </label>
          <textarea
            id="idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g., a simple site for my new task app. for busy parents. fun vibe, mobile first. show features, pricing, faq, and testimonials. maybe a blog later."
            className="h-40 w-full resize-y rounded-xl border border-zinc-200 bg-white p-4 text-base leading-relaxed outline-none ring-0 transition focus:border-zinc-300 focus:shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          />
          <div className="mt-2 text-xs text-zinc-500">
            {(idea.trim() ? idea.trim().split(/\s+/).length : 0)} words · {idea.length} chars
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

        {includeDetails && details && (
          <section className="mt-4 transition-all duration-300">
            <div className="relative rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Details (JSON)</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyDetails}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {detailsCopied ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={() => downloadText("details.json", JSON.stringify(details, null, 2))}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    Download
                  </button>
                </div>
              </div>
              <pre ref={detailsRef} className="whitespace-pre-wrap rounded-xl bg-white/70 p-4 text-sm leading-relaxed text-zinc-800 backdrop-blur-sm dark:bg-zinc-950/40 dark:text-zinc-200">
{JSON.stringify(details, null, 2)}
              </pre>
            </div>
          </section>
        )}
          <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <div>Press Ctrl/Cmd + Enter to improve</div>
              <div className="w-full flex items-center gap-3 mt-2">
                <div className="flex items-center gap-2">
                  <span>Language</span>
                  <select
                    value={outputLang}
                    onChange={(e) => setOutputLang(e.target.value as any)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1">
                  <input
                    type="checkbox"
                    checked={includeDetails}
                    onChange={(e) => setIncludeDetails(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span>Details</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1">
                  <input
                    type="checkbox"
                    checked={projectMode}
                    onChange={(e) => setProjectMode(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span>Project mode</span>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <span>Examples</span>
                <button
                  type="button"
                  onClick={() => setIdea("A SaaS landing page for time tracking. Pricing, FAQ, testimonials, blog.")}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  SaaS
                </button>
                <button
                  type="button"
                  onClick={() => setIdea("An e‑commerce store for fashion in Egypt. Cart, checkout, reviews, blog. Arabic + English.")}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  E‑commerce
                </button>
                <button
                  type="button"
                  onClick={() => setIdea("A portfolio for a photographer with gallery, about, services, testimonials, and contact form.")}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Portfolio
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setIdea(""); setImproved(""); setBlueprint(""); setDetails(null); setProcessingMs(null); setError(null); setShowResult(false); }}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Clear
              </button>
            </div>
            <button
              disabled={loading}
              onClick={handleImprove}
              className="inline-flex min-w-max shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-zinc-900 px-5 py-3 font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white dark:border-zinc-900/60 dark:border-t-zinc-900" />
              )}
              <span>{loading ? "Improving..." : "Improve my idea"}</span>
            </button>
          </div>
        </section>

        {/* Result */}
        <section
          aria-live="polite"
          className={`mt-8 transition-all duration-300 ${showResult ? "opacity-100" : "opacity-0 translate-y-1"}`}
        >
          {improved && (
            <div
              ref={resultRef}
              className="relative rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Improved prompt</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <span aria-live="polite" className="sr-only">{copied ? "Copied" : ""}</span>
                  <button
                    onClick={() => downloadText("improved.md", improved)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    Download
                  </button>
                  {processingMs != null && (
                    <span className="text-xs text-zinc-500">{processingMs} ms</span>
                  )}
                  <button
                    onClick={() => setShowImproved((v) => !v)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {showImproved ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {showImproved && (
              <pre ref={contentRef} dir={outputLang === 'ar' ? 'rtl' : 'ltr'} className={`whitespace-pre-wrap rounded-xl bg-white/70 p-4 text-sm leading-relaxed text-zinc-800 backdrop-blur-sm dark:bg-zinc-950/40 dark:text-zinc-200 ${outputLang === 'ar' ? 'text-right' : ''}`}>
{improved}
              </pre>
              )}
            </div>
          )}
        </section>

        {loading && !improved && (
          <section className="mt-4">
            <div className="animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mb-2 h-3 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mb-2 h-3 w-11/12 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mb-2 h-3 w-9/12 rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          </section>
        )}

        {blueprint && (
          <section className="mt-4 transition-all duration-300">
            <div className="relative rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Project blueprint</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyBlueprint}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {copiedBlueprint ? "Copied" : "Copy"}
                  </button>
                  <span aria-live="polite" className="sr-only">{copiedBlueprint ? "Copied" : ""}</span>
                  <button
                    onClick={() => downloadText("blueprint.md", blueprint)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => setShowBlueprintSection((v) => !v)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {showBlueprintSection ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {showBlueprintSection && (
              <pre ref={blueprintRef} dir={outputLang === 'ar' ? 'rtl' : 'ltr'} className={`whitespace-pre-wrap rounded-xl bg-white/70 p-4 text-sm leading-relaxed text-zinc-800 backdrop-blur-sm dark:bg-zinc-950/40 dark:text-zinc-200 ${outputLang === 'ar' ? 'text-right' : ''}`}>
{blueprint}
              </pre>
              )}
            </div>
          </section>
        )}

        {/* Footer note to set expectations about logic source */}
        <p className="mt-10 text-xs text-zinc-500">
          This demo uses deterministic heuristics on the server to improve clarity and structure. No external AI calls are made.
        </p>
      </main>
    </div>
  );
}
