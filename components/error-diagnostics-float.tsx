"use client";

import {useEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from "react";
import {AlertTriangle,Activity,Check,Copy,X} from "lucide-react";
import {CHAT_APP_SETTINGS_UPDATED_EVENT,loadChatAppSettings} from "@/lib/chat-storage";
import {ERROR_DIAGNOSTICS_EVENT,clearErrorDiagnostic,errorDiagnosticReport,getErrorDiagnostics,setErrorDiagnosticsArmed,httpDiagnosticStatus,type ErrorDiagnostic} from "@/lib/error-diagnostics";


// UI-only sample: never enters real diagnostic history or triggers any API request.
const SAMPLE_DIAGNOSTIC: ErrorDiagnostic = {
  operation: "查手机 → 浏览器 → 生成浏览记录",
  code: "PARSE-001",
  title: "返回内容解析失败",
  explanation: "API 已返回内容，但模型没有按这个功能要求的格式输出。原有记录未被覆盖。",
  checks: [
    "检查该功能绑定的 API 和模型是否正确。",
    "确认模型是否按要求返回 JSON，且包含必要字段。",
    "如果换模型后仍然复现，可以复制详细诊断报告反馈。",
  ],
  technical: "缺少有效的 items 数组，无法生成浏览记录。",
  httpStatus: 200,
  occurredAt: "示例时间（非真实请求）",
  previous: "第一次：返回的 JSON 缺少 items 字段。",
  expectedFormat: '{"items":[{"title":"网页标题","url":"https://example.com/page"}]}',
  parseFailure: "items 字段不存在；期望数组，实际为 undefined。",
  actualReturn: '{\n  "history": [\n    { "name": "昨晚看过的网页", "link": "/page" }\n  ]\n}',
  returnTruncated: false,
};

/** Shares the existing floating-button / quick-action popover styles. */
export function ErrorDiagnosticsFloat() {
  const [enabled,setEnabled]=useState(false);
  const [open,setOpen]=useState(false);
  const [latest,setLatest]=useState<ErrorDiagnostic|null>(null);
  const [copied,setCopied]=useState(false);
  const [demoOpen,setDemoOpen]=useState(false);
  const [includeActualReturn,setIncludeActualReturn]=useState(false);
  const [position,setPosition]=useState<{left:number;top:number}|null>(null);
  const drag=useRef<{x:number;y:number;left:number;top:number;moved:boolean;id:number}|null>(null);
  const ignoreClick=useRef(false);
  const button=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const sync=()=>{const next=loadChatAppSettings().errorDiagnosticsEnabled===true;setEnabled(next);setErrorDiagnosticsArmed(next);if(!next){setOpen(false);setDemoOpen(false);}};
    const changed=()=>setLatest(getErrorDiagnostics().latest);
    sync();changed();
    window.addEventListener(CHAT_APP_SETTINGS_UPDATED_EVENT,sync);
    window.addEventListener(ERROR_DIAGNOSTICS_EVENT,changed);
    return()=>{window.removeEventListener(CHAT_APP_SETTINGS_UPDATED_EVENT,sync);window.removeEventListener(ERROR_DIAGNOSTICS_EVENT,changed);setErrorDiagnosticsArmed(false);};
  },[]);
  useEffect(()=>{if(open){setCopied(false);setIncludeActualReturn(false);}},[open,latest,demoOpen]);
  const shown = demoOpen ? SAMPLE_DIAGNOSTIC : latest;
  const start=(e:ReactPointerEvent<HTMLButtonElement>)=>{
    if(e.button!==0)return;
    const rect=e.currentTarget.getBoundingClientRect();
    drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top,moved:false};
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move=(e:ReactPointerEvent<HTMLButtonElement>)=>{
    const d=drag.current;if(!d||e.pointerId!==d.id)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<5)return;
    d.moved=true;
    const bounds=e.currentTarget.parentElement?.getBoundingClientRect();
    if(!bounds)return;
    setPosition({left:Math.max(8,Math.min(bounds.width-56-8,d.left-bounds.left+e.clientX-d.x)),top:Math.max(66,Math.min(bounds.height-56-8,d.top-bounds.top+e.clientY-d.y))});
  };
  const finish=(e:ReactPointerEvent<HTMLButtonElement>)=>{
    const d=drag.current;if(!d||e.pointerId!==d.id)return;
    ignoreClick.current=d.moved;drag.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const copy=async()=>{
    if(!shown)return;
    const report=(demoOpen?"【测试示例｜非真实报错】\n":"")+errorDiagnosticReport(shown,includeActualReturn);
    try {await navigator.clipboard.writeText(report);setCopied(true);}
    catch {const field=document.createElement("textarea");field.value=report;document.body.appendChild(field);field.select();document.execCommand("copy");field.remove();setCopied(true);}
  };
  if(!enabled)return null;
  return <div className="quick-action-layer error-diagnostics-layer">
    <button ref={button} type="button" className="prompt-viewer-float-button error-diagnostics-ball" aria-label="打开错误诊断" data-positioned={position?"":undefined} style={position?{left:position.left,top:position.top} as CSSProperties:undefined}
      onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
      onClick={()=>{if(ignoreClick.current){ignoreClick.current=false;return;}setOpen(v=>!v);}}>
      {shown?<AlertTriangle size={24}/>:<Activity size={24}/>}
    </button>
    {open&&<div className="quick-action-panel-overlay error-diagnostics-overlay">
      <div className="quick-action-popover error-diagnostics-popover" role="dialog" aria-label="错误诊断">
        <div className="quick-action-header">
          <div className="quick-action-title"><span className="quick-action-title-icon"><Activity size={18}/></span><div><h3>错误诊断</h3><p>{demoOpen?"测试示例 · 非真实报错":latest?"已记录本次异常":"正在监测，请重试刚才的操作"}</p></div></div>
          <button type="button" className="quick-action-icon-btn" aria-label="关闭错误诊断" onClick={()=>setOpen(false)}><X size={18}/></button>
        </div>
        <div className="quick-action-body error-diagnostics-body">
          {demoOpen&&<div className="quick-action-empty">以下为模拟内容，不会调用 API，也不会写入真实诊断记录。</div>}
          {shown?<><section className="quick-action-section">
              <div className="quick-action-section-heading"><span><AlertTriangle size={16}/>{shown.title}</span></div>
              <div className="error-diagnostics-status">
                <span>服务器状态</span><strong>{httpDiagnosticStatus(shown.httpStatus)}</strong>
                <span>失败阶段</span><strong>{shown.code==="PARSE-001"?"内容解析":shown.code==="STORE-001"?"本地保存":"API／网络请求"}</strong>
              </div>
              <p>{shown.explanation}</p><p>操作：{shown.operation}</p>
              <div className="quick-action-section-heading"><span>建议检查</span></div>
              <ol>{shown.checks.map((s,i)=><li key={i}>{s}</li>)}</ol>
              <details><summary>技术详情</summary><p>内部分类：{shown.code}</p><p>HTTP：{httpDiagnosticStatus(shown.httpStatus)}</p><p className="error-diagnostics-technical">{shown.technical}</p>{shown.previous&&<p>前次错误：{shown.previous}</p>}{shown.expectedFormat&&<p>期望格式：{shown.expectedFormat}</p>}{shown.parseFailure&&<p>解析失败点：{shown.parseFailure}</p>}</details>
              {shown.actualReturn!==undefined&&<details><summary>查看模型实际返回{shown.returnTruncated?"（内容过长，已截断）":""}</summary><pre className="error-diagnostics-technical">{shown.actualReturn||"（空内容）"}</pre></details>}
              {shown.actualReturn!==undefined&&<label className="ti-user-reference"><input type="checkbox" checked={includeActualReturn} onChange={e=>setIncludeActualReturn(e.target.checked)}/><span>复制时附上模型实际返回内容（可能包含私人对话，请先检查）</span></label>}
            </section>
            <button type="button" className="quick-action-option error-diagnostics-copy" onClick={()=>void copy()}>{copied?<Check size={16}/>:<Copy size={16}/>}<span>{copied?"已复制诊断报告":"复制诊断报告"}</span></button>
            {demoOpen
              ? <button type="button" className="quick-action-option error-diagnostics-clear" onClick={()=>setDemoOpen(false)}>退出示例 · 返回真实监测</button>
              : <button type="button" className="quick-action-option error-diagnostics-clear" onClick={clearErrorDiagnostic}>清除本次记录</button>}
          </>:<><div className="quick-action-empty">监测已开启。请返回发生报错的 APP，再操作一次。成功时无需报告；再次失败后，这里会显示原因与排查方法。不会自动发起请求。</div>
            <button type="button" className="quick-action-option error-diagnostics-copy" onClick={()=>setDemoOpen(true)}><AlertTriangle size={16}/><span>查看示例报告 · 返回格式错误</span></button>
          </>}
          <p className="error-diagnostics-privacy">仅本机临时记录，不自动上传。复制实际返回内容前，请注意可能含私人对话。</p>
        </div>
      </div>
    </div>}
  </div>;
}
