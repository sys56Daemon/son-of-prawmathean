# 🛠️ Command & Feature Control

This document describes how bot owners can globally enable or disable any feature, tool, or command in **Rick Sanchez C-137 (waBot)**.

---

## 1. Why Feature Control?

There are times when you need to shut off specific bot capabilities without taking down the entire bot:
- **Groq API Rate Limits / Budget:** Disable AI chat globally (`.disablecmd ai`) if your Groq token quota is running low.
- **Privacy Controls:** Turn off view-once extraction (`.disablecmd give`) if someone requests it in sensitive groups.
- **Resource Heavy Commands:** Turn off media converters or stickers during server high-load periods.

---

## 2. Disabling Commands via WhatsApp (Owner Only)

Owners can disable or enable commands from any chat with immediate effect:

### Disable a command:
```text
.disablecmd ai
.disablecmd give
.disablecmd sticker
```

### Re-enable a command:
```text
.enablecmd ai
.enablecmd give
```

### View all globally disabled commands:
```text
.disabledcmds
```
*(Aliases: `.cmdlist`, `.commandslist`)*

> [!NOTE]
> Bot owners retain access to bypass disabled command checks for debugging purposes. Regular users will receive a polite notification that the feature is temporarily disabled.

---

## 3. Disabling Features via JSON File

The disabled command list is persisted to disk in:
```text
data/disabled_commands.json
```

Because `data/` is in `.gitignore`, this file remains local to your deployment and is never overwritten on git pulls.

You can edit this file directly at any time:
```json
[
  "ai",
  "give"
]
```

---

## 4. Canonical Feature Mapping

The feature controller uses canonical aliasing so disabling a feature covers all of its aliases and triggers:

| Command / Alias | Covers |
|---|---|
| `ai`, `groq` | `.ai`, `.groq`, `hey rick ...`, `yo ...`, `rick ...`, and replies to the bot. |
| `give`, `viewonce`, `vo` | `.give` and view-once media extraction. |
| `sticker`, `s` | `.sticker`, bare `sticker`. |
| `toimg` | `.toimg`. |
| `tagall` | `.tagall`. |
| `insta`, `instagram` | `insta <url>`, `.insta <url>`. |
| `pet`, `petpet` | `.pet`, `.petpet`. |
| `thinksay`, `think` | `.thinksay`, `.think`. |
| `gay`, `rainbow` | `.gay`, `.rainbow`. |
| `remind`, `reminder` | `.remind`. |
| `qr` | `qr <text>`, `.qr <text>`. |

---

## 5. Next Steps

- ⚙️ **[Configuration & Environment](CONFIGURATION.md)**: Manage `.env`, owners, and private mode.
- 🧠 **[AI Prompts & Custom Personas](PROMPTS_AND_AI.md)**: Customize prompts and scoped private group rules.
- 📖 **[Main Documentation](../README.md)**: Return to main documentation.
