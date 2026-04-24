# Quick Start Guide - Multi-Platform Real Estate Portfolio App

Get your cross-platform app running in minutes.

## Prerequisites
- Node.js 16+ installed
- npm or yarn

## 1. Install Dependencies (One Time)

```bash
npm install
```

## 2. Choose Your Platform

### Option A: Run on Web (Desktop Browser)
```bash
npm run web
```
- Opens at `http://localhost:8081`
- Use any modern browser
- Perfect for development and testing
- **No additional tools needed**

### Option B: Run on iOS (Mac only)
```bash
npm run ios
```
- Requires Xcode installed
- Opens iOS simulator automatically
- Test on iPhone/iPad

### Option C: Run on Android
```bash
npm run android
```
- Requires Android Studio + emulator running
- Opens emulator automatically
- Test on Android phones/tablets

### Option D: Interactive Menu (See All Options)
```bash
npm start
```
Then press:
- `w` for web
- `i` for iOS
- `a` for Android
- `q` to quit

## 3. View the App

Once running, you'll see:
- **Dashboard** tab: Portfolio metrics and property table
- **Properties** tab: Coming soon (placeholder)
- **Mortgages** tab: Coming soon (placeholder)

### Sample Data Included
- 4 properties (Barcelona, Madrid, Valencia, Bilbao)
- 3 mortgages
- All metrics calculated and displayed

## 4. Modify Sample Data

Edit the mock properties and mortgages:

**File**: `src/common/data/mockData.ts`

```typescript
export const mockProperties: Property[] = [
  {
    id: 'prop1',
    name: 'Your Property Name',
    address: 'Your Address',
    city: 'City',
    country: 'Country',
    // ... other fields
  },
  // Add more properties
];
```

Save and the app updates automatically.

## 5. Making Changes

### Update Calculations
Edit: `src/common/utils/calculations.ts`

Changes apply to all platforms automatically.

### Update Web UI
Edit: `src/platforms/web/components/` or `src/platforms/web/pages/`

Styles: `src/platforms/web/styles/index.css` (Tailwind CSS)

### Update Mobile UI
Edit: `src/platforms/mobile/screens/` or `src/platforms/mobile/components/`

Uses React Native components.

## 6. Build for Production

### Web
```bash
npm run build
```
Creates optimized `dist/` folder ready to deploy.

### iOS (Requires EAS Account)
```bash
npm run build-ios
```

### Android (Requires EAS Account)
```bash
npm run build-android
```

## Structure Overview

```
Your App
├── shared code (calculations)       src/common/
├── web version (React + CSS)        src/platforms/web/
├── mobile version (React Native)    src/platforms/mobile/
├── web entry point                  src/main.tsx
└── expo entry point                 App.tsx
```

## Troubleshooting

### Port already in use
```bash
# Web runs on 8081, if taken:
npm run web -- --port 3000
```

### Clear cache
```bash
npm start -- --reset-cache
```

### Module not found error
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

### Mobile won't start
- Ensure Android Studio/Xcode is installed
- Check emulator is running
- Try `npm start` first to test basic setup

## Next Steps

1. ✅ **Run the app** on your preferred platform
2. ✅ **Explore the dashboard** with sample data
3. ✅ **Modify sample data** in `src/common/data/mockData.ts`
4. ✅ **Add more properties/mortgages**
5. 🔄 **Build CRUD features** (add/edit/delete)
6. 🔄 **Connect to backend** API
7. 🔄 **Deploy** to app stores and web

## File Locations for Common Tasks

| Task | File |
|------|------|
| Change sample data | `src/common/data/mockData.ts` |
| Update calculations | `src/common/utils/calculations.ts` |
| Add web component | `src/platforms/web/components/` |
| Add mobile screen | `src/platforms/mobile/screens/` |
| Change web styling | `src/platforms/web/styles/index.css` |
| Change app layout | `src/platforms/web/App.tsx` or `src/platforms/mobile/App.tsx` |

## Support

Refer to `MULTI_PLATFORM_SETUP.md` for detailed architecture documentation.

---

**You're ready!** Choose your platform above and start building. 🚀
