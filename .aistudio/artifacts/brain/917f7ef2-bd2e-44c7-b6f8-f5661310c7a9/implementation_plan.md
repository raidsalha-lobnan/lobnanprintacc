# Implementation Plan: Migrating Daily Entry Rows to Sub-collections

## Overview
To resolve the synchronization issues where concurrent edits overwrite each other in the daily entry sheets, we will migrate the daily entry rows from a single document to a Firestore sub-collection: `dailyEntrySheets/{date}/rows/{rowId}`.

## Steps

1.  **Firebase Blueprint Update**: Update `firebase-blueprint.json` to reflect the new structure:
    -   Collection `dailyEntrySheets`: Holds summary information (date, notes, updatedAt).
    -   Sub-collection `dailyEntrySheets/{date}/rows`: Holds individual `DailyEntryRow` documents.

2.  **Firestore Rules Update**: Update `firestore.rules` to secure the new sub-collection:
    -   Secure `dailyEntrySheets/{date}`.
    -   Secure `dailyEntrySheets/{date}/rows/{rowId}`.

3.  **AccountingContext.tsx Refactoring**:
    -   Update `saveDailyEntryRow` to perform a `setDoc` on `dailyEntrySheets/{date}/rows/{rowId}`.
    -   Update `deleteDailyEntrySheet` to use a `batch` deletion or a cloud function (if possible) or client-side deletion of the sub-collection rows.
    -   Implement a real-time `onSnapshot` listener on `dailyEntrySheets/{date}/rows` to sync local state with the sub-collection.
    -   Remove or adapt `saveDailyEntrySheet` to only update summary fields.

4.  **Verification**:
    -   Ensure real-time sync works across multiple clients.
    -   Verify that edits to one row do not interfere with other rows.
    -   Run `compile_applet` to ensure no breaking changes.
