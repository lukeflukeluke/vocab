<script lang="ts">
  // Wordhoard's mark: a cut gem, a word worth keeping. Same drawing as public/favicon.svg
  // and the PNG icons (scripts/make_icons.py).
  let { size = 32 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
  <rect width="512" height="512" rx="112" fill="#1b2240" />
  <polygon points="136,200 196,136 216,200" fill="#f6cf6a" />
  <polygon points="196,136 316,136 296,200 216,200" fill="#fbe3a0" />
  <polygon points="316,136 376,200 296,200" fill="#e8b143" />
  <polygon points="136,200 216,200 256,388" fill="#e6a730" />
  <polygon points="216,200 296,200 256,388" fill="#f2bd4b" />
  <polygon points="296,200 376,200 256,388" fill="#c98a1c" />
  <polygon points="380,96 388,120 412,128 388,136 380,160 372,136 348,128 372,120" fill="#fff3d1" />
</svg>
