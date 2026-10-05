import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html:
              "html,body,#root{width:100%;max-width:100%;overflow:hidden;overscroll-behavior:none}body{margin:0;background:#F7F5EE;touch-action:pan-x pan-y;-webkit-tap-highlight-color:transparent}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
