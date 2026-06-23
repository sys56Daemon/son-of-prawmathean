// ============================================================
//  Bot Configuration
// ============================================================

export default {
  botName:     'prawmathean',
  version:     '2.0.0',
  prefix:      '.',      // Commands start with '.'  e.g. .ping  .help

  // Your WhatsApp number — international format, NO '+' or spaces
  // Example: +91 77362 21227  →  '917736221227'
  ownerNumber: 'YOUR_NUMBER_HERE',  // e.g. '919876543210' (country code + number, no + or spaces)

  // PRIVATE MODE
  // true  → Only numbers in allowedNumbers (+ ownerNumber) can use the bot
  // false → Anyone can use the bot
  private: false,

  // Numbers allowed to use the bot when private: true
  // ownerNumber is ALWAYS allowed regardless of this list
  allowedNumbers: [
    'YOUR_NUMBER_HERE',  // add your number here
    // '91XXXXXXXXXX', // add a friend here if needed
  ],
};
