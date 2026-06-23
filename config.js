// ============================================================
//  Bot Configuration
// ============================================================

export default {
  botName:     'prawmathean',
  version:     '2.0.0',
  prefix:      '.',      // Commands start with '.'  e.g. .ping  .help

  // Your WhatsApp number — international format, NO '+' or spaces
  // Example: +91 77362 21227  →  '917736221227'
  ownerNumber: '919037972225',

  // PRIVATE MODE
  // true  → Only numbers in allowedNumbers (+ ownerNumber) can use the bot
  // false → Anyone can use the bot
  private: false,

  // Numbers allowed to use the bot when private: true
  // ownerNumber is ALWAYS allowed regardless of this list
  allowedNumbers: [
    '917736221227',  
    '919037972225'
    // '91XXXXXXXXXX', // add a friend here if needed
  ],
};
