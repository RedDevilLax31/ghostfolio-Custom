# Development TODO

## UI

- [x] Differentiate development and production instances
- [x] fix side to side scrolling because of long names in tables
- [x] Inlaw mode - Settings can hide monetary amounts for the current browser tab while retaining charts and percentages. Exports and copies still contain real values; free-form text can reveal amounts.
- [x] Admin access to all accounts on server to switch back and forth between them all - Use Admin Control > Users to switch; security, sharing, and server-wide admin operations are protected while switched.
- [x] Draft mode in the activities table to show drafts that need correcting - The Drafts only filter combines with the other activity filters. Bulk export and delete apply to all matching drafts, including those on other pages.
- [ ] Add a last refresh date to the individual holdings in the gather market data tab on the admin page

## Bugfixes

- [x] Overview not showing any value after vanguard import process 55% to 66% = 11%
      -[x] Yahoo API retrieve limit?
      -[x] Longer Development code cache
      -[x] Yahoo Request Throttling
      -[x] Rate limit backoff
      -[x] persistent redis cache
      -[x] reduced historical refresh frequency

## Importing

- [x] Correct the Vanguard import process 24% to 55% = 31% used
  - [x] added flexible import checks for flexible loads with metadata at top of file
  - [x] added downloadable csv for failed rows
  - [x] failed symbols are loaded as drafts to be updated later
  - [x] added xlsx as file type
  - [x] fix dividend handling process
  - [x] import specific processes based on platform of the account
- [x] Correct Fidelity import process - Fidelity brokerage CSVs are imported locally in USD for Fidelity accounts. Unsupported transactions and cash reinvestments are available in the skipped-rows download; cash balances are not updated. - Vested RSU acquisitions are imported as drafts tagged `Vested RSUs`. Enter the vest-date cost basis from the vesting records and remove `DRAFT` after correcting the activity. Drafts are excluded from portfolio calculations until corrected.
- [ ] Correct 401k import process (needs to split roth and trad transactions)
- [x] Prevent duplicate records from loading - Duplicate imports are checked by account, timestamp, type, asset, quantity, price, currency, and fees. Skipped rows can be downloaded from the import preview. - Simultaneous imports are not serialized and may still race; matching transactions can represent legitimate separate trades.
- [ ] Does this handle stock splits? - vanguard - should this be manual as its really an exception process?
- [ ] Does this handle company merges? - vanguard - should this be manual as its really an exception process?
- [ ] Run automatic data gathering for any new holdings imported

## Account Types

- [ ] Add RSU support
- [ ] Add options support
- [ ] Add proxy values for 401(k) holdings to map to current prices
- [x] Add Platform selection (vanguard, Fidelity, JNJ 401k) 9% to 18% = 9% used
- [x] Add Account type (Roth IRA, Taxable Brokerage, Traditional IRA, Roth 401K, Traditional 401K) 19% to 24% = 5% used

## Planning

- [ ] Add FIRE/coast-FIRE support
- [ ] add networth tracking sheet analysis
- [ ] add salary sheet tracking analysis (Career Tab?)

## Analysis

- [ ] Roth vs traditional vs taxable analysis
- [ ] end/start of day email summary + analysis of moves to make
- [ ] single stock performance view to see portfolio work of only single stocks without etfs, better understand the
      success and failures of single stock selections

## Backend Work

- [ ] Backend Database querying and structure analysis
- [x] added skill for fast and easy development enviroment start up process
- [x] suggested copilot skills, instructions, and hooks to improve processes
- [x] SSH coding set up with laptop
- [ ] Is automatic data gathering needed after a certain amount of time?
- [x] Reset admin passcode to regular password
