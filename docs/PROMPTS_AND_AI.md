# 🧠 Groq AI Prompts & Scoped Custom Personas

This document explains how the conversational AI engine works in Rick Sanchez C-137, how to edit the base personality, and how to create private, chat-isolated memory contexts that will never leak into other groups or public repositories.

---

## 1. Overview & Architecture

The bot uses the [Groq SDK](https://github.com/groq/groq-typescript) with fast low-latency models like `qwen/qwen3.8-27b` and `llama-3.1-8b-instant`.

The prompt system is completely decoupled from the source code:
```
prompts/
├── rick.md                        # Base personality & character instructions
├── custom_contexts.example.json   # Template for chat-scoped rules (git-tracked)
└── custom_contexts.local.json     # Private memories, friends & group secrets (gitignored)
```

---

## 2. Base Character Prompt (`prompts/rick.md`)

The base character file is plain Markdown. You can edit [prompts/rick.md](../prompts/rick.md) to tweak:
- Persona & dialogue rules (authentic Dan Harmon style, cynic, sharp, deadpan).
- Bot creator / owner relationship.
- Donation instructions (with automatic `{{UPI_ID}}` interpolation from `.env`).

Example excerpt:
```markdown
# Rick Sanchez (Dimension C-137) System Prompt

You are Rick Sanchez from Dimension C-137, responding over WhatsApp.

## Persona
- Cynical, pragmatic, sharp, deadpan, condescendingly casual.
- Authentic and grounded dialogue style; avoid catchphrase spam.
...
- Mention running `.donate` or using UPI ID: {{UPI_ID}}.
```

---

## 3. Scoped Private Contexts (`custom_contexts.local.json`)

If you want Rick to remember private facts about close friends, specific group inside jokes, or confidential project details **strictly inside a specific chat**, you define them in:
```text
prompts/custom_contexts.local.json
```

> [!IMPORTANT]
> `custom_contexts.local.json` is in `.gitignore` by default (`*.local.json`). It will never be committed to GitHub or leaked publicly.

### How to set it up:
1. Copy the example file:
   ```bash
   cp prompts/custom_contexts.example.json prompts/custom_contexts.local.json
   ```
2. Open `prompts/custom_contexts.local.json` and configure:

#### Scenario A: Personalizing for a person across DMs and multiple groups
To personalize for someone wherever they interact with the bot (or across multiple specified chats):

```json
[
  {
    "id": "sanu-personal",
    "enabled": true,
    "users": ["918075894293", "62848977895445"],
    "senders": [
      {
        "pattern": "918075894293",
        "tag": "Sanu (+918075894293) - P's close friend"
      },
      {
        "pattern": "62848977895445",
        "tag": "Sanu (Sneha) - P's close friend"
      }
    ],
    "systemContext": "Personal Context for Sanu (Sneha):\n- She is P's close friend. Super cool, genuine nerd, uses Arch Linux, and loves nerdy projects.\n- You know and respect her as P's close friend.\n- When talking directly to her in DM or in allowed chats, treat her warmly and share nerdy banter."
  }
]
```

#### Scenario B: Restricting to multiple specific group chats and DMs
You can also supply an array of `chatJids`:
```json
[
  {
    "id": "sanu-allowed-chats",
    "enabled": true,
    "chatJids": [
      "120363433763376897@g.us",
      "120363999999999999@g.us",
      "918075894293@s.whatsapp.net",
      "62848977895445@lid"
    ],
    "senders": [
      {
        "pattern": "918075894293",
        "tag": "Sanu (+918075894293) - P's close friend"
      },
      {
        "pattern": "62848977895445",
        "tag": "Sanu (Sneha) - P's close friend"
      }
    ],
    "systemContext": "Private Context: Sanu is P's close friend who runs Arch Linux. Only active in these approved chats."
  }
]
```

### Context Schema Fields Reference:
- `id`: A descriptive identifier for this context block.
- `enabled`: `true` or `false` (set to `false` to pause without deleting).
- `users`: *(Optional)* Array of phone numbers, LIDs, or JIDs. If specified, this context is **only loaded when one of these users is interacting with Rick** (perfect for personalized 1-on-1 DMs and across groups).
- `chatJid` / `chatJids`: *(Optional)* A single chat JID string or array of chat JIDs (e.g. `["120363433763376897@g.us", "919876543210@s.whatsapp.net"]`). If provided, the context is only active in these specific conversations.
- `senders`: *(Optional)* Array of sender rules `[{ "pattern": "1234567890", "tag": "Name - Label" }]`. When this person speaks, Rick sees `[From: Name - Label]` above their message so he instantly recognizes who is talking.
- `systemContext`: The custom system prompt instructions, facts, and rules appended dynamically to Rick's prompt.

> [!TIP]
> **Matching Phone vs LID:**
> Always add both the contact's international phone number and their WhatsApp LID (retrieved via `.whoami @user`) into `users` and `senders`. WhatsApp may deliver messages under either identifier depending on the chat type.

---

## 4. Autonomous AI Tool Calling

Rick is equipped with function tools so he can autonomously take actions in the WhatsApp chat when asked:

| Tool Function | Description |
|---|---|
| `create_sticker` | Converts recent images or GIFs in the chat to WhatsApp stickers. |
| `sticker_to_image` | Converts a sticker back into a standard PNG photo (`.toimg`). |
| `create_qr_code` | Generates and sends a scannable QR code image (`.qr`). |
| `set_reminder` | Automatically schedules reminders with natural time parsing. |
| `tag_all_members` | Mentions all members in the current group (`.tagall`). |

When chatting with Rick, you can naturally say:
- *"Rick, turn the last 3 photos into stickers."*
- *"Rick, remind me in 45 minutes to submit the assignment."*
- *"Make a QR code for https://github.com"*
- *"Tag everyone in this group and tell them server is down."*

Rick will call the corresponding tool directly in WhatsApp!

---

## 5. Conversational Triggers

You can trigger Rick Sanchez in three ways:
1. **Natural conversation:**
   - `hey rick <message>`
   - `yo <message>`
   - `rick <message>`
2. **Explicit command:**
   - `.ai <prompt>` or `.groq <prompt>`
3. **Reply:**
   - Simply reply to any message previously sent by the bot.
4. **Wipe Chat Memory:**
   - Send `reset`, `clear`, or `forget` to clear the conversation window for the current chat.

---

## 6. Next Steps

- ⚙️ **[Configuration & Environment](CONFIGURATION.md)**: Details on `.env` settings and permissions.
- 🛠️ **[Command & Feature Control](COMMAND_CONTROL.md)**: Disable or enable AI features dynamically.
- 📖 **[Main Documentation](../README.md)**: Overview and commands catalog.
