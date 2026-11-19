/**
 * In-memory message store for caching recent messages.
 * Allows retrieving original messages by (jid, stanzaId),
 * which is crucial when quoted messages lack full media keys.
 */

const MAX_MESSAGES_PER_CHAT = 150;
const messages = new Map(); // jid -> Map(stanzaId -> message)

export const messageStore = {
  /**
   * Save a message into the in-memory store
   * @param {object} msg
   */
  saveMessage(msg) {
    if (!msg?.key?.id) return;
    const jid = msg.key.remoteJid;
    if (!jid) return;

    if (!messages.has(jid)) {
      messages.set(jid, new Map());
    }
    const chatMap = messages.get(jid);
    chatMap.set(msg.key.id, msg);

    // Keep memory bounded
    if (chatMap.size > MAX_MESSAGES_PER_CHAT) {
      const oldestKey = chatMap.keys().next().value;
      chatMap.delete(oldestKey);
    }
  },

  /**
   * Retrieve a message by chat jid and stanza/message ID
   * @param {string} jid
   * @param {string} id
   * @returns {object|undefined}
   */
  loadMessage(jid, id) {
    if (!jid || !id) return undefined;
    return messages.get(jid)?.get(id);
  },

  /**
   * Get the most recent messages for a chat in chronological order (oldest to newest)
   * @param {string} jid
   * @param {number} limit
   * @returns {object[]}
   */
  getRecentMessages(jid, limit = 50) {
    if (!jid || !messages.has(jid)) return [];
    const list = Array.from(messages.get(jid).values());
    return list.slice(-limit);
  },

  /**
   * Bind event listener to Baileys socket event emitter
   * @param {object} ev - sock.ev
   */
  bind(ev) {
    ev.on('messages.upsert', ({ messages: newMsgs }) => {
      for (const m of newMsgs) {
        messageStore.saveMessage(m);
      }
    });
  },
};

export default messageStore;
