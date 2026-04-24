# Multi-Platform Setup Guide

This document explains the structure and how to work with the cross-platform real estate portfolio app.

## Architecture Overview

The app uses a **shared code + platform-specific UI** architecture:

### Shared Code (`src/common/`)
All business logic, data, types, and calculations are in `src/common/`:
- `types/` - TypeScript interfaces used across all platforms
- `data/` - Mock data (consistent across all platforms)
- `utils/calculations.ts` - Financial calculation logic
- `utils/formatting.ts` - Number and currency formatting

### Platform-Specific UI

#### Web (`src/platforms/web/`)
- Built with React + TypeScript + Tailwind CSS
- Runs via Vite dev server
- Desktop-first responsive design
- Components use HTML/CSS

#### Mobile (`src/platforms/mobile/`)
- Built with React Native + Expo
- Runs on iOS and Android
- Native platform UI
- Components use React Native primitives

## File Organization

```
src/
├── common/                      # ✅ Shared across all platforms
│   ├── types/index.ts
│   ├── data/mockData.ts
│   └── utils/
│       ├── calculations.ts
│       └── formatting.ts
│
├── platforms/
│   ├── web/                    # 💻 Web version only
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── styles/index.css
│   │
│   └── mobile/                 # 📱 iOS/Android via Expo
│       ├── App.tsx
│       ├── screens/
│       └── components/
│
└── main.tsx                    # Web entry point

App.tsx                         # Expo entry point
```

## How It Works

### When running on Web
1. `npm run web` starts Vite dev server
2. Vite builds the app with `src/main.tsx` as entry
3. `src/main.tsx` imports `src/platforms/web/App`
4. Web UI components render with Tailwind CSS

### When running on Mobile (iOS/Android)
1. `npm start` or `npm run ios`/`npm run android`
2. Expo CLI loads `app.json` and `App.tsx`
3. `App.tsx` detects platform and imports `src/platforms/mobile/App`
4. Mobile navigation loads React Native screens
5. Native app runs on device simulator or physical device

## Development Workflow

### Making Changes to Shared Logic
If you update calculations or types:
1. Edit files in `src/common/`
2. Changes automatically apply to all platforms (web, iOS, Android)
3. No need to reload or restart different servers

### Adding a Web Feature
1. Create component in `src/platforms/web/components/`
2. Create page in `src/platforms/web/pages/` if needed
3. Update `src/platforms/web/App.tsx` routes
4. Styles go in `src/platforms/web/styles/` or component CSS

### Adding a Mobile Feature
1. Create component in `src/platforms/mobile/components/`
2. Create screen in `src/platforms/mobile/screens/`
3. Update `src/platforms/mobile/App.tsx` navigation
4. Styles use React Native `StyleSheet`

## Shared Code Guidelines

### ✅ Put in `src/common/`
- Business logic (calculations, algorithms)
- Data models (interfaces, types)
- Formatting utilities
- Mock/test data
- Any logic used by multiple platforms

### ❌ Don't put in `src/common/`
- UI components (different per platform)
- Navigation logic (different per platform)
- Platform-specific APIs
- Styling (CSS for web, StyleSheet for mobile)

## Styling Approach

### Web
- **Tailwind CSS** utility classes
- Example: `className="bg-blue-50 text-slate-900 rounded-lg p-6"`
- Global styles in `src/platforms/web/styles/index.css`

### Mobile
- **React Native StyleSheet**
- Example: `style={styles.container}` with `StyleSheet.create()`
- No HTML/CSS, uses native components

## Adding New Calculations

1. Add to `src/common/utils/calculations.ts`
2. Test with sample data in `src/common/data/mockData.ts`
3. Use in both web and mobile screens

Example:
```typescript
// Add function in src/common/utils/calculations.ts
export const calculateNewMetric = (property: Property): number => {
  return property.value * 2; // your logic
};

// Use in web dashboard
import { calculateNewMetric } from '../../common/utils/calculations';
const result = calculateNewMetric(property);

// Use in mobile dashboard
import { calculateNewMetric } from '../../../common/utils/calculations';
const result = calculateNewMetric(property);
```

## Importing Patterns

### From Web Components
```typescript
// ✅ Correct: Shared code
import { calculatePortfolioMetrics } from '../../../common/utils/calculations';
import { Property } from '../../../common/types';

// ✅ Correct: Web components
import { MetricCard } from './MetricCard';
import { Dashboard } from '../pages/Dashboard';

// ❌ Wrong: Don't import mobile components
import MobileMetricCard from '../../mobile/components/MobileMetricCard';
```

### From Mobile Components
```typescript
// ✅ Correct: Shared code
import { calculatePortfolioMetrics } from '../../common/utils/calculations';
import { Property } from '../../common/types';

// ✅ Correct: Mobile components
import MobileMetricCard from '../components/MobileMetricCard';
import MobileDashboard from './MobileDashboard';

// ❌ Wrong: Don't import web components
import { MetricCard } from '../../web/components/MetricCard';
```

## Environment-Specific Code

If you need platform-specific behavior in shared code, use conditionals:

```typescript
// src/common/utils/formatting.ts
import { Platform } from 'react-native';

export const getDeviceType = () => {
  if (Platform.OS === 'web') {
    return 'desktop';
  } else {
    return 'mobile';
  }
};
```

## Running Different Versions

```bash
# Start Expo dev menu (choose which to run)
npm start

# Direct commands
npm run web      # Web on localhost:8081
npm run ios      # iOS simulator (macOS)
npm run android  # Android emulator

# Production builds
npm run build-ios      # iOS App
npm run build-android  # Android APK
npm build              # Web static files
```

## Debugging

### Web
- Browser DevTools (F12)
- React DevTools extension
- Network/Console tabs

### Mobile
- Expo DevTools (shake device or `Ctrl+D`)
- React Native Debugger (separate app)
- Metro bundler console logs

## Common Problems

### "Module not found" error
- Check import path relative to your file location
- Web: `../../../common/` vs Mobile: `../../common/`
- Verify file exists at that path

### "React Native modules not found"
- Run `npm install` to ensure all dependencies
- Delete node_modules and reinstall if needed
- Clear Expo cache: `npm start -- --reset-cache`

### Web styling issues
- Check Tailwind classes are correct
- Ensure `tailwind.config.js` is configured
- CSS in `src/platforms/web/styles/index.css`

### Mobile layout issues
- Use `flex: 1` for flexible layouts
- Test on both simulator and device
- Check for screen notches/safe areas with `SafeAreaView`

## Next Steps

1. **Customize Sample Data**: Edit `src/common/data/mockData.ts`
2. **Add More Calculations**: Extend `src/common/utils/calculations.ts`
3. **Build CRUD Features**: Add screens for adding/editing properties
4. **Add Backend**: Connect to API (will still use `src/common/` for logic)
5. **Deploy**: Use Expo EAS for iOS/Android, Vercel/Netlify for web

## Resources

- [React Documentation](https://react.dev)
- [React Native Docs](https://reactnative.dev)
- [Expo Documentation](https://docs.expo.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

---

Questions? Review the project structure and remember: **Shared logic in `common/`, UI in `platforms/`**
