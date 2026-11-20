# Rick Sanchez C-137 🤖 (waBot)

A production-ready, feature-rich WhatsApp bot and AI assistant powered by [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) and [Groq Cloud AI](https://groq.com/).

Runs lightweight on Linux, Raspberry Pi, Arduino (Ventuno Q / Uno Q), Android (via Termux), VPS, or Docker — **no headless browser needed**.

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [⚙️ Configuration](#️-configuration)
- [📚 Documentation Index](#-documentation-index)
- [🤖 Groq AI Assistant (Rick Sanchez)](#-groq-ai-assistant-rick-sanchez)
- [📋 Complete Commands Catalog](#-complete-commands-catalog)
- [🔒 Access Control & Privacy](#-access-control--privacy)
- [🛠️ Global Feature Control](#️-global-feature-control)
- [📸 Instagram Downloader](#-instagram-downloader)
- [📂 Project Structure](#-project-structure)
- [❓ Troubleshooting](#-troubleshooting)

---

## ✨ Features

- 🧠 **Autonomous Groq AI (Rick Sanchez C-137):** Unfiltered, sharp, Dan Harmon dialogue-style AI with memory, custom chat contexts, and WhatsApp function calling (auto-creates stickers, sets reminders, tags members, generates QR codes).
- 🖼️ **Full Media Suite:** High-performance WebP stickers (static and animated), `.toimg` sticker extraction, view-once media unmasking (`.give`), and `.petpet` animated patting generators.
- 🎨 **Meme & Generator Tools:** Mock certificates, QR codes, think-vs-say memes, and rainbow overlay filters.
- 📸 **Instagram Reels & Video Downloader:** High-quality public reels and video downloads with full audio via `yt-dlp` and `ffmpeg`.
- 👥 **Group Moderation:** Tag all members (`.tagall`), kick, promote, demote, and group inspection.
- ⏰ **Natural Reminders:** Set reminders with human durations (`10m`, `1h30m`, `2d`).
- 🔐 **Zero-Leak Modular Security:** All personal numbers, custom persona rules, API keys, and group memories are decoupled into gitignored files (`.env`, `prompts/*.local.json`).

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js:** v20.x or higher
- **System tools:** `ffmpeg` and `yt-dlp`

```bash
# Debian / Ubuntu
sudo apt update && sudo apt install -y nodejs npm ffmpeg yt-dlp

# Arch Linux
sudo pacman -S nodejs npm ffmpeg yt-dlp

# macOS
brew install node ffmpeg yt-dlp
```

> **Running on Android / Termux?** Follow the dedicated **[Termux Setup Guide](TERMUX_SETUP.md)**.

### 2. Install Dependencies
```bash
git clone https://github.com/your-username/son-of-prawmathean.git
cd son-of-prawmathean
npm install
```

### 3. Setup Environment Variables
```bash
cp .env.example .env
```
Open `.env` and enter your owner phone numbers and Groq API key. See **[Configuration Guide](docs/CONFIGURATION.md)** for details.

### 4. Start the Bot
```bash
npm start
```
A WhatsApp QR code will be generated in your terminal (and saved as `qr.png`). Scan it using WhatsApp (**Linked Devices > Link a Device**).

---

## ⚙️ Configuration

The bot uses a lightweight, zero-dependency environment loader (`utils/env.js`).

Key `.env` variables:
```ini
BOT_PREFIX=.
OWNER_NUMBERS=1234567890,9876543210
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=qwen/qwen3.8-27b
BOT_PRIVATE=false
ALLOWED_NUMBERS=1234567890,9876543210,62848977895445
```

👉 **For full configuration details, read the [Configuration Guide](docs/CONFIGURATION.md).**

---

## 📚 Documentation Index

| Guide | Description |
|---|---|
| ⚙️ **[Configuration & Setup](docs/CONFIGURATION.md)** | Detailed instructions on `.env`, owner privileges, private mode, and WhatsApp LIDs. |
| 🧠 **[Groq AI Prompts & Scoped Contexts](docs/PROMPTS_AND_AI.md)** | Customizing Rick's system prompt, function calling tools, and confidential group memories. |
| 🛠️ **[Command & Feature Control](docs/COMMAND_CONTROL.md)** | How to disable/enable specific commands globally via WhatsApp or JSON files. |
| 📱 **[Termux Setup Guide](TERMUX_SETUP.md)** | Step-by-step setup on Android via Termux and PRoot Ubuntu. |

---

## 🤖 Groq AI Assistant (Rick Sanchez)

Rick runs natively inside your WhatsApp chats with persona memory and automatic tool execution.

### How to talk to Rick:
- `hey rick <your message>`
- `yo <your message>`
- `rick <your message>`
- `.ai <your message>`
- Reply directly to any message sent by the bot.

### What Rick can do autonomously:
- *"Rick, turn the last 2 photos in this chat into stickers"* → Calls `create_sticker`
- *"Remind me in 30 minutes to take a break"* → Calls `set_reminder`
- *"Make a QR code for my portfolio link"* → Calls `create_qr_code`
- *"Tag everyone in this group"* → Calls `tag_all_members`

### Personalize Rick for specific friends & groups:
You can provide custom memory and personalized rules for friends in DMs and multiple groups by editing `prompts/custom_contexts.local.json`:
- **Personal DMs & Multi-chat:** Target specific contacts by their Phone / LID using `"users": ["1234567890", "...@lid"]`.
- **Group isolation:** Restrict private project contexts to an array of chats using `"chatJids": ["..."]`.
- **Zero-leak guarantee:** Files matching `*.local.json` are gitignored and never pushed to GitHub.

👉 **To customize Rick's personality, tools, or friend rules, check [AI Prompts & Custom Personas Guide](docs/PROMPTS_AND_AI.md).**

---

## 📋 Complete Commands Catalog

### 🛠️ General & Identity
| Command | Trigger | Description |
|---|---|---|
| `.whoami` / `.jid` | `.whoami` | View your phone number, JID, LID, and the current chat JID. |
| `.whoami @user` | `.whoami @user` | View a tagged contact's Phone, JID, and LID (for `.env`). |
| `.ping` | `.ping` | Check round-trip server latency and uptime. |
| `.alive` | `.alive` | Check if bot instance is online. |
| `.info` | `.info` | System memory usage, uptime, and version. |
| `.stats` | `.stats` | Total requests, user leaderboard, and sticker count. |
| `.donate` | `.donate` | Creator's UPI donation QR code. |
| `.help` | `.help` | Public command menu. |

### 🖼️ Media & View Once
| Command | Trigger | Description |
|---|---|---|
| `.sticker` | `.sticker [pack] [author]` | Converts attached or replied image/GIF to sticker (auto-fits). |
| `.toimg` | `.toimg` | Reply to a sticker to convert it back to a PNG image. |
| `.give` | `.give` | Reply to any view-once photo, video, or audio to unmask and extract it. |
| `.pet` / `.petpet` | `.pet` | Reply to an image/sticker to create an animated hand-patting sticker. |

### 🎨 Generators & Memes
| Command | Trigger | Description |
|---|---|---|
| `certificate` | `certificate <name> <role>` | Generates a mock framed certificate. |
| `qr` | `qr <text or url>` | Generates a scannable QR code image. |
| `.thinksay` | `.thinksay [-s] "thought" "speech"` | Creates a "What you think vs What you say" meme image or sticker. |
| `.gay` | `.gay [-s]` | Applies an authentic rainbow pride overlay over an image or sticker. |

### 📸 Social Media
| Command | Trigger | Description |
|---|---|---|
| `insta` | `insta <url>` or `.insta <url>` | Downloads and forwards public Instagram Reels, posts, or IGTV videos. |

### 👥 Group Moderation *(Admin Only)*
| Command | Trigger | Description |
|---|---|---|
| `.tagall` | `.tagall [announcement]` | Mentions all members in the group chat. |
| `.kick` | `.kick @user` | Kicks a member from the group. |
| `.promote` | `.promote @user` | Promotes a member to group admin. |
| `.demote` | `.demote @user` | Demotes an admin back to regular member. |
| `.ginfo` | `.ginfo` | Displays group creation date, owner, participant count, and description. |

### 🎮 Fun & Utility
| Command | Trigger | Description |
|---|---|---|
| `.remind` | `.remind <time> <msg>` | Sets a reminder (e.g. `10m`, `1h30m`, `2d`). |
| `.calc` | `.calc <math expression>` | Calculates a math expression (e.g. `(15*4)/2`). |
| `.weather` | `.weather [city]` | Current weather report via wttr.in. |
| `.translate` | `.translate <lang> <text>` | Translates text to target language (alias: `.tr`). |
| `.langs` | `.langs` | Displays list of supported translation language codes. |
| `.define` | `.define <word>` | Dictionary definition and pronunciation. |
| `.tts` | `.tts <text>` | Converts text into an audio voice note. |
| `.8ball` | `.8ball <question>` | Magic 8-ball fortune response. |
| `.flip` | `.flip` | Flips a coin (Heads/Tails). |
| `.roll` | `.roll [sides]` | Rolls a random dice (e.g. `d20`, `2d6`). |
| `.choose` | `.choose <a \| b \| c>` | Randomly picks an option. |

### 👑 Owner & Admin Controls
| Command | Description |
|---|---|
| `.mode` | Toggles between Public and Private mode. |
| `.public` | Switches bot to Public mode. |
| `.private` | Switches bot to Private mode. |
| `.disablecmd <cmd>` | Globally disables a command or AI feature (e.g. `.disablecmd ai`). |
| `.enablecmd <cmd>` | Globally re-enables a command or feature. |
| `.disabledcmds` | Lists all globally disabled commands. |
| `.groqstats` | Detailed diagnostic stats for Groq AI API calls. |
| `.disable` | Disables the bot inside the current chat. |
| `.enable [jid]` | Re-enables the bot inside the current or target chat. |
| `.disabledlist` | Lists all disabled chats. |
| `.ignore <phone/@user>` | Blocks a user from using the bot. |
| `.unignore <phone/@user>` | Unblocks a user. |
| `.ignorelist` | Lists all blocked users. |

---

## 🔒 Access Control & Privacy

In **Private Mode** (`BOT_PRIVATE=true` in `.env` or via `.private`), the bot silently ignores unauthorized users. Only:
1. Numbers in `OWNER_NUMBERS`
2. Numbers/LIDs in `ALLOWED_NUMBERS`

can interact with the bot.

To whitelist a friend, find their JID/LID using:
```text
.whoami @user
```
and add both their phone number and LID to `ALLOWED_NUMBERS` in `.env`.

👉 **Read [Configuration & Setup](docs/CONFIGURATION.md) for full details.**

---

## 🛠️ Global Feature Control

Need to turn off view-once extraction (`.give`) or temporarily freeze AI requests due to rate limits?

You can disable features immediately from WhatsApp:
```text
.disablecmd ai
.disablecmd give
```
Or edit `data/disabled_commands.json`.

👉 **Read [Command & Feature Control](docs/COMMAND_CONTROL.md) for full details.**

---

## 📸 Instagram Downloader

The bot uses `yt-dlp` to download Instagram reels and posts with high reliability.

### Avoiding Instagram Rate Limits:
1. **Desktop Browsers:** When run on a machine with Chrome/Brave/Firefox installed, the bot automatically borrows cookies from your logged-in browser session.
2. **Headless Servers / Termux (`cookies.txt`):**
   - Install the **Get cookies.txt LOCALLY** browser extension on your PC.
   - Go to `instagram.com` while logged in.
   - Export your cookies as `cookies.txt` and place it in the bot's root folder.
   - `cookies.txt` is already gitignored.

---

## 📂 Project Structure

```
son-of-prawmathean/
├── .env.example               # Template environment configuration
├── config.js                  # Central configuration loader
├── index.js                   # Main Baileys connection & command router
├── prompts/                   # Decoupled system prompts
│   ├── rick.md                # Base character markdown prompt
│   ├── custom_contexts.example.json # Public example template
│   └── custom_contexts.local.json   # Private memories & rules (gitignored)
├── docs/                      # Extended documentation
│   ├── CONFIGURATION.md       # .env, LIDs, and permission setup
│   ├── PROMPTS_AND_AI.md      # AI character, tools, and scoped contexts
│   └── COMMAND_CONTROL.md     # Dynamic feature disabling
├── handlers/                  # Modular command handlers
│   ├── groq.js                # Groq AI & tool execution
│   ├── viewOnce.js            # View-once extraction (.give)
│   ├── general.js             # General utilities, identity & admin controls
│   ├── sticker.js             # Sticker creation & conversion
│   ├── group.js               # Group moderation (.tagall, .kick, etc.)
│   ├── instagram.js           # Instagram reel & video downloader
│   ├── certificate.js         # Certificate generator
│   ├── thinksay.js            # Think vs Say meme generator
│   ├── petpet.js              # Animated patting generator
│   ├── qr.js                  # QR code generator
│   ├── fun.js                 # Reminders, calculator, 8ball, coin flip
│   └── utility.js             # Weather, TTS, translate, dictionary
├── utils/                     # Helper modules
│   ├── env.js                 # Zero-dependency .env loader
│   ├── promptManager.js       # Dynamic prompt loader & context resolver
│   ├── commandControl.js      # Global feature toggle manager
│   ├── permissions.js         # Owner, LID, and allow-list verifier
│   ├── reminderStore.js       # Reminder scheduling engine
│   ├── messageStore.js        # Message caching for Baileys
│   ├── blocklist.js           # User ignore/block management
│   ├── chatfilter.js          # Chat-level disable filter
│   ├── converter.js           # Image & animated WebP conversion
│   ├── metadata.js            # Sticker EXIF metadata injection
│   └── stats.js               # Usage analytics & leaderboard
├── assets/                    # Static templates, fonts & donation QR
├── data/                      # Local persistent JSON stores (gitignored)
└── auth_info/                 # WhatsApp multi-file auth credentials (gitignored)
```

---

## ❓ Troubleshooting

| Issue | Resolution |
|---|---|
| **Friend can't use bot in Private Mode** | WhatsApp frequently uses LIDs (`<id>@lid`) instead of phone numbers. Use `.whoami @friend` to get their LID number and add it to `ALLOWED_NUMBERS` in `.env`. |
| **`ffmpeg` or `yt-dlp` error** | Ensure `ffmpeg` and `yt-dlp` are installed on the host system: `sudo apt install ffmpeg yt-dlp` or `sudo pacman -S ffmpeg yt-dlp`. |
| **Groq 429 Rate Limit error** | You hit your Groq token quota. Switch models in `.env` (`llama-3.1-8b-instant`), upgrade your tier, or temporarily run `.disablecmd ai`. |
| **Sticker conversion fails on Android** | Termux requires `glibc` libraries to compile image buffers properly. Follow the **[Termux PRoot Setup](TERMUX_SETUP.md)**. |
| **Instagram download returns empty** | Place a valid `cookies.txt` in the root folder exported from a logged-in Instagram browser session. |
| **QR code keeps refreshing** | Scan quickly from WhatsApp (**Linked Devices > Link a Device**). Ensure your network allows outbound WebSocket connections to WhatsApp servers. |

---

## 📄 License

This project is licensed under the MIT License.
