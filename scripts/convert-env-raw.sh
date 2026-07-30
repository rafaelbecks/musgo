#!/usr/bin/env bash
# Convert env/raw photos (jpg, heic, png) to equirectangular EXR env maps.
# Portrait sources are rotated to landscape before resize.
# Outputs: env/exr/blue_shades_<n>_env.exr  (labels: "Blue shades N")
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/env/raw photos"
OUT_DIR="$ROOT/env/exr"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/resonant-exr.XXXXXX")"
MUL=6
RESIZE="4096x2048"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if ! command -v oiiotool >/dev/null 2>&1; then
  echo "oiiotool not found. Install OpenImageIO (e.g. brew install openimageio)." >&2
  exit 1
fi

shopt -s nullglob nocaseglob
files=("$SRC_DIR"/*.{jpg,jpeg,heic,png})
shopt -u nocaseglob

if [ ${#files[@]} -eq 0 ]; then
  echo "No jpg/heic/png files in $SRC_DIR" >&2
  exit 1
fi

# Stable order (bash 3.2-compatible)
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | LC_ALL=C sort))
unset IFS

unique=()
seen_img_9740=0
for src in "${sorted[@]}"; do
  base="$(basename "$src")"
  case "$base" in
    "IMG_9740 (1).HEIC"|"IMG_9740 (1).heic")
      echo "skip duplicate: $base"
      continue
      ;;
    IMG_9740.HEIC|IMG_9740.heic)
      if [ "$seen_img_9740" -eq 1 ]; then
        echo "skip duplicate: $base"
        continue
      fi
      seen_img_9740=1
      ;;
  esac
  unique+=("$src")
done

image_size() {
  # Parses: "path : W x H, ..."
  oiiotool --info "$1" 2>/dev/null | sed -n 's/.*: \([0-9][0-9]*\) x \([0-9][0-9]*\).*/\1 \2/p' | head -1
}

mkdir -p "$OUT_DIR"
n=0
for src in "${unique[@]}"; do
  n=$((n + 1))
  base="$(basename "$src")"
  ext="${base##*.}"
  ext_lc="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"
  work="$src"

  if [ "$ext_lc" = "heic" ]; then
    if ! command -v heif-convert >/dev/null 2>&1; then
      echo "heif-convert not found (needed for HEIC). brew install libheif" >&2
      exit 1
    fi
    work="$TMP_DIR/heic_${n}.jpg"
    echo "  heic→jpg: $base"
    heif-convert -q 95 "$src" "$work" >/dev/null
  fi

  oriented="$TMP_DIR/oriented_${n}.tif"
  oiiotool "$work" --reorient -o "$oriented"

  size="$(image_size "$oriented")"
  w="${size%% *}"
  h="${size##* }"
  landscape="$oriented"
  if [ -n "$w" ] && [ -n "$h" ] && [ "$h" -gt "$w" ]; then
    landscape="$TMP_DIR/landscape_${n}.tif"
    echo "  portrait→landscape (${w}x${h})"
    oiiotool "$oriented" --rotate90 -o "$landscape"
  fi

  out="$OUT_DIR/blue_shades_${n}_env.exr"
  echo "→ Blue shades $n  ($base)  →  $(basename "$out")"
  oiiotool "$landscape" \
    --tocolorspace linear \
    --mulc "$MUL,$MUL,$MUL" \
    --resize "$RESIZE" \
    -o "$out"
done

echo
echo "Done. $n file(s) converted to $OUT_DIR/blue_shades_*_env.exr"
echo "Config entries:"
i=1
while [ "$i" -le "$n" ]; do
  echo "  blue_shades_$i: { label: \"Blue shades $i\", file: \"exr/blue_shades_${i}_env.exr\", format: \"exr\" },"
  i=$((i + 1))
done
