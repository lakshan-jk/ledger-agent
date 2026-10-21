import type { GLAccount, Transaction, EvalCase } from '../domain/types.js';

/** Chart of accounts for a small SaaS company. */
export const GL_ACCOUNTS: GLAccount[] = [
  { code: '6000', name: 'Payroll & Salaries', category: 'Operating Expenses' },
  { code: '6100', name: 'Software Subscriptions — G&A', category: 'Operating Expenses' },
  { code: '6200', name: 'Marketing & Advertising', category: 'Operating Expenses' },
  { code: '6300', name: 'Travel', category: 'Operating Expenses' },
  { code: '6400', name: 'Office & Supplies', category: 'Operating Expenses' },
  { code: '6500', name: 'R&D — Cloud Infrastructure', category: 'Operating Expenses' },
  { code: '6600', name: 'Professional Services', category: 'Operating Expenses' },
  { code: '6700', name: 'Meals & Entertainment', category: 'Operating Expenses' },
  { code: '6800', name: 'Bank & Payment Fees', category: 'Operating Expenses' },
];

/** Natural-language coding policies. These are the editable "business context". */
export const CODING_RULES: { id: string; text: string; accountCode: string }[] = [
  {
    id: 'r-cloud',
    text: 'Cloud infrastructure and hosting used to run the product (AWS, Google Cloud, Azure, Vercel, Cloudflare, Snowflake, Datadog) → 6500 R&D — Cloud Infrastructure',
    accountCode: '6500',
  },
  {
    id: 'r-software',
    text: 'General business/productivity software and SaaS tools (Slack, Notion, Google Workspace, Zoom, Figma, Linear, Retool) → 6100 Software Subscriptions — G&A',
    accountCode: '6100',
  },
  {
    id: 'r-marketing',
    text: 'Advertising and marketing platforms (Google Ads, Meta/Facebook Ads, LinkedIn Ads, HubSpot, Mailchimp) → 6200 Marketing & Advertising',
    accountCode: '6200',
  },
  {
    id: 'r-travel',
    text: 'Business travel — airfare, hotels, trains, ride-share (United, Delta, Marriott, Uber, Lyft) → 6300 Travel',
    accountCode: '6300',
  },
  {
    id: 'r-meals',
    text: 'Restaurants, coffee, team meals and food delivery (Starbucks, DoorDash, restaurants) → 6700 Meals & Entertainment',
    accountCode: '6700',
  },
  {
    id: 'r-prof',
    text: 'Professional services — legal, accounting, consulting, contractors → 6600 Professional Services',
    accountCode: '6600',
  },
  {
    id: 'r-office',
    text: 'Office supplies, furniture, equipment, and coworking (WeWork, Amazon.com physical goods) → 6400 Office & Supplies',
    accountCode: '6400',
  },
  {
    id: 'r-fees',
    text: 'Payment processor and bank fees (Stripe fees, wire fees, FX fees) → 6800 Bank & Payment Fees',
    accountCode: '6800',
  },
];

/** A couple of vendor mappings the org has already settled on. */
export const VENDOR_MEMORY: { vendor: string; accountCode: string }[] = [
  { vendor: 'stripe', accountCode: '6800' },
];

const tx = (
  id: string,
  vendor: string,
  description: string,
  amount: number,
  memo?: string,
): Transaction => ({
  id,
  date: '2026-10-15',
  vendor,
  description,
  amountCents: Math.round(amount * 100),
  memo,
});

/** Transactions used by the scripted demos (stable ids so demos can reference them). */
export const DEMO_TRANSACTIONS: Record<string, Transaction> = {
  aws: tx('t-aws', 'Amazon Web Services', 'AWS cloud hosting — EC2, S3, RDS for production', 4210.33),
  vercelA: tx('t-vercel-a', 'Vercel', 'Vercel Pro — frontend hosting for the product', 60.0),
  vercelB: tx('t-vercel-b', 'Vercel Inc.', 'Vercel usage overage — edge functions', 128.5),
  amazonGoods: tx('t-amz-goods', 'Amazon.com', 'Standing desk and monitor arm for office', 540.0),
};

/** Labeled eval set — a mix of easy and niche/ambiguous cases. */
export const EVAL_SET: EvalCase[] = [
  { transaction: tx('e1', 'Amazon Web Services', 'AWS — production cloud hosting', 3920.0), expectedAccountCode: '6500' },
  { transaction: tx('e2', 'Slack', 'Slack Business+ team subscription', 240.0), expectedAccountCode: '6100' },
  { transaction: tx('e3', 'Google Ads', 'Search advertising campaign', 1500.0), expectedAccountCode: '6200' },
  { transaction: tx('e4', 'United Airlines', 'Flight SFO-JFK for customer meeting', 612.4), expectedAccountCode: '6300' },
  { transaction: tx('e5', 'Starbucks', 'Team coffee', 38.75), expectedAccountCode: '6700' },
  { transaction: tx('e6', 'WeWork', 'Coworking desk — monthly', 450.0), expectedAccountCode: '6400' },
  { transaction: tx('e7', 'Stripe', 'Payment processing fees', 320.11), expectedAccountCode: '6800' },
  { transaction: tx('e8', 'Wilson Sonsini', 'Legal fees — contract review', 2800.0), expectedAccountCode: '6600' },
  { transaction: tx('e9', 'Snowflake', 'Snowflake data warehouse compute', 1840.0), expectedAccountCode: '6500' },
  { transaction: tx('e10', 'Datadog', 'Datadog monitoring for production services', 410.0), expectedAccountCode: '6500' },
  { transaction: tx('e11', 'Mailchimp', 'Email marketing — monthly plan', 99.0), expectedAccountCode: '6200' },
  { transaction: tx('e12', 'Lyft', 'Ride to client office', 24.3), expectedAccountCode: '6300' },
  { transaction: tx('e13', 'Notion Labs', 'Notion team workspace', 160.0), expectedAccountCode: '6100' },
  { transaction: tx('e14', 'Retool', 'Retool internal tools platform', 300.0), expectedAccountCode: '6100' },
  { transaction: tx('e15', 'Vercel', 'Vercel Pro — product frontend hosting', 60.0), expectedAccountCode: '6500' },
  { transaction: tx('e16', 'Amazon.com', 'Office chairs and desk lamps', 740.0), expectedAccountCode: '6400' },
];
