// Bilingual (English + Filipino) onboarding call scripts, ported verbatim
// from gas-webapp/Agent.html's SCRIPTS object. {name} = applicant's first
// name, {agent} = the agent's own name, {goneshName}/{goneshEmail} = the
// onboarding contact added to the WhatsApp group, {sopLink} = SOP doc link.
export const GONESH = { name: "Gonesh Roy", email: "gonesh890620@gmail.com" };

export const AGENT_SCRIPTS: Record<"en" | "ph", Record<string, string>> = {
  en: {
    thankYouAvailability: "Hi {name}! Thank you so much for applying and showing interest in joining our team here at Franbooking. I'd love to set up a quick 15-20 minute introductory call to get to know you better and answer any questions. When would be a good time for you? Or if you're free right now, we can hop on a call straight away!",
    groupInstruction: "Create a WhatsApp group with {name} and add {goneshName} ({goneshEmail}) to it.",
    intro: "Hello, I'm {agent}. For the past several years I've been working with the Franbooking recruiting team, and I'm really glad to hear that you applied here on OnlineJobs.ph.\n\nBefore we get started, do you have any questions for me?",
    company: "Franbooking - previously known as Prospect Direct - is a lead generation company for franchise brokers and brands. Over the last 8 years we've worked with 500+ clients. Our current outreach method is LinkedIn-based outreach.",
    earning: "There's no cap on earnings - it's a solid pay-per-appointment structure. You earn $40 per appointment. Payments are made through Wise, biweekly: the 1st-15th appointments are paid on the 16th of the month, and the 16th-30th/31st appointments are paid at the start of the following month.",
    trust: "I've personally worked with this company for over 4 years and have seen steady, progressive earnings. They've never once delayed a payment in any billing cycle. They use their own internal tools to manage everything, and if you'd like, I'm happy to hop on Zoom or Google Meet and screen-share to show you exactly what we do.",
    transition: "Great, before we move forward I just have a few quick questions.",
    liConcernQ: "1. Do you have any concerns about using your own LinkedIn account for this?",
    liConcernReassure: "That's a really common concern - LinkedIn restrictions usually happen from spammy templates or high sending volume. But the company is very careful about LinkedIn account safety. We keep sends per day limited per Sales Navigator seat, and once you see the outreach copy we use, you'll immediately see it's professional and legitimate, not spammy at all.",
    connectionsQ: "How many connections do you currently have?",
    profileUpdate: "Before we get started, you'll need to update your LinkedIn profile to reflect your new role. You'll also update your profile banner to the one we use across the whole team - I'll share my LinkedIn profile in the group so you can see the format, and you can download the cover photo from there to use on your own profile.",
    qOtherProject: "Are you currently working on any other projects?",
    qHandleSends: "Are you comfortable handling regular outreach sends and nurturing conversations?",
    qWorkType: "Would this be full-time or part-time for you?",
    qBestTime: "What's your best working time?",
    sopMessage: "Here's our SOP (Standard Operating Procedure) - please read through it fully: {sopLink}",
    onboardLiEmailAsk: "Nice, you're all set on the LI profile! Can you send me the email address linked to your LinkedIn account? I'll use it to get your Sales Navigator activated and your login credentials sent over.",
    notifyGoneshInstruction: "Post in the group and ask {goneshName} to send the Login Panel credentials and the Sales Nav activation link, then check this box once sent.",
    zoomInvite: "Let's hop on a quick Zoom call so I can introduce you to the dashboard and walk you through exactly how everything works.",
    confirmSendsInstruction: "On this call, pull up your Sales Navigator and show me your sent InMails and Invites so we can confirm everything went out correctly."
  },
  ph: {
    thankYouAvailability: "Hi {name}! Maraming salamat sa pag-apply at sa interes mo sa aming team dito sa Franbooking. Gusto ko sana mag-set ng mabilis na 15-20 minutong introductory call para makilala ka pa namin at masagot ang mga tanong mo. Kailan ka available? O kung free ka ngayon, pwede na rin tayong mag-usap agad!",
    groupInstruction: "Gumawa ng WhatsApp group kasama si {name} at idagdag si {goneshName} ({goneshEmail}).",
    intro: "Hello po, ako si {agent}. Ilang taon na akong kasama ng Franbooking recruiting team, at masaya akong malaman na nag-apply kayo dito sa OnlineJobs.ph.\n\nBago tayo magsimula, meron ba kayong tanong sa akin?",
    company: "Ang Franbooking - dati ay kilala bilang Prospect Direct - ay isang lead generation company para sa mga franchise broker at brand. Sa nakaraang 8 taon, nakatrabaho na namin ang mahigit 500 clients. Ang kasalukuyang paraan ng outreach namin ay sa pamamagitan ng LinkedIn.",
    earning: "Walang cap sa kikitain - solid ang pay-per-appointment na setup. $40 kada appointment. Ang bayad ay sa Wise, tuwing dalawang linggo (biweekly): ang mga appointment mula ika-1 hanggang ika-15 ay babayaran sa ika-16 ng buwan, at ang mga appointment mula ika-16 hanggang ika-30/31 ay babayaran sa simula ng susunod na buwan.",
    trust: "Higit 4 na taon na akong nagtatrabaho dito at unti-unti akong kumikita nang mas malaki. Hindi pa sila kailanman na-delay sa bayad sa kahit anong billing cycle. Gumagamit sila ng sarili nilang mga tools para sa lahat. Kung gusto niyo makita mismo kung ano ang ginagawa namin, pwede tayong mag-Zoom o Google Meet at mag-screen share.",
    transition: "Ang galing, bago tayo tumuloy, meron lang akong ilang tanong.",
    liConcernQ: "1. May issue ba kayo sa paggamit ng sarili niyong LinkedIn account?",
    liConcernReassure: "Normal lang ang alalahanin na iyan - kadalasan nagkakaroon ng restriction dahil sa spammy na template o sobrang dami ng sends. Pero talagang inaalagaan ng company ang LinkedIn account niyo. May limitasyon kami sa bilang ng sends kada araw kada Sales Navigator seat, at kapag nakita niyo na ang aming outreach copy, mapapansin niyo agad na propesyonal ito at hindi spammy.",
    connectionsQ: "Ilan ang connections niyo ngayon?",
    profileUpdate: "Bago tayo magsimula, kailangan niyong i-update ang inyong LinkedIn profile ayon sa bagong role niyo. Iu-update rin niyo ang inyong profile banner gamit ang ginagamit namin sa buong team - ise-share ko ang aking LinkedIn profile sa group para makita niyo ang format, at pwede niyo na i-download doon ang cover photo para gamitin sa sarili niyong profile.",
    qOtherProject: "May kasalukuyan po ba kayong ibang project?",
    qHandleSends: "Kaya niyo bang mag-handle ng regular na outreach sends at nurturing ng mga conversations?",
    qWorkType: "Full-time o part-time po ang gusto niyo?",
    qBestTime: "Ano ang pinaka-magandang oras para sa inyo para magtrabaho?",
    sopMessage: "Narito ang aming SOP (Standard Operating Procedure) - pakibasa nang mabuti: {sopLink}",
    onboardLiEmailAsk: "Ang galing, tapos na tayo sa LI profile! Pwede po ba ninyong ipadala ang email na naka-link sa inyong LinkedIn account? Gagamitin ko ito para i-activate ang inyong Sales Navigator at maipadala ang login credentials ninyo.",
    notifyGoneshInstruction: "Mag-post sa group at hilingin kay {goneshName} na ipadala ang Login Panel credentials at ang Sales Nav activation link, pagkatapos i-check ang box na ito kapag naipadala na.",
    zoomInvite: "Mag-quick Zoom call tayo para maipakilala ko sa inyo ang dashboard at ipaliwanag kung paano gumagana ang lahat.",
    confirmSendsInstruction: "Sa call na ito, buksan ninyo ang Sales Navigator at ipakita sa akin ang mga naipadala ninyong InMail at Invites para makumpirma na tama ang lahat ng naipadala."
  }
};

export function firstName(fullName: string) {
  return String(fullName || "").trim().split(/\s+/)[0] || fullName || "there";
}

export function scriptText(lang: "en" | "ph", key: string, vars: { name: string; agent: string; sopLink?: string }) {
  const tpl = AGENT_SCRIPTS[lang][key] || "";
  return tpl.replace(/\{(\w+)\}/g, (m, k) => {
    if (k === "name") return vars.name;
    if (k === "agent") return vars.agent;
    if (k === "goneshName") return GONESH.name;
    if (k === "goneshEmail") return GONESH.email;
    if (k === "sopLink") return vars.sopLink || "";
    return m;
  });
}
