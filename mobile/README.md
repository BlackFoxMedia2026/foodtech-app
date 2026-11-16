# App Foodtech (Capacitor)

L'app è il gestionale stesso in una finestra nativa: carica `https://foodtech-app.vercel.app`
(vedi `capacitor.config.ts`) e Capacitor aggiunge il ponte verso i plugin nativi. Ogni deploy
del sito arriva anche nell'app; l'app si ripubblica solo quando cambiano i plugin o i permessi.

Il sito riconosce l'app da `window.Capacitor` (`src/lib/app-nativa.ts`) e solo lì mostra i
gesti nativi, come «Scansiona le reti» nel portale Wi-Fi.

## Plugin

- `@capgo/capacitor-wifi`: elenco delle reti vicine (solo Android; su iOS solo la rete attuale).
- Fotocamera: nessun plugin, il QR si legge nella pagina con `getUserMedia` + `jsqr`
  (permesso `CAMERA` nel manifest Android).

## Lavorarci: l'app collegata al dev server

Con il dev server acceso nella cartella principale (`npm run dev`) e un telefono Android
collegato via USB con il debug attivo (oppure l'emulatore `Foodtech`):

```sh
cd mobile
npm run dev            # compila, installa e apre l'app su http://localhost:3000
```

Da lì ogni file salvato arriva sul telefono come nel browser. Si rilancia solo quando
cambiano plugin, permessi o `capacitor.config.ts`. Con `npm run dev -- --rete` il telefono
si collega al computer via Wi-Fi senza cavo, ma la fotocamera non funziona e l'accesso va
fatto prima dal cavo.

Per guardare dentro l'app con gli strumenti di Chrome: `chrome://inspect` sul computer.

## Altri comandi

```sh
npx cap sync android          # riporta l'app sulla produzione
npx cap open android          # apre Android Studio
npm run apk                   # APK di debug (produzione) in android/app/build/outputs/apk/debug/
```

Lo script imposta da solo `JAVA_HOME` sul JDK di Android Studio; per `npm run apk` va
impostato a mano (`C:\Program Files\Android\Android Studio\jbr`).

## iOS

Da aggiungere su un Mac: `npx cap add ios`, poi in `Info.plist`
`NSLocationWhenInUseUsageDescription` e `NSCameraUsageDescription`, e la capability
«Access Wi-Fi Information».
