const HELP = {
  thresholds: "Comma-separated percentages of quota remaining that trigger an alert once per quota cycle. Example: 25, 10, 0.",
  resetAlert: "Notifies you only after the extension observes that capacity actually increased after a reset. A changed reset timestamp alone is not treated as a reset.",
  predictiveAlert: "Warns when observed usage suggests your remaining quota may be exhausted before the scheduled weekly reset. Requires real usage history.",
  burnAlert: "Warns when your observed daily quota consumption is materially above the sustainable pace needed to reach the reset without running out.",
  unusedAlert: "Warns when a large amount of quota remains close to reset, so you can choose to use capacity that would otherwise expire.",
  unusedThreshold: "Minimum quota percentage that counts as 'unused capacity' for the unused-capacity warning.",
  unusedHours: "How close to reset the unused-capacity warning becomes eligible to fire.",
  cooldown: "Minimum time before the same predictive warning can fire again. Threshold and reset alerts have their own per-cycle deduplication.",
  emailEnabled: "Sends enabled alerts through an email relay that you configure. For public/community installs, use your own Cloudflare Worker/Brevo relay rather than another user's relay.",
  emailRelayUrl: "HTTPS endpoint of your email relay, for example a Cloudflare Worker ending in /email. The Worker should forward only predefined alert events to your email provider.",
  emailRelaySecret: "Shared secret that protects your email relay. This is NOT the Brevo API key. The Brevo key should stay only in your Worker secret storage.",
  discordEnabled: "Sends alerts to a Discord channel through a Discord webhook URL that you create for that channel.",
  discordWebhook: "In Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Keep the URL private because it can post to the channel.",
  telegramEnabled: "Sends alerts to a Telegram chat using a bot that you create with BotFather.",
  telegramToken: "Create a bot with @BotFather using /newbot, then paste the bot token here. Keep it private.",
  telegramChat: "Numeric Telegram chat ID to receive alerts. Start your bot once, then use a Telegram ID bot such as @userinfobot to get your user ID for a private chat.",
  webhookEnabled: "Sends alert event JSON to any HTTPS webhook you control, useful for n8n, Make, Zapier, Home Assistant or custom automation.",
  webhook: "Full HTTPS webhook URL. Host access is requested only for the exact origin you configure.",
  pollMinutes: "How often the extension refreshes Codex quota in the background. 10 minutes is a good balance between freshness and unnecessary requests.",
  toolbarMode: "Controls the badge number: both windows by default, or one selected window, used quota, or pacing status. Hover the icon for exact five-hour and weekly values.",
  overlayEnabled: "Shows a small Codex capacity meter directly on ChatGPT pages so you do not need to open the extension popup.",
  overlayCompact: "Uses the smaller version of the ChatGPT page overlay.",
  targetRemaining: "Optional quota percentage you want left when the weekly reset occurs. Use 0% if your goal is simply not to run out early.",
  paceTolerance: "How much deviation from the ideal quota/time pace is tolerated before the extension labels your pace as too fast or underusing.",
  monthlyCost: "Optional subscription price used only for simple subscription-utilization context. It is not used to estimate token or API-equivalent cost.",
  currency: "Currency label for the optional subscription cost field.",
  range: "Time range shown in the usage-history chart.",
  duration: "Expected duration of a future coding session. The planner estimates quota use only after enough observed session data exists."
};

export function installHelpTooltips(root=document) {
  let popover=root.querySelector?.('.help-popover');
  if (!popover) {
    popover=document.createElement('div');
    popover.className='help-popover';
    popover.id='settings-help-popover';
    popover.setAttribute('role','tooltip');
    popover.hidden=true;
    root.body?.append(popover);
  }
  let active=null;
  const hide=()=>{popover.hidden=true;active=null};
  const show=icon=>{
    active=icon;popover.textContent=icon.dataset.tooltip;popover.hidden=false;
    const rect=icon.getBoundingClientRect(),gap=8,margin=12;
    popover.style.maxWidth=`${Math.max(180,Math.min(320,innerWidth-margin*2))}px`;
    const tip=popover.getBoundingClientRect();
    const left=Math.max(margin,Math.min(innerWidth-tip.width-margin,rect.left+rect.width/2-tip.width/2));
    const above=rect.top-tip.height-gap;
    popover.style.left=`${left}px`;
    popover.style.top=`${above>=margin?above:Math.min(innerHeight-tip.height-margin,rect.bottom+gap)}px`;
  };
  for (const [id, text] of Object.entries(HELP)) {
    const input = root.getElementById?.(id) || root.querySelector?.(`#${CSS.escape(id)}`);
    if (!input) continue;
    let anchor = input.closest('label') || input.parentElement;
    if (!anchor || anchor.querySelector(`.help-icon[data-help-for="${id}"]`)) continue;
    const icon=document.createElement('span');
    icon.className='help-icon'; icon.tabIndex=0; icon.setAttribute('role','button');
    icon.setAttribute('aria-label',`Help: ${text}`); icon.setAttribute('aria-describedby',popover.id); icon.dataset.helpFor=id; icon.dataset.tooltip=text; icon.textContent='i';
    icon.addEventListener('mouseenter',()=>show(icon)); icon.addEventListener('mouseleave',hide);
    icon.addEventListener('focus',()=>show(icon)); icon.addEventListener('blur',hide);
    icon.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();active===icon?hide():show(icon)});
    icon.addEventListener('keydown',event=>{if(event.key==='Escape'){hide();icon.blur()}});
    if (anchor.tagName==='LABEL') {
      if (input.matches('input[type=checkbox]')) anchor.appendChild(icon);
      else anchor.insertBefore(icon, input);
    } else anchor.insertBefore(icon, input);
  }
  addEventListener('scroll',hide,{passive:true});
  addEventListener('resize',hide,{passive:true});
}
