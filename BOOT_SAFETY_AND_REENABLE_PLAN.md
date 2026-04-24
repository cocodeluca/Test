# Boot Safety And Re-enable Plan

## Central Safety Switches
- `APP_RECOVERY_MODE` in `src/platforms/web/utils/appRecoveryMode.ts`
- `GALLERY_SAFE_MODE` in `src/platforms/web/utils/gallerySafeMode.ts`
- `AppSafetyProvider` in `src/platforms/web/context/AppSafetyContext.tsx`

## Central Settled Gate
- `isBootSettled` becomes `true` after the first animation frame inside `AppSafetyProvider`.
- `canAutoWrite = isBootSettled && !APP_RECOVERY_MODE`.
- Any automatic write, sync, or migration effect should check `canAutoWrite` before doing work.

## Currently Disabled Paths
1. Portfolio autosave in `src/platforms/web/App.tsx`
2. Recovery snapshot persistence in `src/platforms/web/App.tsx`
3. Delayed backup sync in `src/platforms/web/App.tsx`
4. Pagehide and visibility backup flush in `src/platforms/web/App.tsx`
5. Etoro sync on mount in `src/platforms/web/App.tsx`
6. Demo session boot mutation paths in `src/platforms/web/App.tsx`
7. FX refresh on mount in `src/platforms/web/context/SettingsContext.tsx`
8. Gallery ref resolution and gallery-to-state sync in `src/platforms/web/hooks/useResolvedGalleryUrls.ts`

## Staged Re-enable Order
1. Recovery snapshot writeback
2. Delayed backup sync
3. Pagehide and visibility backup flush
4. Etoro sync on mount
5. Portfolio autosave
6. FX refresh on mount

## Re-enable Preconditions
- App has a settled gate separate from data hydration.
- Effect has a semantic no-op guard.
- Effect dependencies are primitives or stable signatures.
- The effect does not run until after the boot gate is open.
- A browser smoke test passes immediately after one path is re-enabled.

## Regression Checklist
- Hard refresh
- Cold boot
- Open dashboard
- Open properties list
- Open property card
- Open create property
- Open edit property
- Upload 3+ images
- Save and reopen
- Leave app idle for 15 seconds
- Check console for loops, repeated writes, or render spam

## Boot-Effect Safety Checklist
- Does the effect write state?
- Does it persist or sync data?
- Does it depend on unstable objects or arrays?
- Can it fire during hydration?
- Does it have a semantic no-op guard?
- Can it be deferred until the app is settled?
- Can it be user-triggered instead of boot-triggered?
