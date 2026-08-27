import { preferredWindow,getShortWindow,getWeeklyWindow,getCurrentCycleHistory,calculatePacing,inferSessions,buildHeatmap,formatDurationMs } from './core.js';
import { installHelpTooltips } from './help.js';
const $=id=>document.getElementById(id); let state={};
function resetText(w){if(!w?.resetAt)return'Reset time unavailable';const d=new Date(w.resetAt*1000),ms=d-Date.now();return`Resets ${d.toLocaleString()} · ${formatDurationMs(ms)}`}
function fmtDate(ms){return Number.isFinite(ms)?new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}
function renderLimits(usage) {
  const holder = $('limitCard');
  holder.textContent = '';
  const shortWindow = getShortWindow(usage);
  const weeklyWindow = getWeeklyWindow(usage);
  const fallback = preferredWindow(usage);
  const windows = [shortWindow, weeklyWindow].filter(window => Number.isFinite(window?.remainingPercent));
  if (!windows.length && Number.isFinite(fallback?.remainingPercent)) windows.push(fallback);

  const card = document.createElement('section');
  card.className = 'card quota-summary';
  if (!windows.length) {
    card.classList.add('muted');
    card.textContent = 'No quota window returned. The internal usage endpoint may have changed.';
    holder.append(card);
    return null;
  }

  const title = document.createElement('div');
  title.className = 'section-head';
  const heading = document.createElement('strong');
  heading.textContent = windows.length > 1 ? 'Current quotas' : windows[0].label;
  title.append(heading);
  if (windows.length > 1) {
    const windowNote = document.createElement('span');
    windowNote.className = 'muted';
    windowNote.textContent = 'rolling windows';
    title.append(windowNote);
  }

  const grid = document.createElement('div');
  grid.className = 'quota-grid';
  for (const window of windows) {
    const item = document.createElement('article');
    item.className = 'quota-window';
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('strong');
    const remaining = document.createElement('span');
    name.textContent = window.label;
    remaining.textContent = Math.round(window.remainingPercent) + '% remaining';
    row.append(name, remaining);
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'fill';
    fill.style.width = String(window.remainingPercent) + '%';
    bar.append(fill);
    const reset = document.createElement('div');
    reset.className = 'muted';
    reset.textContent = resetText(window);
    item.append(row, bar, reset);
    grid.append(item);
  }
  card.append(title, grid);
  if (shortWindow && weeklyWindow) {
    const note = document.createElement('p');
    note.className = 'muted quota-note';
    note.textContent = 'The 5-hour and weekly quotas are tracked separately.';
    card.append(note);
  }
  holder.append(card);
  return preferredWindow(usage) || windows[0];
}
function renderPace(w,h,s){const p=calculatePacing(w,h,{targetRemaining:s.targetRemaining,tolerance:s.paceTolerance});$('safe').textContent=p?.cycle?`${p.safePerDay.toFixed(1)}%/day`:'—';$('timeMarker').style.left=p?.cycle?`${p.cycle.elapsedFraction*100}%`:'0%';$('usageMarker').style.left=Number.isFinite(w?.usedPercent)?`${w.usedPercent}%`:'0%';if(!p?.burn){$('paceStatus').textContent='Collecting';$('paceStatus').className='pill';$('burn').textContent='Learning…';$('emptyAt').textContent='Need observed use';$('atReset').textContent='Need observed use';$('paceNote').textContent=`Safe budget is based only on your ${Math.round(w.remainingPercent)}% remaining and time until reset. Burn-rate projections start after the extension observes actual quota drops across at least 20 minutes of closely spaced samples.`;return}const labels={'too-fast':'Too fast','underusing':'Underusing','on-pace':'On pace'};$('paceStatus').textContent=labels[p.status]||'Observed';$('paceStatus').className=`pill ${p.status==='too-fast'?'bad':''}`;$('burn').textContent=`${p.burn.perDay.toFixed(1)}%/day`;$('emptyAt').textContent=p.exhaustionAt?fmtDate(p.exhaustionAt):'Not projected';$('atReset').textContent=Number.isFinite(p.predictedRemainingAtReset)?`${Math.round(p.predictedRemainingAtReset)}%`:'—';$('paceNote').textContent=`Observed from ${p.burn.segments} quota-change interval${p.burn.segments===1?'':'s'} spanning ${formatDurationMs(p.burn.elapsedMs)}.`}
function draw(history){const c=$('chart'),ctx=c.getContext('2d'),dpr=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);$('historyMeta').textContent=`${history.length} sample${history.length===1?'':'s'}`;if(history.length<2){$('chartEmpty').textContent=history.length===1?'One snapshot stored. The graph appears after another refresh/sample.':'No samples stored yet.';return}$('chartEmpty').textContent='';const pad={l:25,r:6,t:6,b:17},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b,minT=history[0].t,maxT=history.at(-1).t||minT+1,cs=getComputedStyle(document.body);ctx.strokeStyle=cs.color;ctx.fillStyle=cs.color;ctx.globalAlpha=.15;for(const yv of[0,25,50,75,100]){const y=pad.t+ih*(1-yv/100);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+iw,y);ctx.stroke()}ctx.globalAlpha=.9;ctx.lineWidth=2;ctx.beginPath();history.forEach((p,i)=>{const x=pad.l+((p.t-minT)/Math.max(1,maxT-minT))*iw,y=pad.t+ih*(1-p.remaining/100);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}
function renderHeat(history){const heat=buildHeatmap(history,7),holder=$('heatmap');holder.textContent='';heat.buckets.forEach((v,i)=>{const el=document.createElement('i'),r=heat.max?v/heat.max:0,l=r<=0?0:r<=.25?1:r<=.5?2:r<=.75?3:4;el.className=`heat ${l?`l${l}`:''}`;const d=new Date(heat.startMs+i*3600000);el.title=`${d.toLocaleString()}: ${v.toFixed(2)}% quota used`;holder.append(el)});$('heatEmpty').textContent=heat.max>0?'':'No quota drops observed yet. The heatmap fills as usage changes.'}
function parseThresholds(){return $('thresholds').value.split(',').map(x=>Number(x.trim())).filter(n=>Number.isFinite(n)&&n>=0&&n<=100)}
function fillAlerts(s){$('thresholds').value=(s.thresholds||[25,10,0]).join(', ');$('resetAlert').checked=s.resetAlert!==false;$('predictiveAlert').checked=s.predictiveAlert!==false;$('burnAlert').checked=s.burnAlert!==false;$('unusedAlert').checked=s.unusedCapacityAlert!==false;$('emailEnabled').checked=!!s.emailEnabled;$('emailRelayUrl').value=s.emailRelayUrl||'';$('emailRelaySecret').value=s.emailRelaySecret||'';$('discordEnabled').checked=!!s.discordEnabled;$('discordWebhook').value=s.discordWebhook||'';$('telegramEnabled').checked=!!s.telegramEnabled;$('telegramToken').value=s.telegramBotToken||'';$('telegramChat').value=s.telegramChatId||'';const active=[...(s.thresholds||[25,10,0]).map(x=>`${x}%`),s.resetAlert!==false?'reset':null].filter(Boolean);$('alertsSummary').textContent=active.join(' · ');const ex=[];if(s.emailEnabled)ex.push('Email');if(s.discordEnabled)ex.push('Discord');if(s.telegramEnabled)ex.push('Telegram');$('integrationSummary').textContent=ex.length?ex.join(' + '):'Optional'}
async function saveAlerts(){const old=(await chrome.storage.local.get('settings')).settings||{};const settings={...old,thresholds:parseThresholds(),resetAlert:$('resetAlert').checked,predictiveAlert:$('predictiveAlert').checked,burnAlert:$('burnAlert').checked,unusedCapacityAlert:$('unusedAlert').checked,emailEnabled:$('emailEnabled').checked,emailRelayUrl:$('emailRelayUrl').value.trim(),emailRelaySecret:$('emailRelaySecret').value,discordEnabled:$('discordEnabled').checked,discordWebhook:$('discordWebhook').value.trim(),telegramEnabled:$('telegramEnabled').checked,telegramBotToken:$('telegramToken').value.trim(),telegramChatId:$('telegramChat').value.trim()};await chrome.storage.local.set({settings});state.settings=settings;fillAlerts(settings);$('saveStatus').textContent='Saved';setTimeout(()=>$('saveStatus').textContent='',1500)}
async function requestOrigin(url){try{const u=new URL(url);if(u.protocol!=='https:')throw new Error('Only HTTPS integrations are supported');if(u.username||u.password)throw new Error('URLs containing embedded credentials are not supported');return await chrome.permissions.request({origins:[`${u.protocol}//${u.host}/*`]});}catch(e){$('status').textContent=e.message;return false}}
async function testChannel(channel){await saveAlerts();const s=state.settings||{};const url=channel==='email'?s.emailRelayUrl:channel==='discord'?s.discordWebhook:channel==='telegram'?'https://api.telegram.org/':'';if(url&&!(await requestOrigin(url))){$('status').textContent='Host permission was not granted.';return}$('status').textContent=`Testing ${channel}…`;const r=await chrome.runtime.sendMessage({type:'testExternal',channel});$('status').textContent=r?.ok?r.result:r?.error||'Test failed'}
async function load(){state=await chrome.storage.local.get(['usage','history','settings','lastError','lastSuccessAt']);const s=state.settings||{},w=renderLimits(state.usage),h=getCurrentCycleHistory(state.history||[],state.usage);$('plan').textContent=state.usage?.planType?`${state.usage.planType} plan`:'ChatGPT / Codex';if(w)renderPace(w,h,s);draw(h);renderHeat(state.history||[]);const sessions=inferSessions(h);$('sessionCount').textContent=sessions.length?String(sessions.length):'0';$('peakSession').textContent=sessions.length?`${Math.max(...sessions.map(x=>x.burned)).toFixed(1)}%`:'—';$('credits').textContent=String(state.usage?.resetCredits?.filter(c=>c.status==='available').length||0);fillAlerts(s);$('status').textContent=state.lastError?state.lastError:state.lastSuccessAt?`Updated ${new Date(state.lastSuccessAt).toLocaleTimeString()}`:'No successful refresh yet.'}
$('refresh').onclick=async()=>{const b=$('refresh');b.disabled=true;$('status').textContent='Refreshing…';const r=await chrome.runtime.sendMessage({type:'refresh'});if(!r?.ok)$('status').textContent=r?.error||'Refresh failed';else await load();b.disabled=false};$('dashboard').onclick=()=>chrome.runtime.sendMessage({type:'openDashboard'});$('about').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('privacy.html')});$('saveAlerts').onclick=saveAlerts;$('testEmail').onclick=()=>testChannel('email');$('testDiscord').onclick=()=>testChannel('discord');$('testTelegram').onclick=()=>testChannel('telegram');['thresholds','resetAlert','predictiveAlert','burnAlert','unusedAlert'].forEach(id=>$(id).addEventListener('change',saveAlerts));
async function enableIntegration(channel){await saveAlerts();const s=state.settings||{};const enabled=channel==='email'?s.emailEnabled:channel==='discord'?s.discordEnabled:s.telegramEnabled;if(!enabled)return;const url=channel==='email'?s.emailRelayUrl:channel==='discord'?s.discordWebhook:'https://api.telegram.org/';if(!url){$('status').textContent=`Enter the ${channel} configuration first.`;return}const ok=await requestOrigin(url);if(!ok)$('status').textContent='Host permission was not granted.'}
$('emailEnabled').addEventListener('change',()=>enableIntegration('email'));$('discordEnabled').addEventListener('change',()=>enableIntegration('discord'));$('telegramEnabled').addEventListener('change',()=>enableIntegration('telegram'));['emailRelayUrl','emailRelaySecret','discordWebhook','telegramToken','telegramChat'].forEach(id=>$(id).addEventListener('change',saveAlerts));installHelpTooltips();load();setInterval(load,30000);
