/**
 * Feature switches shared by the dashboard and its API routes.
 *
 * Cashfree refunds from the dashboard ("Refund ₹X via Cashfree" on a cancelled
 * servicing case). Off for now (Sandeep, 2026-11-20): refunds are made outside
 * the dashboard and recorded with "Mark refunded". The code is kept; set this to
 * true to bring the button and its API back.
 */
export const CASHFREE_REFUNDS_ENABLED = false;
