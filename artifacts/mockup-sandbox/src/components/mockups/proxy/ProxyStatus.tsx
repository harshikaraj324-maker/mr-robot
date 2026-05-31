import { useState, useEffect, useRef } from "react";

const STREAM_URL = "https://mr-robot-relay.s39452363.workers.dev/api/relay-stream";
const TOGGLE_URL = "https://mr-robot-relay.s39452363.workers.dev/api/relay-toggle";
const BASE_URL   = "https://mr-robot-relay.s39452363.workers.dev/api/relay";

type Entry = {
  id: number; ts: string; method: string; path: string;
  ip: string; body: unknown; status: number; responseSnippet: string; ms: number;
};

const MC: Record<string, string> = {
  GET:"#38bdf8", POST:"#a78bfa", PATCH:"#fb923c", DELETE:"#f87171", PUT:"#34d399",
};
const fmt   = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
const clock = (iso: string) => { try { return new Date(iso).toLocaleTimeString("en-IN",{hour12:false}); } catch { return iso; } };
const sc    = (s: number) => s>=200&&s<300 ? {bg:"#052e1688",fg:"#4ade80",glow:"#4ade8055"} : s>=400 ? {bg:"#450a0a88",fg:"#f87171",glow:"#f8717155"} : {bg:"#0f172a88",fg:"#94a3b8",glow:"transparent"};
const snip  = (b: unknown) => { if(!b||!Object.keys(b as object).length) return ""; try{const s=JSON.stringify(b);return s.length>80?s.slice(0,80)+"…":s;}catch{return "";} };

/* ─── CSS ─────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:#060c1a}
  ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:4px}
  @keyframes ping{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.4);opacity:0}}
  @keyframes rowIn{from{opacity:0;transform:translateX(-8px);background:#1a1060;}to{opacity:1;transform:none;background:transparent;}}
  @keyframes glow{0%,100%{opacity:.4}50%{opacity:.9}}
  @keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(600px)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .new-row{animation:rowIn .4s ease forwards}
  .card{background:linear-gradient(135deg,rgba(15,23,42,.95),rgba(8,15,30,.9));border:1px solid rgba(99,102,241,.15);border-radius:12px;backdrop-filter:blur(12px)}
  .card-glow{box-shadow:0 0 20px rgba(99,102,241,.08),inset 0 1px 0 rgba(255,255,255,.04)}
  .btn{border:none;cursor:pointer;font-family:inherit;font-weight:700;transition:all .2s;letter-spacing:.3px}
  .row-hover:hover{background:rgba(99,102,241,.06)!important;border-color:rgba(99,102,241,.3)!important}
  .detail-in{animation:fadeIn .25s ease forwards}
`;

/* ─── Hex Logo ─────────────────────────────────────────────────────── */
function HexLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f46e5"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
        <filter id="hf"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <polygon points="18,2 31,9.5 31,26.5 18,34 5,26.5 5,9.5" fill="url(#hg)" filter="url(#hf)" opacity=".9"/>
      <polygon points="18,6 27,11 27,25 18,30 9,25 9,11" fill="none" stroke="rgba(167,139,250,.5)" strokeWidth=".8"/>
      <path d="M13 18h10M18 13v10" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="18" cy="18" r="2.5" fill="#e0d9ff"/>
    </svg>
  );
}

/* ─── Sparkline ────────────────────────────────────────────────────── */
function Spark({ data }: { data: {ms:number;ok:boolean}[] }) {
  const W=280,H=52;
  const pts = data.slice(-50);
  if(pts.length<2) return (
    <div style={{width:W,height:H,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <span style={{fontSize:10,color:"#1e3a5f"}}>no data yet</span>
    </div>
  );
  const maxMs = Math.max(...pts.map(p=>p.ms),1);
  const step  = W/(pts.length-1);
  const y     = (ms:number) => H-6-((ms/maxMs)*(H-12));
  const poly  = pts.map((p,i)=>`${i*step},${y(p.ms)}`).join(" ");
  const area  = `0,${H} ${poly} ${(pts.length-1)*step},${H}`;
  return (
    <svg width={W} height={H} style={{display:"block",overflow:"visible"}}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" stopOpacity=".5"/>
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0"/>
        </linearGradient>
        <filter id="lf"><feGaussianBlur stdDeviation="1.2"/></filter>
      </defs>
      {/* grid lines */}
      {[0.25,0.5,0.75].map(f=>(
        <line key={f} x1="0" y1={H*f} x2={W} y2={H*f} stroke="#0f1f3d" strokeWidth=".5"/>
      ))}
      <polygon points={area} fill="url(#sg)"/>
      {/* glow line */}
      <polyline points={poly} fill="none" stroke="#818cf8" strokeWidth="3" strokeOpacity=".2" filter="url(#lf)"/>
      <polyline points={poly} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((p,i)=>(
        <circle key={i} cx={i*step} cy={y(p.ms)} r={i===pts.length-1?3.5:2}
          fill={p.ok?"#4ade80":"#f87171"}
          style={{filter:`drop-shadow(0 0 ${i===pts.length-1?5:3}px ${p.ok?"#4ade80":"#f87171"})`}}
        />
      ))}
    </svg>
  );
}

/* ─── Ring chart ───────────────────────────────────────────────────── */
function Ring({ pass, fail }: { pass:number; fail:number }) {
  const total = pass+fail||1;
  const pct   = Math.round((pass/total)*100);
  const r=36, cx=44, cy=44, circ=2*Math.PI*r;
  const pd = (pass/total)*circ;
  const fd = (fail/total)*circ;
  return (
    <svg width={88} height={88}>
      <defs>
        <filter id="rglow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0f172a" strokeWidth="10"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f87171" strokeWidth="8"
        strokeDasharray={`${fd} ${circ-fd}`}
        strokeDashoffset={circ*0.25}
        strokeLinecap="round"
        style={{transition:"stroke-dasharray .6s ease",filter:"drop-shadow(0 0 4px #f87171)"}}
      />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4ade80" strokeWidth="8"
        strokeDasharray={`${pd} ${circ-pd}`}
        strokeDashoffset={circ*0.25-fd}
        strokeLinecap="round"
        style={{transition:"stroke-dasharray .6s ease",filter:"drop-shadow(0 0 4px #4ade80)"}}
      />
      <text x={cx} y={cy-5} textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="800" fontFamily="Inter,sans-serif">
        {total>1?`${pct}%`:"—"}
      </text>
      <text x={cx} y={cy+9} textAnchor="middle" fill="#475569" fontSize="8" fontWeight="600" fontFamily="Inter,sans-serif" letterSpacing=".5">
        PASS
      </text>
    </svg>
  );
}

/* ─── Mini bar for method breakdown ───────────────────────────────── */
function MethodBar({ log }: { log: Entry[] }) {
  const counts: Record<string,number> = {};
  log.forEach(e => { counts[e.method]=(counts[e.method]||0)+1; });
  const total = log.length||1;
  const methods = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(!methods.length) return <div style={{color:"#1e3a5f",fontSize:10}}>No data</div>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5,width:"100%"}}>
      {methods.map(([m,c])=>(
        <div key={m} style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:9,fontWeight:800,color:MC[m]??"#64748b",width:38,fontFamily:"JetBrains Mono,monospace"}}>{m}</div>
          <div style={{flex:1,height:5,background:"#0f172a",borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${(c/total)*100}%`,height:"100%",background:MC[m]??"#64748b",borderRadius:3,boxShadow:`0 0 6px ${MC[m]??"#64748b"}`,transition:"width .4s ease"}}/>
          </div>
          <div style={{fontSize:9,fontWeight:700,color:"#475569",width:18,textAlign:"right"}}>{c}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Stat Card ────────────────────────────────────────────────────── */
function StatCard({ label, value, color, sub }: { label:string; value:string|number; color:string; sub?:string }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(()=>{
    if(prev.current!==value){
      prev.current=value;
      setFlash(true);
      setTimeout(()=>setFlash(false),400);
    }
  },[value]);
  return (
    <div className="card card-glow" style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:4,position:"relative",overflow:"hidden",transition:"box-shadow .3s",boxShadow:flash?`0 0 24px ${color}44,inset 0 1px 0 rgba(255,255,255,.04)`:"0 0 0px transparent,inset 0 1px 0 rgba(255,255,255,.04)"}}>
      <div style={{fontSize:8,fontWeight:700,color:"#334155",letterSpacing:1.2,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontSize:26,fontWeight:900,color,lineHeight:1,textShadow:`0 0 24px ${color}66`,transition:"color .3s"}}>{value}</div>
      {sub && <div style={{fontSize:9,color:"#1e3a5f",marginTop:1}}>{sub}</div>}
      {/* corner accent */}
      <div style={{position:"absolute",top:0,right:0,width:30,height:30,background:`radial-gradient(circle at top right, ${color}18, transparent)`,pointerEvents:"none"}}/>
    </div>
  );
}

/* ─── Live Dot ─────────────────────────────────────────────────────── */
function LiveDot({ color="#22c55e" }: { color?:string }) {
  return (
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:10,height:10}}>
      <span style={{position:"absolute",width:10,height:10,borderRadius:"50%",background:color,opacity:.5,animation:"ping 1.6s ease infinite"}}/>
      <span style={{width:6,height:6,borderRadius:"50%",background:color,display:"inline-block",boxShadow:`0 0 6px ${color}`}}/>
    </span>
  );
}

/* ─── Detail Panel ─────────────────────────────────────────────────── */
function Detail({ sel, onClose }: { sel:Entry; onClose:()=>void }) {
  const s = sc(sel.status);
  return (
    <div className="detail-in" style={{width:280,borderLeft:"1px solid rgba(99,102,241,.15)",background:"linear-gradient(180deg,#070c1a,#060b18)",flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* panel header */}
      <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(99,102,241,.12)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(99,102,241,.06)"}}>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:"#818cf8",letterSpacing:.8}}>REQUEST DETAIL</div>
          <div style={{fontSize:8,color:"#1e3a5f",marginTop:1}}>{clock(sel.ts)}</div>
        </div>
        <button onClick={onClose} className="btn" style={{background:"rgba(99,102,241,.1)",color:"#818cf8",borderRadius:6,width:24,height:24,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:10}}>
        {/* status hero */}
        <div style={{padding:"12px 14px",borderRadius:10,background:s.bg,border:`1px solid ${s.glow}`,textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:900,color:s.fg,textShadow:`0 0 20px ${s.glow}`,lineHeight:1}}>{sel.status||"ERR"}</div>
          <div style={{fontSize:9,color:s.fg,opacity:.6,marginTop:2}}>{sel.status>=200&&sel.status<300?"SUCCESS":sel.status>=400?"CLIENT ERROR":"SERVER ERROR"}</div>
        </div>

        {/* meta grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {([
            ["Method", sel.method, MC[sel.method]??"#94a3b8"],
            ["Latency", fmt(sel.ms), sel.ms>800?"#f59e0b":sel.ms>300?"#a78bfa":"#4ade80"],
            ["IP", sel.ip, "#64748b"],
            ["Path", sel.path.split("/").slice(-1)[0]||"/", "#38bdf8"],
          ] as [string,string,string][]).map(([k,v,c])=>(
            <div key={k} style={{padding:"8px 10px",borderRadius:8,background:"rgba(15,23,42,.7)",border:"1px solid rgba(30,58,95,.4)"}}>
              <div style={{fontSize:8,color:"#334155",fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>{k}</div>
              <div style={{fontFamily:"JetBrains Mono,monospace",fontSize:11,fontWeight:700,color:c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
            </div>
          ))}
        </div>

        {/* full path */}
        <div style={{padding:"8px 10px",borderRadius:8,background:"rgba(15,23,42,.7)",border:"1px solid rgba(30,58,95,.4)"}}>
          <div style={{fontSize:8,color:"#334155",fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Full Path</div>
          <div style={{fontFamily:"JetBrains Mono,monospace",fontSize:10,color:"#475569",wordBreak:"break-all"}}>{sel.path}</div>
        </div>

        {/* body */}
        {sel.body&&Object.keys(sel.body as object).length>0&&(
          <div>
            <div style={{fontSize:8,color:"#334155",fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Request Body</div>
            <pre style={{background:"rgba(6,12,24,.9)",border:"1px solid rgba(30,58,95,.4)",borderRadius:8,padding:"9px 10px",fontSize:10,color:"#4b5563",margin:0,overflow:"auto",maxHeight:110,whiteSpace:"pre-wrap",wordBreak:"break-all",fontFamily:"JetBrains Mono,monospace"}}>
              {JSON.stringify(sel.body,null,2)}
            </pre>
          </div>
        )}

        {/* response */}
        <div>
          <div style={{fontSize:8,color:"#334155",fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Response</div>
          <pre style={{background:"rgba(6,12,24,.9)",border:"1px solid rgba(30,58,95,.4)",borderRadius:8,padding:"9px 10px",fontSize:10,color:"#4b5563",margin:0,overflow:"auto",maxHeight:120,whiteSpace:"pre-wrap",wordBreak:"break-all",fontFamily:"JetBrains Mono,monospace"}}>
            {sel.responseSnippet||<span style={{color:"#1e293b"}}>(empty)</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────────────────── */
export function ProxyStatus() {
  const [log, setLog]           = useState<Entry[]>([]);
  const [err, setErr]           = useState<string|null>(null);
  const [sel, setSel]           = useState<Entry|null>(null);
  const [firing, setFiring]     = useState(false);
  const [proxyOn, setProxyOn]   = useState(true);
  const [toggling, setToggling] = useState(false);
  const [newIds, setNewIds]     = useState<Set<number>>(new Set());
  const prevIds                 = useRef<Set<number>>(new Set());

  useEffect(()=>{
    const es = new EventSource(STREAM_URL);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as
          |{type:"init";log:Entry[];enabled:boolean}
          |{type:"entry";entry:Entry};
        if(msg.type==="init"){
          msg.log.forEach(en=>prevIds.current.add(en.id));
          setLog(msg.log); setProxyOn(msg.enabled); setErr(null);
        } else if(msg.type==="entry"){
          const entry=msg.entry;
          setLog(prev=>[entry,...prev].slice(0,200));
          prevIds.current.add(entry.id);
          setNewIds(s=>new Set(s).add(entry.id));
          setTimeout(()=>setNewIds(s=>{const n=new Set(s);n.delete(entry.id);return n;}),700);
        }
      } catch {}
    };
    es.onerror = ()=>setErr("Stream disconnected — reconnecting…");
    es.onopen  = ()=>setErr(null);
    return ()=>es.close();
  },[]);

  const toggle = async ()=>{
    setToggling(true);
    try{const r=await fetch(TOGGLE_URL,{method:"POST"});const d=await r.json();setProxyOn(d.enabled);}catch{}
    setToggling(false);
  };
  const fireTest = async ()=>{
    setFiring(true);
    try{await fetch(`${BASE_URL}/healthz`);}catch{}
    setFiring(false);
  };

  const total   = log.length;
  const ok2xx   = log.filter(e=>e.status>=200&&e.status<300).length;
  const e4xx    = log.filter(e=>e.status>=400&&e.status<500).length;
  const e5xx    = log.filter(e=>e.status>=500).length;
  const avgMs   = total>0 ? Math.round(log.reduce((a,e)=>a+e.ms,0)/total) : 0;
  const spark   = [...log].reverse().map(e=>({ms:e.ms,ok:e.status>=200&&e.status<300}));

  return (
    <div style={{height:"100vh",background:"#060b18",color:"#e2e8f0",fontFamily:"Inter,system-ui,sans-serif",display:"flex",flexDirection:"column",overflow:"hidden",fontSize:12}}>
      <style>{CSS}</style>

      {/* ── TOPBAR ── */}
      <div style={{padding:"0 20px",height:52,borderBottom:"1px solid rgba(99,102,241,.12)",background:"linear-gradient(90deg,#08101f,#0a0d1f)",display:"flex",alignItems:"center",gap:12,flexShrink:0,position:"relative"}}>
        {/* scan line */}
        <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",opacity:.15}}>
          <div style={{position:"absolute",left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,#818cf8,transparent)",animation:"scan 6s linear infinite"}}/>
        </div>

        <HexLogo/>
        <div>
          <div style={{fontWeight:900,fontSize:13,letterSpacing:.8,background:"linear-gradient(90deg,#a78bfa,#38bdf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>MR ROBOT</div>
          <div style={{fontSize:8,color:"#1e3a5f",letterSpacing:1.5,marginTop:1}}>PROXY INTELLIGENCE</div>
        </div>

        {/* center: connection status */}
        <div style={{marginLeft:"auto",marginRight:"auto",display:"flex",alignItems:"center",gap:8,padding:"4px 14px",borderRadius:20,background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.15)"}}>
          {err
            ? <><LiveDot color="#f87171"/><span style={{fontSize:10,color:"#f87171",fontWeight:700}}>{err}</span></>
            : <><LiveDot/><span style={{fontSize:10,color:"#22c55e",fontWeight:700}}>Live Stream</span><span style={{fontSize:9,color:"#1e3a5f",marginLeft:4}}>— instant push</span></>
          }
        </div>

        {/* right controls */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={fireTest} disabled={firing} className="btn" style={{padding:"6px 14px",borderRadius:8,fontSize:11,background:"rgba(99,102,241,.12)",color:firing?"#334155":"#818cf8",border:"1px solid rgba(99,102,241,.25)"}}>
            {firing?"Sending…":"⚡ Ping"}
          </button>
          <button onClick={toggle} disabled={toggling} className="btn" style={{padding:"5px 14px",borderRadius:8,fontSize:11,display:"flex",alignItems:"center",gap:8,background:proxyOn?"rgba(5,46,22,.8)":"rgba(69,10,10,.8)",border:`1px solid ${proxyOn?"rgba(22,163,74,.4)":"rgba(220,38,38,.4)"}`,opacity:toggling?.6:1}}>
            <div style={{position:"relative",width:28,height:15,borderRadius:8,background:proxyOn?"#16a34a":"#dc2626",transition:"background .3s",flexShrink:0,boxShadow:`0 0 8px ${proxyOn?"#16a34a":"#dc2626"}66`}}>
              <div style={{position:"absolute",top:2,left:proxyOn?14:2,width:11,height:11,borderRadius:"50%",background:"#fff",transition:"left .3s",boxShadow:"0 1px 3px #0006"}}/>
            </div>
            <span style={{fontWeight:800,color:proxyOn?"#4ade80":"#f87171",minWidth:24}}>{toggling?"…":proxyOn?"ON":"OFF"}</span>
          </button>
        </div>
      </div>

      {/* ── OFF BANNER ── */}
      {!proxyOn&&(
        <div style={{background:"linear-gradient(90deg,rgba(127,29,29,.6),rgba(69,10,10,.6))",borderBottom:"1px solid rgba(220,38,38,.3)",padding:"6px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          <span style={{fontSize:10,fontWeight:700,color:"#f87171"}}>PROXY DISABLED — All requests returning 503. Toggle ON to resume forwarding.</span>
        </div>
      )}

      {/* ── METRICS ROW ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto auto",gap:10,padding:"12px 16px",flexShrink:0,borderBottom:"1px solid rgba(99,102,241,.08)",background:"rgba(6,11,24,.6)"}}>
        <StatCard label="Total Requests" value={total} color="#818cf8"/>
        <StatCard label="2xx Pass"        value={ok2xx} color="#4ade80" sub={total?`${Math.round((ok2xx/total)*100)}% success`:undefined}/>
        <StatCard label="4xx Errors"      value={e4xx}  color="#f87171"/>
        <StatCard label="5xx Errors"      value={e5xx}  color="#f59e0b"/>
        <StatCard label="Avg Latency"     value={total?fmt(avgMs):"—"} color="#38bdf8"/>

        {/* sparkline card */}
        <div className="card card-glow" style={{padding:"10px 14px",gridColumn:"6"}}>
          <div style={{fontSize:8,fontWeight:700,color:"#334155",letterSpacing:1.2,textTransform:"uppercase",marginBottom:6}}>Response Time</div>
          <Spark data={spark}/>
        </div>

        {/* ring + methods */}
        <div className="card card-glow" style={{padding:"10px 14px",display:"flex",gap:12,alignItems:"center",gridColumn:"7"}}>
          <div>
            <div style={{fontSize:8,fontWeight:700,color:"#334155",letterSpacing:1.2,textTransform:"uppercase",marginBottom:4}}>Pass Rate</div>
            <Ring pass={ok2xx} fail={e4xx+e5xx}/>
          </div>
          <div style={{width:110}}>
            <div style={{fontSize:8,fontWeight:700,color:"#334155",letterSpacing:1.2,textTransform:"uppercase",marginBottom:6}}>By Method</div>
            <MethodBar log={log}/>
          </div>
        </div>
      </div>

      {/* ── TABLE + DETAIL ── */}
      <div style={{flex:1,overflow:"hidden",display:"flex",gap:0}}>

        {/* Table */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* column headers */}
          <div style={{display:"grid",gridTemplateColumns:"68px 50px 120px 96px 52px 60px 1fr",padding:"6px 16px",background:"rgba(6,9,18,.9)",borderBottom:"1px solid rgba(15,23,42,.9)",flexShrink:0}}>
            {["Time","Method","Path","IP","Status","Latency","Body"].map(h=>(
              <div key={h} style={{fontSize:8,color:"#334155",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{h}</div>
            ))}
          </div>

          {/* rows */}
          <div style={{flex:1,overflowY:"auto"}}>
            {log.length===0&&!err&&(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:8,opacity:.3}}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{fontSize:11,color:"#334155"}}>Waiting for incoming requests…</span>
              </div>
            )}

            {log.map((e,i)=>{
              const s    = sc(e.status);
              const isSel= sel?.id===e.id;
              const isNew= newIds.has(e.id);
              return (
                <div
                  key={e.id}
                  className={`row-hover${isNew?" new-row":""}`}
                  onClick={()=>setSel(isSel?null:e)}
                  style={{
                    display:"grid",
                    gridTemplateColumns:"68px 50px 120px 96px 52px 60px 1fr",
                    padding:"6px 16px",
                    borderBottom:"1px solid rgba(15,23,42,.6)",
                    borderLeft:`2px solid ${isSel?"#818cf8":"transparent"}`,
                    background:isSel?"rgba(99,102,241,.08)":i%2===0?"rgba(8,12,22,.4)":"rgba(6,9,18,.3)",
                    cursor:"pointer",
                    alignItems:"center",
                    transition:"background .15s,border-color .15s",
                  }}
                >
                  <div style={{fontSize:9,color:"#1e3a5f",fontFamily:"JetBrains Mono,monospace"}}>{clock(e.ts)}</div>
                  <div style={{fontSize:9,fontWeight:800,color:MC[e.method]??"#64748b",fontFamily:"JetBrains Mono,monospace",textShadow:`0 0 8px ${MC[e.method]??"#64748b"}88`}}>{e.method}</div>
                  <div style={{fontSize:10,color:"#334155",fontFamily:"JetBrains Mono,monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.path}</div>
                  <div style={{fontSize:9,color:"#1e3a5f",fontFamily:"JetBrains Mono,monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.ip}</div>
                  <div>
                    <span style={{fontSize:9,fontWeight:800,fontFamily:"JetBrains Mono,monospace",padding:"2px 6px",borderRadius:5,background:s.bg,color:s.fg,boxShadow:`0 0 6px ${s.glow}`}}>
                      {e.status||"ERR"}
                    </span>
                  </div>
                  <div style={{fontSize:10,fontWeight:700,fontFamily:"JetBrains Mono,monospace",color:e.ms>800?"#f59e0b":e.ms>300?"#a78bfa":"#475569"}}>{fmt(e.ms)}</div>
                  <div style={{fontSize:9,color:"#1e3a5f",fontFamily:"JetBrains Mono,monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {snip(e.body)||<span style={{color:"#0f172a"}}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{padding:"5px 16px",borderTop:"1px solid rgba(15,23,42,.9)",background:"rgba(6,9,18,.9)",display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
            <span style={{fontSize:8,color:"#1e3a5f"}}>TOTAL {total} ENTRIES</span>
            <span style={{fontSize:8,color:"#1e3a5f"}}>·</span>
            <span style={{fontSize:8,color:"#1e3a5f"}}>TARGET: mr-robot-5s3.pages.dev</span>
            <span style={{marginLeft:"auto",fontSize:8,color:"#1e3a5f"}}>MR ROBOT PROXY v1.0</span>
          </div>
        </div>

        {/* Detail Panel */}
        {sel&&<Detail sel={sel} onClose={()=>setSel(null)}/>}
      </div>
    </div>
  );
}
