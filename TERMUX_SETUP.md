# Termux Setup (Android)

Running the bot directly on Termux can cause issues with missing C++ libraries (like `glibc`), causing the "sticker bug" or crash when installing canvas dependencies.

The correct way to run this on Termux is to use `proot-distro` to create an isolated Ubuntu environment. This gives you a standard Linux system that can compile Node.js native packages without errors.

> **Note:** Do *not* use Docker on Termux. Docker requires kernel features that Android blocks. This Ubuntu environment gives you the exact same benefits as Docker without needing the Docker Engine!

---

### 1. Install Ubuntu in Termux

Open your Termux app and run these commands to install and enter the Ubuntu subsystem:

```bash
pkg update -y
pkg install proot-distro -y
proot-distro install ubuntu
proot-distro login ubuntu
```

*(You will notice your prompt changes to `root@localhost` — you are now inside the Ubuntu environment!)*

### 2. Install System Dependencies

Inside Ubuntu, install the required packages (FFmpeg, Git, and Node.js 20):

```bash
apt-get update
apt-get install -y curl ffmpeg git build-essential

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 3. Get the Bot Code

Clone your repository (or copy it) into the Ubuntu environment:

```bash
# Example if cloning from git:
git clone https://github.com/yourusername/your-bot-repo.git waBot
cd waBot
```

### 4. Configure the Bot

Edit `config.js` to add your number before starting:

```js
ownerNumber: '919876543210',      // ← Your number (country code + number, no + or spaces)
private: true,                     // ← true = private mode ON
allowedNumbers: ['919876543210'],  // ← Numbers allowed to use the bot
```

### 5. Install Node Dependencies and Start

Finally, install the NPM packages and run the bot:

```bash
npm install
node index.js
```

Scan the QR code with your WhatsApp app (Linked Devices → Link a Device).

### Keep it running (Optional)

If you want the bot to run in the background inside Ubuntu:
```bash
npm install -g pm2
pm2 start index.js --name wabot
```
