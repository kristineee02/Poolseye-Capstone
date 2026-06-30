# PoolsEye

Admin web dashboard + lifeguard mobile app.

## Structure

```
Poolseye-Capstone/
  frontend/     React + Vite admin console (browser)
  mobile/       Expo lifeguard app (Android / iOS)
```

## Web (frontend)

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

## Mobile (Expo SDK 54)

```bash
cd mobile
npm install
npx expo install --fix
npm start
```

Scan the QR code in **Expo Go (SDK 54)** on your phone, or press `a` for Android emulator.

## From project root

```bash
npm run dev       # starts frontend
npm run mobile    # starts Expo
npm run install:all
```
