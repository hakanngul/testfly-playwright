/** Dashboard stylesheet (inline in the HTML; light/dark via CSS variables). */
export const CSS = String.raw`
:root{
  --bg:#f6f7f9;--panel:#fff;--text:#1b1f24;--muted:#667085;--border:#e1e4e8;
  --pass:#1a7f4b;--fail:#c62828;--warn:#b26a00;--info:#1f5fbf;--skip:#8a94a3;--accent:#4f46e5;
  --pass-bg:#e4f5ec;--fail-bg:#fdeaea;--warn-bg:#fff3dc;--info-bg:#e6effc;--skip-bg:#eceff3;
  --code:#f0f2f5;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0f1318;--panel:#171c23;--text:#e6e9ee;--muted:#98a2b3;--border:#2a323d;
    --pass:#4cc38a;--fail:#ff7b72;--warn:#e3b341;--info:#79b0ff;--skip:#8a94a3;--accent:#8b8cf8;
    --pass-bg:#12301f;--fail-bg:#3a1a1a;--warn-bg:#38290a;--info-bg:#14264a;--skip-bg:#222a34;
    --code:#10151b;
  }
}
:root[data-theme="dark"]{
  --bg:#0f1318;--panel:#171c23;--text:#e6e9ee;--muted:#98a2b3;--border:#2a323d;
  --pass:#4cc38a;--fail:#ff7b72;--warn:#e3b341;--info:#79b0ff;--skip:#8a94a3;--accent:#8b8cf8;
  --pass-bg:#12301f;--fail-bg:#3a1a1a;--warn-bg:#38290a;--info-bg:#14264a;--skip-bg:#222a34;
  --code:#10151b;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.muted{color:var(--muted)}
.top{display:flex;align-items:center;gap:16px;padding:10px 20px;background:var(--panel);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:5;flex-wrap:wrap}
.brand{font-weight:700;font-size:16px}
nav{display:flex;gap:4px;flex:1;flex-wrap:wrap}
nav button{background:none;border:0;color:var(--muted);padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit}
nav button[aria-selected="true"]{background:var(--accent);color:#fff}
button.ghost,.btn{background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit}
.btn:hover,button.ghost:hover{border-color:var(--accent)}
main{max-width:1200px;margin:0 auto;padding:20px}
.view[hidden]{display:none}
.grid{display:grid;gap:16px}
.cols-2{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.card h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.stat .n{font-size:26px;font-weight:700}
.stat .l{color:var(--muted);font-size:12px}
.pass{color:var(--pass)}.fail{color:var(--fail)}.warn{color:var(--warn)}.info{color:var(--info)}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;margin-right:4px;white-space:nowrap}
.b-passed,.b-STABLE{background:var(--pass-bg);color:var(--pass)}
.b-failed,.b-timedOut,.b-interrupted,.b-HIGH,.b-APPLICATION_BUG{background:var(--fail-bg);color:var(--fail)}
.b-flaky,.b-WATCH,.b-SYSTEM_FLAKY{background:var(--warn-bg);color:var(--warn)}
.b-healed,.b-TEST_BUG{background:var(--info-bg);color:var(--info)}
.b-skipped,.b-quarantined,.b-NEEDS_INVESTIGATION{background:var(--skip-bg);color:var(--skip)}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
input[type=search],select{background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 9px;font:inherit}
input[type=search]{min-width:240px}
.row{background:var(--panel);border:1px solid var(--border);border-radius:8px;margin-bottom:6px}
.row>.head{display:flex;gap:10px;align-items:center;padding:8px 12px;cursor:pointer;flex-wrap:wrap}
.row>.head:hover{background:var(--code)}
.row .title{flex:1;min-width:200px;font-weight:600}
.row .file{color:var(--muted);font-size:12px}
.detail{padding:4px 14px 14px;border-top:1px solid var(--border)}
.detail h4{margin:14px 0 6px;font-size:12px;text-transform:uppercase;color:var(--muted);letter-spacing:.04em}
pre{background:var(--code);border-radius:6px;padding:10px;overflow:auto;max-height:320px;margin:0;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.tl{list-style:none;margin:0;padding:0}
.tl li{display:grid;grid-template-columns:70px 14px 1fr;gap:8px;align-items:center;padding:2px 0}
.tl .dot{width:10px;height:10px;border-radius:50%;background:var(--info)}
.tl .l-pass{background:var(--pass)}.tl .l-fail{background:var(--fail)}.tl .l-warn{background:var(--warn)}
.bar{height:8px;border-radius:4px;background:var(--accent);min-width:2px}
.bar-track{background:var(--code);border-radius:4px;height:8px;width:100%}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0}
.kv dt{color:var(--muted)}.kv dd{margin:0;word-break:break-all}
a{color:var(--accent)}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:12px}
.empty{padding:24px;text-align:center;color:var(--muted)}
svg text{fill:var(--muted);font-size:10px}
@media (max-width:640px){main{padding:12px}.top{padding:8px 12px}}
`;
