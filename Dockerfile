FROM node:18-bullseye-slim

# Install system dependencies, notably ffmpeg for sticker processing
# @napi-rs/canvas may require some standard C++ libraries which are usually present in bullseye-slim,
# but we install build-essential and python3 just in case for node-gyp fallbacks.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only package files first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Run the bot
CMD ["npm", "start"]
