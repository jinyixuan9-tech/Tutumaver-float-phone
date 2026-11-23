"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Info, LoaderCircle, X } from "lucide-react";
import { chooseGenerationOutcome, generationOutcome, isGenerationProgress, type GenerationOutcome } from "@/lib/generation-feedback";
import styles from "./generation-feedback.module.css";

type Result = { text: string; kind: GenerationOutcome };

/** Uses existing request state; it does not time out, retry, or create extra API calls. */
export function useGenerationFeedback(activeLabel: string | null, externalNotice?: (text: string) => void, visible = true) {
  const parent = useRef(externalNotice); parent.current = externalNotice;
  const run = useRef({ active: false, task: "", notices: [] as string[] });
  const [result, setResult] = useState<Result | null>(null);
  const [progress, setProgress] = useState("");
  const onNotice = useCallback((text: string) => {
    parent.current?.(text);
    if (run.current.active) {
      run.current.notices.push(text);
      if (run.current.notices.length > 30) run.current.notices.shift();
      if (isGenerationProgress(text)) setProgress(text);
    } else if (["error", "warning"].includes(generationOutcome(text))) {
      setResult({ text, kind: generationOutcome(text) });
    }
  }, []);
  useEffect(() => {
    if (activeLabel) {
      if (!run.current.active) {
        run.current = { active: true, task: activeLabel, notices: [] };
        setResult(null); setProgress("");
      } else run.current.task = activeLabel;
    } else if (run.current.active) {
      setResult(chooseGenerationOutcome(run.current.notices, run.current.task));
      run.current.active = false; setProgress("");
    }
  }, [activeLabel]);
  return { onNotice, feedback: visible ? <GenerationFeedback activeLabel={activeLabel} detail={progress} result={result} onDismiss={() => setResult(null)} /> : null };
}

export function GenerationFeedback({ activeLabel, detail, result, onDismiss }: {
  activeLabel: string | null; detail?: string; result: Result | null; onDismiss: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const busy = Boolean(activeLabel);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now(); setSeconds(0);
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  if (!busy && !result) return null;
  const kind = busy ? "busy" : result!.kind;
  const title = busy ? activeLabel : ({success:"生成完成",error:"生成失败",warning:"生成有提示",empty:"本次无新增",info:"请求已结束"} as const)[result!.kind];
  const Icon = busy ? LoaderCircle : kind === "success" ? CheckCircle2 : kind === "error" || kind === "warning" ? CircleAlert : Info;
  return <aside className={styles.panel} data-state={kind} role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"} aria-atomic="true" aria-busy={busy}>
    <Icon className={busy ? styles.spinner : styles.icon} size={19} aria-hidden="true" />
    <div className={styles.copy}>
      <strong>{title}</strong>
      <p>{busy ? detail || "正在等待生成结果…" : result!.text}</p>
      {busy && <small aria-live="off">已等待 {seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds/60)} 分 ${seconds%60} 秒`}{seconds >= 60 ? " · 耗时较长，仍在等待返回" : ""}</small>}
    </div>
    {!busy && <button type="button" aria-label="关闭生成结果" onClick={onDismiss}><X size={18}/></button>}
  </aside>;
}
