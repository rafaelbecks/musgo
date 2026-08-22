#!/usr/bin/env bash
# Stitch a folder of similar stills into a short looping animation via ffmpeg.
#
# Each image is held for N video frames; the sequence can loop (and optionally
# bounce / ping-pong) so slight frame-to-frame differences read as motion.
#
# Usage:
#   scripts/images-to-video.sh ~/Documents/ls_test
#   scripts/images-to-video.sh ~/Documents/ls_test -f 4 -l 8 -o out.mp4
#   scripts/images-to-video.sh ~/Documents/ls_test --frames 2 --fps 12 --loops 20 --bounce
set -euo pipefail

FRAMES=4
FPS=24
LOOPS=4
BOUNCE=0
OUTPUT=""
INPUT_DIR=""

usage() {
  cat <<'EOF'
Usage: images-to-video.sh <image-dir> [options]

Options:
  -f, --frames N     Hold each picture for N video frames (default: 4)
  -r, --fps N        Output frame rate (default: 24)
  -l, --loops N      Repeat the sequence N times (default: 4)
  -b, --bounce       Ping-pong: forward then reverse each cycle
  -o, --output PATH  Output file (default: <dir-name>-anim.mp4 next to input)
  -h, --help         Show this help

Examples:
  images-to-video.sh ~/Documents/ls_test
  images-to-video.sh ~/Documents/ls_test -f 3 -l 12 -r 24 -o ~/Desktop/ls.mp4
  images-to-video.sh ~/Documents/ls_test --frames 2 --bounce --loops 10
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--frames)
      FRAMES="${2:?}"
      shift 2
      ;;
    -r|--fps)
      FPS="${2:?}"
      shift 2
      ;;
    -l|--loops)
      LOOPS="${2:?}"
      shift 2
      ;;
    -b|--bounce)
      BOUNCE=1
      shift
      ;;
    -o|--output)
      OUTPUT="${2:?}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$INPUT_DIR" ]]; then
        echo "Unexpected argument: $1" >&2
        usage >&2
        exit 1
      fi
      INPUT_DIR="$1"
      shift
      ;;
  esac
done

if [[ -z "$INPUT_DIR" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Not a directory: $INPUT_DIR" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it (e.g. brew install ffmpeg)." >&2
  exit 1
fi

for pair in "frames:$FRAMES" "fps:$FPS" "loops:$LOOPS"; do
  name="${pair%%:*}"
  val="${pair#*:}"
  if ! [[ "$val" =~ ^[1-9][0-9]*$ ]]; then
    echo "--$name must be a positive integer (got: $val)" >&2
    exit 1
  fi
done

INPUT_DIR="$(cd "$INPUT_DIR" && pwd)"
if [[ -z "$OUTPUT" ]]; then
  OUTPUT="$(dirname "$INPUT_DIR")/$(basename "$INPUT_DIR")-anim.mp4"
fi

shopt -s nullglob nocaseglob
raw=("$INPUT_DIR"/*.{png,jpg,jpeg,webp,tif,tiff})
shopt -u nocaseglob

if [[ ${#raw[@]} -eq 0 ]]; then
  echo "No images found in $INPUT_DIR" >&2
  exit 1
fi

IFS=$'\n' IMAGES=($(printf '%s\n' "${raw[@]}" | sort -V))
unset IFS

DURATION="$(python3 -c "print($FRAMES / float($FPS))")"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/images-to-video.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

LIST="$TMP_DIR/concat.txt"
: >"$LIST"

escape_path() {
  # ffmpeg concat demuxer: single quotes escaped as '\''
  printf "%s" "${1//\'/\'\\\'\'}"
}

append_still() {
  printf "file '%s'\n" "$(escape_path "$1")" >>"$LIST"
  printf "duration %s\n" "$DURATION" >>"$LIST"
}

HOLDS_PER_CYCLE=${#IMAGES[@]}
if [[ "$BOUNCE" -eq 1 ]] && [[ ${#IMAGES[@]} -gt 1 ]]; then
  # forward N + reverse N-1 (skip duplicate of last before walking back)
  HOLDS_PER_CYCLE=$(( ${#IMAGES[@]} * 2 - 1 ))
fi

for ((cycle = 0; cycle < LOOPS; cycle++)); do
  for img in "${IMAGES[@]}"; do
    append_still "$img"
  done
  if [[ "$BOUNCE" -eq 1 ]] && [[ ${#IMAGES[@]} -gt 1 ]]; then
    local_i=$((${#IMAGES[@]} - 2))
    while [[ $local_i -ge 0 ]]; do
      append_still "${IMAGES[$local_i]}"
      local_i=$((local_i - 1))
    done
  fi
done

# Trailing file entry required by concat demuxer (no duration)
LAST_IDX=$((${#IMAGES[@]} - 1))
LAST_IMG="${IMAGES[$LAST_IDX]}"
if [[ "$BOUNCE" -eq 1 ]]; then
  LAST_IMG="${IMAGES[0]}"
fi
printf "file '%s'\n" "$(escape_path "$LAST_IMG")" >>"$LIST"

TOTAL_HOLDS=$((HOLDS_PER_CYCLE * LOOPS))
TOTAL_VIDEO_FRAMES=$((TOTAL_HOLDS * FRAMES))
DURATION_SEC="$(python3 -c "print(round($TOTAL_VIDEO_FRAMES / float($FPS), 3))")"

echo "Images:  ${#IMAGES[@]}  ($(basename "${IMAGES[0]}") … $(basename "${IMAGES[$LAST_IDX]}"))"
echo "Hold:    ${FRAMES} frame(s) each @ ${FPS} fps  (${DURATION}s / still)"
echo "Loops:   ${LOOPS}$([[ "$BOUNCE" -eq 1 ]] && echo ' (bounce/ping-pong)')"
echo "Length:  ~${DURATION_SEC}s  (${TOTAL_VIDEO_FRAMES} frames)"
echo "Output:  $OUTPUT"
echo

mkdir -p "$(dirname "$OUTPUT")"

ffmpeg -y -hide_banner -loglevel error -stats \
  -f concat -safe 0 -i "$LIST" \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p" \
  -r "$FPS" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUTPUT"

echo
echo "Done → $OUTPUT"
