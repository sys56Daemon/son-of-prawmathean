# waBot 🤖 — WhatsApp Bot

A feature-rich private WhatsApp bot hosted on Termux (no browser required).

---

## Commands

| Command | Prefix needed? | Description |
|---|---|---|
| `.sticker [pack] [author]` | Optional | Convert image/GIF → sticker |
| `.toimg` | Yes | Convert sticker → image |
| `certificate <name> <role>` | Optional | Generate a goofy certificate |
| `qr <text>` | Optional | Generate a QR code image |
| `.ping` | Yes | Check latency & uptime |
| `.alive` | Yes | Check if bot is online |
| `.info` | Yes | Bot stats (version, memory, uptime) |
| `.help` | Yes | Show all commands |
| `.tagall [msg]` | Yes | Tag all group members *(group admin only)* |
| `.kick @user` | Yes | Kick member *(group admin only)* |
| `.promote @user` | Yes | Make user admin *(group admin only)* |
| `.demote @user` | Yes | Remove user's admin *(group admin only)* |

> `sticker`, `certificate`, and `qr` work both with and without the `.` prefix.

---

## Termux Setup

### 1. Install system dependencies
```bash
pkg update && pkg upgrade
pkg install nodejs ffmpeg
```

### 2. Install Node dependencies
```bash
cd ~/waBot
npm install
```

### 3. Configure the bot — **do this before starting!**

Edit `config.js`:
```js
ownerNumber: '919876543210',      // ← Your number (country code + number, no + or spaces)
private: true,                     // ← true = private mode ON
allowedNumbers: ['919876543210'],  // ← Numbers allowed to use the bot
```

> **How to find your number format**: If your WhatsApp number is +91 98765 43210,
> write it as `'919876543210'` (country code `91` + 10-digit number, no `+` or spaces).

### 4. Start the bot
```bash
node index.js
```
Scan the QR code with WhatsApp → Linked Devices → Link a Device.

### 5. Keep it running (optional)
```bash
npm install -g pm2
pm2 start index.js --name wabot
pm2 save
```

---

## 🔒 Private Mode — How It Works

Private mode controls **who can send commands to the bot**.

### Configuration (`config.js`)

```js
// Set to your phone number — this account is ALWAYS allowed regardless of other settings
ownerNumber: '919876543210',

// true  → Only numbers in allowedNumbers (+ owner) can use the bot
// false → Anyone who messages the bot can use it (public bot)
private: true,

// List of numbers that can use the bot (when private: true)
// Format: international number with NO + or spaces
allowedNumbers: [
  '919876543210',   // you (the owner)
  '919999988888',   // a friend
],
```

### How the allow-list check works

```
Message received from sender
         │
         ▼
  ownerNumber set?  ──No──▶  OPEN (anyone can use) + startup warning printed
         │
        Yes
         │
         ▼
  private: false?  ──Yes──▶  OPEN (anyone can use)
         │
        No
         │
         ▼
  sender == owner?  ──Yes──▶  ALLOWED ✅
         │
        No
         │
         ▼
  sender in allowedNumbers?  ──Yes──▶  ALLOWED ✅
         │
        No
         │
         ▼
      BLOCKED 🚫 (silently ignored)
```

### Adding someone to the allow-list

Edit `config.js` → add their number to `allowedNumbers` → restart the bot:
```js
allowedNumbers: [
  '919876543210',
  '14155552671',    // ← new friend added
],
```

### Switching to public mode

Set `private: false` in `config.js`. Anyone who messages the bot can now use it.

> **Important**: If `ownerNumber` is still set to `'YOUR_NUMBER_HERE'` (the default placeholder),
> the bot automatically runs in **open/public mode** and prints a warning at startup.
> Set your real number to activate private mode.

---

## Project Structure
```
waBot/
├── index.js              # Entry point + command router
├── config.js             # ⚙️  Bot settings (edit this!)
├── handlers/
│   ├── sticker.js        # .sticker
│   ├── general.js        # .ping, .alive, .info, .help, .toimg
│   ├── group.js          # .tagall, .kick, .promote, .demote
│   ├── certificate.js    # certificate <name> <role>
│   └── qr.js             # qr <text>
├── utils/
│   ├── converter.js      # WebP conversion (sharp + ffmpeg)
│   ├── metadata.js       # WebP EXIF sticker pack metadata
│   └── permissions.js    # Allow-list + admin checks
├── auth_info/            # Auto-created — session (don't delete)
└── package.json
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **Bot not responding at all** | Check that `ownerNumber` in `config.js` is set correctly (no `+`, no spaces). If it's still `YOUR_NUMBER_HERE`, the bot runs open but will log a warning. |
| **Bot responds to owner but not others** | Add their number to `allowedNumbers` in `config.js` and restart |
| `ffmpeg: not found` | `pkg install ffmpeg` |
| QR keeps refreshing | Scan faster; stable internet needed |
| Sticker not in pack | Open WA sticker drawer → scroll to bottom |
| Group commands fail | Make the bot a group admin first |
| `Bad MAC` errors in terminal | Harmless — old encrypted messages from before session was established; ignore them |
