# Localization Refactoring - Implementation Guide

## Quick Reference: How to Localize a Component

### Prerequisites
- Component file exists in `src/platforms/web/components/`
- Translation keys have been added to en-extra.ts and es-extra.ts

### Step-by-Step Process

#### 1. Add Import
```typescript
import { useSettings } from '../context/SettingsContext';
```

#### 2. Get Translation Function (in component)
```typescript
export const MyComponent: React.FC<Props> = (props) => {
  const { t } = useSettings();
  // Use t() throughout component
};
```

#### 3. Replace Hardcoded Strings
```typescript
// ❌ BEFORE
<button>Click Me</button>
<p>Some description text</p>
<h1>My Title</h1>

// ✅ AFTER
<button>{t('myComponent.buttonLabel')}</button>
<p>{t('myComponent.description')}</p>
<h1>{t('myComponent.title')}</h1>
```

#### 4. Add Translation Keys
```typescript
// src/platforms/web/i18n/locales/en-extra.ts
export const enExtra = {
  // ... existing code ...
  myComponent: {
    buttonLabel: 'Click Me',
    description: 'Some description text',
    title: 'My Title',
  },
  // ... rest of file ...
};

// src/platforms/web/i18n/locales/es-extra.ts
export const esExtra = {
  // ... existing code ...
  myComponent: {
    buttonLabel: 'Hazme clic',
    description: 'Texto de descripción',
    title: 'Mi Título',
  },
  // ... rest of file ...
};
```

#### 5. For Dynamic Content, Use useMemo
```typescript
// ❌ When translating arrays/objects that depend on t():
const items = [
  { label: t('key.item1') }, // ⚠️ Can become stale
];

// ✅ CORRECT - Use useMemo to recalculate when t() changes:
const items = useMemo(
  () => [
    { label: t('key.item1') },
    { label: t('key.item2') },
  ],
  [t] // ← CRITICAL: Include t in dependency array
);
```

#### 6. Test Language Switching
- Open DevTools → Application → Local Storage
- Find key `re-portfolio-settings`
- Edit JSON to change `"language": "en"` to `"language": "es"`
- Refresh page → all text should be in Spanish
- Change back to `"en"` → all text should be in English

---

## Common Patterns

### Pattern 1: Tab Navigation
```typescript
// ❌ BEFORE
const tabs = ['Overview', 'Details', 'Settings'];

// ✅ AFTER
const { t } = useSettings();
const tabs = useMemo(
  () => [
    { id: 'overview', label: t('component.overviewTab') },
    { id: 'details', label: t('component.detailsTab') },
    { id: 'settings', label: t('component.settingsTab') },
  ],
  [t]
);
```

### Pattern 2: Conditional Rendering
```typescript
// ❌ BEFORE
<p>{loading ? 'Loading...' : 'Ready'}</p>

// ✅ AFTER
<p>{loading ? t('common.loading') : t('common.ready')}</p>
```

### Pattern 3: Modal/Dialog
```typescript
// ❌ BEFORE
<Modal title="Are you sure?" >
  <p>This action cannot be undone.</p>
  <button>Cancel</button>
  <button>Delete</button>
</Modal>

// ✅ AFTER
<Modal title={t('confirmDialog.title')} >
  <p>{t('confirmDialog.message')}</p>
  <button>{t('common.cancel')}</button>
  <button>{t('common.delete')}</button>
</Modal>
```

### Pattern 4: Form Labels
```typescript
// ❌ BEFORE
<label>Property Name</label>
<input placeholder="e.g., Valencia Apartment" />

// ✅ AFTER
<label>{t('propertyForm.propertyNameLabel')}</label>
<input placeholder={t('propertyForm.propertyNamePlaceholder')} />
```

### Pattern 5: Titles with Variables
```typescript
// ❌ BEFORE
<h1>Welcome, John!</h1>

// ✅ AFTER - Using replacements parameter
<h1>{t('welcome.greeting', { name: userName })}</h1>
// In translation file:
// { greeting: 'Welcome, {{name}}!' }
```

---

## Batch Refactoring Script Ideas

### For Developers Using VSCode Find & Replace:
Use this regex pattern to find all hardcoded English text (works in English-only files):

Find: `["']([A-Z][a-z\s&\-\.,']+)["']`
Replace: `{t('component.keyName')}`

Then manually verify and adjust the replacement.

---

##Priority Components Ranked by Impact

### 🔴 CRITICAL (Do First)
1. **PropertyCard** - Most frequently used component
   - Shows 20+ metric labels
   - Major visual component
   - File: `src/platforms/web/components/PropertyCard.tsx`
   - Expected keys: 40+

2. **PropertyFormNew** - Critical for property creation
   - Multiple form sections
   - Expense types, billing frequencies
   - File: `src/platforms/web/components/PropertyFormNew.tsx`
   - Expected keys: 50+

### 🟠 HIGH (Do Second)
3. **IngestionReviewModal** - User-facing feature
4. **QuickPropertyCreateModal** - Onboarding flow
5. **MortgageForm** - Core domain feature

### 🟡 MEDIUM (Do Third)
6. **WealthAccountsEditor**
7. **WorkspaceReviewScreen**
8. **AlertCenterWidget**
9. **Sidebar** - Navigation
10. **Layout** - Layout wrappers

### 🟢 LOW (Do Last)
- Utility modals
- Secondary screens
- Edge case components

---

## Verification Checklist Per Component

Before considering a component "done":
- [ ] All hardcoded text replaced with `t()` calls
- [ ] No console errors when component mounts
- [ ] Spanish translations exist for all keys
- [ ] English translations exist for all keys
- [ ] Switch language → component text updates immediately
- [ ] No "Missing translation key" warnings in console
- [ ] Component props and types still valid
- [ ] No broken functionality

---

## Translation Key Naming Convention

Use this format for consistency:
```
component[Name].[featureName or elementType].[specific label or state]

Examples:
propertyCard.deleteButton
propertyCard.overviewTab
mortgageForm.interestRateLabel
wealthAccountsEditor.linkedAccountsSection
```

---

## Testing the Translation System

### Manual Load Test:
```javascript
// In browser console:
localStorage.setItem('re-portfolio-settings', 
  JSON.stringify({ language: 'es' }));
location.reload(); // All text should be Spanish

localStorage.setItem('re-portfolio-settings', 
  JSON.stringify({ language: 'en' }));
location.reload(); // All text should be English
```

### Automated Test Pattern (pseudo-code):
```typescript
import { render, screen } from '@testing-library/react';
import { SettingsProvider } from '../context/SettingsContext';

test('component shows Spanish text when language is Spanish', () => {
  render(
    <SettingsProvider> {/* Pass language: 'es' in props */}
      <MyComponent />
    </SettingsProvider>
  );
  expect(screen.getByText(/Spanish.*text/)).toBeInTheDocument();
});
```

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Forgetting t() in dependency array
```typescript
// WRONG - translations become stale
const items = useMemo(() => [
  { label: t('key.item1') },
], []); // Missing [t]!

// RIGHT
const items = useMemo(() => [
  { label: t('key.item1') },
], [t]); // Include t in dependencies
```

### ❌ Mistake 2: Forgetting to add Spanish translations
```typescript
// en-extra.ts ✅ exists
// es-extra.ts ❌ missing!
```
Result: Falls back to English, user sees English when Spanish selected.

### ❌ Mistake 3: Hard String Inside JSX Expression
```typescript
// WRONG
<button>{condition ? 'Save' : 'Cancel'}</button>

// RIGHT
<button>{condition ? t('common.save') : t('common.cancel')}</button>
```

### ❌ Mistake 4: Translating Inside Effects
```typescript
// PROBLEMATIC - May cause race conditions
useEffect(() => {
  const title = t('page.title');
  // ... do something with title
}, []); // t not in dependencies!

// BETTER - Use useMemo instead
const title = useMemo(() => t('page.title'), [t]);
```

---

## Quick Command Reference

### Count hardcoded strings in a file:
```bash
# Count English strings that look like labels
grep -o '"[A-Z][a-z ]*"' component.tsx | wc -l
```

### Find components needing localization:
```bash
# Find all TSX files with hardcoded English text
grep -r '"[A-Z][a-z ]" src/platforms/web/components/
```

---

## When Translation Keys Get Complex

### Example: Dynamic Option Lists
```typescript
// If you have dynamic lists of options:
const expenseTypeOptions = useMemo(() => {
  const types = ['housing', 'utilities', 'maintenance'];
  return types.map(type => ({
    value: type,
    label: t(`propertyForm.expenseTypes.${type}`),
  }));
}, [t]);

// Translation file structure:
{
  propertyForm: {
    expenseTypes: {
      housing: 'Housing',
      utilities: 'Utilities',
      maintenance: 'Maintenance',
    },
  },
}
```

---

## File Size Impact

Adding translations increases file size slightly but minimally:
- Each translation key: ~20-50 bytes (depending on text length)
- Split across en-extra.ts and es-extra.ts
- Gzip compression handles repetition well
- No runtime performance impact (translations are static)

---

## Summary

The refactoring follows a simple, repeatable pattern:
1. Import useSettings
2. Get t() function
3. Replace hardcoded strings
4. Add translation keys
5. Test language switching
6. Verify no console errors

Expected time per component:
- Simple component (5-10 strings): 10-15 minutes
- Medium component (20-40 strings): 20-30 minutes
- Complex component (40+ strings with logic): 30-60 minutes

Total estimated time for all 23 remaining components: 8-12 hours
