# PoolsEye Lifeguard Mobile App

## Source structure

- `api/`: HTTP requests and backend response mapping. Screens should not build endpoint URLs directly.
- `auth/`: password-policy rules shared by authentication screens and context.
- `components/`: reusable visual components. `components/icons/` contains shared SVG icons.
- `context/`: application-level session state and user actions.
- `data/`: static product content and the canonical design tokens.
- `hooks/`: reusable React lifecycle behavior such as polling and safe-area layout.
- `navigation/`: bottom-tab composition and app-level notification integration.
- `notifications.js`: Expo permission, push-token, and local-notification integration.
- `screen/`: screen composition and screen-specific state.
- `storage/`: AsyncStorage persistence behind small, named functions.
- `theme/`: stable public import path for design tokens.
- `utils/`: small pure functions with no UI or network side effects.

## Code conventions

1. Keep network endpoint details in `api/`.
2. Keep AsyncStorage keys and operations in `storage/` or the API client.
3. Extract logic only when it is reused or has a separate responsibility; screen-specific rendering can stay with its screen.
4. Use shared design tokens instead of introducing one-off colors or sizes unless the design truly requires them.
5. Comments should explain **why** a non-obvious decision exists. Avoid comments that only repeat the next line of code.
6. Use JSDoc for reusable hooks/components when behavior or parameters are not obvious.
7. Keep backend validation authoritative even when the UI performs the same validation for quick feedback.
8. Preserve accessibility labels and minimum touch targets when editing controls.

## Main data flow

```text
Screen -> Auth context or api/* -> Express backend
       <- mapped result objects <-

TabNavigator -> useAlertNotifications -> Expo push + polling fallback
Home/Alerts  -> useAutoRefresh       -> current backend event state
```

Run `npm run start` for Expo development. For a production-like static check, run an Expo web export.
