# Generates the game's audio assets as small WAV files into web/public/audio.
# Everything here is synthesized from scratch (original, royalty-free): an upbeat
# background loop plus short sound effects. Re-run to regenerate.
import os
import math
import wave
import struct
import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "audio")
os.makedirs(OUT, exist_ok=True)

# ---- note helpers ----------------------------------------------------------
NOTE = {  # frequencies (Hz)
    "C2": 65.41, "F2": 87.31, "G2": 98.00, "A2": 110.0, "C3": 130.81,
    "E3": 164.81, "G3": 196.00, "A3": 220.0, "C4": 261.63, "E4": 329.63,
    "F4": 349.23, "G4": 392.00, "A4": 440.0, "C5": 523.25, "D5": 587.33,
    "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.0, "C6": 1046.5,
}


def env(n, attack=0.01, release=0.06):
    a = max(1, int(SR * attack))
    r = max(1, int(SR * release))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    if r < n:
        e[n - r:] = np.linspace(1, 0, r)
    return e


def tone(freq, dur, kind="square", vol=0.5, attack=0.01, release=0.06):
    n = int(SR * dur)
    t = np.arange(n) / SR
    if kind == "sine":
        w = np.sin(2 * np.pi * freq * t)
    elif kind == "triangle":
        w = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * freq * t))
    elif kind == "saw":
        w = 2 * (t * freq - np.floor(0.5 + t * freq))
    else:  # square (slightly soft via 0.5 duty)
        w = np.sign(np.sin(2 * np.pi * freq * t))
    return (w * env(n, attack, release) * vol).astype(np.float64)


def noise(dur, vol=0.3, attack=0.001, release=0.05):
    n = int(SR * dur)
    w = np.random.uniform(-1, 1, n)
    return w * env(n, attack, release) * vol


def kick(dur=0.16, vol=0.7):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = np.linspace(140, 50, n)  # pitch drop
    w = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return w * env(n, 0.001, 0.1) * vol


def place(track, sound, at_sec):
    i = int(SR * at_sec)
    end = min(len(track), i + len(sound))
    track[i:end] += sound[: end - i]


def save(name, audio, peak=0.85):
    a = np.asarray(audio, dtype=np.float64)
    m = np.max(np.abs(a)) or 1.0
    a = a / m * peak
    # tiny fades to avoid clicks (and to mask the music loop seam)
    f = int(SR * 0.008)
    a[:f] *= np.linspace(0, 1, f)
    a[-f:] *= np.linspace(1, 0, f)
    data = (a * 32767).astype(np.int16)
    path = os.path.join(OUT, name)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print(f"{name}: {len(data)} samples ({len(data)/SR:.1f}s)")


# ---- background music loop -------------------------------------------------
def music():
    bpm = 130
    beat = 60 / bpm
    bar = beat * 4
    bars = 8
    total = int(SR * bar * bars)
    track = np.zeros(total)

    # I-V-vi-IV (C G Am F), twice
    prog = ["C", "G", "A", "F"] * 2
    roots = {"C": "C3", "G": "G2", "A": "A2", "F": "F2"}
    # a simple arpeggio melody per chord (scale degrees)
    arps = {
        "C": ["C5", "E5", "G5", "E5"],
        "G": ["G4", "D5", "G5", "D5"],
        "A": ["A4", "C5", "E5", "C5"],
        "F": ["F4", "A4", "C5", "A4"],
    }
    for b, chord in enumerate(prog):
        t0 = b * bar
        # bass on each beat (triangle)
        for k in range(4):
            place(track, tone(NOTE[roots[chord]], beat * 0.9, "triangle", 0.32), t0 + k * beat)
        # lead arpeggio, eighth notes
        notes = arps[chord]
        for k in range(8):
            f = NOTE[notes[k % 4]]
            place(track, tone(f, beat * 0.45, "square", 0.16, 0.005, 0.05), t0 + k * (beat / 2))
        # drums: kick on 1 and 3, hats on offbeats
        place(track, kick(), t0 + 0 * beat)
        place(track, kick(), t0 + 2 * beat)
        for k in range(4):
            place(track, noise(0.04, 0.10), t0 + k * beat + beat / 2)
    save("music-loop.wav", track, peak=0.7)


# ---- sound effects ---------------------------------------------------------
def question_start():
    a = np.zeros(int(SR * 0.5))
    for i, key in enumerate(["C5", "E5", "G5", "C6"]):
        place(a, tone(NOTE[key], 0.14, "square", 0.5, 0.005, 0.08), i * 0.07)
    save("question-start.wav", a)


def tick():
    save("tick.wav", tone(1200, 0.07, "square", 0.5, 0.002, 0.05))


def time_up():
    a = np.zeros(int(SR * 0.55))
    place(a, tone(330, 0.22, "square", 0.5), 0.0)
    place(a, tone(247, 0.30, "square", 0.5), 0.22)
    save("time-up.wav", a)


def correct():
    a = np.zeros(int(SR * 0.45))
    place(a, tone(NOTE["E5"], 0.12, "square", 0.5, 0.005, 0.06), 0.0)
    place(a, tone(NOTE["A5"], 0.22, "square", 0.5, 0.005, 0.12), 0.11)
    save("correct.wav", a)


def wrong():
    a = np.zeros(int(SR * 0.45))
    place(a, tone(NOTE["A3"], 0.18, "saw", 0.45), 0.0)
    place(a, tone(NOTE["F2"], 0.26, "saw", 0.45), 0.16)
    save("wrong.wav", a)


def finish():
    a = np.zeros(int(SR * 1.3))
    for i, key in enumerate(["C5", "E5", "G5", "C6"]):
        place(a, tone(NOTE[key], 0.16, "square", 0.5, 0.005, 0.08), i * 0.12)
    # final chord
    for key in ["C5", "E5", "G5", "C6"]:
        place(a, tone(NOTE[key], 0.6, "square", 0.3, 0.01, 0.4), 0.5)
    save("finish.wav", a)


def join():
    save("join.wav", tone(NOTE["A5"], 0.12, "sine", 0.5, 0.005, 0.07))


def tap():
    save("tap.wav", tone(NOTE["E5"], 0.06, "sine", 0.4, 0.002, 0.045))


if __name__ == "__main__":
    np.random.seed(7)  # deterministic hats
    music()
    question_start()
    tick()
    time_up()
    correct()
    wrong()
    finish()
    join()
    tap()
    print("done ->", OUT)
