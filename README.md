# Real Estate Portfolio Management App

A modern cross-platform application for tracking and managing real estate investment portfolios. Built with React, TypeScript, React Native, and Expo for seamless deployment across Web, iOS, and Android.

## Status

**Version 1.0 - MVP Dashboard & Analytics**

This is the initial release focused on:
- ✅ Portfolio dashboard with key metrics
- ✅ Financial calculations and analytics
- ✅ Property performance table
- ✅ Mock data and sample properties
- ✅ Clean, professional UI
- ✅ Multi-platform support (Web, iOS, Android)
- 🔄 Properties management (placeholder)
- 🔄 Mortgages management (placeholder)
- ⏳ CRUD operations (coming next)

### Safe Development Note
Keep changes small and branch-based while the app is still being hardened. Favor read-only UI or documentation updates before touching persistence, auth, ingestion, backups, or recovery flows.

## Key Features

### Cross-Platform
- **Web**: Full-featured dashboard with Tailwind CSS responsive design
- **iPhone/iPad**: Native iOS app via Expo
- **Android**: Native Android app via Expo
- **Shared Code**: Single business logic codebase across all platforms

### Dashboard Metrics
- Portfolio summary (value, debt, equity)
- Cashflow analysis (monthly rent, expenses, mortgage payments)
- Return metrics (gross yield, debt-to-value ratio)
- Property performance table (10 key metrics per property)

### Financial Calculations
1. Total Portfolio Value
2. Total Debt
3. Total Equity
4. Equity Percentage
5. Total Monthly Rent
6. Total Annual Expenses
7. Total Monthly Mortgage Payments
8. Net Monthly Cashflow
9. Average Gross Yield
10. Debt-to-Value Ratio

### Per-Property Metrics
- Equity and Equity Percentage
- Annual Rental Income
- Annual Expenses Breakdown
- Net Monthly Cashflow
- Gross Yield
- Net Yield
- Return on Capital Employed (ROCE)

## Tech Stack

### Web
- React 18
- TypeScript
- Tailwind CSS
- Vite (Build tool)
- Lucide React (Icons)

### Mobile (iOS/Android)
- React Native
- TypeScript
- Expo
- React Navigation (Bottom tab navigation)
- Lucide React Native (Icons)

### Cross-Platform
- Shared business logic (calculations, data, types)
- Platform-specific UI components

## Project Structure

```
real-estate-portfolio/
├── src/
│   ├── common/              # Shared code across all platforms
│   │   ├── types/           # TypeScript interfaces
│   │   ├── data/            # Mock data
│   │   └── utils/           # Calculations & formatting
│   │
│   ├── platforms/
│   │   ├── web/             # Web app (React + Tailwind)
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── pages/       # Page components
│   │   │   ├── styles/      # CSS files
│   │   │   └── App.tsx
│   │   │
│   │   └── mobile/          # Mobile app (React Native + Expo)
│   │       ├── components/  # Mobile-specific components
│   │       ├── screens/     # Screen components
│   │       └── App.tsx
│   │
│   └── main.tsx             # Web entry point
│
├── App.tsx                  # Expo entry point (all platforms)
├── app.json                 # Expo configuration
├── package.json
├── tsconfig.json
├── vite.config.ts          # Vite config (web only)
├── tailwind.config.js       # Tailwind config
└── README.md
```

## Installation & Setup

### Prerequisites
- Node.js 16+ and npm/yarn
- For iOS: macOS with Xcode
- For Android: Android Studio & Android SDK
- Expo CLI: `npm install -g expo-cli`

### Quick Start

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Run on Web
```bash
npm run web
```
Opens at `http://localhost:8081` in your browser.

#### 3. Run on iOS (macOS only)
```bash
npm run ios
```
Requires Xcode and a connected iOS device/simulator.

#### 4. Run on Android
```bash
npm run android
```
Requires Android Studio and an emulator/connected device.

#### 5. Start Expo Dev Server
```bash
npm start
```
Choose which platform to run by pressing:
- `w` for web
- `i` for iOS
- `a` for Android

## Available Scripts

### Development
- `npm start` - Start Expo dev server (interactive menu)
- `npm run web` - Run web version
- `npm run ios` - Run iOS version (macOS only)
- `npm run android` - Run Android version
- `npm run dev` - Alternative web development

### Production
- `npm run build-ios` - Build iOS app for App Store (requires EAS account)
- `npm run build-android` - Build Android APK for Play Store (requires EAS account)
- `npm run build` - Build web for production

## Data Model

### Property
```typescript
{
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  purchasePrice: number;
  currentEstimatedValue: number;
  purchaseDate: string;
  monthlyRent: number;
  annualIBI: number;
  annualInsurance: number;
  annualCommunityFees: number;
  annualMaintenance: number;
  annualOtherExpenses: number;
  notes: string;
}
```

### Mortgage
```typescript
{
  id: string;
  propertyId: string;
  lenderName: string;
  originalLoanAmount: number;
  currentBalance: number;
  interestRate: number;
  mortgageTermYears: number;
  monthlyMortgagePayment: number;
  mortgageStartDate: string;
  fixedOrVariable: 'fixed' | 'variable';
  notes: string;
}
```

## Calculation Logic

### Portfolio-Level Metrics

**Total Portfolio Value**
```
= Sum of currentEstimatedValue of all properties
```

**Total Debt**
```
= Sum of currentBalance of all mortgages
```

**Total Equity**
```
= Total Portfolio Value - Total Debt
```

**Equity Percentage**
```
= (Total Equity / Total Portfolio Value) × 100
```

**Total Net Monthly Cashflow**
```
= Total Monthly Rent 
  - (Total Annual Expenses / 12)
  - Total Monthly Mortgage Payments
```

### Per-Property Metrics

**Net Monthly Cashflow**
```
= Monthly Rent
  - (Annual Expenses / 12)
  - Monthly Mortgage Payment
```

**Gross Yield**
```
= (Annual Rental Income / Current Value) × 100
```

**ROCE (Return on Capital Employed)**
```
If mortgage exists:
  Invested Capital = Purchase Price - Original Loan Amount
Else:
  Invested Capital = Purchase Price

ROCE = (Annual Net Cashflow / Invested Capital) × 100
```

## Sample Data

The app comes with:
- **4 Sample Properties**
  - Barcelona Apartment
  - Madrid Townhouse
  - Valencia Coastal Villa
  - Bilbao Urban Flat
  
- **3 Sample Mortgages** (attached to properties 1-3)

Edit `src/common/data/mockData.ts` to customize.

## Platform-Specific Notes

### Web Version
- Fully responsive design
- Works on all modern browsers
- Dark sidebar navigation
- Desktop-friendly

### iOS Version
- Bottom tab navigation
- Native iOS controls
- Tablet support
- Optimized for iPhone/iPad

### Android Version
- Bottom tab navigation
- Material Design inspired
- Full Android support
- Optimized for phones/tablets

## Building for Production

### Web
```bash
npm run build
```
Creates optimized build in `dist/` folder.

### iOS & Android (with EAS)
```bash
npm run build-ios
npm run build-android
```

Requires EAS CLI setup:
```bash
npm install -g eas-cli
eas build:configure
```

## Troubleshooting

### npm install fails
- Ensure Node.js 16+ is installed
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

### Web won't load
- Port 8081 may be in use
- Kill the process or use: `npm run web -- --port 3000`

### Mobile build fails
- iOS: Ensure Xcode is installed and up to date
- Android: Check Android SDK setup in Android Studio
- Run `npm run web` first to ensure basic setup works

### Metro bundler issues
- Clear cache: `npm start -- --reset-cache`
- Delete `.expo` folder

## Future Enhancements

- [ ] Add/Edit/Delete properties and mortgages (CRUD)
- [ ] Amortization schedules
- [ ] Future projections
- [ ] Rental forecasts
- [ ] Expense tracking and analysis
- [ ] Document management
- [ ] Multi-currency support
- [ ] Backend API integration
- [ ] User authentication
- [ ] Data persistence (local storage/database)
- [ ] Charts and visualizations
- [ ] Export to PDF/Excel
- [ ] Push notifications
- [ ] Offline support

## Browser & Device Support

### Web
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

### Mobile
- iOS 13+ (iPhone/iPad)
- Android 9+ (phones/tablets)

## Performance

- Instant calculations on property updates
- Optimized re-renders with React hooks
- Lightweight bundle (web)
- Native performance on mobile

## License

Private use

## Support

For issues, questions, or feature requests, refer to project documentation or review the code structure.

---

**Ready to use!** Install dependencies and run any of the dev commands above based on your target platform.
