# Complete Project Structure

```
real-estate-portfolio/
│
├── src/                                  # TypeScript source code
│   │
│   ├── common/                          # Shared code across all platforms
│   │   ├── types/
│   │   │   └── index.ts                 # Property, Mortgage, Metrics interfaces
│   │   │
│   │   ├── data/
│   │   │   └── mockData.ts              # Sample properties and mortgages
│   │   │
│   │   └── utils/
│   │       ├── calculations.ts          # Financial calculation logic
│   │       └── formatting.ts            # Currency, percentage formatting
│   │
│   ├── platforms/                       # Platform-specific implementations
│   │   │
│   │   ├── web/                        # Web app (React + Tailwind CSS + Vite)
│   │   │   ├── App.tsx                 # Web app entry point
│   │   │   │
│   │   │   ├── components/
│   │   │   │   ├── Layout.tsx          # Main layout with sidebar
│   │   │   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   │   │   ├── MetricCard.tsx      # Metric display cards
│   │   │   │   └── PropertyTable.tsx   # Properties table
│   │   │   │
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx       # Dashboard page
│   │   │   │   ├── PropertiesPage.tsx  # Properties placeholder
│   │   │   │   └── MortgagesPage.tsx   # Mortgages placeholder
│   │   │   │
│   │   │   └── styles/
│   │   │       └── index.css           # Global Tailwind styles
│   │   │
│   │   └── mobile/                     # Mobile app (React Native + Expo)
│   │       ├── App.tsx                 # Mobile app entry point
│   │       │
│   │       ├── screens/
│   │       │   ├── MobileDashboard.tsx # Dashboard screen
│   │       │   ├── MobilePropertiesScreen.tsx
│   │       │   └── MobileMortgagesScreen.tsx
│   │       │
│   │       └── components/
│   │           ├── MobileMetricCard.tsx
│   │           └── MobilePropertyTable.tsx
│   │
│   └── main.tsx                        # Web entry point (Vite)
│
├── App.tsx                             # Cross-platform entry point (Expo)
├── app.json                            # Expo configuration
├── package.json                        # Dependencies & scripts
├── tsconfig.json                       # TypeScript config
├── tsconfig.node.json                  # TypeScript config for Vite
├── vite.config.ts                      # Vite build config
├── tailwind.config.js                  # Tailwind CSS config
├── postcss.config.js                   # PostCSS config
├── index.html                          # HTML template for web
├── .gitignore                          # Git ignore rules
│
├── README.md                           # Main documentation
├── QUICK_START.md                      # Quick start guide
├── MULTI_PLATFORM_SETUP.md            # Detailed architecture guide
│
└── node_modules/                       # Dependencies (created by npm install)

```

## File Descriptions

### Core Files

| File | Purpose |
|------|---------|
| `App.tsx` | Detects platform (web/iOS/Android) and loads appropriate app |
| `app.json` | Expo configuration for iOS/Android builds |
| `package.json` | Project metadata, dependencies, and npm scripts |
| `index.html` | HTML template for web app |
| `src/main.tsx` | Web entry point, imports React and web app |

### Shared Code (`src/common/`)

| File | Purpose |
|------|---------|
| `types/index.ts` | TypeScript interfaces: `Property`, `Mortgage`, `PortfolioMetrics`, `PropertyMetrics` |
| `data/mockData.ts` | `mockProperties` array and `mockMortgages` array for sample data |
| `utils/calculations.ts` | All financial calculation functions (portfolio & per-property metrics) |
| `utils/formatting.ts` | `formatCurrency()`, `formatPercentage()`, `formatDate()` helpers |

### Web App (`src/platforms/web/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Web app entry, state management, page routing |
| `components/Layout.tsx` | Main layout with sidebar and main content area |
| `components/Sidebar.tsx` | Navigation menu with Dashboard/Properties/Mortgages links |
| `components/MetricCard.tsx` | Reusable card that displays a metric value |
| `components/PropertyTable.tsx` | Table showing all properties and their metrics |
| `pages/Dashboard.tsx` | Dashboard page with metric cards and property table |
| `pages/PropertiesPage.tsx` | Properties placeholder page |
| `pages/MortgagesPage.tsx` | Mortgages placeholder page |
| `styles/index.css` | Global styles with Tailwind directives |

### Mobile App (`src/platforms/mobile/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Mobile app entry, bottom tab navigation with React Navigation |
| `screens/MobileDashboard.tsx` | Dashboard screen with metric cards and property list |
| `screens/MobilePropertiesScreen.tsx` | Properties placeholder screen |
| `screens/MobileMortgagesScreen.tsx` | Mortgages placeholder screen |
| `components/MobileMetricCard.tsx` | React Native metric card component |
| `components/MobilePropertyTable.tsx` | React Native property list/table |

### Configuration Files

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript compiler options |
| `tsconfig.node.json` | TypeScript for Vite build |
| `vite.config.ts` | Vite build tool configuration |
| `tailwind.config.js` | Tailwind CSS theme and customization |
| `postcss.config.js` | PostCSS plugin configuration |
| `.gitignore` | Files/folders to exclude from git |

### Documentation

| File | Purpose |
|------|---------|
| `README.md` | Complete project documentation |
| `QUICK_START.md` | Quick start guide to get running fast |
| `MULTI_PLATFORM_SETUP.md` | Detailed architecture and development guide |
| `PROJECT_STRUCTURE.md` | This file - folder and file descriptions |

## Development Workflow

### To Add a Feature

1. **If it's calculation logic**: Add to `src/common/utils/calculations.ts`
2. **If it's a web component**: Add to `src/platforms/web/components/` or `pages/`
3. **If it's a mobile screen**: Add to `src/platforms/mobile/screens/`
4. **If it's a type**: Add to `src/common/types/index.ts`
5. **If it's sample data**: Update `src/common/data/mockData.ts`

### File Location Guide

```
Need to calculate something?
└─> src/common/utils/calculations.ts

Building web UI?
├─> Component: src/platforms/web/components/
├─> Full Page: src/platforms/web/pages/
└─> Styling: src/platforms/web/styles/index.css

Building mobile UI?
├─> Screen: src/platforms/mobile/screens/
└─> Component: src/platforms/mobile/components/

Need a data model/type?
└─> src/common/types/index.ts

Need sample data?
└─> src/common/data/mockData.ts

Formatting numbers/dates?
└─> src/common/utils/formatting.ts
```

## Key Design Patterns

### Single Source of Truth
- All calculations in `src/common/utils/` used by both web and mobile
- Sample data in `src/common/data/` shared across platforms

### Platform-Specific UI
- Web uses Tailwind CSS classes and HTML elements
- Mobile uses React Native components and StyleSheet
- Both use same data and calculation logic

### Type Safety
- All data modeled with TypeScript interfaces in `src/common/types/`
- Reduces bugs and improves IDE autocomplete

### Separation of Concerns
- Business logic separate from UI
- Easy to test calculations independently
- Easy to swap out UI without affecting logic

## Dependencies Overview

### Runtime
- `react` - UI library
- `react-dom` - React for web (in web version)
- `react-native` - React for mobile (in mobile version)
- `expo` - Framework for building iOS/Android
- `@react-navigation/native` - Navigation for mobile
- `@react-navigation/bottom-tabs` - Tab navigation
- `lucide-react` - Icons for web
- `lucide-react-native` - Icons for mobile

### Development
- `typescript` - Static typing
- `vite` - Web build tool
- `tailwindcss` - CSS utility framework
- `@types/*` - Type definitions

---

This structure supports:
- ✅ Shared business logic across all platforms
- ✅ Platform-specific UI (web, iOS, Android)
- ✅ Easy maintenance and testing
- ✅ Scalable architecture for adding features
- ✅ Clear separation of concerns
