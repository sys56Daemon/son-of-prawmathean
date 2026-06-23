# waBot 🤖 — WhatsApp Bot

A feature-rich private WhatsApp bot. Runs on Termux (Android) or any Linux machine — no browser required.

---

## Commands

### 🛠️ General
| Command | Prefix needed? | Description |
|---|---|---|
| `.ping` | Yes | Check latency & uptime |
| `.alive` | Yes | Check if bot is online |
| `.info` | Yes | Bot stats (version, memory, uptime) |
| `.help` | Yes | Show all commands |
| `.mode` | Yes | Toggle public/private mode |

### 🎨 Media
| Command | Prefix needed? | Description |
|---|---|---|
| `.sticker [pack] [author]` | Optional | Convert image/GIF → sticker |
| `.toimg` | Yes | Convert sticker → image |
| `certificate <name> <role>` | Optional | Generate a goofy certificate |
| `qr <text>` | Optional | Generate a QR code image |

### 📸 Social Media
| Command | Prefix needed? | Description |
|---|---|---|
| `insta <url>` | Optional | Download & send an Instagram post, reel, or IGTV video |

> Supports public posts, reels, and IGTV. Videos are sent as playable WhatsApp videos with sound.

### 👥 Group *(admin only)*
| Command | Prefix needed? | Description |
|---|---|---|
| `.tagall [msg]` | Yes | Tag all group members |
| `.kick @user` | Yes | Kick a member |
| `.promote @user` | Yes | Make a user admin |
| `.demote @user` | Yes | Remove a user's admin |

### 🎲 Fun
| Command | Prefix needed? | Description |
|---|---|---|
| `.flip` | Yes | Flip a coin |
| `.roll [sides]` | Yes | Roll a dice |
| `.8ball <question>` | Yes | Ask the magic 8-ball |
| `.choose <a\|b\|c>` | Yes | Pick a random option |
| `.remind <n> <s\|m\|h> <msg>` | Yes | Set a reminder |
| `.calc <expression>` | Yes | Calculate a math expression |

### 🌐 Utility
| Command | Prefix needed? | Description |
|---|---|---|
| `.weather [location]` | Yes | Current weather (via wttr.in) |
| `.translate <lang> <text>` | Yes | Translate text (auto-detect source) |
| `.tr <lang> <text>` | Yes | Alias for `.translate` |
| `.define <word>` | Yes | Dictionary definition |
| `.tts <text>` | Yes | Text-to-speech voice note |
| `.ginfo` | Yes | Show current group info |

> `sticker`, `certificate`, and `qr` work both with and without the `.` prefix.

---

## Setup

### Termux (Android)

#### 1. Install system dependencies
```bash
pkg update && pkg upgrade
pkg install nodejs ffmpeg yt-dlp
```

#### 2. Install Node dependencies
```bash
cd ~/waBot
npm install
```

#### 3. Configure the bot — **do this before starting!**

Edit `config.js`:
```js
ownerNumber: '919876543210',      // ← Your number (country code + number, no + or spaces)
private: true,                     // ← true = private mode ON
allowedNumbers: ['919876543210'],  // ← Numbers allowed to use the bot
```

> **How to find your number format**: If your WhatsApp number is +91 98765 43210,
> write it as `'919876543210'` (country code `91` + 10-digit number, no `+` or spaces).

#### 4. Start the bot
```bash
node index.js
```
Scan the QR code with WhatsApp → Linked Devices → Link a Device.

#### 5. Keep it running (optional)
```bash
npm install -g pm2
pm2 start index.js --name wabot
pm2 save
```

---

### Linux / VPS

#### 1. Install system dependencies
```bash
# Debian / Ubuntu
sudo apt install nodejs npm ffmpeg yt-dlp

# Arch
sudo pacman -S nodejs npm ffmpeg yt-dlp
```

#### 2. Install Node dependencies
```bash
npm install
```

#### 3. Configure & start — same as Termux steps 3–5 above.

---

## 📸 Instagram Downloader

Send any public Instagram post, reel, or IGTV video to the bot and it will download and forward the media directly in the chat.

**Triggers:**
```
insta https://www.instagram.com/reel/XXXX/
.insta https://www.instagram.com/p/XXXX/
```

### How it works

The bot uses [yt-dlp](https://github.com/yt-dlp/yt-dlp) under the hood — the most actively maintained media downloader available. It handles DASH stream merging (video + audio) via `ffmpeg`, so reels play with full audio in WhatsApp.

### Avoiding rate limits

Without authentication, Instagram rate-limits anonymous requests after a request or two. The bot avoids this automatically:

**Auto-detected browser cookies (recommended):**
The bot checks for an installed browser on startup (Brave → Chrome → Chromium → Firefox) and uses its session cookies. If you're logged into Instagram in that browser, requests go through as a real user — no rate limiting.

**Manual `cookies.txt` (best for servers/Termux without a desktop browser):**
1. Install the [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) extension in Chrome/Brave on your PC
2. Go to `instagram.com` while logged in
3. Click the extension → Export → save as `cookies.txt`
4. Drop the file in the bot's root folder (next to `index.js`)

The bot will automatically pick it up. `cookies.txt` is in `.gitignore` so it will never be committed.

> **Note:** Only **public** posts are supported. Private accounts require the logged-in account to follow them.

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
│   ├── sticker.js        # .sticker, .toimg
│   ├── general.js        # .ping, .alive, .info, .help, .mode
│   ├── group.js          # .tagall, .kick, .promote, .demote
│   ├── fun.js            # .flip, .roll, .8ball, .choose, .remind, .calc
│   ├── utility.js        # .weather, .translate, .define, .tts, .ginfo
│   ├── instagram.js      # insta <url> — Instagram downloader
│   ├── certificate.js    # certificate <name> <role>
│   └── qr.js             # qr <text>
├── utils/
│   ├── converter.js      # WebP conversion (sharp + ffmpeg)
│   ├── metadata.js       # WebP EXIF sticker pack metadata
│   └── permissions.js    # Allow-list + admin checks
├── auth_info/            # Auto-created — WA session (gitignored)
├── cookies.txt           # Optional — Instagram cookies (gitignored)
└── package.json
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **Bot not responding at all** | Check `ownerNumber` in `config.js` is set correctly (no `+`, no spaces). If it's `YOUR_NUMBER_HERE`, the bot runs open and logs a warning. |
| **Bot responds to owner but not others** | Add their number to `allowedNumbers` in `config.js` and restart |
| **Instagram: rate limited / empty response** | Add a `cookies.txt` file — see [Instagram Downloader](#-instagram-downloader) section above |
| **Instagram: private account error** | Only public posts are supported |
| `yt-dlp: not found` | `pkg install yt-dlp` (Termux) or `sudo apt install yt-dlp` (Linux) |
| `ffmpeg: not found` | `pkg install ffmpeg` (Termux) or `sudo apt install ffmpeg` (Linux) |
| QR keeps refreshing | Scan faster; stable internet needed |
| Sticker not in pack | Open WA sticker drawer → scroll to bottom |
| Group commands fail | Make the bot a group admin first |
| `Bad MAC` errors in terminal | Harmless — old encrypted messages from before session was established; ignore |
