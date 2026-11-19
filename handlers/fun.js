// ── Fun & Utility Handlers ───────────────────────────────────────────────────
import { addReminder, parseDuration, fmtDuration } from '../utils/reminderStore.js';

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * .calc <expression>
 * Safe arithmetic evaluator — no eval(), uses Function constructor
 * restricted to digits and math operators only.
 */
export async function handleCalc(sock, msg, args) {
  const jid  = msg.key.remoteJid;
  const expr = args.join(' ').trim();

  if (!expr) {
    await sock.sendMessage(jid, {
      text: '🧮 *Usage:* `.calc <expression>`\n_Example:_ `.calc (12 + 3) * 4 / 2`',
    }, { quoted: msg });
    return;
  }

  // Whitelist: only allow digits, spaces, math operators, parentheses, dots
  if (!/^[\d\s\+\-\*\/\.\(\)\^%]+$/.test(expr)) {
    await sock.sendMessage(jid, {
      text: '❌ Invalid expression. Only use numbers and `+ - * / ( ) % .`',
    }, { quoted: msg });
    return;
  }

  try {
    // Replace ^ with ** for exponentiation
    const sanitized = expr.replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${sanitized})`)();

    if (!isFinite(result)) {
      await sock.sendMessage(jid, { text: '❌ Result is undefined (division by zero?)' }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, {
      text: `🧮 *Calculator*\n\n\`${expr}\`\n= *${result}*`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid, { text: '❌ Could not evaluate that expression.' }, { quoted: msg });
  }
}

/**
 * .flip — flips a coin
 */
export async function handleFlip(sock, msg) {
  const jid    = msg.key.remoteJid;
  const result = Math.random() < 0.5 ? 'Heads 🪙' : 'Tails 🔄';
  await sock.sendMessage(jid, {
    text: `🪙 *Coin Flip*\n\nResult: *${result}*`,
  }, { quoted: msg });
}

/**
 * .roll [NdM]  — rolls dice, default 1d6
 * Examples: .roll  →  1d6   |   .roll 2d20  |  .roll d100
 */
export async function handleRoll(sock, msg, args) {
  const jid  = msg.key.remoteJid;
  const raw  = (args[0] || '1d6').toLowerCase();

  const match = raw.match(/^(\d*)d(\d+)$/);
  if (!match) {
    await sock.sendMessage(jid, {
      text: '🎲 *Usage:* `.roll [NdM]`\n_Examples:_ `.roll` `.roll 2d20` `.roll d100`',
    }, { quoted: msg });
    return;
  }

  const count = Math.min(parseInt(match[1] || '1', 10), 20); // cap at 20 dice
  const sides = parseInt(match[2], 10);

  if (sides < 2 || sides > 10000) {
    await sock.sendMessage(jid, { text: '❌ Dice must have between 2 and 10,000 sides.' }, { quoted: msg });
    return;
  }

  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((a, b) => a + b, 0);

  const rollsStr = count > 1 ? `\nRolls: ${rolls.join(', ')}` : '';
  await sock.sendMessage(jid, {
    text: `🎲 *Dice Roll* (${count}d${sides})${rollsStr}\n\n🏆 Total: *${total}*`,
  }, { quoted: msg });
}

/**
 * .remind <duration> <message>
 * e.g. .remind 10m take medicine
 *      .remind 1h30m check the oven
 */
export async function handleRemind(sock, msg, args) {
  const jid    = msg.key.remoteJid;
  const sender = msg.key.participant ?? (msg.key.fromMe ? sock.user?.id : jid);

  if (args.length < 2) {
    await sock.sendMessage(jid, {
      text: '⏰ *Usage:* `.remind <time> <message>`\n_Example:_ `.remind 10m take medicine`\n\nTime units: `s` (seconds) `m` (minutes) `h` (hours)\nYou can combine: `1h30m`, `2h`, `45s`',
    }, { quoted: msg });
    return;
  }

  const durationStr = args[0];
  const reminderText = args.slice(1).join(' ');
  const ms = parseDuration(durationStr);

  if (!ms) {
    await sock.sendMessage(jid, {
      text: '❌ Invalid time format.\n_Use:_ `10m`, `1h`, `30s`, `1h30m`, `2d`',
    }, { quoted: msg });
    return;
  }

  addReminder({
    jid,
    sender,
    text: reminderText,
    ms,
  });

  await sock.sendMessage(jid, {
    text: `⏰ *Reminder set!*\n\nI'll remind you in *${fmtDuration(ms)}*:\n"${reminderText}"`,
  }, { quoted: msg });
}

/**
 * .8ball <question>
 * Classic Magic 8-Ball
 */
const EIGHTBALL_RESPONSES = [
  'It is certain. ✅',
  'It is decidedly so. ✅',
  'Without a doubt. ✅',
  'Yes, definitely. ✅',
  'You may rely on it. ✅',
  'As I see it, yes. 🤔',
  'Most likely. 🤔',
  'Outlook good. 🤔',
  'Yes. 🤔',
  'Signs point to yes. 🤔',
  'Reply hazy, try again. 😶',
  'Ask again later. 😶',
  'Better not tell you now. 😶',
  'Cannot predict now. 😶',
  'Concentrate and ask again. 😶',
  "Don't count on it. ❌",
  'My reply is no. ❌',
  'My sources say no. ❌',
  'Outlook not so good. ❌',
  'Very doubtful. ❌',
];

export async function handle8Ball(sock, msg, args) {
  const jid      = msg.key.remoteJid;
  const question = args.join(' ').trim();

  if (!question) {
    await sock.sendMessage(jid, {
      text: '🎱 *Usage:* `.8ball <your question>`\n_Example:_ `.8ball Will I win the lottery?`',
    }, { quoted: msg });
    return;
  }

  const answer = EIGHTBALL_RESPONSES[Math.floor(Math.random() * EIGHTBALL_RESPONSES.length)];
  await sock.sendMessage(jid, {
    text: `🎱 *Magic 8-Ball*\n\n❓ ${question}\n\n💬 *${answer}*`,
  }, { quoted: msg });
}

/**
 * .choose <option1> | <option2> | ...
 * Randomly picks one option from a pipe-separated list
 */
export async function handleChoose(sock, msg, args) {
  const jid  = msg.key.remoteJid;
  const text = args.join(' ').trim();

  const options = text.split('|').map(s => s.trim()).filter(Boolean);

  if (options.length < 2) {
    await sock.sendMessage(jid, {
      text: '🤔 *Usage:* `.choose <option1> | <option2> | ...`\n_Example:_ `.choose Pizza | Burger | Tacos`',
    }, { quoted: msg });
    return;
  }

  const chosen = options[Math.floor(Math.random() * options.length)];
  await sock.sendMessage(jid, {
    text: `🤔 *Choose*\n\nOptions: ${options.map(o => `_${o}_`).join(', ')}\n\n✅ I choose: *${chosen}*`,
  }, { quoted: msg });
}
