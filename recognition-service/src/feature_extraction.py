import os
import numpy as np
import librosa
import torch

SAMPLE_RATE = 22050
DURATION = 3.0  # seconds
NUM_SAMPLES = int(SAMPLE_RATE * DURATION)  # 66150 samples
N_MELS = 128
N_FFT = 2048
HOP_LENGTH = 512
FIXED_FRAMES = 130  # Fixed time dimension for log-mel spectrogram


def extract_features_from_audio(y: np.ndarray, sr: int = SAMPLE_RATE) -> torch.Tensor:
    """
    Given a 1D audio numpy array, extract a fixed-size normalized log-mel spectrogram tensor.

    Output shape: (1, 128, 130) -> (Channels=1, Mel_Bands=128, Time_Frames=130)
    """
    # Convert to mono if multi-channel
    if y.ndim > 1:
        y = librosa.to_mono(y)

    # Resample if sample rate doesn't match
    if sr != SAMPLE_RATE:
        y = librosa.resample(y, orig_sr=sr, target_sr=SAMPLE_RATE)

    # Pad or trim to exactly 3 seconds (NUM_SAMPLES)
    if len(y) < NUM_SAMPLES:
        padding = NUM_SAMPLES - len(y)
        y = np.pad(y, (0, padding), mode="constant")
    elif len(y) > NUM_SAMPLES:
        y = y[:NUM_SAMPLES]

    # Compute Mel-spectrogram
    mel_spec = librosa.feature.melspectrogram(
        y=y,
        sr=SAMPLE_RATE,
        n_fft=N_FFT,
        hop_length=HOP_LENGTH,
        n_mels=N_MELS,
        power=2.0
    )

    # Convert to log-mel (dB scale)
    log_mel = librosa.power_to_db(mel_spec, ref=np.max)

    # Normalize to [0, 1]
    # log_mel values are typically in [-80, 0] dB
    min_val = log_mel.min()
    max_val = log_mel.max()
    if max_val - min_val > 1e-6:
        norm_mel = (log_mel - min_val) / (max_val - min_val)
    else:
        norm_mel = np.zeros_like(log_mel)

    # Ensure fixed frame count
    if norm_mel.shape[1] < FIXED_FRAMES:
        pad_width = FIXED_FRAMES - norm_mel.shape[1]
        norm_mel = np.pad(norm_mel, ((0, 0), (0, pad_width)), mode="constant")
    elif norm_mel.shape[1] > FIXED_FRAMES:
        norm_mel = norm_mel[:, :FIXED_FRAMES]

    # Convert to torch tensor with channel dim: (1, 128, 130)
    tensor = torch.tensor(norm_mel, dtype=torch.float32).unsqueeze(0)
    return tensor


def extract_features(audio_path: str) -> torch.Tensor:
    """
    Load an audio file from path and extract normalized log-mel spectrogram for the FIRST 3 SECONDS.
    Raises ValueError if file cannot be read or is corrupted.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    try:
        y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
    except Exception as e:
        raise ValueError(f"Could not load audio file '{audio_path}': {str(e)}")

    if y is None or len(y) == 0:
        raise ValueError(f"Audio file '{audio_path}' is empty or could not be decoded.")

    return extract_features_from_audio(y, sr)


def extract_sliding_windows(audio_path: str, window_sec: float = 3.0, hop_sec: float = 1.5) -> list:
    """
    Extracts log-mel tensors across the entire song using a sliding window.
    Returns: list of dicts [{"start": float, "end": float, "tensor": torch.Tensor}]
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    try:
        y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
    except Exception as e:
        raise ValueError(f"Could not load audio file '{audio_path}': {str(e)}")

    if y is None or len(y) == 0:
        raise ValueError(f"Audio file '{audio_path}' is empty.")

    if y.ndim > 1:
        y = librosa.to_mono(y)

    total_samples = len(y)
    total_sec = total_samples / sr

    window_samples = int(window_sec * sr)
    hop_samples = int(hop_sec * sr)

    windows = []

    # If the song is shorter than the window, just return one padded window
    if total_samples <= window_samples:
        tensor = extract_features_from_audio(y, sr)
        windows.append({"start": 0.0, "end": total_sec, "tensor": tensor})
        return windows

    for start_sample in range(0, total_samples, hop_samples):
        end_sample = start_sample + window_samples

        # Don't process trailing windows that are less than 50% of the window size,
        # unless it's the very last chunk and we still pad it.
        chunk = y[start_sample:min(end_sample, total_samples)]
        if len(chunk) < (window_samples * 0.5):
            break

        tensor = extract_features_from_audio(chunk, sr)
        start_time = round(start_sample / sr, 2)
        end_time = round(min(end_sample, total_samples) / sr, 2)

        windows.append({"start": start_time, "end": end_time, "tensor": tensor})

    return windows
