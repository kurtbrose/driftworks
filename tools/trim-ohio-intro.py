"""Conservatively tighten quiet Ohio DJ pauses; preserve the unedited source."""
from pathlib import Path
import array
import math
import sys
import wave

folder = Path(__file__).resolve().parents[1] / 'assets/audio/ohio'
with wave.open(str(folder / 'radio-intro-source.wav'), 'rb') as source:
    params = source.getparams()
    assert params.nchannels == 1 and params.sampwidth == 2
    samples = array.array('h', source.readframes(params.nframes))
if sys.byteorder != 'little':
    samples.byteswap()
rate = params.framerate
hop = round(rate * .01)
gaps = []
start = None
for frame in range(0, len(samples), hop):
    chunk = samples[frame:frame + hop]
    rms = math.sqrt(sum(value * value for value in chunk) / len(chunk)) / 32768
    if rms < .006:
        if start is None:
            start = frame
    elif start is not None:
        duration = (frame - start) / rate
        if duration >= .22:
            keep = .35 if duration >= .45 else .16
            middle = (start + frame) // 2
            remove = round((duration - keep) * rate)
            gaps.append((middle - remove // 2, middle + remove // 2))
        start = None
# Work backwards so source positions remain stable. Cuts stay inside quiet audio.
blend = round(.005 * rate)
for left, right in reversed(gaps):
    bridge = array.array('h', (round(samples[left - blend + i] * (1 - i / blend) + samples[right + i] * (i / blend)) for i in range(blend)))
    samples[left - blend:right + blend] = bridge
seconds = len(samples) / rate
if sys.byteorder != 'little':
    samples.byteswap()
with wave.open(str(folder / 'radio-intro.wav'), 'wb') as target:
    target.setparams(params)
    target.writeframes(samples.tobytes())
print(f'Tightened {len(gaps)} quiet pauses: {params.nframes / rate:.2f}s -> {seconds:.2f}s ({seconds / 1.25:.2f}s at 1.25x)')
