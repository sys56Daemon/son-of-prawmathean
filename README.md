# 🤖 wa-sticker-bot

A powerful and lightweight WhatsApp bot built with `@whiskeysockets/baileys`, designed specifically to run seamlessly on **Android (Termux)**. It specializes in converting media to high-quality stickers and includes several fun utility commands.

## 🚀 Features

- **🖼️ Smart Sticker Conversion**: Support for static images, animated GIFs, and videos.
- **🏷️ Metadata Injection**: Custom Pack Name and Author for stickers.
- **✨ High Quality**: Automatic resizing, transparent padding, and optimized compression.
- **🏆 Certificate Generator**: Create goofy "Certificates of Achievement" (with pure-JS fallback for Termux).
- **🔲 QR Code Generator**: Generate scannable QR codes from text.
- **👥 Group Management**: Tag all members, kick, promote, and demote.
- **🔒 Privacy Control**: Toggle between Public and Private modes.

## 📦 Installation (Termux)

1. **Update and install dependencies**:
   ```bash
   pkg update && pkg upgrade
   pkg install nodejs ffmpeg webp
   ```

2. **Clone and Install**:
   ```bash
   cd son-of-prawmathean
   npm install
   ```

3. **Configure**:
   Edit `config.js` to set your phone number (ownerNumber).

4. **Start**:
   ```bash
   npm start
   ```
   Scan the QR code with your WhatsApp "Linked Devices" menu.

## ⚙️ Configuration (`config.js`)

```javascript
export default {
  botName:     'waBot 🤖',
  prefix:      '.',
  ownerNumber: '917736221227', // Your number without '+'
  private:     true,           // Restricted to allowedNumbers by default
  allowedNumbers: ['917736221227'],
};
```

## 📋 Commands

| Command | Description |
| :--- | :--- |
| `.sticker [pack] [author]` | Convert replied image/GIF/video to sticker |
| `.toimg` | Convert a quoted sticker back to an image |
| `certificate <name> <role>` | Generate a custom certificate |
| `qr <text>` | Generate a QR code |
| `.ping` | Check bot latency and uptime |
| `.tagall [msg]` | Mention everyone in a group (Admin only) |
| `.mode` | Toggle Private/Public mode (Owner only) |

## 🛠️ Technical Details

- **Baileys**: High-performance WhatsApp Web API.
- **FFmpeg**: Handles media resizing and WebP conversion.
- **Webpmux**: Ensures technically perfect WebP metadata injection.
- **Jimp/PureImage**: Image processing with zero native dependencies where possible.

## 🤝 Credits
Created by **prawmathean**.
Built for the community.
