// Example Cloudflare Worker for optional email alerts.
// Configure secrets: BREVO_API_KEY, EXTENSION_SECRET
// Configure variables: ALERT_FROM_EMAIL, ALERT_FROM_NAME, ALERT_TO_EMAIL
const EVENTS = new Set(["test","threshold","capacity_reset","projected_exhaustion","high_burn","unused_capacity"]);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ok:true,service:"codex-capacity-alerts"});
    if (request.method !== "POST" || url.pathname !== "/email") return json({ok:false,error:"Not found"},404);
    if (!env.EXTENSION_SECRET || !env.BREVO_API_KEY || !env.ALERT_FROM_EMAIL || !env.ALERT_TO_EMAIL) return json({ok:false,error:"Relay is not configured"},503);
    if (Number(request.headers.get("content-length") || 0) > 4096) return json({ok:false,error:"Request too large"},413);
    if (request.headers.get("Authorization") !== `Bearer ${env.EXTENSION_SECRET}`) return json({ok:false,error:"Unauthorized"},401);
    let body; try { body = await request.json(); } catch { return json({ok:false,error:"Invalid JSON"},400); }
    if (JSON.stringify(body).length > 4096) return json({ok:false,error:"Request too large"},413);
    if (!EVENTS.has(body?.event)) return json({ok:false,error:"Unsupported event"},400);
    const remaining = Number.isFinite(Number(body.remaining)) ? Math.max(0,Math.min(100,Math.round(Number(body.remaining)))) : null;
    const resetAt = typeof body.resetAt === "string" && body.resetAt.length <= 40 && Number.isFinite(Date.parse(body.resetAt)) ? new Date(body.resetAt).toISOString() : null;
    const subject = body.event === "test" ? "Codex Capacity — test successful" : body.event === "capacity_reset" ? "Codex capacity is back" : remaining !== null ? `Codex quota — ${remaining}% remaining` : `Codex Capacity — ${body.event.replaceAll('_',' ')}`;
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method:"POST",
      headers:{"accept":"application/json","content-type":"application/json","api-key":env.BREVO_API_KEY},
      body:JSON.stringify({
        sender:{name:env.ALERT_FROM_NAME||"Codex Capacity",email:env.ALERT_FROM_EMAIL},
        to:[{email:env.ALERT_TO_EMAIL}],
        subject,
        htmlContent:`<h2>${esc(subject)}</h2><p>${remaining !== null ? `${remaining}% remaining.` : "Codex Capacity alert."}</p>${resetAt?`<p>Reset: ${esc(resetAt)}</p>`:""}`,
        tags:["codex-capacity",body.event]
      })
    });
    let data=null; try { data=await res.json(); } catch {}
    if (!res.ok) return json({ok:false,error:"Email provider rejected the request",providerStatus:res.status},502);
    return json({ok:true,channel:"email",event:body.event,messageId:data?.messageId||null});
  }
};
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json;charset=utf-8","cache-control":"no-store"}})}
