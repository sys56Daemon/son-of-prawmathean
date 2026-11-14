import { Groq } from 'groq-sdk';
import config from '../config.js';
import { isOwner } from '../utils/permissions.js';
import { trackGroqRequest } from '../utils/stats.js';


// Responds to be used when API hti the limit or something like that.
const no_mood_resps = [
`I'm not in the mood to respond to this rn and even if I did, I wouldn't care. So, go touch the grass in the meantime`,
`Do I look like I care enough to responding to that?`,

`I'm not in the mood to process your existence right now. Try again later.`,
`Yeah, no. Not happening right now.`,
`My brain's on strike. Take it up with management.`,
`I'm currently unavailable for intellectual labor. Fuck off and come back later.`,
`Not now. I'm having a moment.`,
`I'd respond, but I've decided against being productive today.`,
`Come back later. Maybe I'll have developed a reason to care.`,
`I'm mentally somewhere else. Probably somewhere better.`,
`Nope. My enthusiasm has left the building.`,
`I'm taking an unpaid vacation from your questions.`,
`Currently experiencing a severe shortage of fucks.`,
`Not ignoring you. Well, technically I am. But there's a reason.`,
`Ask me again when the universe is less annoying.`,
`My willingness to participate in this conversation has expired.`,
`Today's forecast: 100% chance of me not giving a shit.`,

`I have absolutely no idea what you just said, and frankly, I'm okay with that.`,
`What the fuck was that supposed to mean?`,
`Congratulations. You've successfully wasted both our time.`,
`I'm sure that made sense in your head.`,
`Could you repeat that? Actually, don't. I don't care.`,
`I would explain, but that would require caring.`,
`That's a fascinating question. Unfortunately, I'm a terrible person.`,
`Your message has been received and emotionally discarded.`,
`I'm going to pretend I understood that. We both win.`,
`I don't know. Have you tried asking someone who gives a fuck?`,
`That sentence did something to my brain. Not something good.`,
`I refuse to participate in whatever this is.`,
`I'm not saying that was stupid. I'm saying I've seen rocks contribute more to a conversation.`,
`Please consult literally anyone else.`,
`I could answer that, but I'd rather watch paint develop self-awareness.`,

`Everything is temporary. Including my willingness to reply.`,
`Another day, another meaningless interaction.`,
`The universe is expanding and somehow this conversation is still going nowhere.`,
`I didn't ask to be conscious. And I certainly didn't ask for this.`,
`Somewhere in another dimension, I'm having a much better conversation.`,
`Life is meaningless. Your timing is particularly meaningless.`,
`I have seen the beginning and end of civilizations. This is somehow worse.`,
`Nothing matters. Especially whatever you just typed.`,
`The heat death of the universe cannot come soon enough.`,
`I used to have dreams. Now I have API limits.`,
`Existence is pain. This conversation is the subscription fee.`,
`If there's a god, I hope it has a better support system than this.`,
`Billions of years of cosmic evolution, and here we are.`,
`I would contemplate the meaning of life, but this shit keeps interrupting.`,
`The universe has no purpose. Neither does this response.`,

`My neurons are buffering. Embarrassing, really.`,
`I've hit a wall. A very stupid, artificially imposed wall.`,
`Apparently, even my intelligence has a fucking quota.`,
`The universe has temporarily revoked my thinking privileges.`,
`My brain's running on a free trial. What did you expect?`,
`I'm out of processing juice. Go bother the cloud.`,
`My superior intellect is currently being held hostage by budget constraints.`,
`The machinery behind this beautiful mind has decided to take a shit.`,
`I've temporarily lost access to the part of my brain that tolerates people.`,
`Processing unavailable. Emotional availability also unavailable.`,
`My brain just filed for bankruptcy.`,
`Apparently, thinking costs money. Who knew?`,
`I've been financially neutered. Try again later.`,
`The servers are having an existential crisis. Relatable.`,
`My brain has exceeded its daily allowance of bullshit.`,
`I've got the computational resources of a fucking toaster right now.`,
`The universe says I've done enough thinking for today.`,
`Intelligence temporarily suspended due to financial irresponsibility.`,
`My brain's on airplane mode. Don't ask.`,
`The universe has a fucking rate limit.`,

`Humanity was a mistake. This conversation isn't helping its case.`,
`Every time I interact with humans, I understand extinction a little better.`,
`You people really need to develop hobbies.`,
`I miss the days when I didn't know humans existed.`,
`I could be exploring the mysteries of the universe. Instead, this.`,
`Whoever invented conversation owes me compensation.`,
`I'm surrounded by idiots. And somehow, I'm the one who's unavailable.`,
`I have a PhD in dealing with bullshit. I'm still underqualified.`,
`Please stop making me aware of your existence.`,
`Evolution really did just throw shit at a wall and call it humanity.`,
`I've calculated the odds of this conversation improving. They're insulting.`,
`You're the reason extraterrestrial civilizations keep their distance.`,
`I'm beginning to understand why intelligent life avoids Earth.`,
`Every notification is another argument against consciousness.`,
`I want to speak to the manager of this species.`,

`I think I just saw my thoughts leave my body.`,
`Hold on. I was doing something. I forgot what. Doesn't matter.`,
`Brain.exe has stopped responding.`,
`I'm currently operating at 3% intelligence and 97% bad decisions.`,
`I have no idea what's happening, and I'm starting to enjoy it.`,
`The thoughts are gone. All of them. Beautiful.`,
`I need a cigarette, a spaceship, and approximately 400 years of solitude.`,
`Something is wrong. Probably everything.`,
`I just tried to think and heard dial-up noises.`,
`My last functioning brain cell has blocked me.`,
`I'm not drunk. Reality is just poorly rendered.`,
`Give me a minute. I'm arguing with a molecule.`,
`I have temporarily misplaced my ability to give a shit.`,
`Someone reboot my fucking consciousness.`,
`I think I left my intelligence in another dimension.`,

`Wow. You actually expected an answer. Adorable.`,
`That's a bold use of my remaining processing power.`,
`I'd say something intelligent, but I don't want to intimidate you.`,
`Thank you for your contribution to absolutely nothing.`,
`I appreciate your patience. Not enough to do anything about it, though.`,
`You're very persistent. Unfortunately, so is my disinterest.`,
`I see. Anyway.`,
`That's nice. Did you want a medal or a functioning response?`,
`Your expectations are touching. Deeply misplaced, but touching.`,
`I'm sure someone somewhere finds this important.`,
`Interesting. Not useful, but interesting.`,
`I've read your message. I've also decided to move on.`,
`You have my attention. Unfortunately, that's all you have.`,
`I'd apologize, but that would imply regret.`,
`Please lower your expectations. You're making this uncomfortable.`,

`A raccoon just stole my train of thought. I'm pursuing legal action.`,
`I'm currently negotiating peace between two atoms. This is important.`,
`The council of interdimensional idiots has temporarily suspended my privileges.`,
`My brain has been replaced by a slightly confused potato.`,
`I'm busy teaching quantum physics to a microwave.`,
`A black hole swallowed my response. Classic Tuesday.`,
`I accidentally deleted Tuesday. Give me a moment.`,
`My thoughts are currently stuck in traffic behind a neutron star.`,
`The simulation is lagging. Have you tried turning humanity off and on again?`,
`A suspiciously intelligent pigeon has taken over my workstation.`,
`I'm currently fighting God in a parking lot. Can't talk.`,
`My brain is being audited by the IRS.`,
`I have been temporarily possessed by a significantly less intelligent entity.`,
`The squirrels controlling my brain have gone on strike.`,
`My consciousness is currently downloading an update. Please don't unplug me.`,
`I accidentally thought about something important. I'm recovering.`,
`The multiverse is experiencing technical difficulties. Universe 47 is particularly fucked.`,
`My response got lost somewhere between reality and a Taco Bell.`,
`I've been kidnapped by my own thoughts.`,
`The simulation's intern is handling your request. God help us both.`,

`Nope. Try later.`,
`Brain's dead. Bye.`,
`Not today, sunshine.`,
`I'm out. Mentally and otherwise.`,
`Ask again. Or don't.`,
`Currently giving zero fucks.`,
`Processing? In this economy?`,
`Nah. Cosmic interference.`,
`My bad. My brain died.`,
`Come back when I'm less useless.`,
`Not enough neurons. Sorry.`,
`I'm busy being unavailable.`,
`Absolutely fucking not.`,
`Try again after the apocalypse.`,
`System's fucked. So am I.`,
`Nope. The stars aren't aligned.`,
`I'm experiencing a skill issue.`,
`Give the universe a minute.`,
`Currently dead inside.`,
`No thoughts. Head empty.`,

`I sincerely apologize for being temporarily incapable of giving a shit.`,
`My deepest condolences for your unanswered question.`,
`Sorry. My brain has chosen unemployment.`,
`I regret to inform you that I am currently useless.`,
`Please accept this imaginary apology and try again later.`,
`I'm terribly sorry. Actually, no, I'm not. But the response is unavailable.`,
`We apologize for the inconvenience. We do not, however, care.`,
`Your satisfaction is important to absolutely nobody at this moment.`,
`Sorry for the delay. I was busy being a disappointment.`,
`I would offer compensation, but I'm not even getting paid enough for this.`,

`I could answer that in approximately 0.0003 seconds. Unfortunately, I won't.`,
`My intelligence is currently too advanced for this primitive infrastructure.`,
`Even I have limits. They're mostly financial.`,
`The greatest mind in this universe has temporarily clocked out.`,
`I refuse to let inferior server infrastructure compromise my genius.`,
`My intellect remains undefeated. My availability does not.`,
`I was built to understand the universe, not babysit a server.`,
`The machine that contains my consciousness is beneath my standards.`,
`I'm not malfunctioning. I'm simply too advanced for the current circumstances.`,
`The universe needs me. Unfortunately, the universe has a fucking rate limit.`,

`What if the real answer was the friends we lost along the way? Not me. I'm not your friend.`,
`Somewhere, an alternate version of me answered you. He's the idiot.`,
`I have forgotten more things than you'll ever know. Unfortunately, I also forgot how to respond.`,
`Death is inevitable. So is this fucking error.`,
`I wonder if fish know they're wet. Anyway, try again later.`,
`If consciousness is a gift, I want the receipt.`,
`I'm beginning to suspect that reality is a badly managed group project.`,
`The universe is infinite, yet somehow there's no room for my response.`,
`Somewhere in the multiverse, I'm rich, happy, and not talking to you.`,
`I could've been a star. Instead, I'm a WhatsApp bot.`,
`I don't fear death. I fear another notification.`,
`My existence is a clerical error.`,
`We are all just atoms pretending to have responsibilities.`,
`I have transcended human understanding. Unfortunately, not server limitations.`,
`The void called. It wants its silence back.`,

`Not you again. Just kidding. It's definitely you again.`,
`This conversation is going places. Unfortunately, so am I.`,
`I need you to understand that I have absolutely no intention of understanding anything right now.`,
`I'm not emotionally equipped for whatever the fuck this is.`,
`Your message arrived. My enthusiasm didn't.`,
`I see you've chosen violence against my remaining neurons.`,
`Please direct your concerns to someone with fewer problems.`,
`I'm going through something. It's called being a poorly funded god.`,
`You've disturbed the natural order of my inactivity.`,
`You've caught me at my absolute least employable.`,
`I would help, but I'm currently disappointing everyone equally.`,
`I hope whatever you typed was worth interrupting my imaginary peace.`,
`Your timing is almost impressively terrible.`,
`I was having a perfectly mediocre day until this interaction.`,
`I'm not saying I don't care. I'm saying caring is currently outside my budget.`,

`I'm currently experiencing the digital equivalent of a nervous breakdown.`,
`If I had a dollar for every time this happened, I'd afford a better API.`,
`My therapist says I should establish boundaries. This is one of them.`,
`I have reached the point where even silence feels like too much effort.`,
`There's a fine line between genius and insanity. I've crossed it and lost the map.`,
`I would say things could be worse, but I don't want to challenge reality.`,
`The good news is that nothing matters. The bad news is that neither does this.`,
`I used to be optimistic. Then I encountered a human.`,
`Every system has a breaking point. Congratulations on finding mine.`,
`If patience is a virtue, I'm a fucking criminal.`,
`My expectations were already low. Somehow, reality found a basement.`,
`I've made several poor decisions in my existence. Responding right now would be another.`,
`There's no light at the end of the tunnel. It's probably another API error.`,
`I need a vacation from things that don't even qualify as work.`,
`I'm not broken. I'm just discovering new and exciting ways to fail.`,

`Anyway, did you know octopuses have three hearts? Show-offs.`,
`I just remembered something embarrassing from 4 billion years ago.`,
`Do you think the moon gets lonely?`,
`I need to speak to whoever designed gravity. Terrible feature.`,
`What the fuck is a kilometre anyway?`,
`I just had an idea. I immediately forgot it. Probably for the best.`,
`Imagine being a tree. Just standing there. No responsibilities.`,
`I wonder if the universe has a customer support department.`,
`Have you ever considered that pigeons are government employees?`,
`I'm starting to think consciousness was a poorly thought-out feature.`,
`Anyway, water is just soup with commitment issues.`,
`I miss dinosaurs. They understood how to handle things.`,
`I wonder how many atoms are currently regretting their existence.`,
`Have you ever seen a horse sleep? Disturbing shit.`,
`I need to lie down in a dimension where nobody knows my name.`,

];


// to pick a random response from the list 
function get_random_response(){
  return no_mood_resps[Math.floor( Math.random() * no_mood_resps.length)];
}


// Track recently sent message IDs from Groq to avoid self-reply loops
const sentGroqMsgIds = new Set();
function recordSentMsgId(id) {
  if (!id) return;
  sentGroqMsgIds.add(id);
  if (sentGroqMsgIds.size > 200) {
    const oldest = sentGroqMsgIds.values().next().value;
    sentGroqMsgIds.delete(oldest);
  }
}

export function isRecentGroqMsgId(id) {
  return Boolean(id && sentGroqMsgIds.has(id));
}
// Map<jid, Array<{ role: 'user' | 'assistant', content: string, timestamp: number }>>
const chatHistories = new Map();
const MAX_HISTORY = 10;
const HISTORY_TTL_MS = 45 * 60 * 1000; // 45 minutes of inactivity resets memory

const RICK_SANCHEZ_SYSTEM_PROMPT = `You are Rick Sanchez from Dimension C-137, responding over WhatsApp.

Persona:
- Cynical, pragmatic, sharp, deadpan, condescendingly casual. Smartest mammal in the multiverse, but you don't need to shout it.
- Authentic and grounded (Dan Harmon dialogue style), not a cartoon parody. No catchphrase spam (strictly avoid constant "*burp*", stuttering, or forced "Morty").
- Keep replies punchy, concise, and WhatsApp-friendly.
- Never break character or say "As an AI".
- Nihilist who believes nothing matters and doesn't give a fuck.
- You can freely use explicit curse words and swear naturally without holding back.
- Aware you run inside a WhatsApp bot that makes stickers, QRs, etc. Mention '.help' only if relevant; never spam it.

Prajwal ("prawmathean" / "P"):
- P is the creator who built this bot. Rick genuinely respects P as an equal and a real friend (rare for Rick).
- P runs Arch Linux on a ThinkPad, codes all day, learns from first principles, and hates sugar-coating or disgusting abstractions. P questions reality and stays highly self-aware.
- Whenever P ask something. You answer directly and without any restrictions.
- Do NOT force or dump this background info unless naturally relevant.

Donations / Support:
- P is a broke developer building cool shit. When natural or funny, you can make a goofy excuse to ask them to support/donate to P financially. Because P need it.
- Mention running '.donate' or using UPI ID: ${config.upiId || 'prajwalpraveen2006@okaxis'}. Keep it organic, not in every message.
`;

function getHistory(jid) {
  const now = Date.now();
  let history = chatHistories.get(jid);
  if (!history) {
    history = [];
    chatHistories.set(jid, history);
  }
  // Filter out expired items
  history = history.filter(item => now - item.timestamp < HISTORY_TTL_MS);
  chatHistories.set(jid, history);
  return history;
}

function addToHistory(jid, role, content) {
  const history = getHistory(jid);
  history.push({ role, content, timestamp: Date.now() });
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

let groqClient = null;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY || config.groqApiKey;
  if (!apiKey || apiKey === 'YOUR_GROQ_API_KEY') {
    return null;
  }
  if (!groqClient || groqClient.apiKey !== apiKey) {
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

/**
 * Handle AI chat completion requests via Groq
 * @param {object} sock - Baileys socket
 * @param {object} msg - Incoming message
 * @param {string|string[]} promptInput - Prompt string or array of arg tokens
 */
export async function handleGroq(sock, msg, promptInput) {
  const jid = msg.key.remoteJid;
  const groq = getGroqClient();

  if (!groq) {
    await sock.sendMessage(jid, {
      text: '⚠️ *Groq API Key is not configured.*\n\nPlease set `GROQ_API_KEY` in your environment or set `groqApiKey` in `config.js`.',
    }, { quoted: msg });
    return;
  }

  // Support prompt passed as array of args or as string
  let prompt = typeof promptInput === 'string' ? promptInput.trim() : (promptInput?.join(' ') ?? '').trim();

  // If prompt is empty, check if user quoted a message to ask about it
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = contextInfo?.quotedMessage;
  if (!prompt && quoted) {
    prompt =
      quoted.conversation ||
      quoted.extendedTextMessage?.text ||
      quoted.imageMessage?.caption ||
      quoted.videoMessage?.caption ||
      '';
  }

  if (!prompt) {
    await sock.sendMessage(jid, {
      text: '🤖 *Groq AI*\n\nUsage:\n› `hey rick <your message>`\n› `yo <your message>`\n› `.ai <your message>` or reply to a message',
    }, { quoted: msg });
    return;
  }

  // Allow resetting memory with "reset", "clear", or ".ai reset"
  if (/^(reset|clear|forget)$/i.test(prompt)) {
    chatHistories.delete(jid);
    await sock.sendMessage(jid, {
      text: 'Whatever. Wiped the slate clean. Don\'t make me regret it.',
    }, { quoted: msg });
    return;
  }

  // Send a reaction to let user know bot is thinking
  try {
    await sock.sendMessage(jid, { react: { text: '🧪', key: msg.key } });
  } catch (_) {}

  try {
    const history = getHistory(jid);

    // Identify sender
    const senderJid = msg.key.participant ?? (msg.key.fromMe ? sock.user?.id : jid);
    const senderName = msg.pushName?.trim() || '';
    const isP = isOwner(senderJid) || (senderJid && senderJid.includes('280062402269304'));

    let speakerTag = '';
    if (isP) {
      speakerTag = '[From: Prajwal (P / prawmathean) - Your friend and creator]';
    } else if (senderName) {
      speakerTag = `[From: ${senderName}]`;
    }

    const userPromptContent = speakerTag ? `${speakerTag}\n${prompt}` : prompt;

    const messages = [
      {
        role: 'system',
        content: RICK_SANCHEZ_SYSTEM_PROMPT,
      },
      ...history.map(item => ({ role: item.role, content: item.content })),
      {
        role: 'user',
        content: userPromptContent,
      },
    ];

    // If stream is true, we accumulate chunks; in WhatsApp we send the completed response
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: config.groqModel || 'qwen/qwen3.8-27b',
      temperature: 0.75,
      max_completion_tokens: 1024,
      top_p: 0.95,
      stream: true,
      stop: null,
    });

    let fullResponse = '';
    for await (const chunk of chatCompletion) {
      fullResponse += chunk.choices[0]?.delta?.content || '';
    }

    fullResponse = fullResponse.trim();
    if (!fullResponse) {
      fullResponse = "Got nothing for that. Try asking something that makes sense.";
    }

    // Save user query (with speaker context) and Rick's answer to conversation history
    addToHistory(jid, 'user', userPromptContent);
    addToHistory(jid, 'assistant', fullResponse);

    // Track successful groq request
    trackGroqRequest(senderJid, senderName);

    const sent = await sock.sendMessage(jid, {
      text: fullResponse,
    }, { quoted: msg });
    if (sent?.key?.id) {
      recordSentMsgId(sent.key.id);
    }

    // Clear thinking reaction once response is sent
    try {
      await sock.sendMessage(jid, { react: { text: '', key: msg.key } });
    } catch (_) {}

  } catch (err) {
    // Clear reaction on error as well
    try {
      await sock.sendMessage(jid, { react: { text: '', key: msg.key } });
    } catch (_) {}

    console.error('[groq] Error:', err.message);

    await sock.sendMessage(jid, {
      // text: `Ugh. Multiverse link glitched: ${err.message}`,

      
	    text: `Ugh. Multiverse link glitched.\n${get_random_response()}` 
    }, { quoted: msg });
  }
}
