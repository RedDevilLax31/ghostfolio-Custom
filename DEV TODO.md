# Development TODO

## UI

- [x] Differentiate development and production instances

## Bugfixes

- [ ] Overview not showing any value after vanguard import process 55% to x% = y%

## Importing

- [x] Correct the Vanguard import process 24% to 55% = 31% used
  - [x] added flexible import checks for flexible loads with metadata at top of file
  - [x] added downloadable csv for failed rows
  - [x] failed symbols are loaded as drafts to be updated later
  - [x] added xlsx as file type
  - [x] fix dividend handling process
  - [x] import specific processes based on platform of the account
- [ ] Correct Fidelity import process
- [ ] Correct 401k import process (needs to split roth and trad transactions)
- [ ] Prevent duplicate records from loading
- [ ] Does this handle stock splits? - vanguard - should this be manual as its really an exception process?
- [ ] Does this handle company merges? - vanguard - should this be manual as its really an exception process?

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

## Backend Work

- [ ] Backend Database querying and structure analysis
