// lib/config/payment.ts
// Server-side corporate bank transfer configuration.
// Reads parameters strictly from server environment variables without fabricated or dummy defaults.

export interface BankTransferConfig {
  isConfigured: boolean;
  bankName: string;
  branch: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
}

/**
 * Returns corporate bank transfer instructions for manual subscription payments.
 * Eliminates all dummy placeholder fallbacks (SEC-3B2C2-LOW-02).
 * If configuration is incomplete or missing, returns `isConfigured: false` to fail closed.
 */
export function getBankTransferDetails(): BankTransferConfig {
  const bankName = process.env.BANK_NAME?.trim() || "";
  const branch = process.env.BANK_BRANCH?.trim() || "";
  const accountName = process.env.BANK_ACCOUNT_NAME?.trim() || "";
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER?.trim() || "";
  const instructions =
    process.env.BANK_PAYMENT_INSTRUCTIONS?.trim() ||
    "Please deposit the exact subscription fee and enter the bank deposit slip reference or upload the receipt slip below.";

  // Configuration is valid ONLY if all critical banking coordinates are explicitly defined
  const isConfigured = Boolean(
    bankName &&
    accountName &&
    accountNumber &&
    accountNumber !== "8010045678" // Explicitly reject placeholder accounts
  );

  return {
    isConfigured,
    bankName,
    branch,
    accountName,
    accountNumber,
    instructions,
  };
}
