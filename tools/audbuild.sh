#!/bin/bash
# يبني مقاطع الاستماع (سعد الغامدي) في itqan/audio من everyayah
set -e
mkdir -p itqan/audio /tmp/ay
for k in $(python3 -c "import json;print(' '.join(json.load(open('tools/audk.json'))))"); do
  o=itqan/audio/$k.mp3; [ -s "$o" ] && continue
  IFS=- read s a1 a2 <<<"$k"; : > /tmp/l.txt
  for ((a=10#$a1;a<=10#$a2;a++)); do f=$(printf "%03d%03d" $((10#$s)) $a); p=/tmp/ay/$f.mp3
    [ -s $p ] || curl -sf --retry 3 -o $p "https://everyayah.com/data/Ghamadi_40kbps/$f.mp3" || curl -sf --retry 3 -o $p "https://mirrors.quranicaudio.com/everyayah/Ghamadi_40kbps/$f.mp3"
    echo "file '$p'" >> /tmp/l.txt; done
  ffmpeg -loglevel error -y -f concat -safe 0 -i /tmp/l.txt -ac 1 -ar 22050 -b:a 32k "$o"
done
ls itqan/audio | wc -l; du -sh itqan/audio
