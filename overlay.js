const ROOT_ID='codex-capacity-overlay';
function windowText(window,label){return Number.isFinite(window?.remainingPercent)?label+' '+Math.round(window.remainingPercent)+'%':null}
async function render(){
  const d=await chrome.storage.local.get(['usage','settings']);
  const s=d.settings||{};
  document.getElementById(ROOT_ID)?.remove();
  if(s.overlayEnabled===false||!d.usage?.windows?.length)return;
  const short=d.usage.windows.find(x=>x.kind==='short'||x.id==='short');
  const weekly=d.usage.windows.find(x=>x.kind==='weekly'||x.id==='weekly');
  const fallback=weekly||short||d.usage.windows[0];
  const windows=[short,weekly].filter(x=>Number.isFinite(x?.remainingPercent));
  if(!windows.length&&Number.isFinite(fallback?.remainingPercent))windows.push(fallback);
  if(!windows.length)return;
  const summary=windows.map(x=>windowText(x,x.kind==='short'?'5h':x.kind==='weekly'?'Weekly':x.label)).filter(Boolean);
  const el=document.createElement('button');
  el.id=ROOT_ID;
  el.type='button';
  el.title='Open dashboard · '+summary.join(' · ');
  el.textContent=s.overlayCompact!==false?'Codex · '+summary.join(' · '):'Codex · '+summary.map(x=>x+' remaining').join(' · ');
  Object.assign(el.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'2147483647',border:'1px solid rgba(128,128,128,.35)',borderRadius:'999px',padding:'7px 10px',background:'rgba(25,25,25,.88)',color:'#fff',font:'12px system-ui',cursor:'pointer',boxShadow:'0 4px 18px rgba(0,0,0,.18)'});
  el.onclick=()=>chrome.runtime.sendMessage({type:'openDashboard'});
  document.documentElement.appendChild(el);
}
render();chrome.storage.onChanged.addListener((c,a)=>{if(a==='local'&&(c.usage||c.settings))render()});
