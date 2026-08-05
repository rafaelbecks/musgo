#!/usr/bin/env bash
# Convert env/raw photos/new → equirectangular EXR env maps with descriptive names.
# Portrait sources are rotated to landscape before resize.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/env/raw photos/new"
OUT_DIR="$ROOT/env/exr"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/resonant-exr-new.XXXXXX")"
MUL=6
RESIZE="4096x2048"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if ! command -v oiiotool >/dev/null 2>&1; then
  echo "oiiotool not found. Install OpenImageIO (e.g. brew install openimageio)." >&2
  exit 1
fi

# source_basename|slug|label
MAPPINGS=(
  "1000086233.jpg|blue_ruin_sky|Blue ruin sky"
  "1000124744.jpg|green_moss_stone|Green moss stone"
  "1000236876.jpg|green_moss_undergrowth|Green moss undergrowth"
  "1000353651.jpg|glass_caustics|Glass caustics"
  "1000353653.jpg|glass_caustics_2|Glass caustics 2"
  "FullSizeRender24.heic|stockholm_golden_hall|Stockholm golden hall"
  "IMG_1414.HEIC|aland_iridescent_moss|Åland iridescent moss"
  "IMG_1428.HEIC|aland_lichen|Åland lichen"
  "IMG_20231129_094059740~2.jpg|blue_snow|Blue snow"
  "IMG_20231129_094124092.jpg|blue_snow_2|Blue snow 2"
  "IMG_20231129_094452776~2.jpg|blue_snow_3|Blue snow 3"
  "IMG_20231222_180801007~2.jpg|mossy_rocks|Mossy rocks"
  "IMG_20240316_142330496.jpg|yellow_leaf|Yellow leaf"
  "IMG_20240510_045452758.jpg|golden_door|Golden door"
  "IMG_20240919_173049841.jpg|sunlit_foliage|Sunlit foliage"
  "IMG_20241015_165537273.jpg|autumn_canopy|Autumn canopy"
  "IMG_20250206_124701019.jpg|silver_ice|Silver ice"
  "IMG_20250206_124718442~2.jpg|melting_ice|Melting ice"
  "IMG_20250206_124804728~2.jpg|dark_mudflat|Dark mudflat"
  "IMG_20250206_124845137~2.jpg|muddy_shore|Muddy shore"
  "IMG_20250220_083305968.jpg|blue_frost_window|Blue frost window"
  "IMG_20250220_083315803~2.jpg|frost_rosehips|Frost rosehips"
  "IMG_20250220_083328435~2.jpg|hoar_frost|Hoar frost"
  "IMG_2123.HEIC|cancun_teal_water|Cancún teal water"
  "IMG_2661.jpg|teal_orange_abstract|Teal orange abstract"
  "IMG_9713.HEIC|stockholm_sunbeams|Stockholm sunbeams"
  "IMG_9718.HEIC|stockholm_god_rays|Stockholm god rays"
)

image_size() {
  oiiotool --info "$1" 2>/dev/null | sed -n 's/.*: \([0-9][0-9]*\) x \([0-9][0-9]*\).*/\1 \2/p' | head -1
}

mkdir -p "$OUT_DIR"
n=0
for entry in "${MAPPINGS[@]}"; do
  IFS='|' read -r base slug label <<<"$entry"
  src="$SRC_DIR/$base"
  if [ ! -f "$src" ]; then
    echo "missing: $base" >&2
    continue
  fi
  n=$((n + 1))
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

  out="$OUT_DIR/${slug}_env.exr"
  echo "→ $label  ($base)  →  $(basename "$out")"
  oiiotool "$landscape" \
    --tocolorspace linear \
    --mulc "$MUL,$MUL,$MUL" \
    --resize "$RESIZE" \
    -o "$out"
done

echo
echo "Done. $n file(s) converted to $OUT_DIR/*_env.exr"
echo "Config entries:"
for entry in "${MAPPINGS[@]}"; do
  IFS='|' read -r base slug label <<<"$entry"
  echo "  $slug: { label: \"$label\", file: \"exr/${slug}_env.exr\", format: \"exr\" },"
done
