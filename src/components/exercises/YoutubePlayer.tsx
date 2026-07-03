import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Radius } from '../../theme';

function extractVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([^&#]+)/,
    /youtu\.be\/([^?&#]+)/,
    /\/embed\/([^?&#/]+)/,
  ];
  for (const pattern of patterns) {
    const m = url.match(pattern);
    if (m) return m[1];
  }
  return null;
}

interface Props {
  url: string;
}

export default function YoutubePlayer({ url }: Props) {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  // Using baseUrl gives the WebView a proper origin that YouTube accepts for
  // embedding, which prevents the "open in YouTube app" redirect.
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
  <iframe
    src="https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1&fs=1&enablejsapi=1&origin=https://localhost"
    allowfullscreen
    allow="autoplay; fullscreen; picture-in-picture"
  ></iframe>
</body>
</html>`;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html, baseUrl: 'https://localhost' }}
        style={styles.webview}
        originWhitelist={['*']}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        scrollEnabled={false}
        // Block any navigation that would leave the player (e.g. open YouTube app)
        onShouldStartLoadWithRequest={(req) => {
          const u = req.url;
          // Allow initial blank load and known YouTube embed/cdn resources
          if (
            u === 'about:blank' ||
            u.startsWith('https://localhost') ||
            u.includes('/embed/') ||
            u.includes('ytimg.com') ||
            u.includes('googlevideo.com') ||
            u.includes('youtube.com/api') ||
            u.includes('accounts.google.com')
          ) {
            return true;
          }
          // Block everything else (youtube.com/watch, youtube app scheme, etc.)
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginTop: 10,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});
