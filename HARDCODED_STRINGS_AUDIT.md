# Hardcoded Strings Audit - Component by Component

## Format
Each component lists:
- **Status**: How many strings remain
- **File**: Full path
- **Strings**: List of hardcoded strings that need translation

---

## ✅ COMPLETED (0 strings remaining)

### BasicModeSetupWizard
- **Status**: ✅ FULLY LOCALIZED (0/~40 remaining)
- **File**: `src/platforms/web/components/BasicModeSetupWizard.tsx`

### DemoTutorialModal
- **Status**: ✅ FULLY LOCALIZED (0/~25 remaining)
- **File**: `src/platforms/web/components/DemoTutorialModal.tsx`

---

## 🔄 REMAINING WORK (23 components)

### PropertyCard
- **Status**: ❌ NOT STARTED (~25 strings)
- **File**: `src/platforms/web/components/PropertyCard.tsx`
- **Hardcoded Strings**:
  - Tab labels: "Overview", "Financials", "Expenses", "Mortgage", "Taxes", "Notes"
  - Metric labels: "Current Value", "Monthly Rent", "Total Monthly Expenses", "Net Cashflow"
  - Date/Price labels: "Purchase Date", "Purchase Price", "Total Investment"
  - Return metrics: "ROCE", "Gross Yield", "Net Yield"
  - Expense types: "IBI", "Insurance", "Community Fees", "Maintenance", "Other Expenses"
  - Mortgage info: "Lender Name", "Current Balance", "Monthly Payment"
  - Button titles: "Delete property", "Edit property"

### PropertyFormNew
- **Status**: ❌ NOT STARTED (~50+ strings)
- **File**: `src/platforms/web/components/PropertyFormNew.tsx`
- **Hardcoded Strings**:
  - **Expense Types**: "Property tax", "Home insurance", "Life insurance", "Rent default insurance", "Community fees", "Management fees", "Maintenance", "Utilities", "Other operating", "Custom"
  - **Billing Frequencies**: "Monthly", "Quarterly", "Every 4 months", "Every 6 months", "Yearly", "Custom"
  - **Projection Modes**: "Fixed amount", "Manual annual estimate", "Use last known amount", "Increase by X% every Y months", "Custom schedule"
  - Form section titles and descriptions
  - Field labels and placeholders
  - Helper text throughout form

### IngestionReviewModal
- **Status**: ❌ NOT STARTED (~20 strings)
- **File**: `src/platforms/web/components/IngestionReviewModal.tsx`
- **Hardcoded Strings**:
  - Modal title: "AI File Ingestion Review"
  - Section headers: "Property data", "Budget / project data", "Mortgage / financing data"
  - Column headers: "Field", "Value", "Confidence", "Source"
  - Data labels: "Detected Profile", "AI Summary", "Recommended next action"
  - Button labels: "Reanalyze", "Ignore This File", "Save Approved Data"
  - Status badges and helpers

### QuickPropertyCreateModal
- **Status**: ❌ NOT STARTED (~25 strings)
- **File**: `src/platforms/web/components/QuickPropertyCreateModal.tsx`
- **Hardcoded Strings**:
  - Step labels: "Property", "Income", "Expenses", "Financing", "Review"
  - Title variations for basic vs advanced mode
  - Section descriptions
  - Field labels
  - Currency/currency selection text

### PropertyPortfolioOverview
- **Status**: ❌ NOT STARTED (~5 strings)
- **File**: `src/platforms/web/components/PropertyPortfolioOverview.tsx`
- **Hardcoded Strings**:
  - Empty state message: "No properties yet"
  - Single property message: "You have one property"
  - Concentration levels: "High concentration", "Medium concentration", "Low concentration"

### WealthAccountsEditor
- **Status**: ❌ NOT STARTED (~15 strings)
- **File**: `src/platforms/web/components/WealthAccountsEditor.tsx`
- **Hardcoded Strings**:
  - Section headers: "Cash Accounts", "Investment Accounts", "Broker Connection"
  - Field labels: "Name", "Balance", "Currency", "Read Only"
  - Account type options
  - Connection status labels
  - Provider options

### MortgageCard
- **Status**: ❌ NOT STARTED (~5 strings)
- **File**: `src/platforms/web/components/MortgageCard.tsx`
- **Hardcoded Strings**:
  - Button labels: "Edit full record", "Delete mortgage"
  - Modal titles: "Edit mortgage"
  - Helper text: "Points: X pts"

### CompactEditModal
- **Status**: ❌ NOT STARTED (~4 strings)
- **File**: `src/platforms/web/components/CompactEditModal.tsx`
- **Hardcoded Strings**:
  - aria-labels: "Close editor"
  - Button labels: "Section Edit", "Edit Full Record"
  - Lock message: "Locked"

### WorkspaceReviewScreen
- **Status**: ❌ NOT STARTED (~20 strings)
- **File**: `src/platforms/web/components/WorkspaceReviewScreen.tsx`
- **Hardcoded Strings**:
  - Alert title: "Low-confidence AI setup"
  - Modal headers: "Workspace proposal", "Detected Profile"
  - Section headers: "Confidence Breakdown", "Recommended Modules", "Suggested Categories"
  - Label text: "Priority", "Enabled", "Secondary strategies"
  - Placeholder: "Add category"

### Sidebar
- **Status**: ❌ NOT STARTED (~1 string)
- **File**: `src/platforms/web/components/Sidebar.tsx`
- **Hardcoded Strings**:
  - Module badge: "AI"

### WorkspaceSwitcher
- **Status**: ❌ NOT STARTED (~3 strings)
- **File**: `src/platforms/web/components/WorkspaceSwitcher.tsx`
- **Hardcoded Strings**:
  - Aria labels: "Previous {{name}}", "Next {{name}}"
  - "total" suffix in counter display

### AlertCenterWidget
- **Status**: ⚠️ PARTIAL (10+ strings)
- **File**: `src/platforms/web/components/AlertCenterWidget.tsx`
- **Note**: Already uses some translations, but has mixed language issues
- **Remaining Strings**:
  - Alert type labels
  - Priority indicators
  - Action button text

### AuthScreen
- **Status**: ⚠️ PARTIAL (15 strings)
- **File**: `src/platforms/web/components/AuthScreen.tsx`
- **Remaining Strings**:
  - Language selector options (uses t() but with hardcoded fallback)
  - Settings labels

### Layout
- **Status**: ⚠️ PARTIAL (5 strings)
- **File**: `src/platforms/web/components/Layout.tsx`
- **Remaining Strings**:
  - Wrapper labels
  - Navigation text

### UseCaseSelectionStep
- **Status**: ⚠️ PARTIAL (varies)
- **File**: `src/platforms/web/components/UseCaseSelectionStep.tsx`
- **Note**: Takes translations as props - verify all are coming from translations

### LanguageSelectionStep
- **Status**: ⚠️ PARTIAL (3 strings)
- **File**: `src/platforms/web/components/LanguageSelectionStep.tsx`
- **Remaining Strings**:
  - Language names: "English", "Spanish", "Portuguese"

### MortgageForm
- **Status**: ❌ NOT STARTED (~8 strings)
- **File**: `src/platforms/web/components/MortgageForm.tsx`
- **Hardcoded Strings**:
  - Section labels: "Property", "Lender", "Loan Terms", "Rate", "Bonifications", "Notes"

### PostSignupWorkspaceSetup
- **Status**: ❌ NOT STARTED (varies)
- **File**: `src/platforms/web/components/PostSignupWorkspaceSetup.tsx`
- **Note**: Check if using wizard translations

### ItemSelector
- **Status**: ⚠️ PARTIAL (5 strings)
- **File**: `src/platforms/web/components/ItemSelector.tsx`
- **Remaining Strings**:
  - Empty state messages
  - Selection helpers

### PropertyCardExpanded
- **Status**: ❌ NOT STARTED (varies)
- **File**: `src/platforms/web/components/PropertyCardExpanded.tsx`

### PortfolioCompositionChart
- **Status**: ❌ NOT STARTED (5+ strings)
- **File**: `src/platforms/web/components/PortfolioCompositionChart.tsx`
- **Remaining Strings**:
  - Chart labels
  - Legend items

### Others
Additional components that may have strings:
- DemoGuidedTutorial
- BasicModeSetupWizard (double-check completed)
- PropertyFormNew (form helpers)

---

## Summary Statistics

| Status | Count | Total Strings |
|--------|-------|----------------|
| ✅ Completed | 2 | 0 |
| ❌ Not Started | 14 | ~160 |
| ⚠️ Partial | 7 | ~40 |
| **TOTAL** | **23 remaining** | **~200** |

---

## Recommended Refactoring Order

### Phase 1: HIGH IMPACT (8-10 hours)
1. PropertyCard (25 strings, high visibility)
2. PropertyFormNew (50+ strings, critical path)
3. IngestionReviewModal (20 strings)
4. QuickPropertyCreateModal (25 strings)

### Phase 2: MEDIUM IMPACT (4-6 hours)
5. WealthAccountsEditor (15 strings)
6. MortgageForm (8 strings)
7. WorkspaceReviewScreen (20 strings)
8. PortfolioCompositionChart (5 strings)

### Phase 3: LOW IMPACT (3-4 hours)
9. CompactEditModal (4 strings)
10. MortgageCard (5 strings)
11. PropertyPortfolioOverview (5 strings)
12. Sidebar (1 string)
13. WorkspaceSwitcher (3 strings)
14. ItemSelector (5 strings)
15. Remaining components

---

## Testing All at Once

Once all components are refactored, run this test:
```javascript
// Browser console
const testLang = (lang) => {
  localStorage.setItem('re-portfolio-settings', 
    JSON.stringify({ language: lang }));
  location.reload();
};

// Test 1: Spanish
testLang('es');
// EXPECTED: All visible text in Spanish, no English text visible

// Test 2: English
testLang('en');
// EXPECTED: All visible text in English, no Spanish text visible
```

---

## Missing Key Detection

Monitor browser console logs:
```
[i18n] Missing translation key "componentName.keyName" for "es". Falling back to key name.
```

Any of these warnings indicate:
1. Translation key not added to es-extra.ts
2. Translation key name mismatch between component and file
3. New component strings added but translations missing

---

## Consistency Across Components

To avoid confusion, use existing keys when possible:
- Common words: `common.save`, `common.cancel`, `common.delete`
- Don't create: `propertyCard.save`, `mortgageForm.save`, etc.
- Reuse existing translations across components

Check `en-extra.ts` for existing keys before creating new ones!

---

## Next Developer Tasks

1. Pick a component from Phase 1
2. Follow the LOCALIZATION_IMPLEMENTATION_GUIDE.md
3. Use this audit as a checklist
4. Create PR with component changes
5. Update this audit as you complete them
