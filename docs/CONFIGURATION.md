# ⚙️ Configuration & Environment Setup

This document covers all options for setting up environment variables, credentials, permissions, and security settings for **Rick Sanchez C-137 (waBot)**.

---

## 1. Quick Setup: `.env`

The bot loads configuration from a root `.env` file via `utils/env.js`. To get started:

```bash
cp .env.example .env
```

Open `.env` in your editor and configure the variables:

```ini
# ============================================================
# Bot Configuration
# ============================================================
BOT_NAME="Rick Sanchez C-137"
BOT_PREFIX=.

# ============================================================
# Owner Credentials & Privileges
# ============================================================
# Comma-separated international phone numbers or LIDs without '+' or spaces.
# Owners have unrestricted access to all commands and controls.
OWNER_NUMBERS=1234567890,9876543210

# Legacy single owner fallback
OWNER_NUMBER=1234567890
OWNER_LID=

# ============================================================
# Groq AI Configuration
# ============================================================
# Get your API key from: https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=qwen/qwen3.8-27b

# ============================================================
# Creator Donations / Support
# ============================================================
UPI_ID=your_upi_id@bank

# ============================================================
# Access Control (Private Mode)
# ============================================================
# Set to 'true' to restrict bot to OWNER_NUMBERS + ALLOWED_NUMBERS.
# Set to 'false' to allow anyone in DMs or groups to run commands.
BOT_PRIVATE=false

# Comma-separated phone numbers or LIDs authorized when BOT_PRIVATE=true
ALLOWED_NUMBERS=1234567890,9876543210,62848977895445
```

---

## 2. Understanding WhatsApp Identifiers: Phone Numbers vs LIDs

WhatsApp uses two different kinds of identifiers:
- **Phone JID (`<phone>@s.whatsapp.net`):** The traditional phone-number-based WhatsApp address.
- **LID (`<lid>@lid`):** Linked Identity / Device ID assigned by WhatsApp to mask users' phone numbers in communities, groups, and multi-device sessions.

> [!TIP]
> **Why do LIDs matter?**  
> In modern WhatsApp groups, incoming messages often come from an `@lid` address instead of a phone number. If you run in **Private Mode**, add **both** the user's phone number and their LID to `ALLOWED_NUMBERS`.
>
> You can retrieve any contact's LID using:
> ```text
> .whoami @user
> ```
> or by quoting their message with `.whoami`.

---

## 3. Runtime Access Control Commands

Bot owners can toggle access control without restarting the bot:

| Command | Description |
|---|---|
| `.mode` | Toggles between Public and Private mode. |
| `.private` | Immediately switches the bot into Private mode. |
| `.public` | Immediately switches the bot into Public mode. |
| `.whoami` / `.jid` | Displays the current chat JID and sender JID/LID. |
| `.whoami @user` | Displays the tagged contact's Phone Number, JID, and LID. |
| `.ignore <phone/@user>` | Blocks a specific user from interacting with the bot. |
| `.unignore <phone/@user>` | Unblocks a previously ignored user. |
| `.ignorelist` | Lists all currently blocked users. |
| `.disable` | Disables the bot in the current chat/group. |
| `.enable [jid]` | Re-enables the bot in the current (or specified) chat. |
| `.disabledlist` | Lists all disabled chats. |

---

## 4. Next Steps

- 🤖 **[AI Prompts & Custom Personas](PROMPTS_AND_AI.md)**: Customize the system prompt and private group memory.
- 🛠️ **[Command & Feature Control](COMMAND_CONTROL.md)**: Enable or disable specific commands globally.
- 📖 **[Main Documentation](../README.md)**: Full command catalog and installation guide.
