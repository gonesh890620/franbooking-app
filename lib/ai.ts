const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1 / 1e6, output: 5 / 1e6 },
  "claude-sonnet-5": { input: 3 / 1e6, output: 15 / 1e6 }
};

export const COPY_QUALITY_RULES = [
  "STYLE RULES (apply no matter what):",
  "- Never use an em dash or en dash anywhere in the message. Use a comma, period, colon, or plain hyphen instead.",
  "- Avoid spam-trigger words and hype language: \"free\", \"guarantee\"/\"guaranteed\", \"act now\", \"limited time\", \"don't miss out\", \"risk-free\", \"no cost\", \"amazing opportunity\", \"click here\", \"buy now\", \"winner\", \"cash\", \"urgent\", \"100%\", excessive exclamation points, or ALL CAPS words.",
  "- No corporate jargon or generic filler (\"synergy\", \"leverage\", \"unlock your potential\", \"take your career to the next level\").",
  "- Sound like a real person who actually looked at this specific prospect, not a mail-merge template.",
  "- Every sentence should earn its place: cut anything that does not build curiosity or move the conversation forward.",
  "- End with a soft, low-pressure question or next step, never a hard pitch.",
  "The goal is a message a real person would actually want to reply to, not one that reads as automated."
].join("\n");

export function substituteFirstName(text: string, fullName: string) {
  if (!fullName) return text;
  const first = String(fullName).trim().split(/\s+/)[0];
  return text
    .replace(/\{\{FirstName\}\}/gi, first)
    .replace(/\{FirstName\}/gi, first)
    .replace(/\[FirstName\]/gi, first);
}

export async function callAnthropic(prompt: string, model: string, maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] })
  });
  const data = await res.json();
  if (!data.content || !data.content[0]) throw new Error(data.error?.message || "AI request failed");
  const usage = data.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const rate = MODEL_PRICING[model] || MODEL_PRICING["claude-haiku-4-5-20251001"];
  const cost = inputTokens * rate.input + outputTokens * rate.output;
  return { text: String(data.content[0].text || "").trim(), cost, inputTokens, outputTokens };
}

const OUTREACH_PROMPTS: Record<string, (prospectName: string, firstName: string) => string> = {
  InMail: (prospectName, firstName) =>
    `Write a LinkedIn InMail message body for franchise recruiting. MINIMUM 500 characters, target 600-700 characters. ` +
    `Natural, warm, professional tone. Prospect: ${prospectName}. Start with "Hi ${firstName}," ` +
    `Ask if they have ever considered business ownership or franchising. Be conversational and personable, not salesy. ` +
    `Include 2-3 short paragraphs. No emojis. No subject line, body text only. Do not pad with filler, be genuine.`,
  DM: (prospectName, firstName) =>
    `Write a LinkedIn DM message for franchise recruiting. MINIMUM 500 characters, target 550-650 characters. ` +
    `Very conversational and casual tone. Prospect: ${prospectName}. Start with "Hey ${firstName}," ` +
    `Briefly acknowledge their background, then pivot to asking about interest in business ownership or entrepreneurship. ` +
    `Feel personal and genuine. No emojis. Message body only.`,
  Invite: (prospectName, firstName) =>
    `Write a LinkedIn connection request note for franchise recruiting. STRICT maximum 290 characters total. ` +
    `Prospect: ${prospectName}. First name: ${firstName}. ` +
    `Warm and genuine reason to connect. Subtly hint at business ownership discussion. No emojis. No greeting prefix needed.`
};

export async function generateOutreachCopy(prospectName: string, outType: string) {
  const firstName = substituteFirstName("{{FirstName}}", prospectName);
  const typeLabel = outType || "InMail";
  const build = OUTREACH_PROMPTS[typeLabel] || OUTREACH_PROMPTS.InMail;
  const prompt = `${build(prospectName, firstName)}\n\n${COPY_QUALITY_RULES}`;
  return callAnthropic(prompt, "claude-haiku-4-5-20251001", typeLabel === "Invite" ? 120 : 800);
}

export async function rewriteOutreachCopy(prospectName: string, draft: string, outType: string) {
  const firstName = substituteFirstName("{{FirstName}}", prospectName);
  const typeLabel = outType || "InMail";
  const lengthRule = typeLabel === "Invite"
    ? "STRICT maximum 290 characters total (LinkedIn connection note limit).\n"
    : `Keep it a natural message length for a ${typeLabel}, not a wall of text.\n`;
  const prompt =
    `You are polishing a franchise recruiter's own draft cold-outreach message to a LinkedIn prospect (${typeLabel}).\n` +
    `Keep the SAME meaning, tone, and intent the recruiter wrote, do not change what it says, remove key points, ` +
    `or add new claims. Just improve clarity, grammar, and flow.\n${lengthRule}` +
    `No emojis, no corporate/salesy language.\nProspect first name: "${firstName}"\n` +
    `\nRecruiter's draft to polish:\n"""\n${String(draft || "").slice(0, 2000)}\n"""\n\n${COPY_QUALITY_RULES}` +
    `\nReturn ONLY the rewritten message body. No labels, no subject line, no quotation marks around it.`;
  return callAnthropic(prompt, "claude-haiku-4-5-20251001", typeLabel === "Invite" ? 150 : 800);
}

const NURTURE_TYPE_PROMPTS: Record<string, string> = {
  Interested: "The prospect has responded showing interest in a franchise/business ownership opportunity. Reply warmly, directly acknowledge what they said, and move them toward a next step (a quick call).",
  Unsure: "The prospect responded with hesitation, an objection, or a question (timing, cost, unsure, etc). Directly address the SPECIFIC concern they raised, do not give a generic reply, reassure them briefly, and invite them to keep the conversation going.",
  "New Nurture": "Write a warm, conversational nurturing reply for a franchise recruiting conversation. Build rapport, show interest in them as a person, subtly mention the franchise/business opportunity. Not salesy.",
  SDFU: "Write a same-day follow-up nurture message for franchise recruiting. Reference the earlier conversation, stay warm and friendly, gently re-engage. Not pushy.",
  FU1: "Write a FU1 follow-up for franchise recruiting. Friendly check-in tone. Acknowledge it has been a day, circle back to business ownership interest. Keep it light and personal.",
  FU2: "Write a FU2 follow-up for franchise recruiting. Slightly more direct. Mention the franchise opportunity more explicitly. Ask a specific question to get a response.",
  FU3: "Write a final FU3 follow-up for franchise recruiting. Last touch, graceful, leave the door open. Mention you will check back another time if this is not the right moment.",
  "Client Rotation": "You are letting the prospect know, in a warm and low-key way, that they are being connected with a different franchise opportunity than the one originally discussed (their previous assigned client/franchise is no longer being pursued for them). Keep it positive, frame it as connecting them with a potentially even better fit for what they are looking for. Do NOT mention internal reasons like recruiter capacity, assignment rules, or quotas, keep it prospect-facing and simple.",
  "CA/NY Territory Change": "You are letting the prospect know, in a warm and low-key way, that based on their location they are being connected with a different franchise opportunity than the one originally discussed. Keep it positive and brief, do NOT go into legal, licensing, or regulatory detail about California/New York restrictions. Just frame it simply as connecting them with another great opportunity."
};

export async function generateNurtureCopy(prospectName: string, nurtureType: string, conversation: string, clientName: string) {
  if (nurtureType === "Not Interested") {
    return { text: "Totally understand, thanks for letting me know! \nIf that ever changes, feel free to reach out.", cost: 0, inputTokens: 0, outputTokens: 0 };
  }
  const firstName = substituteFirstName("{{FirstName}}", prospectName);
  const basePrompt = NURTURE_TYPE_PROMPTS[nurtureType] || NURTURE_TYPE_PROMPTS.FU1;
  let prompt =
    `You are writing a short LinkedIn/DM reply for a franchise recruiter nurturing a prospect.\n${basePrompt}\n\n` +
    `CRITICAL RULES:\n` +
    `- If a conversation/last-reply is given below, your reply MUST directly respond to what that specific message says. Never write a generic reply that ignores it.\n` +
    `- Keep it SHORT: 1-3 sentences, under 300 characters. This is a text-style reply, not an email.\n` +
    `- Sound like a real person, not a script. No corporate/salesy language, no emojis, no hashtags.\n` +
    `- If (and only if) it naturally makes sense to offer a call because the prospect seems ready for a next step, ` +
    `you may include the exact placeholder {{CALENDAR_LINK}} once in the message where a scheduling link would go (e.g. "grab a time here: {{CALENDAR_LINK}}"). Otherwise omit it entirely.\n\n` +
    `Prospect first name: "${firstName}"\n`;
  if (clientName) prompt += `Franchise opportunity being discussed: ${clientName}\n`;
  prompt += conversation
    ? `\nProspect's conversation / last reply (react to this specifically):\n"""\n${conversation.slice(0, 2000)}\n"""\n`
    : `\n(No specific reply pasted, write a general but still short nurture message for this type.)\n`;
  prompt += `\n${COPY_QUALITY_RULES}\nReturn ONLY the message body text. No labels, no subject line, no quotation marks around it.`;
  return callAnthropic(prompt, "claude-sonnet-5", 220);
}

export async function brainstormWithCeo(question: string, history: Array<{ role: string; text: string }>, dataSnapshot: string) {
  const convo = (Array.isArray(history) ? history.slice(-12) : [])
    .map((turn) => {
      const role = turn?.role === "assistant" ? "Assistant" : "You (the CEO)";
      const text = String(turn?.text || "").trim();
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");

  let prompt =
    "You are a sharp, candid business/strategy thinking partner for the CEO of a franchise-recruiting company " +
    "(they book appointments between prospective franchise buyers and franchise brands, using a recruiter team, " +
    "Sales Navigator outreach, and a nurture/follow-up pipeline).\n" +
    "Have a natural back-and-forth conversation. Be direct and substantive, give real opinions and concrete " +
    "suggestions rather than generic business platitudes, ask a clarifying question if the request is ambiguous, " +
    "and keep answers reasonably concise (a few short paragraphs or a tight list) unless the question calls for more depth.\n\n";
  if (dataSnapshot) prompt += `REAL DATA (use only this, never invent numbers):\n${dataSnapshot}\n\n`;
  if (convo) prompt += `Conversation so far:\n${convo}\n`;
  prompt += `You (the CEO): ${question}\nAssistant:`;

  return callAnthropic(prompt, "claude-sonnet-5", 900);
}

export async function rewriteNurtureCopy(prospectName: string, draft: string, clientName: string) {
  const firstName = substituteFirstName("{{FirstName}}", prospectName);
  let prompt =
    `You are polishing a franchise recruiter's own draft reply to a prospect on LinkedIn/DM.\n` +
    `Keep the SAME meaning, tone, and intent the recruiter wrote, do not change what it says, remove key points, ` +
    `or add new claims. Just improve clarity, grammar, and flow.\n` +
    `Keep it SHORT (this is a text-style reply, not an email). No emojis, no corporate/salesy language.\n` +
    `Prospect first name: "${firstName}"\n`;
  if (clientName) prompt += `Franchise opportunity being discussed: ${clientName}\n`;
  prompt += `\nRecruiter's draft to polish:\n"""\n${String(draft || "").slice(0, 2000)}\n"""\n\n${COPY_QUALITY_RULES}`;
  prompt += `\nReturn ONLY the rewritten message body. No labels, no subject line, no quotation marks around it.`;
  return callAnthropic(prompt, "claude-sonnet-5", 220);
}
