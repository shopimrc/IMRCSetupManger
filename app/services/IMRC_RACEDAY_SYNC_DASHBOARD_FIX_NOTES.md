# IMRC RaceDay Sync + Dashboard Light Fix

## Replace these files

- `app/services/cloudSync.js` -> `cloudSync.js`
- `app/services/sync.js` -> `sync.js`
- `app/index.js` -> `index.js`
- `src/dashboard/DashboardScreen.js` -> `DashboardScreen.js`

The ZIP also includes matching copies of:

- `app/services/auth.js`
- `app/services/firebaseClient.js`
- `app/oauthredirect.js`

## What this fixes

### RaceDay active-state resurrection

The sync layer now treats `@raceDayEnded_v1` as the deciding local/cloud hint that an active RaceDay must not be resurrected from an older cloud payload.

If `@raceDayEnded_v1` is truthy and an active RaceDay pointer exists, sync now:

- clears `@raceDayActive_v1`
- clears `@activeRaceDay`
- keeps `@raceDayEnded_v1 = "1"`
- marks the matching session as `status: "ended"`

This prevents Dashboard from showing **Cont. Race Day** after an ended RaceDay was restored from cloud.

### Dashboard safety repair

`DashboardScreen.js` now does a local-only repair before refreshing dashboard data. If it sees an active RaceDay pointer but the ended flag/session says it is ended, it clears the active pointers locally and marks cloud dirty. This does not directly write to Firestore.

### Dashboard sync light

`app/index.js` now feeds local-only cloud sync status into `DashboardScreen`.

`DashboardScreen.js` uses that status color for `DashboardHeader`, so the light stays yellow while syncing and only goes green after `cloudSync.js` finishes the full sync path and clears dirty state.

### Write storm protection

`cloudSync.js` and `sync.js` include guards for:

- one sync operation at a time
- one cloud backup write at a time
- 60-second spacing between backup writes
- 10-minute Firebase resource-exhausted backoff
- 30-minute heartbeat throttle

## Important

The RaceDay End button should still locally clear these keys in the RaceDay area itself:

```js
await AsyncStorage.setItem("@raceDayActive_v1", "");
await AsyncStorage.setItem("@activeRaceDay", "");
await AsyncStorage.setItem("@raceDayEnded_v1", "1");
```

This package adds protection so stale cloud data cannot bring it back, but the RaceDay End flow should also be correct.
